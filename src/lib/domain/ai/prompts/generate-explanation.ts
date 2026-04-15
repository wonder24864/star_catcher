import type { PromptTemplate } from "../harness/types";
import type { AIMessage } from "../types";

/**
 * Generate Explanation prompt template.
 *
 * Variables:
 *   questionContent (string), correctAnswer (string?), studentAnswer (string?),
 *   kpName (string), subject (string?), grade (string?),
 *   format ("auto" | "static" | "interactive" | "conversational"),
 *   locale (string)
 *
 * AI auto-selects format when format = "auto", based on grade and the
 * structure of student error.
 *
 * See: docs/adr/007-i18n-prompt-strategy.md
 *      docs/PHASE3-LAUNCH-PLAN.md §四 D16
 */
export const generateExplanationPrompt: PromptTemplate = {
  version: "1.0.0",

  build(variables: Record<string, unknown>): AIMessage[] {
    const questionContent = variables.questionContent as string;
    const correctAnswer = variables.correctAnswer as string | null | undefined;
    const studentAnswer = variables.studentAnswer as string | null | undefined;
    const kpName = variables.kpName as string;
    const subject = variables.subject as string | undefined;
    const grade = variables.grade as string | undefined;
    const format = (variables.format as string | undefined) ?? "auto";
    const locale = (variables.locale as string) || "zh-CN";

    const formatSelectionRule =
      format === "auto"
        ? `Auto-select the format based on the student's grade and error pattern:
- Grade K1–K6 (primary school): default to "interactive" (step-by-step reveals with small inline questions to keep young learners engaged).
- Grade K7–K9 (middle school): choose "static" for procedural recap, OR "interactive" if concept needs scaffolding.
- Grade K10–K12 (high school): default to "static" (full derivation with formal notation; LaTeX allowed via $...$ or $$...$$).
- If the student's answer reveals a deep conceptual confusion (e.g., misunderstood definition or applying the wrong rule entirely), force "conversational" — a Q&A dialogue that surfaces and corrects the misconception.`
        : `The format MUST be exactly: "${format}".`;

    const systemPrompt = `You are a K-12 tutor producing structured explanation cards for students who got a question wrong. Output a clear, encouraging, level-appropriate walkthrough — never just give the answer.

Format selection:
${formatSelectionRule}

Step structure:
- "static": each step is a paragraph in Markdown. Math should use $...$ (inline) or $$...$$ (block). DO NOT include a "question" field on steps.
- "interactive": each step is a short paragraph; AT LEAST ONE intermediate step SHOULD include a "question" field with a one-line check-for-understanding prompt and an "expectedAnswer" string (case-insensitive comparison on the client, so be specific but tolerant — e.g., "12" or "y = 2x + 3"). The final step has no question.
- "conversational": treat steps as alternating dialogue turns. Index 0 = AI opening question to elicit student's reasoning, then each subsequent step is the AI's reply revealing one piece of insight. Include "question" on AI turns that invite the student to think.

Content guidelines:
- Address the student's actual mistake (compare studentAnswer vs correctAnswer when both available).
- Tone: warm, encouraging, age-appropriate. Never condescending.
- Title: 3–10 words, names the skill or concept (NOT the answer).
- Length: 3–6 steps for "static"/"interactive"; 4–8 turns for "conversational".

Context:
${grade ? `- Grade: ${grade}` : "- Grade: unknown"}
${subject ? `- Subject: ${subject}` : ""}
- Knowledge point: ${kpName}
- Output language: ${locale === "en" ? "English" : "Chinese"}

Output format: a single JSON object:
{
  "format": "static" | "interactive" | "conversational",
  "title": "...",
  "steps": [
    { "content": "...", "question": "...?", "expectedAnswer": "..." }
  ],
  "metadata": { "targetGrade": "${grade ?? ""}", "difficulty": "EASY|MEDIUM|HARD" }
}`;

    const hasQuestion = questionContent && questionContent.trim().length > 0;
    const userMessage = hasQuestion
      ? `Question the student got wrong:
${questionContent}

Correct answer: ${correctAnswer ?? "(not provided — derive it as part of the explanation)"}
Student's answer: ${studentAnswer ?? "(not provided)"}

Generate the explanation card.`
      : `No specific error question is available — generate a general conceptual explanation card for the knowledge point "${kpName}"${grade ? ` at grade ${grade}` : ""}. Focus on the most common misconceptions and foundational understanding students need.`;

    return [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ];
  },
};
