/**
 * HarnessPipeline — executes an ordered array of HarnessComponents.
 *
 * - Components run sequentially; if any sets ctx.completed the rest are skipped.
 * - The logger component always runs (finally block).
 * - OTel spans are added per-component in Task 92 via withSpan().
 *
 * See: docs/sprints/sprint-10a.md (Task 91b)
 */

import type { AIProvider } from "../types";
import type { AIHarnessRequest, AIHarnessResult } from "./types";
import type { HarnessComponent, HarnessContext } from "./component";
import { createContext } from "./component";
import { withSpan } from "@/lib/infra/telemetry/tracer";
import { createLogger } from "@/lib/infra/logger";

const log = createLogger("harness-pipeline");

export class HarnessPipeline {
  constructor(
    private readonly components: HarnessComponent[],
    private readonly logger: HarnessComponent,
  ) {}

  async execute<T>(
    provider: AIProvider,
    request: AIHarnessRequest<unknown>,
  ): Promise<AIHarnessResult<T>> {
    const ctx = createContext(provider, request);

    try {
      for (const component of this.components) {
        await withSpan(
          `harness.${component.name}`,
          ctx.spanAttributes(),
          () => component.execute(ctx),
        );
        if (ctx.completed) break;
      }

      // If no component set a result (shouldn't happen with AICallComponent),
      // treat as an error
      if (!ctx.result) {
        ctx.fail("Pipeline completed without producing a result", "PIPELINE_ERROR", false);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log.error({ err: error, operation: request.operation.name }, "Pipeline error");
      if (!ctx.completed) {
        ctx.fail(msg, "AI_CALL_FAILED", true);
      }
    } finally {
      try {
        await this.logger.execute(ctx);
      } catch (e) {
        log.error({ err: e }, "Logger component failed");
      }
    }

    return ctx.getResult<T>();
  }
}
