/**
 * Agent Runner — manages the AI function-calling loop.
 *
 * Flow per ADR-008 §5:
 *   1. Load Agent definition
 *   2. Query ACTIVE allowedSkills from SkillRegistry → Schema Adapter → tools[]
 *   3. Loop:
 *      a. Check AgentStepLimiter + CostTracker
 *      b. AI call (via FunctionCallingProvider) with tools
 *      c. Parse function_call from response
 *      d. Execute skill via SkillRuntime (IPC sandbox)
 *      e. Append tool result to conversation
 *      f. Record step (AgentStep) + update trackers
 *   4. Return AgentRunResult
 *
 * See: docs/adr/008-agent-architecture.md
 */
import type { SkillRegistry, CachedSkill } from "../skill/registry";
import type { SkillRuntime } from "../skill/runtime";
import type { SupportedProvider } from "../skill/schema-adapter";
import { adaptSchemas } from "../skill/schema-adapter";
import { AgentStepLimiter } from "./step-limiter";
import { CostTracker } from "./cost-tracker";
import type {
  AgentDefinition,
  AgentRunContext,
  AgentRunResult,
  AgentStep,
  AgentTerminationReason,
  FunctionCallingProvider,
  FunctionCallingProviderMessage,
  FunctionCallingResponse,
  FunctionCallRequest,
} from "./types";

// ─── Runner Configuration ────────────────────────

export interface AgentRunnerConfig {
  /** AI provider with function calling support */
  provider: FunctionCallingProvider;
  /** Current AI provider type (for Schema Adapter) */
  providerType: SupportedProvider;
  /** Skill registry (loads ACTIVE skills from DB) */
  registry: SkillRegistry;
  /** Skill runtime (IPC sandbox executor) */
  runtime: SkillRuntime;
  /** Bundle path resolver: skill name → absolute path to compiled JS */
  resolveBundlePath: (skill: CachedSkill) => string;
}

// ─── Agent Runner ────────────────────────────────

export class AgentRunner {
  private readonly provider: FunctionCallingProvider;
  private readonly providerType: SupportedProvider;
  private readonly registry: SkillRegistry;
  private readonly runtime: SkillRuntime;
  private readonly resolveBundlePath: (skill: CachedSkill) => string;

  constructor(config: AgentRunnerConfig) {
    this.provider = config.provider;
    this.providerType = config.providerType;
    this.registry = config.registry;
    this.runtime = config.runtime;
    this.resolveBundlePath = config.resolveBundlePath;
  }

  /**
   * Run an agent with the given definition, user message, and context.
   *
   * The runner builds a conversation with function calling tools, loops
   * until the AI stops calling tools or a termination limit is hit,
   * then returns the structured result.
   */
  async run(
    definition: AgentDefinition,
    userMessage: string,
    context: AgentRunContext,
  ): Promise<AgentRunResult> {
    const startTime = Date.now();
    const steps: AgentStep[] = [];
    const agentName = definition.name;

    // ── Initialize limiters ──
    const stepLimiter = new AgentStepLimiter(
      definition.termination.maxSteps,
    );
    const costTracker = new CostTracker(
      definition.termination.maxTokens,
    );

    // ── 1. Resolve allowed skills from registry ──
    const skillMap = await this.resolveSkills(definition.allowedSkills);
    const schemas = Array.from(skillMap.values()).map((s) => s.functionSchema);
    const tools = adaptSchemas(schemas, this.providerType);

    // ── 2. Build initial conversation ──
    const systemPrompt = this.buildSystemPrompt(definition, stepLimiter);
    const messages: FunctionCallingProviderMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ];

    // ── 3. Function calling loop ──
    let terminationReason: AgentTerminationReason = "COMPLETED";
    let finalResponse = "";

    while (true) {
      // ── Pre-flight checks ──
      if (!stepLimiter.check().allowed) {
        terminationReason = "MAX_STEPS";
        break;
      }
      if (!costTracker.check().allowed) {
        terminationReason = "MAX_TOKENS";
        break;
      }

      // ── AI call with tools ──
      let response: FunctionCallingResponse;
      try {
        response = await this.provider.chatWithTools([...messages], tools, {
          temperature: definition.modelConfig?.temperature ?? 0.3,
          maxTokens: definition.modelConfig?.maxOutputTokens,
        });
      } catch (err) {
        terminationReason = "ERROR";
        finalResponse =
          err instanceof Error ? err.message : "AI call failed";
        break;
      }

      // Record token usage from AI response
      costTracker.record(response.usage);

      const assistantMsg = response.message;
      const toolCalls = assistantMsg.toolCalls ?? [];

      // ── No tool calls → agent is done ──
      if (toolCalls.length === 0) {
        finalResponse = assistantMsg.content ?? "";
        terminationReason = "COMPLETED";
        messages.push({
          role: "assistant",
          content: assistantMsg.content,
        });
        break;
      }

      // ── Append assistant message (with toolCalls) ──
      messages.push({
        role: "assistant",
        content: assistantMsg.content,
        toolCalls,
      });

      // ── Execute each tool call ──
      let allFailed = true;

      for (const toolCall of toolCalls) {
        // Consume a step
        const stepCheck = stepLimiter.check();
        if (!stepCheck.allowed) {
          terminationReason = "MAX_STEPS";
          break;
        }
        stepLimiter.consume();

        const step = await this.executeToolCall(
          toolCall,
          stepLimiter.stepCount,
          skillMap,
          context,
          agentName,
        );
        steps.push(step);

        // Record skill-internal token usage (currently 0 — see TODO below)
        // TODO: SkillRuntime does not yet surface token usage from IPC
        // harness.call. When it does, record here via costTracker.record().
        costTracker.record(step.tokensUsed);

        if (step.status === "SUCCESS") {
          allFailed = false;
        }

        // ── Append tool result to conversation ──
        messages.push({
          role: "tool",
          content: JSON.stringify(
            step.status === "SUCCESS"
              ? step.output
              : { error: step.errorMessage },
          ),
          toolCallId: toolCall.id,
          name: toolCall.name,
        });

        // ── Re-check cost after each step ──
        if (!costTracker.check().allowed) {
          terminationReason = "MAX_TOKENS";
          break;
        }
      }

      // If we hit a limit during tool execution, break outer loop
      if (
        terminationReason === "MAX_STEPS" ||
        terminationReason === "MAX_TOKENS"
      ) {
        break;
      }

      // If all tool calls failed, terminate
      if (allFailed) {
        terminationReason = "SKILL_ALL_FAILED";
        break;
      }
    }

