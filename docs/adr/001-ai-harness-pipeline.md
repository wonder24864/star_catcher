# ADR-001: AI Harness Pipeline for All AI Calls

## Status
Accepted (2026-04-08)

## Context
Star Catcher is a K-12 error notebook product where AI generates content shown directly to children (OCR results, progressive help hints, subject detection). Phase 1 defines three AI operations: `ocr-recognize`, `subject-detect`, and `help-generate`, all calling Azure OpenAI GPT-5.4. Without a centralized control layer, each call site would need to independently handle output validation, content safety filtering, prompt injection defense, rate limiting, logging, and graceful degradation. Scattering these cross-cutting concerns across business code is unmaintainable and, more critically, a single missed safety check on AI output could expose a child to inappropriate content or corrupt student data with malformed OCR results.

## Decision
All AI calls flow through a decorator-style Harness pipeline. Business code invokes the Operations layer (`recognize-homework`, `detect-subject`, `generate-help`), which delegates to the AI Harness. The Harness executes three stages around the actual AI provider call:

- **Pre-call**: RateLimiter (Redis sliding window, 5/min and 100/day per user) then PromptInjectionGuard (sanitize student input, risk scoring) then PromptManager (template resolution and variable injection).
- **Post-call**: OutputValidator (Zod schema enforcement with robust JSON parsing) then ContentGuardrail (K-12 keyword blacklist, topic drift detection, length bounds) then CallLogger (persist to AICallLog table).
- **Error path**: FallbackHandler (per-operation degradation strategy) then CallLogger.

Each Harness component is independent and pluggable. Adding a new AI operation in future phases requires only three new files: a Zod output schema, a prompt template, and an operation orchestrator.

## Consequences

**Positive:**
- Content safety is enforced uniformly; no call can bypass the guardrail.
- OutputValidator prevents malformed AI JSON from polluting SessionQuestion and ErrorQuestion records.
- Rate limiting and logging are guaranteed for every AI call without per-callsite code.
- FallbackHandler ensures the system degrades gracefully (e.g., OCR failure routes to manual input, help failure shows a static encouraging message).
- Future Phase 2+ components (CircuitBreaker, SemanticCache, CostTracker) slot into the same pipeline without touching existing operations.

**Negative:**
- Every new AI operation requires 3 files (schema + prompt + operation), adding boilerplate even for simple operations.
- The pipeline adds latency overhead (Zod parse, Redis round-trip for rate limit, guardrail scan), though this is negligible compared to the 5-30 second AI call itself.
- Developers must understand the Harness architecture before adding AI features; the learning curve is steeper than a direct API call.
