# ADR-008: Agent Runner + Skill 插件系统架构

## Status
Accepted (Sprint 4a/4b)

## Context

Phase 1 使用 3 个固定 Operations（recognizeHomework、detectSubject、generateHelp），代码硬编码调用哪个操作。Phase 2 引入：
1. AI Agent 自主决策调用 Skill（function calling，provider-agnostic）
2. Skill 完全插件化 — 管理员可上传/启用/禁用 Skill，不需代码部署
3. Skill 在 IPC 沙箱中隔离执行，安全可控

## Decision

### 1. Skill 插件系统

**Skill 生命周期：开发 → 打包 → 上传 → 审核 → 启用**

每个 Skill 是一个独立 bundle，包含：
- `manifest.json`: 元信息（name, version, description, author）
- `schema.json`: **Canonical JSON Schema 格式**的参数定义（用于 function calling，provider-agnostic，不绑定任何 AI Provider）
- `execute.ts`: 执行逻辑 + Zod input/output schema（编译为 JS 后在沙箱中运行；Zod schema 用于运行时校验输入输出）

**Skill 存储**:
- Skill 配置存入 DB（SkillDefinition 表）
- Skill 代码打包为 bundle 存入 MinIO
- Skill 运行时由 SkillRuntime 从缓存/存储加载到沙箱

**DB Schema**:

```
SkillDefinition:
  - id, name, version, description, author
  - functionSchema (JSONB): Canonical JSON Schema（provider-agnostic，用于 function calling）
  - bundleUrl: MinIO 中的代码 bundle 路径
  - config (JSONB): 可配置参数（timeout、cache TTL 等）
  - status: DRAFT | ACTIVE | DISABLED | DEPRECATED
  - callCount, avgDurationMs（统计）
  - createdAt, updatedAt, deletedAt
```

**Skill 管理（管理员后台）**:
- 查看已注册 Skill 列表（名称、版本、状态、调用统计）
- 启用/禁用 Skill（Toggle 开关，立即生效）
- 上传新 Skill bundle（经校验后注册）
- 编辑 Skill 配置参数
- 查看 Skill 调用历史和性能指标

### 2. Schema Adapter（多 Provider 兼容）

Skill 的 `schema.json` 存 Canonical JSON Schema（标准 JSON Schema 格式），不绑定任何 Provider。Agent Runner 组装 tools 时通过 Schema Adapter 转换为当前 Provider 的格式：

```typescript
// schema-adapter.ts
interface CanonicalSkillSchema {
  name: string;
  description: string;
  parameters: JSONSchema;  // 标准 JSON Schema
}

function toProviderFormat(skill: CanonicalSkillSchema, provider: ProviderType): unknown {
  switch (provider) {
    case 'openai':    // Azure OpenAI / OpenAI
      return { type: 'function', function: { name: skill.name, description: skill.description, parameters: skill.parameters } };
    case 'anthropic': // Claude
      return { name: skill.name, description: skill.description, input_schema: skill.parameters };
    case 'ollama':    // Llama / Gemma via Ollama
      return { type: 'function', function: { name: skill.name, description: skill.description, parameters: skill.parameters } };
  }
}
```

切换 Provider 只需加 adapter case，不需改任何 Skill schema。与 Phase 1 的 `AIProvider` 抽象层一致——Provider 切换对上层透明。

### 3. IPC 沙箱执行

**核心架构**：Skill 代码在 `worker_threads` 中隔离执行，通过消息传递（IPC）访问外部能力。

```
Agent Runner → SkillRuntime.execute(skillName, input)
  → 启动 Worker Thread，加载 Skill bundle
  → Skill 代码执行，需要外部能力时：
      Skill → postMessage({ type: "harness.call", ... })
        → 宿主进程收到 → 路由到 Harness 管道 → AI 调用 → 结果返回
        → postMessage({ id, result }) → Skill 收到结果，继续
      Skill → postMessage({ type: "memory.read", ... })
        → 宿主进程收到 → 路由到 Memory 层 → 查询 → 结果返回
  → Skill 执行完毕 → 返回最终结果
```

**IPC 协议**：

```typescript
// Skill → 宿主 (请求)
interface SkillRequest {
  id: string;           // 请求唯一 ID（用于匹配响应）
  type: 'harness.call' | 'memory.read' | 'memory.write';
  method: string;       // 具体方法名
  params: unknown;      // 参数（JSON 可序列化）
}

// 宿主 → Skill (响应)
interface SkillResponse {
  id: string;           // 对应请求 ID
  success: boolean;
  data?: unknown;
  error?: { code: string; message: string };
}
```

