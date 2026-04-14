# Sprint 10a: SemanticCache + ObservabilityTracer 基础设施 (Week 14)

**Status**: IN_PROGRESS

**目标**: 搭建 Phase 3 基础设施前半 — SemanticCache 集成 + OpenTelemetry 观测 + BullMQ Handler/Schedule Registry 重构 + Harness 组件管道重构。

## 任务清单

| # | 任务 | 产出 |
|---|------|------|
| 89 | Sprint 10a 用户故事 + Sprint 文件 | US-044 (SemanticCache 集成)、US-045 (ObservabilityTracer) |
| 90 | DB 迁移：新增模型 + 字段扩展 | Prisma migration（详见 `docs/phase3-db-schema.md`） |
| 91 | SemanticCache + EmbeddingProvider + Harness 重构 | Harness 组件管道模式 + EmbeddingProvider 抽象层 + 双层语义缓存 |
| 92 | ObservabilityTracer Harness 组件 | OpenTelemetry SDK 集成；Harness 管道 OTel 自动包装；导出到 Jaeger |
| 93 | BullMQ Handler Registry + Schedule Registry + 新 job types | Worker switch -> `JOB_HANDLERS` 注册表；新增 `SCHEDULE_REGISTRY` 声明式定时任务；新增 4 个 job type |
| 94 | Sprint 10a 集成验证 | 管道测试 + SemanticCache 测试 + Handler Registry 测试 + npm test + tsc --noEmit |

## 设计决策

- **Harness 重构为组件管道**: `HarnessComponent` 接口 + `HarnessPipeline` 执行器。每个组件独立类，管道数组可配。OTel span 由执行器自动包装
- **SemanticCache**: Harness 管道新组件，pgvector brute-force（Spike < 50ms @ 5000 条）。双层缓存：prompt_hash 精确匹配 → embedding 语义匹配（cosine ≥ 0.95）。D19
- **EmbeddingProvider**: 独立于 AIProvider 的接口 + 工厂模式。环境变量配置（EMBEDDING_PROVIDER / MODEL / DIMENSIONS），本地化部署只需改环境变量
- **ObservabilityTracer**: `@opentelemetry/sdk-node` + Jaeger；Pipeline 执行器 `withSpan` 自动包装每个组件；OTEL_ENABLED=false 时零开销。D21
- **Handler Registry**: `Record<AIJobName, JobHandler>` 替代 switch，与 OperationRegistry 模式一致。Rule 9
- **Schedule Registry**: `SCHEDULE_REGISTRY` 数组声明所有 repeatable jobs，Worker 启动时遍历注册。Rule 9

## 详细实施计划

### Task 89: User Stories + Sprint File

**文件:**
- 新建 `docs/user-stories/semantic-cache.md` (US-044)
- 新建 `docs/user-stories/observability.md` (US-045)
- 修改 `docs/user-stories/_index.md` +2 行
- 修改 `docs/sprints/sprint-10a.md` Status→IN_PROGRESS

---

### Task 90: DB Migration

**文件:** `prisma/schema.prisma`, `docs/adr/001-ai-harness-pipeline.md`

**Prisma 变更 (per phase3-db-schema.md):**

新增 enums: `DailyTaskPackStatus`, `DailyTaskType`, `DailyTaskStatus`, `WeaknessTier`

新增 models:
- `DailyTaskPack` — studentId, date, status, totalTasks, completedTasks。@@unique([studentId, date])
- `DailyTask` — packId, type, knowledgePointId, questionId?, content?, status, sortOrder
- `WeaknessProfile` — studentId, tier, data(Json), generatedAt, validUntil?
- `SemanticCache` — operationType, promptHash, promptVersion, embedding(Unsupported("vector(1536)")?), response(Json), hitCount, expiresAt

字段扩展:
- `ParentStudentConfig`: +maxDailyTasks, +learningTimeStart, +learningTimeEnd
- `MasteryState`: +archived, +@@index([studentId, archived, status])
- `AIOperationType`: +6 values (WEAKNESS_PROFILE, INTERVENTION_PLAN, MASTERY_EVALUATE, FIND_SIMILAR, GENERATE_EXPLANATION, EVAL_JUDGE)
- `InterventionType`: +2 values (PRACTICE, BRAIN_DECISION)

Relation fields: User ← DailyTaskPack/WeaknessProfile, KnowledgePoint ← DailyTask, ErrorQuestion ← DailyTask

Migration SQL 追加: `CREATE EXTENSION IF NOT EXISTS vector;`

