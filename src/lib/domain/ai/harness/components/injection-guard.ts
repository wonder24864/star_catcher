import type { HarnessComponent, HarnessContext } from "../component";
import { checkInjection, sanitizeInput } from "../prompt-injection-guard";

export class InjectionGuardComponent implements HarnessComponent {
  readonly name = "injection-guard";

  async execute(ctx: HarnessContext): Promise<void> {
    const { variables } = ctx.request;

    for (const [key, value] of Object.entries(variables)) {
      if (typeof value === "string" && value.length > 0) {
        const check = checkInjection(value);
        if (!check.safe) {
          ctx.fail(
            `Injection detected in variable "${key}": ${check.reason || "Input rejected"}`,
            "INJECTION_DETECTED",
            false,
          );
          return;
        }
        // Sanitize in place
        variables[key] = sanitizeInput(value);
      }
    }
  }
}
