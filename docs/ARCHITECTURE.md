# Star Catcher - 架构设计文档

> 本文档是 Star Catcher 的架构总纲，覆盖所有阶段。每个新 Phase 开始时首先阅读本文档。
> TypeScript 接口与 Zod schema 定义位于源码中，本文档不重复。

---

## 1. AI Harness 管道

### 1.1 设计理念

业务代码不直接调用 AI Provider，而是通过 Harness（线束）管道。Harness 在 AI 调用前后注入跨切面控制逻辑（输入净化、输出校验、安全过滤、限流、降级、日志），使关注点与业务逻辑分离。

### 1.2 架构分层与文件结构

```
业务代码 (tRPC procedures / BullMQ workers)
        |
        v
  Operations 层 (recognize-homework / detect-subject / generate-help)
        |
        v
  AI Harness 管道
   +-- Pre-call -----------------------------------+
   |  RateLimiter -> PromptInjectionGuard          |
   |  -> PromptManager                             |
   +-----------------------------------------------+
        |
   AIProvider.chat() / .vision()
        |
   +-- Post-call ----------------------------------+
   |  OutputValidator -> ContentGuardrail          |
   |  -> CallLogger                                |
   +-----------------------------------------------+
        |
   +-- Error path ---------------------------------+
   |  FallbackHandler -> CallLogger                |
   +-----------------------------------------------+
```

### 1.3 Harness 组件职责（Phase 1 vs Phase 2+）

| 组件 | 职责 | 必要性理由 |
|------|------|-----------|
| OutputValidator | Zod schema 校验 AI JSON 输出 | OCR 畸形输出会污染学生数据，最高风险 |
| PromptManager | 模板注册 + 变量注入 | 3 种操作 x 多语言 x 年级适配，散落 prompt 不可维护 |
| ContentGuardrail | K-12 内容安全过滤 | 给儿童用的 AI 产品，不当内容必须拦截 |
| PromptInjectionGuard | 用户输入净化 | 学生文字嵌入 prompt，需防止注入 |
| FallbackHandler | AI 不可用时降级 | 系统应优雅退化而非崩溃 |
| RateLimiter | Redis 滑动窗口限流 | 落实 5 次/分 100 次/天的规则 |
| CallLogger | AICallLog 持久化 | 落实 AICallLog 模型的写入逻辑 |

**Phase 2+ 延后**: 熔断器（Circuit Breaker）、语义缓存、预算上限、深度可观测性（OpenTelemetry）。

### 1.4 文件结构

```
src/lib/ai/
+-- types.ts                      # AIProvider 接口 + Response 类型
+-- provider-factory.ts           # createAIProvider() 工厂
+-- singleton.ts                  # 全局 AIHarness 实例
+-- providers/
|   +-- azure-openai.ts           # AzureOpenAIProvider
+-- harness/
|   +-- index.ts                  # createAIHarness() 组装管道
|   +-- types.ts                  # AIOperation, AICallContext, AIHarnessResult<T>
|   +-- prompt-manager.ts         # 模板注册 + 变量注入
|   +-- prompt-injection-guard.ts # 输入净化（中英双语模式检测）
|   +-- output-validator.ts       # Zod 校验 + 鲁棒 JSON 解析
|   +-- content-guardrail.ts      # K-12 内容安全过滤
|   +-- rate-limiter.ts           # Redis 滑动窗口
|   +-- fallback-handler.ts       # 降级策略
|   +-- call-logger.ts            # AICallLog 持久化（fire-and-forget）
|   +-- schemas/                  # 每种 AI 操作的输出 Zod Schema
+-- prompts/                      # Prompt 模板（TypeScript 常量，版本化）
+-- operations/                   # 业务层调用入口
    +-- recognize-homework.ts     # OCR 识别编排
    +-- detect-subject.ts         # 学科检测编排
    +-- generate-help.ts          # 求助生成编排
```

---

## 2. Operations 层与降级策略

Operations 层是 BullMQ workers 和 tRPC procedures 调用 AI 的唯一入口，不直接接触 Harness 内部。Phase 1 定义三种 AI 操作:

| 操作 | 调用者 | 用途 |
|------|--------|------|
| `recognize-homework` | BullMQ `ocr-recognize` worker | 图片 OCR 识别 + 判分 |
| `detect-subject` | BullMQ `subject-detect` worker | 手动录入时学科自动识别 |
| `generate-help` | BullMQ `help-generate` worker | 渐进式求助（L1/L2/L3） |

每个 AI 操作由 3 个文件定义（以 `recognize-homework` 为例）：

```
src/lib/ai/
├── operations/recognize-homework.ts    # export async function recognizeHomework(params): Promise<AIHarnessResult<T>>
├── prompts/recognize-homework.ts       # export const ocrRecognizePrompt: PromptTemplate
└── harness/schemas/recognize-homework.ts  # export const OCRRecognitionOutputSchema = z.object({...})
```

