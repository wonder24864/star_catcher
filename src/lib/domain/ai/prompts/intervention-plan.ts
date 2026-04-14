import type { PromptTemplate } from "../harness/types";
import type { AIMessage } from "../types";

/**
 * Intervention Plan prompt template.
 * Variables: weakPoints (array), maxTasks (number), existingErrorQuestions (array),
 *            grade (string?), locale (string)
 *
 * English prompt with locale variable for output language control.
 * See docs/adr/007-i18n-prompt-strategy.md
 */
export const interventionPlanPrompt: PromptTemplate = {
  version: "1.0.0",

  build(variables: Record<string, unknown>): AIMessage[] {
    const weakPoints = variables.weakPoints as Array<{
      kpId: string;
      kpName: string;
      severity: string;
      trend: string;
      errorCount: number;
    }>;
    const maxTasks = variables.maxTasks as number;
    const existingErrorQuestions = variables.existingErrorQuestions as
      | Array<{ id: string; content: string; knowledgePointId: string }>
      | undefined;
    const grade = variables.grade as string | undefined;
    const locale = (variables.locale as string) || "zh-CN";

    const weakPointsList = weakPoints
      .map(
        (wp) =>
          `- [${wp.kpId}] ${wp.kpName} — severity: ${wp.severity}, trend: ${wp.trend}, errorCount: ${wp.errorCount}`,
      )
      .join("\n");

    const errorQuestionsList = existingErrorQuestions?.length
      ? existingErrorQuestions
          .map(
            (eq) =>
              `- [${eq.id}] KP: ${eq.knowledgePointId} — "${eq.content}"`,
          )
          .join("\n")
      : "(no existing error questions available for review)";

    const systemPrompt = `You are a K-12 education task planner. Your job is to generate a personalized daily task plan for a student based on their weak knowledge points.

Task Types:
- REVIEW: Re-practice an existing error question the student got wrong before. Use when there are existing error questions available for the knowledge point.
- PRACTICE: Generate a new practice problem targeting the weak knowledge point. Use for knowledge points with HIGH or MEDIUM severity.
- EXPLANATION: Provide a conceptual explanation for a foundational knowledge gap. Use when the student has fundamental misunderstanding (HIGH severity, WORSENING trend) or no existing error questions.

Prioritization Rules:
1. HIGH severity + WORSENING trend → highest priority (EXPLANATION or PRACTICE)
2. HIGH severity + STABLE trend → high priority (REVIEW if error questions exist, else PRACTICE)
3. MEDIUM severity + WORSENING trend → medium-high priority (PRACTICE)
4. MEDIUM severity → medium priority (REVIEW or PRACTICE)
5. LOW severity → lower priority (REVIEW if available)

Content Guidelines:
- For REVIEW tasks: set questionId to the existing error question ID. Content title should reference the knowledge point.
- For PRACTICE tasks: generate a brief practice prompt in the content field. Include a title and description.
- For EXPLANATION tasks: provide a clear, concise explanation in the content field suitable for the student's grade level.

Constraints:
- Maximum ${maxTasks} tasks total
- Each task must reference a valid knowledgePointId from the provided list
- sortOrder: 0-based, prioritized tasks first
- Ensure variety: mix task types when possible

Context:
${grade ? `- Grade: ${grade}` : ""}
- Output language: ${locale === "en" ? "English" : "Chinese"}

Output format: JSON object:
{
  "tasks": [
    {
      "type": "REVIEW | PRACTICE | EXPLANATION",
      "knowledgePointId": "the kpId from the weak points list",
      "questionId": "existing error question ID (REVIEW only, optional)",
      "content": { "title": "...", "description": "..." },
      "sortOrder": 0,
      "reason": "brief explanation of why this task was chosen"
    }
  ],
  "reasoning": "overall strategy summary"
}`;

    return [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Weak knowledge points:
${weakPointsList}

Existing error questions available for REVIEW tasks:
${errorQuestionsList}

Generate a daily task plan with at most ${maxTasks} tasks.`,
      },
    ];
  },
};
