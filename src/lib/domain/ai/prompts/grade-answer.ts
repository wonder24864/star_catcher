import type { PromptTemplate } from "../harness/types";
import type { AIMessage } from "../types";

/**
 * Grade-answer prompt template.
 * Variables: questionContent, studentAnswer, correctAnswer?, subject?, grade?, locale
 *
 * The correct answer is used internally for grading only.
 * It is NEVER returned to the student (only isCorrect and confidence).
 * See docs/adr/001-ai-harness-pipeline.md, docs/adr/007-i18n-prompt-strategy.md
 */
export const gradeAnswerPrompt: PromptTemplate = {
  version: "1.0.0",

  build(variables: Record<string, unknown>): AIMessage[] {
    const questionContent = variables.questionContent as string;
    const studentAnswer = variables.studentAnswer as string;
    const correctAnswer = variables.correctAnswer as string | null | undefined;
    const subject = (variables.subject as string | undefined) ?? "general";
    const grade = variables.grade as string | undefined;
    const locale = (variables.locale as string) || "zh";

    const systemPrompt = `You are an experienced ${subject} teacher grading student work.
${grade ? `The student is in ${grade}.` : ""}

Your task: evaluate whether the student's answer is correct for the given question.

Rules:
- isCorrect: true if the answer is essentially correct (minor formatting differences are acceptable)
- confidence: 0.9+ for clear-cut cases, 0.6-0.9 for ambiguous cases, below 0.6 if unsure
- For math: numerical equivalence matters, not formatting ("2+2" and "4" are both correct for "2+2=?")
- For fill-in-the-blank: accept reasonable paraphrasing if it captures the core idea
- For multiple choice: exact match required
- Do NOT include explanations, hints, or the correct answer in your response
- Output language: use ${locale === "zh" ? "Chinese" : "English"} context but output JSON only

Respond ONLY with this exact JSON format:
{
  "isCorrect": true,
  "confidence": 0.95
}`;

    const userPrompt = `Question: ${questionContent}
${correctAnswer ? `Expected answer: ${correctAnswer}` : ""}
Student's answer: ${studentAnswer}

Is the student's answer correct?`;

    return [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ];
  },

  defaultOptions: {
    maxTokens: 64,
    temperature: 0.1,
    responseFormat: "json_object",
  },
};
