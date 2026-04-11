# Phase 2 启动计划

> Phase 1 回顾 + Phase 2 开发方式调整方案

---

## 一、Phase 1 回顾

### 保留的好做法

- **文档驱动**：需求 → 用户故事 → ADR → Sprint 计划 → 实现，链路清晰
- **CLAUDE.md 规则体系**：AI Harness 强制、i18n、Docker 命名、commit 规范，每次 session 能快速恢复上下文
- **Sprint 自审清单**：每个 Sprint 结束有结构化验收
- **AI Harness 管道**：7 个组件全部生产就绪，安全边界清晰
- **BullMQ 异步架构**：Worker 隔离、重试逻辑、SSE 推送已验证

### 暴露的问题

| 问题 | 表现 | 根因 |
|------|------|------|
| ADR 与实现脱节 | ADR-003 写了 BullMQ 但 Phase 1 前期没实现 | 写 ADR 时没区分"本期实现"还是"架构预留" |
| 目录结构返工 | Phase 1 结束时才重组 lib/ 分层 | 初期没做结构规划，flat 堆积到后期才暴露 |
| 文档路径漂移 | 重组后多个文档路径失效 | docs 里硬编码了源码路径 |
| 测试断言过时 | error message 修改后测试没跟上 | 改代码时没跑相关测试 |

---

## 二、开发流程调整（6 条）

### 2.1 文档节奏：从"全量预写"改为"逐 Sprint 递进"

Phase 1 先写完全部需求/用户故事/ADR，再按 Sprint 实现。Phase 2 的 AI Agent 设计很难提前完全想清楚 — 需要边做边调整 prompt、tool schema、agent 循环策略。

**新做法：**
- 只提前写 Phase 2 的**高层目标和模块划分**（1 页纸）
- 每个 Sprint 开始时才写该 Sprint 的详细用户故事和 ADR
- 避免花大量时间写未来 Sprint 的详细 spec 然后又改

### 2.2 Sprint 粒度缩小

Phase 1 是 2 周/Sprint，每 Sprint 10+ 任务。

**新做法：**
- **1 周/Sprint，每 Sprint 5-7 个任务**
- 原因：AI Agent 的调试周期不可预测，小 Sprint 能更快暴露问题

### 2.3 ADR 只写当前 Sprint 要实现的

Phase 1 的 ADR-003 写了 BullMQ 但实际延后到 Sprint 3 后才补。

**新做法：**
- ADR 标注生效 Sprint：`Status: Accepted (Sprint 4)`
- 不写"架构预留"型 ADR — 等到实际要实现时再写

### 2.4 改代码时必须跑相关测试

Phase 1 的规则是"测试只在任务完成时跑"，导致测试断言漂移。

**新规则：**
- 改了 router / operation / harness 组件后，**立即跑该文件的单元测试**再继续
- 任务完成时跑全量测试不变

### 2.5 文档里不硬编码源码路径

Phase 1 文档中写了完整的 `src/lib/domain/ai/harness/schemas/<operation>.ts` 这样的路径，重组后全部失效。

**新做法：**
- CLAUDE.md 用**规则描述**而非路径，如"每个 AI 操作需要 schema + prompt + operation 三件套，位于 AI domain 下对应子目录"
- docs 里引用路径用 grep 可搜索的关键词而非完整路径

### 2.6 Phase 2 Sprint 1 做技术验证（Spike）

Phase 2 涉及多个技术未知，不适合直接写功能代码。

**Sprint 1（Spike）目标** — 不交付用户功能，只验证技术方案：

| 验证项 | 目的 | 产出 |
|--------|------|------|
| Azure OpenAI function calling | 确认调用模式、多轮循环控制 | Agent Runner 原型 |
| 知识图谱存储方案 | PostgreSQL JSONB vs 独立图数据库 vs pgvector | 存储方案 ADR |
| Agent 循环控制 | 最大步数、Token 预算、超时策略 | AgentStepLimiter 原型 |
| CircuitBreaker | 验证多 Provider 降级切换 | CircuitBreaker 组件 |
| Student Memory 读写模式 | 掌握状态机、间隔复习算法 | Memory 层接口定义 |

基于 Spike 结果写后续 Sprint 的详细 spec。

---

## 三、工程机制调整（5 条）

### 3.1 用户故事格式扩展

Phase 1 的用户故事格式（角色/行为/验收标准/边界条件/性能要求）对 CRUD 够用，但 Agent 功能需要额外字段。

