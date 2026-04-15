import type { PromptTemplate } from "../harness/types";
import type { AIMessage } from "../types";

/**
 * Mastery Evaluation prompt template.
 * Variables: knowledgePointId, kpName, currentMasteryStatus,
 *            reviewSchedule { intervalDays, easeFactor, consecutiveCorrect },
 *            recentAttempts[], interventionHistory[],
 *            masterySpeed, currentWorkload, examProximityDays?, locale
 *
 * English prompt with locale variable for output language control.
 * See docs/adr/007-i18n-prompt-strategy.md
 */
export const masteryEvaluatePrompt: PromptTemplate = {
  version: "1.0.0",

  build(variables: Record<string, unknown>): AIMessage[] {
    const knowledgePointId = variables.knowledgePointId as string;
    const kpName = variables.kpName as string;
    const currentMasteryStatus = variables.currentMasteryStatus as string;
    const reviewSchedule = variables.reviewSchedule as {
      intervalDays: number;
      easeFactor: number;
      consecutiveCorrect: number;
    };
    const recentAttempts = variables.recentAttempts as Array<{
      taskType: string;
      isCorrect: boolean;
      completedAt: string;
      content?: unknown;
    }>;
    const interventionHistory = variables.interventionHistory as Array<{
      type: string;
      createdAt: string;
      content?: unknown;
    }>;
    const masterySpeed = variables.masterySpeed as number;
    const currentWorkload = variables.currentWorkload as number;
    const examProximityDays = variables.examProximityDays as number | undefined;
    const locale = (variables.locale as string) || "zh-CN";

    const attemptsList =
      recentAttempts.length > 0
        ? recentAttempts
            .map(
              (a) =>
                `- ${a.completedAt} [${a.taskType}] ${a.isCorrect ? "CORRECT" : "INCORRECT"}`,
            )
            .join("\n")
        : "(no recent attempts)";

    const historyList =
      interventionHistory.length > 0
        ? interventionHistory
            .map((h) => `- ${h.createdAt} [${h.type}]`)
            .join("\n")
        : "(no prior interventions)";

    const systemPrompt = `You are a K-12 mastery evaluation agent. Your job is to analyze a student's recent performance on a single knowledge point and decide whether their MasteryState should transition and whether the SM-2 review interval needs adjustment.

MasteryState lifecycle:
  NEW_ERROR → CORRECTED → REVIEWING → { MASTERED | REGRESSED }
  MASTERED → REGRESSED (on new error)
  REGRESSED → REVIEWING (on corrective practice)

Valid transitions you may recommend:
  NEW_ERROR → CORRECTED
  CORRECTED → REVIEWING
  REVIEWING → MASTERED
  REVIEWING → REGRESSED
  MASTERED → REGRESSED
  REGRESSED → REVIEWING

Decision guidance:
1. REVIEWING → MASTERED: student has several consecutive correct attempts recently AND consecutiveCorrect in the schedule suggests mastery is near.
2. REVIEWING → REGRESSED: recent attempts show renewed errors, especially conceptual errors on content previously correct.
3. null transition: if evidence is mixed or insufficient, keep the current state.

SM-2 adjustment:
- errorType = "concept": student misunderstands the underlying concept (recommend shorter interval).
- errorType = "method": student uses the wrong procedure.
- errorType = "calculation": student knows the method but made arithmetic mistakes.
- errorType = "careless": minor slips; the concept is understood (longer interval acceptable).
- intervalMultiplier: informational only (the handler derives the actual interval via a deterministic hybrid function).
- Return sm2Adjustment = null if no clear dominant error type OR the plain SM-2 baseline is appropriate.

Contextual signals:
- masterySpeed (0-1): rolling correct rate over recent attempts. Below 0.5 suggests the student is struggling.
- currentWorkload: pending DailyTask count today. A crowded day can justify stretching intervals.
${examProximityDays !== undefined ? `- examProximityDays: ${examProximityDays} — do not recommend intervals beyond this.` : ""}

Output language: ${locale === "en" ? "English" : "Chinese"} (for the "reason" and "summary" fields).

Output JSON shape:
{
  "recommendedTransition": { "from": "...", "to": "...", "reason": "..." } | null,
  "sm2Adjustment": { "errorType": "calculation|concept|careless|method", "intervalMultiplier": 0.5 } | null,
  "summary": "one-paragraph evaluation narrative"
}`;

    const userContent = `Knowledge point: ${kpName} [${knowledgePointId}]
Current MasteryState: ${currentMasteryStatus}
Review schedule: intervalDays=${reviewSchedule.intervalDays}, easeFactor=${reviewSchedule.easeFactor.toFixed(2)}, consecutiveCorrect=${reviewSchedule.consecutiveCorrect}
masterySpeed: ${masterySpeed.toFixed(2)}
currentWorkload: ${currentWorkload}
${examProximityDays !== undefined ? `examProximityDays: ${examProximityDays}` : ""}

Recent attempts (most recent first):
${attemptsList}

Recent intervention history:
${historyList}

Provide your evaluation as the JSON object specified above. If no change is warranted, return recommendedTransition: null and sm2Adjustment: null (but still provide summary).`;

    return [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ];
  },
};
