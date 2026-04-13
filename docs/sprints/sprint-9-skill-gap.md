# Sprint 9: Skill 系统设计缺口修补 (Phase 2 → Phase 3 过渡)

## 背景

Phase 2 的 Skill 插件系统架构（ADR-008）设计正确，但实现有 4 个落地缺口：
1. **SkillDefinition 表为空** — 已有 6 个 Skill 模板（skills/ 目录）但没注册到数据库
2. **Phase 1 的 7 个 AI 操作绕过 Skill** — 直接调 Harness，没包装成 Skill
3. **IPC handler 硬编码 switch** — 新增 Skill 还要改 handler 代码，不是真正插件化
4. **管理页面缺少上传格式说明** — 用户不知道 .zip 包应该包含什么

Phase 3（Learning Brain）需要 Agent 动态组合 Skill 能力，如果不修补这些缺口，Brain 无法工作。

## 目标

将 Skill 系统从"基础设施已搭建但未启用"变为"内置 Skill 全部激活 + 新增 Skill 即插即用"。

## 任务清单

- [x] 81. Schema 变更：SkillSource 枚举
  - `prisma/schema.prisma` 新增 `SkillSource` 枚举（BUILTIN / CUSTOM）
  - `SkillDefinition` model 加 `source SkillSource @default(CUSTOM)` 字段
  - 生成迁移：`npx prisma migrate dev --name add_skill_source`
  - 产出：迁移文件 + schema 更新

- [x] 82. Operation Registry — 通用 AI 操作路由
  - 新建 `src/lib/domain/ai/operations/registry.ts`
  - 将 7 个 `AIOperationType` 映射到对应操作函数
  - 导出 `callAIOperation(operation, data, context)` 函数
  - context 参数为 `AICallContext`（userId, locale, correlationId），由 handler 注入
  - 产出：registry 代码 + 单元测试

- [x] 83. 重构 IPC Handler — 去掉硬编码 switch
  - 修改 `src/worker/handlers/diagnosis.ts`
    - `onCallAI`: switch → `callAIOperation(operation, data, aiContext)`
    - `onReadMemory`: switch → `MEMORY_READ_WHITELIST[method](params)` 
    - `onWriteMemory`: switch → `MEMORY_WRITE_WHITELIST[method](params)`
  - 修改 `src/worker/handlers/question-understanding.ts` — 同样模式
  - 数据扩充逻辑移到 Skill execute.ts（见自审问题 2）
  - 确保 QUERY_WHITELIST 包含 `findKnowledgePointsByIds`
  - 产出：重构代码 + 现有测试通过

- [x] 84. Phase 1 操作包装成 Skill
  - 新建 5 个 Skill 模板目录（manifest.json + schema.json + execute.ts + 编译 index.js）：
    - `skills/recognize-homework/` — OCR 识别 (OCR_RECOGNIZE)
    - `skills/grade-answer/` — 答案评分 (GRADE_ANSWER)
    - `skills/help-generate/` — 渐进提示 (HELP_GENERATE)
    - `skills/subject-detect/` — 学科检测 (SUBJECT_DETECT)
    - `skills/extract-knowledge-points/` — 确认完善已有模板 (EXTRACT_KNOWLEDGE_POINTS)
  - 每个 Skill 内部调 `ctx.callAI("OPERATION_NAME", params)` → 走 Operation Registry → Harness
  - 产出：5 个 Skill 模板 + 编译产物

- [x] 85. 修正已有 Skill 模板
  - `skills/diagnose-error/execute.ts` — 数据扩充逻辑从 handler 移入
    - 用 `ctx.query("findKnowledgePointsByIds", ...)` 查 KP 完整数据
    - 传完整 knowledgePoints 对象给 callAI（不再传 knowledgePointIds）
  - `skills/classify-question-knowledge/execute.ts` — 同样检查是否有 handler 数据扩充需要移入
  - 重新编译所有修改的 Skill
  - 产出：修正后的 Skill 代码 + 编译产物

- [x] 86. 自动注册内置 Skill — seed 脚本
  - 修改 `prisma/seed.ts` — 遍历 skills/ 目录
  - 读取 `schema.json` 的 name（snake_case）作为 DB name（不是 manifest 的 kebab-case）
  - upsert 到 SkillDefinition 表，source="BUILTIN"，status="ACTIVE"
  - 产出：seed 脚本更新

- [x] 87. 管理页面增强 — 内置保护 + 上传说明
  - `src/server/routers/skill.ts` — disable/delete 检查 source=BUILTIN 时拒绝
  - `src/server/routers/skill.ts` — list 返回 source 字段
  - `src/app/[locale]/(dashboard)/admin/skills/page.tsx`:
    - BUILTIN Skill 显示"系统内置"标签，隐藏禁用/删除按钮
    - 上传对话框添加格式说明卡片（.zip 结构 + 可用 API + 脚手架命令）
  - i18n 中英文新增 key：builtin / cannotDisableBuiltin / uploadGuide / uploadGuideTitle
  - 产出：页面更新 + router 更新 + i18n

- [x] 88. 验证 + 文档同步
  - npm test + tsc --noEmit
  - 验证清单（见下方）
  - ROADMAP.md 更新
  - README.md 目录树同步
  - 产出：验证报告 + 文档

## 自审发现的关键问题（实现时必须注意）

### 问题 1：Skill 命名约定冲突

- `manifest.json` 用 kebab-case: `"name": "diagnose-error"`
- `schema.json` 用 snake_case: `"name": "diagnose_error"`
- Agent `allowedSkills` 用 snake_case: `["diagnose_error"]`
- `resolveBundlePath` 把 snake_case 转 kebab-case 找文件