接口签名与返回类型定义在源码 `src/lib/ai/operations/` 中。所有返回 `AIHarnessResult<T>`，调用约定:
- `result.success === true` -> 读取 `result.data`
- `result.error?.retryable === true` -> 抛出错误让 BullMQ 重试
- 否则执行降级流程

### 2.1 降级服务策略

| 操作 | 降级方案 | 用户体验 |
|------|---------|---------|
| `ocr-recognize` | 返回 `RECOGNITION_FAILED` | 引导用户手动录入，不伪造数据 |
| `subject-detect` | 返回 `{ subject: 'OTHER', confidence: 0 }` | 用户可手选学科（UI 已支持修正） |
| `help-generate` | 返回静态通用提示（按 locale 本地化） | 通用审题引导提示 |

降级结果通过 `AIHarnessResult.fallback = true` 标记，业务层据此调整 UI 提示。

---

## 3. 异步任务设计（BullMQ）

### 3.1 队列与策略

| 队列名 | 触发时机 | 超时 | 重试 |
|--------|----------|------|------|
| `ocr-recognize` | 用户上传图片后 | 60s | 最多 2 次 |
| `subject-detect` | 手动录入题目后 | 15s | 最多 1 次 |
| `help-generate` | 学生点击求助后 | 30s | 最多 1 次 |

### 3.2 轮询机制

- 前端通过 `homework.getSession` tRPC 查询轮询状态，间隔 2 秒
- 当状态从 `RECOGNIZING` 变为 `RECOGNIZED` / `RECOGNITION_FAILED` 时停止轮询
- 前端显示识别进度动画和预计等待时间

---

## 4. 错误处理策略

### 4.1 错误场景与处理

| 场景 | 处理方式 | 用户提示 (i18n key) |
|------|----------|---------------------|
| AI 识别超时 | 标记 RECOGNITION_FAILED | 识别超时，请重试或手动录入 |
| AI 识别结果为空 | 标记 RECOGNITION_FAILED | 未能识别出题目，请确认图片清晰度后重试 |
| AI JSON 输出畸形 | OutputValidator 拦截，触发重试 | 系统繁忙，正在重试... |
| AI 输出含不当内容 | ContentGuardrail 拦截，返回降级结果 | 显示通用安全提示替代 |
| AI API 调用失败 | 记录错误日志，触发重试 | 系统繁忙，正在重试... |
| AI API 额度用完 | 记录告警，通知管理员 | 系统暂时不可用，请稍后再试 |
| AI 所有重试失败 | FallbackHandler 降级 | 按操作类型显示降级体验 |
| 用户输入疑似注入 | PromptInjectionGuard 评分，高危拦截 | 输入内容异常，请修改后重试 |
| 图片上传失败 | 前端重试 3 次 | 上传失败，请检查网络后重试 |
| 图片格式不支持 | 前端拦截 | 不支持的文件格式 |
| 图片过大 | 前端压缩或拦截 | 图片过大，正在压缩... |

> 注: 上述用户提示文案为说明性描述。实现时通过 next-intl i18n key 管理。

### 4.2 Harness 管道错误传播规则

1. **Pre-call 阶段**（RateLimiter、PromptInjectionGuard）失败 -> 不调用 AI，直接返回错误
2. **AI 调用失败** -> BullMQ 重试；重试耗尽后 -> FallbackHandler 降级
3. **Post-call OutputValidator 失败** -> 视为 AI 调用失败，触发重试
4. **Post-call ContentGuardrail 标记不安全** -> 使用降级结果替代
5. **所有错误路径**均经过 CallLogger 记录

---

## 5. 页面路由设计

### 5.1 路由表

| 路径 | 说明 |
|------|------|
| `/[locale]/` | 根据角色重定向 |
| `/[locale]/login` | 登录页 |
| `/[locale]/register` | 注册页 |
| **学生端** | |
| `/[locale]/student/` | 学生首页（快速拍照入口） |
| `/[locale]/student/check` | 作业检查页（拍照上传 + 识别） |
| `/[locale]/student/check/[sessionId]` | 检查流程页（多轮检查） |
| `/[locale]/student/errors` | 错题列表 |
| `/[locale]/student/errors/[id]` | 错题详情 |
| `/[locale]/student/manual-input` | 手动录入 |
| `/[locale]/student/settings` | 个人设置 |
| **家长端** | |
| `/[locale]/parent/` | 家长首页（今日概览） |
| `/[locale]/parent/student/[id]` | 某学生的详细视图 |
| `/[locale]/parent/student/[id]/session/[sid]` | 作业检查详情 |
| `/[locale]/parent/student/[id]/errors` | 该学生错题列表 |
| `/[locale]/parent/student/[id]/stats` | 该学生统计 |
| `/[locale]/parent/family` | 家庭组管理 |
| `/[locale]/parent/settings` | 设置（含答案策略配置） |
| **管理员** | |
| `/[locale]/admin/` | 管理后台首页 |
| `/[locale]/admin/users` | 用户管理 |
| `/[locale]/admin/system` | 系统配置 |

