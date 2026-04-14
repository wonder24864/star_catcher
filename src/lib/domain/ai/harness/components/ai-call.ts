import type { HarnessComponent, HarnessContext } from "../component";

export class AICallComponent implements HarnessComponent {
  readonly name = "ai-call";

  async execute(ctx: HarnessContext): Promise<void> {
    const { operation } = ctx.request;
    const callFn = operation.usesVision
      ? ctx.provider.vision
      : ctx.provider.chat;

    ctx.response = await callFn.call(ctx.provider, ctx.messages, ctx.callOptions);
  }
}
