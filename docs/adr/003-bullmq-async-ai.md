# ADR-003: BullMQ + tRPC SSE Subscriptions for Async AI Operations

## Status
Implemented (2026-04-10)

## Context
The OCR recognition operation (`ocr-recognize`) can take up to 30 seconds to complete. Subject detection takes up to 15 seconds and help generation up to 30 seconds. These durations far exceed acceptable HTTP response times. The system needs an async processing strategy.

## Decision
Use **BullMQ (Redis-backed) for job processing** with **tRPC SSE Subscriptions for real-time push notification**. No polling.

### Architecture

```
Frontend mutation → BullMQ enqueue → Worker processes AI → Redis PUBLISH
tRPC SSE subscription → Redis SUBSCRIBE → yield event → SSE push to frontend
```

### Async vs Sync Operations

| 操作 | 模式 | 依据 |
|------|------|------|
| `ocr-recognize` | 异步 (BullMQ) | Vision + OCR 最慢 (p99 ~45s) |
| `correction-photos` | 异步 (BullMQ) | 识别 + 重判复合操作 |
| `help-generate` | 异步 (BullMQ) | 文本生成 (p99 ~20s) |
| `grade-answer` | 同步 | 单题判分快 (~2s)，用户期望即时反馈 |
| `subject-detect` | 同步 | 纯文本分类快 (~5s)，有 fallback |

### Job Configuration

| 操作 | 重试 | 依据 |
|------|------|------|
| `ocr-recognize` | 3次 (指数退避) | Vision 调用偶有超时 |
| `correction-photos` | 3次 (指数退避) | 同上 |
| `help-generate` | 2次 (指数退避) | 文本生成较稳定 |

### Key Components

- **Queue**: `src/lib/queue/` — 单队列 `ai-jobs`，按 job name 路由
- **Worker**: `src/worker/` — 独立进程，Docker 服务 `star-catcher-worker`
- **Events**: `src/lib/events.ts` — Redis Pub/Sub 桥接 Worker ↔ tRPC
- **Subscriptions**: `src/server/routers/subscription.ts` — SSE 推送
- **Client**: `splitLink` 分流 subscription → `httpSubscriptionLink`

### Redis Channels

- `job:result:session:{sessionId}` — OCR / 改正照片结果
- `job:result:help:{sessionId}:{questionId}` — 求助生成结果

## Consequences

**Positive:**
- 即时推送，无轮询延迟
- tRPC 内置 SSE，无需额外 WebSocket 基础设施
- BullMQ 提供重试、退避、死信队列
- Redis 已在技术栈中，无新依赖
- Worker 崩溃自动重启 (Docker restart policy)
- SSE 自动重连 (tRPC httpSubscriptionLink 内置)

**Negative:**
- SSE 连接占用服务端资源（每个等待中的页面一个连接）
- Worker 作为独立进程增加了部署复杂度（额外 Docker 服务）
- Phase 2 如需双向通信可能仍需 WebSocket