### 5.2 Locale 路由规则

- 访问 `/` 时: 检测已登录用户语言偏好 -> 浏览器 `Accept-Language` -> 默认 `zh`，重定向到 `/zh/` 或 `/en/`
- 语言切换: 保持当前路径，替换 locale 前缀（`/zh/student/errors` <-> `/en/student/errors`）
- 使用 next-intl middleware 自动处理 locale 路由匹配和重定向
- 所有 `<Link>` 组件通过 next-intl 的 `usePathname` + `useRouter` 自动注入当前 locale 前缀

---

## 6. AI 架构演进路线：从 Function 到 Agentic

Star Catcher 的 AI 架构分三个阶段演进。每个阶段在上一阶段基础上叠加新层，Harness 管道始终作为安全底座不变。

### 6.1 三阶段总览

```
Phase 1: AI-as-a-Function（当前）
  代码驱动，AI 被动执行单次调用
  业务代码 → Operations → Harness → Provider

Phase 2: AI-with-Tools（Function Calling）
  AI 获得 Skills 作为 tools，在单次对话中自主选择调用
  业务代码 → Agent → [自主选择 Skill] → Operations → Harness → Provider

Phase 3: Agentic Loop（Learning Brain）
  AI 作为全局编排器，自主循环：观察 → 决策 → 执行 → 更新
  触发事件 → Learning Brain Loop → [选择 Agent] → Agent → Skills → Harness → Provider
                    ↑                                              |
                    └──────── 观察结果，更新 Student Memory ←───────┘
```

### 6.2 核心概念定义

| 概念 | 是什么 | 类比 |
|------|--------|------|
| **Function Calling** | LLM API 的底层机制 — 模型收到可用函数列表，自己决定调什么、传什么参数 | "手能抓东西" |
| **Skill** | 封装好的原子能力单元，有明确输入/输出契约，可被 Agent 通过 function calling 调用 | "一个具体动作" |
| **Agent** | 专注特定任务的 AI 实体，通过 function calling 自主选择并串联多个 Skill | "一个专家" |
| **Learning Brain** | 全局编排器，决定该启动哪个 Agent、以什么策略执行、何时停止 | "大脑" |
| **Student Memory** | 持久化的学生状态（掌握度、错题、干预历史），Agent 读写这些数据做决策 | "记忆" |

**关系链**：Learning Brain → 选择 Agent → Agent 通过 function calling → 调用 Skills → 每个 Skill 经过 Harness 管道

### 6.3 Phase 1：AI-as-a-Function（当前阶段）

```
学生/家长操作（拍照、手动录入、点求助）
      ↓
tRPC / BullMQ
      ↓
Operations 层（代码硬编码调用哪个操作）
      ↓
Harness 管道（限流 → 净化 → 组 prompt → AI 调用 → 校验 → 安全 → 日志）
      ↓
AIHarnessResult<T>
```

**特征**：
- 代码控制一切流程，AI 只做"填空"
- 3 个固定操作：`recognizeHomework`、`detectSubject`、`generateHelp`
- 无 function calling，无自主决策
- 适合 Phase 1 的确定性任务（OCR、判分、模板化求助）

### 6.4 Phase 2：AI-with-Tools（Function Calling）

```
学生完成作业检查 → 触发诊断流程
      ↓
业务代码启动 Agent（如 DiagnosisAgent）
      ↓
Agent 收到：系统提示 + 学生数据 + 可用 Skills 列表
      ↓
┌─ Agent 对话循环 ─────────────────────────────┐
│ 模型自主决定：先调 query_knowledge_graph      │
│      ↓                                        │
│ Skill 执行（经 Harness）→ 返回结果给模型      │
│      ↓                                        │
│ 模型观察结果，决定：再调 get_error_history    │
│      ↓                                        │
│ Skill 执行 → 返回结果                         │
│      ↓                                        │
│ 模型判断信息充分，生成诊断报告                 │
└───────────────────────────────────────────────┘
      ↓
诊断结果写入 Student Memory
```

**新增组件**：

| 组件 | 职责 |
|------|------|
| Agent 定义 | 系统提示 + 可用 Skills 列表 + 终止条件 |
| Skill 注册表 | 所有 Skill 注册为 function calling 的 tools schema |
| Agent Runner | 管理 Agent 对话循环（调用 → 观察 → 再调用 → 直到完成） |
| Student Memory 读写 | Agent 需要读写学生状态数据 |

