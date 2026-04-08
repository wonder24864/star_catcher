# ADR-003: BullMQ with Frontend Polling for Async AI Operations

## Status
Accepted (2026-04-08)

## Context
The OCR recognition operation (`ocr-recognize`) can take up to 30 seconds to complete. Subject detection takes up to 15 seconds and help generation up to 30 seconds. These durations far exceed acceptable HTTP response times. The system needs an async processing strategy. Three options were considered:

1. **WebSocket**: Real-time push when the job completes. Low latency notification but adds a persistent connection layer, reconnection logic, and authentication over WebSocket -- significant complexity for a solo developer in Phase 1.
2. **Server-Sent Events (SSE)**: Simpler than WebSocket (unidirectional push) but still requires holding an HTTP connection open for up to 60 seconds per recognition job, and Next.js SSE support has edge-case issues with middleware and load balancers.
3. **BullMQ job queue with polling**: Jobs enqueued to Redis-backed BullMQ. Frontend polls a tRPC query at a fixed interval. No persistent connections, no special infrastructure.

## Decision
Use BullMQ (Redis-backed) for all AI operations with frontend polling at a 2-second interval. The flow is:

- User action triggers a tRPC mutation that enqueues a BullMQ job and sets HomeworkSession status to `RECOGNIZING`.
- A BullMQ worker picks up the job, calls the AI Harness pipeline, and updates the session status to `RECOGNIZED` or `RECOGNITION_FAILED`.
- The frontend polls `homework.getSession` every 2 seconds, watching for the status transition. Polling stops when a terminal status is reached.
- Job configuration with timeout rationale：

| 操作 | 超时 | 重试 | 依据 |
|------|------|------|------|
| `ocr-recognize` | 60s | 2次 | Vision + OCR 最慢，Azure GPT-5.4 p99 约 45s，60s 留 33% 余量 |
| `subject-detect` | 15s | 1次 | 纯文本分类较快，p99 约 10s，15s 留 50% 余量 |
| `help-generate` | 30s | 1次 | 年级适配的文本生成，p99 约 20s，30s 留 50% 余量 |

## Consequences

**Positive:**
- No WebSocket infrastructure needed in Phase 1, reducing implementation and debugging effort significantly for a solo developer.
- BullMQ provides built-in retry, timeout, backoff, and dead-letter queue semantics out of the box.
- Redis is already in the stack (required for rate limiting and session management), so BullMQ adds no new infrastructure dependency.
- Polling is stateless and survives page refreshes, browser tab switches, and network reconnections without special handling.
- Easy to monitor: job status is visible in Redis and can be inspected with BullMQ dashboard tools.

**Negative:**
- 2-second polling introduces up to 2 seconds of unnecessary delay between job completion and UI update. Users may wait slightly longer than with a push-based approach.
- Polling generates additional server load: roughly 15 requests per 30-second OCR wait per user. Acceptable for personal/family use but may need optimization at scale.
- Phase 2+ may still need WebSocket for real-time features (e.g., live mastery updates). At that point, polling can be replaced for latency-sensitive flows while BullMQ remains the job engine.
