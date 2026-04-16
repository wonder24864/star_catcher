import type { PromptTemplate } from "../harness/types";
import type { AIMessage } from "../types";

/**
 * Learning Suggestion prompt template.
 * Variables: weakPoints (array), masteryStates (array), interventionHistory (array),
 *            grade (string?), locale (string)
 *
 * English prompt with locale variable for output language control.
 * See docs/adr/007-i18n-prompt-strategy.md
 */
export const learningSuggestionPrompt: PromptTemplate = {
  version: "1.0.0",

  build(variables: Record<string, unknown>): AIMessage[] {
    const weakPoints = variables.weakPoints as Array<{
      kpId: string;
      kpName: string;
      severity: string;
      trend: string;
      errorCount: number;
    }>;
    const masteryStates = variables.masteryStates as Array<{
      kpId: string;
      kpName: string;
      status: string;
      correctRate: number;
    }>;
    const interventionHistory = variables.interventionHistory as Array<{
      kpName: string;
      type: string;
      createdAt: string;
      preMasteryStatus: string | null;
    }>;
    const grade = variables.grade as string | undefined;
    const locale = (variables.locale as string) || "zh-CN";

    const weakPointsList = weakPoints?.length
      ? weakPoints
          .map(
            (wp) =>
              `- ${wp.kpName} [${wp.kpId}]: severity=${wp.severity}, trend=${wp.trend}, errors=${wp.errorCount}`,
          )
          .join("\n")
      : "(no weak knowledge points identified)";

    const masteryList = masteryStates?.length
      ? masteryStates
          .map(
            (ms) =>
              `- ${ms.kpName} [${ms.kpId}]: status=${ms.status}, correctRate=${(ms.correctRate * 100).toFixed(0)}%`,
          )
          .join("\n")
      : "(no mastery data available)";

    const historyList = interventionHistory?.length
      ? interventionHistory
          .map(
            (h) =>
              `- ${h.kpName}: type=${h.type}, date=${h.createdAt}${h.preMasteryStatus ? `, preMastery=${h.preMasteryStatus}` : ""}`,
          )
          .join("\n")
      : "(no recent interventions)";

    const systemPrompt = `You are a K-12 learning advisor. Your task is to analyze a student's learning data and generate personalized suggestions for their parent.

Your output has three sections:

1. **suggestions**: Prioritized learning recommendations (1-5 items)
   - category: "review_priority" (topics needing review), "practice_focus" (areas needing more practice), or "learning_strategy" (study method improvements)
   - title: Short, actionable title
   - description: Detailed explanation with specific steps
   - relatedKnowledgePoints: Array of knowledge point names this relates to
   - priority: "high" (needs immediate attention), "medium" (should address this week), "low" (improvement opportunity)

2. **attentionItems**: Risk alerts (0-3 items)
   - type: "regression_risk" (mastered topic showing decline), "foundational_gap" (missing prerequisite knowledge), or "overload_warning" (too many weak points, risk of overwhelm)
   - description: Clear description of the risk
   - actionRequired: true if parent should take action

3. **parentActions**: Concrete guidance for parents (1-4 items)
   - action: What the parent should do
   - reason: Why this helps
   - frequency: "daily", "weekly", or "as_needed"

Rules:
1. Prioritize HIGH severity and WORSENING trend knowledge points.
2. If a student has regression_risk (was MASTERED, now REGRESSED), always flag it.
3. If there are foundational gaps (weak points in prerequisite topics), suggest addressing those first.
4. If the student has many (5+) weak points, include an overload_warning.
5. Parent actions should be specific, practical, and age-appropriate for the grade level.
6. Keep suggestions positive and encouraging — focus on growth, not deficiency.

Context:
${grade ? `- Grade: ${grade}` : "- Grade: unknown"}
- Output language: ${locale === "en" ? "English" : "Chinese"}

Output format: JSON object with suggestions, attentionItems, and parentActions arrays.`;

    return [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Student weakness analysis:
${weakPointsList}

Current mastery states:
${masteryList}

Recent intervention history:
${historyList}

Please generate personalized learning suggestions based on this data.`,
      },
    ];
  },
};
