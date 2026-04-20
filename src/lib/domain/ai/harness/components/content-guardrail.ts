import type { HarnessComponent, HarnessContext } from "../component";
import { checkContentSafety } from "../content-guardrail";

export class ContentGuardrailComponent implements HarnessComponent {
  readonly name = "content-guardrail";

  async execute(ctx: HarnessContext): Promise<void> {
    if (!ctx.response) {
      ctx.fail("No AI response to check", "PIPELINE_ERROR", false);
      return;
    }

    const check = checkContentSafety(
      ctx.response.content,
      ctx.request.operation.maxOutputLength,
    );
    if (!check.safe) {
      ctx.fail(
        check.reason || "Content blocked by safety filter",
        "CONTENT_GUARDRAIL_BLOCKED",
        false,
      );
      return;
    }

    // All checks passed — do NOT call ctx.succeed() here.
    // SemanticCacheStoreComponent (next in pipeline) needs to run first.
  }
}