---

### Task 91: SemanticCache + EmbeddingProvider + Harness 重构

三个子任务，执行顺序 91b → 91a → 91c。

#### 91a: EmbeddingProvider 抽象层

**文件:**
- 新建 `src/lib/domain/ai/embedding/types.ts` — EmbeddingProvider 接口
- 新建 `src/lib/domain/ai/embedding/azure.ts` — Azure OpenAI 实现
- 新建 `src/lib/domain/ai/embedding/factory.ts` — 工厂函数
- 修改 `.env.example`

```typescript
// EmbeddingProvider 接口
export interface EmbeddingProvider {
  readonly provider: string;
  readonly model: string;
  readonly dimensions: number;
  embed(text: string): Promise<number[]>;
  embedBatch?(texts: string[]): Promise<number[][]>;
}

// 工厂
export function createEmbeddingProvider(): EmbeddingProvider {
  const provider = process.env.EMBEDDING_PROVIDER || "azure";
  switch (provider) {
    case "azure": return new AzureEmbeddingProvider();
    // future: case "ollama": return new OllamaEmbeddingProvider();
    default: throw new Error(`Unknown embedding provider: ${provider}`);
  }
}
```

环境变量:
```
EMBEDDING_PROVIDER=azure
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DEPLOYMENT=text-embedding-3-small
EMBEDDING_ENDPOINT=                         # 默认复用 AZURE_OPENAI_ENDPOINT
EMBEDDING_API_KEY=                          # 默认复用 AZURE_OPENAI_API_KEY
EMBEDDING_DIMENSIONS=1536
```

不修改 AIProvider 接口 — embedding 独立能力，本地化部署时可用不同模型。

#### 91b: Harness 重构为组件管道

**文件:**
- 新建 `src/lib/domain/ai/harness/component.ts` — HarnessComponent + HarnessContext
- 新建 `src/lib/domain/ai/harness/pipeline.ts` — HarnessPipeline 执行器
- 新建 `src/lib/domain/ai/harness/components/prompt-manager.ts`
- 新建 `src/lib/domain/ai/harness/components/ai-call.ts`
- 重构现有 6 个组件文件 → 追加导出 XxxComponent 类
- 重写 `src/lib/domain/ai/harness/index.ts` → 组装管道

```typescript
// HarnessComponent 接口
export interface HarnessComponent {
  readonly name: string;
  execute(ctx: HarnessContext): Promise<void>;
}

// HarnessContext (组件间共享状态)
export interface HarnessContext {
  readonly provider: AIProvider;
  readonly request: AIHarnessRequest<unknown>;
  readonly startTime: number;
  messages: AIMessage[];
  callOptions: AICallOptions;
  response?: AIResponse;
  validatedData?: unknown;
  completed: boolean;
  result?: AIHarnessResult<unknown>;
  cacheHit: boolean;
  cacheId?: string;
  fail(message: string, code: string, retryable: boolean): void;
  succeed(data: unknown): void;
}

// Pipeline 执行器 (OTel 自动包装)
export class HarnessPipeline {
  constructor(private components: HarnessComponent[], private logger: HarnessComponent) {}
  async execute<T>(provider, request): Promise<AIHarnessResult<T>> {
    const ctx = createContext(provider, request);
    try {
      for (const component of this.components) {
        await withSpan(`harness.${component.name}`, ctx.spanAttributes(), () => component.execute(ctx));
        if (ctx.completed) break;
      }
    } catch (error) { ctx.fail(...); }
    finally { await this.logger.execute(ctx); }
    return ctx.getResult();
  }
}

// 默认管道
const defaultPipeline = new HarnessPipeline([
  new RateLimiterComponent(),
  new InjectionGuardComponent(),
  new PromptManagerComponent(),
  new SemanticCacheCheckComponent(embeddingProvider),
  new AICallComponent(),
  new OutputValidatorComponent(),
  new ContentGuardrailComponent(),
  new SemanticCacheStoreComponent(embeddingProvider),
], new CallLoggerComponent());

export function executeOperation<T>(provider, request): Promise<AIHarnessResult<T>> {
  return defaultPipeline.execute(provider, request);
}
```

executeOperation 签名不变，现有调用方零改动。

#### 91c: SemanticCache 组件

**文件:**
- 新建 `src/lib/domain/ai/harness/semantic-cache.ts` — SemanticCacheService
- 新建 `src/lib/domain/ai/harness/components/semantic-cache-check.ts`
- 新建 `src/lib/domain/ai/harness/components/semantic-cache-store.ts`
- 修改 `src/lib/domain/ai/harness/types.ts` — +cacheHit?, +cacheId?