**Phase 2 用户故事新增字段：**

```markdown
## US-NNN: Agent Feature Title

（...原有字段保留...）

**Skill 依赖**:
- skill_name_1: 用途说明
- skill_name_2: 用途说明

**Agent 循环终止条件**:
- 最大步数: N
- 决策停止条件: 描述
- Token 预算: N tokens

**Skill 失败恢复**:
- skill_name_1 失败 → 降级策略
- 全部 Skill 不可用 → 兜底行为

**成本约束**:
- 单次 Agent 会话 Token 上限: N
- 每日用户 Agent 调用上限: N
```

### 3.2 CLAUDE.md 新增 Phase 2 规则

Phase 1 的 5 条规则全部保留。Phase 2 需新增：

**Rule 6: Agent 合规**
- 所有 Agent 必须有显式终止条件（max steps + decision criteria）
- 所有 function calling 决策写入 AICallLog（可审计）
- 所有 Agent 使用的 Skill 必须有 Zod output schema
- Skill 注册表包含 Azure OpenAI tool format 的 function calling schema
- Agent 代码不能直接查数据库 — 必须通过 Skill

**Rule 7: Student Memory 隔离**
- Agent/Skill 对学生状态的写入必须通过 Memory 层
- 不能从 Agent/Skill 直接 Prisma 写入
- Memory 读取标注缓存 TTL
- 掌握状态机转换必须经过验证

**Rule 8: Function Calling 安全**
- `tools` 数组硬编码在 Agent 定义中（不能动态构建）
- Tool parameter schema 与 Skill 输入类型匹配
- Agent system prompt 显式禁止调用未列出的 tool
- Function call 结果用 try-catch 包裹（Skill 执行韧性）

### 3.3 Redis Pub/Sub 可靠性评估

Phase 1 的 SSE 推送是单次结果通知（OCR 完成、帮助生成完成），丢一条消息客户端重新请求就行。Phase 2 的 Agent 是**多步循环**，中间状态推送如果丢了，客户端会看到"卡住"。

**技术 Spike 时需评估：**
- Agent 步骤状态是否需要持久化到 DB
- 客户端断线重连后能否拉取历史步骤
- 是否需要从 Redis Pub/Sub 升级到更可靠的消息投递机制

### 3.4 测试策略转变

Phase 1 全部 mock AI Provider，对确定性的单次调用没问题。Phase 2 的 Agent 循环是**多轮调用**，需要新的测试层：

| 测试层 | Phase 1 | Phase 2 新增 |
|--------|---------|-------------|
| 单元测试 | Mock AI，验证单组件 | **Skill 单元测试**：每个 Skill 独立测试输入输出 |
| 集成测试 | 无 | **Agent 集成测试**：用预录的 function calling 响应序列（fixture）验证循环逻辑 |
| 终止测试 | 无 | **边界测试**：验证 Agent 在超步数、超预算、Skill 全失败时确实停下来 |
| 架构测试 | Harness 完整性、i18n 覆盖 | **新增**：Agent 不直接 Prisma 写入、Skill 注册表完整性 |

### 3.5 Prompt 管理扩展

Phase 1 的 4 个 prompt 硬编码在 TypeScript 文件里。Phase 2 Agent 会增加到 10+ 个（每个 Agent 的 system prompt + 每个 Skill 的 instruction）。

**改进：**
- Prompt 增加 `version` 字段，版本号写入 AICallLog（回溯哪个版本效果好）
- PromptManager 注册时包含版本号，方便未来 A/B 测试
- 不需要现在做 prompt 管理 UI，但数据结构要预留

---

## 四、Phase 2 前置工作清单

以下工作在 Phase 2 Sprint 1（技术 Spike）中完成：

- [ ] 设计 Student Memory schema（MasteryState、ReviewSchedule、InterventionHistory）
- [ ] 设计 Knowledge Graph schema（KnowledgePoint、PrerequisiteRelation、QuestionMapping）
- [ ] 实现 CircuitBreaker 组件
- [ ] 实现 AgentStepLimiter 原型
- [ ] 实现 CostTracker 原型（Token 预算 + 告警）
- [ ] 创建 Skill 注册表模式（function calling schema 模板）
- [ ] 实现 Agent Runner 原型（call → observe → decide → next call 循环）
- [ ] 评估 Redis Pub/Sub 在多步 Agent 场景下的可靠性
- [ ] 验证 Azure OpenAI function calling 实际调用模式
- [ ] 评估 pgvector 用于 SemanticCache 的可行性
- [ ] 创建 Phase 2 用户故事模板（含 Agent 专属字段）
- [ ] 更新 CLAUDE.md（新增 Rule 6/7/8）