**Skills 注册示例**（Azure OpenAI function calling 格式）：

```typescript
// Phase 2: 诊断 Agent 的 tools 定义
const diagnosisAgentTools = [
  {
    type: "function",
    function: {
      name: "query_knowledge_graph",
      description: "查询知识点的前置依赖关系和关联知识点",
      parameters: {
        type: "object",
        properties: {
          knowledgePointId: { type: "string" }
        },
        required: ["knowledgePointId"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_student_error_history",
      description: "获取学生在某知识点上的历史错题和掌握状态",
      parameters: {
        type: "object",
        properties: {
          studentId: { type: "string" },
          knowledgePointId: { type: "string" }
        },
        required: ["studentId", "knowledgePointId"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "analyze_error_pattern",
      description: "分析多道错题的错误模式（计算错误/概念混淆/粗心/方法错误）",
      parameters: {
        type: "object",
        properties: {
          questionIds: { type: "array", items: { type: "string" } }
        },
        required: ["questionIds"]
      }
    }
  }
]
```

**每个 Skill 的实际执行仍然经过 Harness 管道** — Skill 不是绕过安全层的快捷方式。

**文件结构扩展**：

```
src/lib/ai/
├── operations/          # Phase 1 保留，Phase 2 新增
├── harness/             # 不变
├── prompts/             # 不变
├── skills/              # 新增：Skill 定义 + 实现
│   ├── registry.ts      # Skill 注册表（所有 Skill 的 function schema）
│   ├── query-knowledge-graph.ts
│   ├── get-error-history.ts
│   └── analyze-error-pattern.ts
├── agents/              # 新增：Agent 定义
│   ├── runner.ts        # Agent 对话循环引擎
│   ├── diagnosis.ts     # 诊断 Agent（系统提示 + tools 列表）
│   ├── question-understanding.ts
│   └── mastery-evaluation.ts
└── memory/              # 新增：Student Memory 读写层
    ├── student-state.ts # 读写学生掌握状态
    └── intervention-history.ts
```

### 6.5 Phase 3：Agentic Loop（Learning Brain）

```
事件触发（新错题、复习到期、学期结束）
      ↓
┌─ Learning Brain Loop ────────────────────────┐
│ 1. 观察：读取 Student Memory（当前状态）      │
│ 2. 判断：需要做什么？                         │
│    - 新错题 → 启动 DiagnosisAgent            │
│    - 复习到期 → 启动 ReviewSchedulingSkill   │
│    - 薄弱趋势 → 启动 InterventionAgent       │
│ 3. 执行：Agent 自主调用 Skills               │
│ 4. 更新：结果写回 Student Memory             │
│ 5. 循环：检查是否还有待处理任务              │
└───────────────────────────────────────────────┘
```

**新增组件**：

| 组件 | 职责 |
|------|------|
| Learning Brain | 全局编排器，通过 function calling 自主选择启动哪个 Agent |
| Event Trigger | 监听数据库变更事件，触发 Brain 循环 |
| Strategy Engine | Brain 的决策辅助 — 根据学生画像选择干预策略 |
| Daily Task Packager | 将 Brain 输出的干预计划打包为学生可执行的任务 |

### 6.6 跨阶段不变量

无论处于哪个阶段，以下规则始终成立：

1. **Harness 管道不可绕过** — 所有 AI 调用（无论是直接的 Operation、Skill 内部、还是 Agent 对话）都经过 Harness
2. **Zod 校验不可跳过** — 每个 Skill 的输出必须有 schema 校验
3. **ContentGuardrail 始终激活** — 任何展示给学生的 AI 内容必须过滤
4. **AICallLog 记录一切** — 无论调用来源，所有 AI 调用都持久化
5. **降级优于崩溃** — 任何环节失败都有 fallback 路径
6. **Student Memory 是数据库** — 不用内存或文件存储学生状态

### 6.7 Phase 2 新增 Harness 组件

Phase 1 的 7 个 Harness 组件在 Phase 2 继续使用，并新增：

| 组件 | 职责 | 必要性 |
|------|------|--------|
| CircuitBreaker | 多 provider 场景下的熔断保护 | 必须（Agent 循环可能频繁调用 AI） |
| SemanticCache | 相似 Skill 调用结果缓存（基于 pgvector） | 必须（Agent 可能重复查询相似知识点） |
| CostTracker | Token 预算管理 + Agent 循环最大步数限制 | 必须（防止 Agent 无限循环消耗 token） |
| AgentStepLimiter | 单个 Agent 对话的最大 function call 次数 | 必须（硬上限，如单次 Agent 最多 10 步） |
