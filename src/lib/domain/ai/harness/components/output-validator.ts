import type { HarnessComponent, HarnessContext } from "../component";
import { validateOutput } from "../output-validator";

export class OutputValidatorComponent implements HarnessComponent {
  readonly name = "output-validator";

  async execute(ctx: HarnessContext): Promise<void> {
    if (!ctx.response) {
      ctx.fail("No AI response to validate", "PIPELINE_ERROR", false);
      return;
    }

    const validation = validateOutput(ctx.response.content, ctx.request.operation.outputSchema);

    if (!validation.success) {
      ctx.fail(validation.error, "OUTPUT_VALIDATION_FAILED", true);
      return;
    }

    ctx.validatedData = validation.data;
  }
}
