import type { HarnessComponent, HarnessContext } from "../component";
import { logAICall } from "../call-logger";

/**
 * Always-run component that logs the AI call result to the database.
 * Runs in the pipeline's finally block — captures both success and failure.
 */
export class CallLoggerComponent implements HarnessComponent {
  readonly name = "call-logger";

  async execute(ctx: HarnessContext): Promise<void> {
    const { operation, context: reqCtx, prompt } = ctx.request;
    const result = ctx.result;

    await logAICall({
      userId: reqCtx.userId,
      operationType: operation.name,
      provider: ctx.provider.config.provider,
      model: ctx.provider.config.model,
      correlationId: reqCtx.correlationId,
      promptVersion: prompt.version,
      usage: ctx.response?.usage ?? { inputTokens: 0, outputTokens: 0 },
      durationMs: Date.now() - ctx.startTime,
      success: result?.success ?? false,
      errorMessage: result?.error?.message,
    });
  }
}
