import type { HarnessComponent, HarnessContext } from "../component";
import { checkRateLimit } from "../rate-limiter";
import { createLogger } from "@/lib/infra/logger";

const log = createLogger("harness");

export class RateLimiterComponent implements HarnessComponent {
  readonly name = "rate-limiter";

  async execute(ctx: HarnessContext): Promise<void> {
    try {
      const result = await checkRateLimit(ctx.request.context.userId);
      if (!result.allowed) {
        ctx.fail("Rate limit exceeded", "RATE_LIMIT_EXCEEDED", false);
      }
    } catch (e) {
      // Rate limiter failure is non-fatal — continue without limiting
      log.warn({ err: e }, "Rate limiter error, continuing");
    }
  }
}
