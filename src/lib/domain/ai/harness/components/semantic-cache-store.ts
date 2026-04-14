/**
 * SemanticCacheStoreComponent — runs AFTER ContentGuardrail.
 *
 * Two responsibilities:
 * 1. Finalize the pipeline result (ctx.succeed) — always runs.
 * 2. Store validated response in semantic cache (if cacheable).
 *
 * Must be the LAST component in the pipeline before CallLogger.
 */

import type { AIOperationType } from "@prisma/client";
import type { HarnessComponent, HarnessContext } from "../component";
import type { SemanticCacheService } from "../semantic-cache";

export class SemanticCacheStoreComponent implements HarnessComponent {
  readonly name = "semantic-cache-store";

  constructor(private readonly cache: SemanticCacheService) {}

  async execute(ctx: HarnessContext): Promise<void> {
    // If pipeline already completed (e.g. cache hit or error), skip
    if (ctx.completed) return;

    // Finalize success — this is where the pipeline produces its result
    ctx.succeed(ctx.validatedData);

    // Optionally store in cache (fire-and-forget)
    if (ctx.cacheHit) return; // Don't re-cache a cache hit
    const { operation, prompt } = ctx.request;
    if (!this.cache.isCacheable(operation.name)) return;

    const promptHash = ctx.promptHash;
    const promptText = ctx.promptText;
    if (!promptHash || !promptText) return;

    this.cache
      .store(
        operation.name as AIOperationType,
        promptHash,
        prompt.version,
        promptText,
        ctx.validatedData,
      )
      .catch(() => {}); // Errors logged inside SemanticCacheService
  }
}
