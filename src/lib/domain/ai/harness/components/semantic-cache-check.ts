/**
 * SemanticCacheCheckComponent — runs BEFORE AICall.
 *
 * If cache hit, sets result and short-circuits the pipeline.
 * Cached responses have already passed OutputValidator + ContentGuardrail.
 */

import type { AIOperationType } from "@prisma/client";
import type { HarnessComponent, HarnessContext } from "../component";
import type { SemanticCacheService } from "../semantic-cache";

export class SemanticCacheCheckComponent implements HarnessComponent {
  readonly name = "semantic-cache-check";

  constructor(private readonly cache: SemanticCacheService) {}

  async execute(ctx: HarnessContext): Promise<void> {
    const { operation, prompt } = ctx.request;

    if (!this.cache.isCacheable(operation.name)) return;

    // PromptManager has already built messages into ctx.messages
    const messages = ctx.messages;
    const promptHash = this.cache.hashPrompt(messages);
    const promptText = messages.map((m) =>
      typeof m.content === "string" ? m.content : JSON.stringify(m.content),
    ).join("\n");

    // Store hash on context for the store component to use
    ctx.promptHash = promptHash;
    ctx.promptText = promptText;

    const result = await this.cache.lookup(
      operation.name as AIOperationType,
      promptHash,
      prompt.version,
      promptText,
    );

    if (result.hit) {
      ctx.cacheHit = true;
      ctx.cacheId = result.cacheId;
      ctx.succeed(result.response);
    }
  }
}