**沙箱安全约束**：
- Worker Thread 执行超时限制（单个 Skill 调用 ≤ 30s）
- 内存限制（通过 `resourceLimits`）
- Skill 只能通过 IPC 协议访问三类能力：
  1. `harness.call` — 调用 AI（经 Harness 管道）
  2. `memory.read` — 读取 Student Memory
  3. `memory.write` — 写入 Student Memory（经状态机验证）
- 禁止直接访问 Prisma、文件系统、网络

**SkillContext（提供给 Skill 的 API）**：

```typescript
// Skill 开发者使用的接口
interface SkillContext {
  // 调用 AI（经 Harness 管道）
  callAI(operation: string, params: unknown): Promise<AIHarnessResult>;
  // 读 Student Memory
  readMemory(method: string, params: unknown): Promise<unknown>;
  // 写 Student Memory（经状态机验证）
  writeMemory(method: string, params: unknown): Promise<void>;
  // Skill 配置参数
  config: Record<string, unknown>;
  // 当前执行上下文
  context: SkillExecutionContext;
}

// 执行上下文（宿主进程注入，Skill 只读）
interface SkillExecutionContext {
  studentId: string;        // 当前学生 ID
  agentId: string;          // 发起调用的 Agent 名称
  sessionId: string;        // 会话 ID
  traceId: string;          // 当前 AgentTrace ID（用于审计关联）
  locale: string;           // 用户语言（zh/en）
}
```

### 4. Agent 定义

每个 Agent 声明（代码文件，Phase 2 不入 DB）：
- `systemPrompt`: 角色 + 任务 + 约束
- `allowedSkills`: 可用的 Skill 名称列表
- `terminationConditions`:
  - `maxSteps`: 最大 function call 次数（硬上限）
  - `maxTokens`: Token 预算
  - `stopCriteria`: 停止条件描述（写入 system prompt）

### 5. Agent Runner

管理 Agent 对话循环：
1. 加载 Agent 定义
2. 从 DB 查询 ACTIVE 的 allowedSkills → 通过 Schema Adapter 组装 tools 数组
3. 循环：
   - AI 调用（经 Harness）→ 解析 function_call
   - SkillRuntime 加载 Skill bundle → 在 Worker Thread 中执行 → IPC 代理
   - 结果追加到对话
   - 每步写入 AgentTrace + AICallLog
   - 每步推送状态（AgentTracePublisher → SSE）
   - 检查 AgentStepLimiter + CostTracker
4. 终止时生成摘要

### 6. Agent Execution Trace

**数据层**:

```
AgentTrace:
  - id, agentName, sessionId, userId
  - status: RUNNING | COMPLETED | TERMINATED | FAILED
  - totalSteps, totalTokens, totalDurationMs
  - terminationReason: COMPLETED | MAX_STEPS | MAX_TOKENS | SKILL_ALL_FAILED | ERROR
  - summary (TEXT): AI 生成的执行摘要（给家长/学生看）
  - createdAt, completedAt

AgentTraceStep:
  - id, traceId (FK → AgentTrace)
  - stepNo
  - skillName
  - input (JSONB), output (JSONB)
  - tokensUsed, durationMs
  - status: SUCCESS | FAILED | TIMEOUT
  - errorMessage
  - createdAt
```

**实时推送**:
AgentTracePublisher 是一个事件发射器，每当 AgentTraceStep 写入时触发，通过 tRPC SSE subscription 推送给前端。Phase 1 已实现的 SSE 基础设施（BullMQ → tRPC subscription）可复用。

**展示层**:
- 管理员：完整 trace 时序图（每步 Skill 调用 + 输入输出 + 耗时 + Token）
- 家长：简化摘要（AgentTrace.summary，如"AI 分析了 3 个知识点，发现 2 个薄弱环节"）
- 学生：进度指示（"AI 正在分析你的错题..."，完成后显示结果摘要）

## Consequences

**Positive:**
- 真正的插件化 — 管理员上传 bundle 即可加 Skill，不需代码部署
- Provider-agnostic — Schema Adapter 支持多 AI Provider 切换
- IPC 隔离保障安全 — Skill 不能越权访问
- 完整审计链 + 可视化 — AgentTrace + AgentTraceStep
- Skill 接口标准化 — SkillContext API 清晰

**Negative:**
- IPC 沙箱是重大工程（预估 2 周）
- 序列化/反序列化性能开销
- Skill 调试比直接代码复杂
- 需要设计 Skill 打包工具和脚手架 CLI
