/**
 * AI Harness Pipeline — central orchestrator for all AI calls.
 *
 * Refactored to component pipeline pattern (Sprint 10a, Task 91b).
 * Each component implements HarnessComponent, pipeline executes in order.
 *
 * Default pipeline:
 *   RateLimiter → InjectionGuard → PromptManager →
 *   SemanticCacheCheck → AICall → OutputValidator →
 *   ContentGuardrail → SemanticCacheStore
 *   Always: CallLogger (finally)
 *
 * Business code NEVER calls AIProvider directly.
 * See docs/adr/001-ai-harness-pipeline.md
 */

import type { AIProvider } from "../types";
import type { AIHarnessRequest, AIHarnessResult } from "./types";
import { HarnessPipeline } from "./pipeline";
import { RateLimiterComponent } from "./components/rate-limiter";
import { InjectionGuardComponent } from "./components/injection-guard";
import { PromptManagerComponent } from "./components/prompt-manager";
import { SemanticCacheCheckComponent } from "./components/semantic-cache-check";
import { AICallComponent } from "./components/ai-call";
import { OutputValidatorComponent } from "./components/output-validator";
import { ContentGuardrailComponent } from "./components/content-guardrail";
import { SemanticCacheStoreComponent } from "./components/semantic-cache-store";
import { CallLoggerComponent } from "./components/call-logger";
import { SemanticCacheService } from "./semantic-cache";
import { createEmbeddingProvider } from "../embedding/factory";
import { createLogger } from "@/lib/infra/logger";

const log = createLogger("harness");

// ── SemanticCache singleton (lazy, non-fatal if embedding unavailable) ──

function createSemanticCache(): SemanticCacheService {
  let embeddingProvider = null;
  if (process.env.SEMANTIC_CACHE_ENABLED === "true") {
    try {
      embeddingProvider = createEmbeddingProvider();
    } catch (e) {
      log.warn({ err: e }, "Embedding provider unavailable, semantic cache uses hash-only mode");
    }
  }
  return new SemanticCacheService(embeddingProvider);
}

const semanticCache = createSemanticCache();

// ── Default Pipeline (singleton) ──

const defaultPipeline = new HarnessPipeline(
  [
    new RateLimiterComponent(),
    new InjectionGuardComponent(),
    new PromptManagerComponent(),
    new SemanticCacheCheckComponent(semanticCache),
    new AICallComponent(),
    new OutputValidatorComponent(),
    new ContentGuardrailComponent(),
    new SemanticCacheStoreComponent(semanticCache),
  ],
  new CallLoggerComponent(),
);

/**
 * Execute an AI operation through the full Harness pipeline.
 * Signature unchanged from pre-refactor — callers need zero changes.
 */
export async function executeOperation<T>(
  provider: AIProvider,
  request: AIHarnessRequest<T>,
): Promise<AIHarnessResult<T>> {
  return defaultPipeline.execute<T>(provider, request as AIHarnessRequest<unknown>);
}