**规则**：DB name = schema.json name（snake_case）。目录名（kebab-case）仅用于文件路径解析。seed 读 schema.json 的 name 注册。

### 问题 2：IPC handler 数据扩充

`diagnosis.ts` 的 `onCallAI` 不只是路由 — 它把 handler 闭包中的 `knowledgePoints`（完整对象）注入操作参数。Skill 只传 `knowledgePointIds`（ID 数组），操作需要完整对象。

**规则**：数据扩充移到 Skill 的 execute.ts，通过 `ctx.query()` 查询。handler 的 onCallAI 变成纯路由。

### 问题 3：onReadMemory / onWriteMemory 也是硬编码 switch

**规则**：和 onQuery 相同的 WHITELIST 注册表模式。创建 `MEMORY_READ_WHITELIST` 和 `MEMORY_WRITE_WHITELIST`。

### 问题 4：通用路由需要注入 AICallContext

所有 AI 操作需要 `context: AICallContext`。这不是 Skill 传的，是 handler 构造的。

**规则**：`callAIOperation(operation, data, context)` 接受第三个参数，handler 负责注入。

## 不动的部分

- Phase 1 的 handler 调用方式不变（`ocr-recognize.ts` 等仍直接调 Harness） — 渐进式，不影响现有功能
- Agent 定义的 `allowedSkills` 不变 — Skill 名称注册到 DB 后 Agent Runner 自动发现
- Skill Runtime / IPC 沙箱机制不变
- Skill Creator 页面推迟到 Phase 4-5（现有 CLI 脚手架 + 管理页面上传够用）

## 涉及文件总览

| 文件 | 操作 |
|------|------|
| `prisma/schema.prisma` | 修改 — 加 SkillSource 枚举 + source 字段 |
| `prisma/seed.ts` | 修改 — 自动注册内置 Skill |
| `src/lib/domain/ai/operations/registry.ts` | **新建** — 操作注册表 |
| `src/worker/handlers/diagnosis.ts` | 修改 — IPC handler 用通用路由 + memory whitelist |
| `src/worker/handlers/question-understanding.ts` | 修改 — 同上 |
| `skills/diagnose-error/execute.ts` | 修改 — 数据扩充从 handler 移入 |
| `skills/classify-question-knowledge/execute.ts` | 修改 — 同上检查 |
| `skills/recognize-homework/` | **新建** — OCR Skill |
| `skills/grade-answer/` | **新建** — 评分 Skill |
| `skills/help-generate/` | **新建** — 求助 Skill |
| `skills/subject-detect/` | **新建** — 学科检测 Skill |
| `skills/extract-knowledge-points/` | 修改 — 确认完善已有模板 |
| `src/app/[locale]/(dashboard)/admin/skills/page.tsx` | 修改 — 内置保护 + 上传说明 |
| `src/server/routers/skill.ts` | 修改 — 禁止禁用/删除内置 Skill + 返回 source |
| `src/i18n/messages/zh.json` | 修改 — 新 key |
| `src/i18n/messages/en.json` | 修改 — 新 key |

## 验证清单

### Sprint 9 特有

- [x] SkillSource 迁移成功，SkillDefinition 表有 source 字段
- [x] `npx prisma db seed` 注册 10 个内置 Skill（6 现有 + 4 新增），全部 status=ACTIVE, source=BUILTIN
- [x] DB 中 Skill name 为 snake_case（与 schema.json 和 Agent allowedSkills 一致）
- [x] callAIOperation 正确路由 7 个操作（8 个单测全通过）
- [x] diagnosis handler 的 onCallAI 不含 switch，使用 callAIOperation
- [x] question-understanding handler 同上
- [x] onReadMemory / onWriteMemory 使用 WHITELIST 模式，不含 switch
- [x] diagnose-error Skill 的 execute.ts 通过 ctx.query() 查询 KP 数据
- [x] 4 个新 Skill 模板 + 6 个现有 Skill 全部编译成功（index.js 生成）
- [x] 管理页面：BUILTIN Skill 显示"系统内置"标签
- [x] 管理页面：BUILTIN Skill 无禁用/删除按钮
- [x] 管理页面：上传对话框显示格式说明
- [x] skill.disable API 对 BUILTIN 返回 FORBIDDEN

### 通用（每 Sprint 必检）

- [x] 所有用户可见字符串使用 i18n key（新增 4 个 key：builtin, cannotDisableBuiltin, uploadGuideTitle, uploadGuide）
- [x] npm test 通过（718 passed）+ tsc --noEmit 无错误
- [x] 无 any 类型泄露
- [x] Prisma 软删除全局过滤（seed 中 deletedAt: null 更新）
- [x] 乐观锁（本 Sprint 无新增写操作需要乐观锁）
- [x] 无密钥/Token 硬编码
- [x] RBAC 中间件覆盖所有新增 procedure（无新增 procedure，disable 增加 BUILTIN 检查）

## 关键设计决策

| # | 决策 | 方案 | 原因 |
|---|------|------|------|
| D1 | 内置 Skill 保护 | source 枚举（BUILTIN/CUSTOM） | 比布尔值更有扩展性，未来可加 IMPORTED 等 |
| D2 | DB name 约定 | schema.json name（snake_case） | Agent allowedSkills 和 SkillRegistry 都用 snake_case |
| D3 | 数据扩充归属 | Skill 负责（通过 ctx.query） | handler 变纯路由，新增 Skill 不改 handler |
| D4 | Skill Creator | 推迟到 Phase 4-5 | 当前只有开发者创建 Skill，CLI + 管理页面上传够用 |
| D5 | Phase 1 操作兼容 | 渐进式：handler 仍可直接调 Harness | 不破坏现有流程，Skill 是补充路径 |