---

## 五、Phase 2 Sprint 规划框架

| Sprint | 周期 | 主题 | 前置 |
|--------|------|------|------|
| Sprint 4 | 1 周 | 技术 Spike + 基础设施 | 无 |
| Sprint 5 | 1 周 | Knowledge Graph + Question Understanding Agent | Sprint 4 验证通过 |
| Sprint 6 | 1 周 | Diagnosis Agent + Student Memory | Sprint 5 |
| Sprint 7 | 1 周 | Mastery Tracking + 间隔复习 | Sprint 6 |
| Sprint 8 | 1 周 | Parent Reports v1 + Phase 2 收尾 | Sprint 7 |

> Sprint 5-8 的详细用户故事在各 Sprint 开始时才写，不提前全量规划。

---

## 六、总结

Phase 2 保留 Phase 1 的文档驱动框架，做以下调整：

| 维度 | Phase 1 做法 | Phase 2 调整 |
|------|-------------|-------------|
| 文档节奏 | 全量预写 | 逐 Sprint 递进 |
| Sprint 周期 | 2 周 / 10+ 任务 | 1 周 / 5-7 任务 |
| ADR 策略 | 预写含架构预留 | 只写当前 Sprint 实现的 |
| 测试时机 | 任务完成时跑 | 改代码后立即跑相关测试 |
| 文档路径 | 硬编码完整路径 | 规则描述 + 关键词 |
| 第一个 Sprint | 直接写功能 | 技术 Spike 先行 |
| 用户故事格式 | CRUD 通用 | 扩展 Agent 专属字段 |
| CLAUDE.md | 5 条规则 | 新增 Agent 合规 / Memory 隔离 / FC 安全 |
| 消息推送 | Redis Pub/Sub 单次通知 | 评估多步 Agent 可靠性 |
| 测试策略 | Mock 单次调用 | Agent 集成测试 + 终止边界测试 |
| Prompt 管理 | 无版本号 | 版本号写入日志 |

---

## 七、启动设计决策记录

> 以下决策在 Phase 2 启动讨论中确定（2026-04-10），记录选择和原因。

| # | 决策 | 选择 | 候选方案 | 选择原因 |
|---|------|------|---------|---------|
| D1 | Agentic 程度 | Phase 2 用户触发 + Agent 自主；Phase 3 做 Learning Brain | 直接 Learning Brain | 工作量已大，solo dev 风险高，基础设施需先验证 |
| D2 | Skill 动态化 | IPC 沙箱完全插件化 | 代码+DB开关 / 折中预留接口 | 用户坚持完全插件化，未来可动态添加 Skill |
| D3 | IPC vs 直接调用 | worker_threads IPC | isolated-vm / 直接函数调用 | 平衡安全隔离和实现复杂度 |
| D4 | Skill Schema 格式 | Canonical JSON Schema（provider-agnostic）| Azure OpenAI tools 格式 | 未来计划切换到本地开源模型（Gemma/Llama） |
| D5 | 闭环维度 | 学习闭环 + Agent 操作闭环嵌套 | 只做学习闭环 / 只做 Agent 闭环 | 两者互补，学习闭环是目标，Agent 闭环是手段 |
| D6 | Agent Trace 可视化 | 管理员完整 trace + 家长/学生简化版 | 仅管理员 / 仅后端日志 | 透明度是可控闭环的关键 |
| D7 | 用户故事节奏 | 先写高层大纲，逐 Sprint 详写 | 全量预写 / 完全不写 | Agent prompt/schema 在实现中才能调稳 |
| D8 | Sprint 4 拆分 | 拆为 4a + 4b（各 1 周） | 10 任务 1 周 / 10 任务 2 周 | Skill 插件系统是重量级任务，需独立 Sprint |
| D9 | Skill 开发工具 | 脚手架 CLI（交互式创建模板） | 手工复制 / 无工具 | 参考 Claude Code skill-creator 模式 |
| D10 | Schema Adapter | 运行时转换层（OpenAI/Anthropic/Ollama） | 硬编码 Provider 格式 | 与 Phase 1 AIProvider 抽象层一致 |
