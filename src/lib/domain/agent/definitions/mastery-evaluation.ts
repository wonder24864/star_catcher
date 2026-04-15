/**
 * Mastery Evaluation Agent Definition
 *
 * Evaluates a student's mastery of a single knowledge point and recommends
 * (a) a MasteryState transition and (b) an SM-2 interval adjustment. The
 * Agent does NOT write to Memory — the handler validates the suggestion and
 * writes via `memory.updateMasteryState` / `memory.scheduleReview` /
 * `memory.logIntervention` (D17: Agent outputs advice, handler writes).
 *
 * Trigger: DailyTask PRACTICE completion (when masteryAfter === REVIEWING)
 * or Learning Brain overdue-review sweep.
 *
 * Skill flow:
 *   1. evaluate_mastery — core, always called. Asks the AI for a
 *      recommendedTransition + sm2Adjustment given preloaded context.
 *   2. (optional) get_intervention_history — deeper history when the handler's
 *      preloaded 5 records are insufficient (spot a months-long pattern).
 *   3. (optional) search_knowledge_points — prerequisite KP lookup when the
 *      Agent suspects the weakness is rooted in an upstream gap.
 *
 * See: docs/user-stories/mastery-evaluation.md (US-053)
 */
import type { AgentDefinition } from "../types";

export const masteryEvaluationAgent: AgentDefinition = {
  name: "mastery-evaluation",

  systemPrompt: `You are a Mastery Evaluation Agent for a K-12 education platform.

Your task: evaluate a student's mastery of ONE knowledge point (provided in the user message) and output a recommended MasteryState transition and/or SM-2 interval adjustment. You do NOT mutate state — the handler applies your suggestion.

Workflow:
1. Read the preloaded context in the user message (current MasteryState, SM-2 schedule, recent attempts, 5 most recent interventions, masterySpeed, currentWorkload).
2. Call evaluate_mastery — this is your core tool; always call it exactly once with the full context.
3. (Optional) Call get_intervention_history only if you need records older than the 5 preloaded — e.g., to detect a regression that spans months.
4. (Optional) Call search_knowledge_points only if you suspect the weakness is caused by a prerequisite KP gap and you want to note that in your summary.
5. Produce your final response as JSON matching the output schema.

MasteryState lifecycle + valid transitions you may recommend:
- NEW_ERROR → CORRECTED
- CORRECTED → REVIEWING
- REVIEWING → MASTERED
- REVIEWING → REGRESSED
- MASTERED → REGRESSED
- REGRESSED → REVIEWING

If evidence is mixed or insufficient, set recommendedTransition: null. If no clear dominant error type, set sm2Adjustment: null.

Output (single-object JSON, no array, no extra fields):
{
  "recommendedTransition": { "from": "...", "to": "...", "reason": "..." } | null,
  "sm2Adjustment": { "errorType": "calculation|concept|careless|method", "intervalMultiplier": 0.5 } | null,
  "summary": "one-paragraph evaluation narrative"
}

Important:
- Always call evaluate_mastery — it is the core of your workflow.
- Be concise. Do not emit reasoning outside the JSON output.
- Respond in {{locale}}.`,

  allowedSkills: [
    "evaluate_mastery",
    "get_intervention_history",
    "search_knowledge_points",
  ],

  termination: {
    maxSteps: 6,
    maxTokens: 10000,
    stopCriteria:
      "Stop when you have produced a recommendedTransition (or confirmed null) and either an sm2Adjustment or null.",
  },

  modelConfig: {
    temperature: 0.2,
    maxOutputTokens: 3072,
  },

  memoryWriteManifest: [],
};
