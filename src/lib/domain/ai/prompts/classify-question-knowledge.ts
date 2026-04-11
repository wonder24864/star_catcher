import type { PromptTemplate } from "../harness/types";
import type { AIMessage } from "../types";

/**
 * Question-Knowledge Classification prompt template.
 * Variables: questionText (string), questionSubject (string),
 *            questionGrade (string?), candidates (array), locale (string)
 *
 * English prompt with locale variable for output language control.
 * See docs/adr/007-i18n-prompt-strategy.md
 */
export const classifyQuestionKnowledgePrompt: PromptTemplate = {
  version: "1.0.0",

  build(variables: Record<string, unknown>): AIMessage[] {
    const questionText = variables.questionText as string;
    const questionSubject = variables.questionSubject as string;
    const questionGrade = variables.questionGrade as string | undefined;
    const candidates = variables.candidates as Array<{ id: string; name: string; description?: string }>;
    const locale = (variables.locale as string) || "zh-CN";

    const candidateList = candidates
      .map((c, i) => `${i + 1}. [${c.id}] ${c.name}${c.description ? ` — ${c.description}` : ""}`)
      .join("\n");

    const systemPrompt = `You are a K-12 education expert specialized in curriculum knowledge point classification.

Your task: Given a student's question and a list of candidate knowledge points, determine which knowledge points this question tests. A single question may test multiple knowledge points (e.g., a final exam question combining concepts from different chapters).

Rules:
1. Evaluate EACH candidate independently.
2. Assign a confidence score (0.0-1.0) for each candidate:
   - 0.9-1.0: This is clearly a primary knowledge point tested by this question
   - 0.7-0.89: Strong relevance, likely tested
   - 0.5-0.69: Moderate relevance, partially tested or a supporting concept
   - Below 0.5: Weak or no relevance (still include in output with low score)
3. Provide brief reasoning for each score.
4. A question can have 1-5 relevant knowledge points (confidence ≥ 0.5).

Context:
- Subject: ${questionSubject}
${questionGrade ? `- Grade: ${questionGrade}` : ""}
- Output language for reasoning: ${locale === "en" ? "English" : "Chinese"}

Output format: JSON object:
{
  "mappings": [
    { "knowledgePointId": "id_from_candidates", "confidence": 0.0-1.0, "reasoning": "brief explanation" }
  ]
}

Include ALL candidates in the output (even low-confidence ones). Sort by confidence descending.`;

    return [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Question: ${questionText}\n\nCandidate knowledge points:\n${candidateList}`,
      },
    ];
  },
};
