import type { PromptTemplate } from "../harness/types";
import type { AIMessage } from "../types";

/**
 * Error Diagnosis prompt template.
 * Variables: question (string), correctAnswer (string), studentAnswer (string),
 *            subject (string), grade (string?), knowledgePoints (array),
 *            errorHistory (array), locale (string)
 *
 * English prompt with locale variable for output language control.
 * See docs/adr/007-i18n-prompt-strategy.md
 */
export const diagnoseErrorPrompt: PromptTemplate = {
  version: "1.0.0",

  build(variables: Record<string, unknown>): AIMessage[] {
    const question = variables.question as string;
    const correctAnswer = variables.correctAnswer as string;
    const studentAnswer = variables.studentAnswer as string;
    const subject = variables.subject as string;
    const grade = variables.grade as string | undefined;
    const knowledgePoints = variables.knowledgePoints as
      | Array<{ id: string; name: string; description?: string }>
      | undefined;
    const errorHistory = variables.errorHistory as
      | Array<{ question: string; studentAnswer: string; knowledgePointName: string; createdAt: string }>
      | undefined;
    const locale = (variables.locale as string) || "zh-CN";

    const kpList = knowledgePoints?.length
      ? knowledgePoints
          .map((kp) => `- [${kp.id}] ${kp.name}${kp.description ? `: ${kp.description}` : ""}`)
          .join("\n")
      : "(no knowledge points mapped yet)";

    const historyBlock = errorHistory?.length
      ? errorHistory
          .map(
            (h) =>
              `- "${h.question}" → student answered "${h.studentAnswer}" (KP: ${h.knowledgePointName}, date: ${h.createdAt})`,
          )
          .join("\n")
      : "(no prior errors in last 30 days for these knowledge points)";

    const systemPrompt = `You are a K-12 education diagnostician. Your task is to analyze a student's incorrect answer, identify the error pattern, and determine which knowledge points are weak.

Error Pattern Categories:
- CONCEPT_CONFUSION: Fundamental misunderstanding of a concept (e.g., confusing area with perimeter)
- CALCULATION_ERROR: Correct method but arithmetic/computation mistake
- METHOD_WRONG: Applied wrong method or formula for this problem type
- CARELESS: Understood concept and method but made a minor oversight (sign error, copy mistake)
- OTHER: Does not fit above categories

Rules:
1. Analyze the gap between the correct answer and the student's answer.
2. Consider the student's error history for patterns (same error type recurring = higher severity).
3. For each relevant knowledge point, assign severity:
   - HIGH: Fundamental gap, needs immediate attention
   - MEDIUM: Partial understanding, review recommended
   - LOW: Minor issue, likely correctable with practice
4. Provide a concise recommendation for improvement.
5. If knowledge points are provided, reference them by ID. If not, describe the weakness generally.

Context:
- Subject: ${subject}
${grade ? `- Grade: ${grade}` : ""}
- Output language: ${locale === "en" ? "English" : "Chinese"}

Output format: JSON object:
{
  "errorPattern": "CONCEPT_CONFUSION | CALCULATION_ERROR | METHOD_WRONG | CARELESS | OTHER",
  "errorDescription": "Brief description of what went wrong",
  "weakKnowledgePoints": [
    { "knowledgePointId": "id", "severity": "HIGH|MEDIUM|LOW", "reasoning": "why this KP is weak" }
  ],
  "recommendation": "What the student should do to improve"
}`;

    return [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Question: ${question}

Correct answer: ${correctAnswer}

Student's answer: ${studentAnswer}

Related knowledge points:
${kpList}

Error history (last 30 days, same knowledge points):
${historyBlock}`,
      },
    ];
  },
};
