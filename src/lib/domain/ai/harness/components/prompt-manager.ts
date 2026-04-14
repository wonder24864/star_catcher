import type { HarnessComponent, HarnessContext } from "../component";

export class PromptManagerComponent implements HarnessComponent {
  readonly name = "prompt-manager";

  async execute(ctx: HarnessContext): Promise<void> {
    const { prompt, variables, options } = ctx.request;
    ctx.messages = prompt.build(variables);
    ctx.callOptions = { ...prompt.defaultOptions, ...options };
  }
}