    // ── 4. Build result ──
    const status =
      terminationReason === "COMPLETED"
        ? "COMPLETED"
        : terminationReason === "ERROR" ||
            terminationReason === "SKILL_ALL_FAILED"
          ? "FAILED"
          : "TERMINATED";

    return {
      agentName: definition.name,
      status,
      terminationReason,
      steps,
      totalSteps: steps.length,
      totalTokens: costTracker.usage,
      totalDurationMs: Date.now() - startTime,
      finalResponse,
    };
  }

  // ─── Private Helpers ─────────────────────────────

  /**
   * Resolve allowed skill names to CachedSkill objects from registry.
   * Only includes skills that are ACTIVE in the registry.
   */
  private async resolveSkills(
    allowedSkills: string[],
  ): Promise<Map<string, CachedSkill>> {
    const result = new Map<string, CachedSkill>();
    for (const name of allowedSkills) {
      const skill = await this.registry.getSkillByName(name);
      if (skill) {
        result.set(skill.functionSchema.name, skill);
      }
    }
    return result;
  }

  /**
   * Build system prompt with termination conditions appended.
   */
  private buildSystemPrompt(
    definition: AgentDefinition,
    stepLimiter: AgentStepLimiter,
  ): string {
    const parts = [definition.systemPrompt];

    if (definition.termination.stopCriteria) {
      parts.push(
        `\nStop Criteria: ${definition.termination.stopCriteria}`,
      );
    }

    parts.push(
      `\nConstraints:`,
      `- You may call at most ${stepLimiter.effectiveLimit} tools total.`,
      `- When you have sufficient information to answer, respond directly without calling more tools.`,
    );

    return parts.join("\n");
  }

  /**
   * Execute a single tool call via SkillRuntime (IPC sandbox).
   */
  private async executeToolCall(
    toolCall: FunctionCallRequest,
    stepNo: number,
    skillMap: Map<string, CachedSkill>,
    context: AgentRunContext,
    agentName: string,
  ): Promise<AgentStep> {
    const startTime = Date.now();
    const skillName = toolCall.name;

    // Parse arguments
    let args: Record<string, unknown>;
    try {
      args = JSON.parse(toolCall.arguments);
    } catch {
      return {
        stepNo,
        skillName,
        input: {},
        output: null,
        durationMs: Date.now() - startTime,
        tokensUsed: { inputTokens: 0, outputTokens: 0 },
        status: "FAILED",
        errorMessage: `Failed to parse tool call arguments: ${toolCall.arguments}`,
      };
    }

    // Look up skill in registry
    const skill = skillMap.get(skillName);
    if (!skill) {
      return {
        stepNo,
        skillName,
        input: args,
        output: null,
        durationMs: Date.now() - startTime,
        tokensUsed: { inputTokens: 0, outputTokens: 0 },
        status: "FAILED",
        errorMessage: `Skill "${skillName}" not found in allowed skills`,
      };
    }

    // Resolve bundle path
    const bundlePath = this.resolveBundlePath(skill);

    // Execute via SkillRuntime (IPC sandbox)
    const execResult = await this.runtime.execute(
      bundlePath,
      args,
      {
        studentId: context.studentId,
        agentId: agentName,
        sessionId: context.sessionId,
        traceId: context.traceId,
        locale: context.locale,
        grade: context.grade,
      },
      skill.config,
    );

    const status: AgentStep["status"] = execResult.success
      ? "SUCCESS"
      : execResult.terminationReason === "timeout"
        ? "TIMEOUT"
        : "FAILED";

    return {
      stepNo,
      skillName,
      input: args,
      output: execResult.data ?? null,
      durationMs: execResult.durationMs,
      tokensUsed: { inputTokens: 0, outputTokens: 0 },
      status,
      errorMessage: execResult.error,
    };
  }
}