双层缓存:
1. prompt_hash 精确匹配（零成本）
2. 精确 miss → embedding 语义匹配（cosine ≥ 0.95）
3. 都 miss → 正常调 AI

可缓存操作: HELP_GENERATE, EXTRACT_KNOWLEDGE_POINTS, CLASSIFY_QUESTION_KNOWLEDGE, DIAGNOSE_ERROR
不缓存: OCR_RECOGNIZE (vision), SUBJECT_DETECT (cheap), GRADE_ANSWER (student-specific)

Cache hit 跳过后续组件（存储时已过 ContentGuardrail）。
Cache store 在 ContentGuardrail 之后。
promptVersion 作为查询条件，schema 升级时旧缓存自动失效。

环境变量: `SEMANTIC_CACHE_ENABLED`, `SEMANTIC_CACHE_TTL_HOURS=168`, `SEMANTIC_CACHE_SIMILARITY_THRESHOLD=0.95`

---

### Task 92: ObservabilityTracer

**文件:**
- 新建 `src/lib/infra/telemetry/index.ts` — initTelemetry()
- 新建 `src/lib/infra/telemetry/tracer.ts` — withSpan()
- 新建 `src/instrumentation.ts` — Next.js OTel hook
- 修改 `deploy/docker-compose.dev.yml` — +star-catcher-jaeger
- 修改 `package.json` — +@opentelemetry/api, sdk-node, exporter-trace-otlp-http, resources, semantic-conventions
- 修改 `src/worker/index.ts` — 入口调 initTelemetry("star-catcher-worker")

OTel 已融入 Pipeline 执行器 — withSpan 自动包装每个 component，无需单独 ObservabilityTracer 组件。
OTEL_ENABLED=false 时 withSpan 直接执行 fn，零开销。

Docker Compose:
```yaml
star-catcher-jaeger:
  image: jaegertracing/all-in-one:latest
  ports: ["16686:16686", "4318:4318"]
  environment: { COLLECTOR_OTLP_ENABLED: "true" }
```

---

### Task 93: Handler Registry + Schedule Registry

**文件:**
- 新建 `src/worker/handler-registry.ts`
- 新建 `src/worker/schedule-registry.ts`
- 修改 `src/worker/index.ts` — switch→registry + schedule 注册
- 修改 `src/lib/infra/queue/types.ts` — +4 job names + data interfaces
- 修改 6 个 handler 文件签名 → `Job<AIJobData, void, AIJobName>`，内部 `as` 断言

新 Job Types: learning-brain, weakness-profile, intervention-planning, mastery-evaluation（stub handler）

Schedule Registry:
- learning-brain: `0 6 * * *` (每日 6 点, D12)
- weakness-profile: `0 3 * * 0` (每周日 3 点)

Worker 启动时调 registerSchedules() → queue.upsertJobScheduler()

---

### Task 94: Integration Verification

测试文件:
- `src/tests/harness/pipeline.test.ts` — 管道组件顺序、early return、error handling
- `src/tests/harness/semantic-cache.test.ts` — 双层匹配
- `src/tests/worker/handler-registry.test.ts` — AIJobName 全覆盖
- `src/tests/worker/schedule-registry.test.ts` — 格式校验

---

## 执行顺序

```
89 (文档) → 90 (DB) → 91b (Harness 重构) → 91a (EmbeddingProvider) → 91c (SemanticCache) → 92 (OTel) → 93 (Registry) → 94 (验证)
```

---

## 验证清单

- [ ] SemanticCache 端到端：embedding 写入 + cosine 查询返回相似结果
- [ ] OTel span 在 Jaeger UI 可视化（Harness 组件 + Pipeline 层）
- [ ] Handler Registry 路由所有现有 job（无 switch 残留）
- [ ] Schedule Registry 注册 learning-brain + weakness-profile cron
- [ ] Harness 组件管道: executeOperation 签名不变，现有调用方零改动
- [ ] npm test 全量通过
- [ ] tsc --noEmit 无错误
- [ ] 无 `any` 类型、无 `@ts-ignore`
- [ ] i18n 新增 key 覆盖 zh + en
- [ ] .env.example 新增所有环境变量
- [ ] README 目录树更新

## 变更文件清单

新建 ~16 文件, 修改 ~20 文件。详见各 Task 段落。
