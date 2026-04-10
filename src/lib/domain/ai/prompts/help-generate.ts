import type { PromptTemplate } from "../harness/types";
import type { AIMessage } from "../types";

/**
 * Prompt template for progressive help generation (3 levels).
 *
 * Level 1: Thinking direction — knowledge point + approach hint, NO steps or answer
 * Level 2: Key steps — step framework, omits final answer
 * Level 3: Full solution — complete worked solution + answer
 *
 * See docs/adr/004-progressive-help-reveal.md
 */
export const helpGeneratePrompt: PromptTemplate = {
  version: "1.0.0",

  build(variables: Record<string, unknown>): AIMessage[] {
    const locale = (variables.locale as string) || "zh";
    const helpLevel = variables.helpLevel as number;
    const questionContent = variables.questionContent as string;
    const studentAnswer = variables.studentAnswer as string;
    const correctAnswer = variables.correctAnswer as string | undefined;
    const subject = (variables.subject as string) || "general";
    const grade = variables.grade as string | undefined;

    const lang = locale === "zh" ? "Chinese (Simplified)" : "English";

    let levelInstruction: string;
    switch (helpLevel) {
      case 1:
        levelInstruction = `LEVEL 1 — Thinking Direction ONLY:
- State the knowledge point being tested.
- Give a brief hint about the solving approach or direction.
- Do NOT include any steps, calculations, or the answer.
- Keep it to 2-3 sentences maximum.`;
        break;
      case 2:
        levelInstruction = `LEVEL 2 — Key Steps:
- State the knowledge point being tested.
- Provide a step-by-step solving framework with main steps.
- Show intermediate reasoning but OMIT the final calculation result.
- Do NOT reveal the final answer.`;
        break;
      case 3:
        levelInstruction = `LEVEL 3 — Full Solution:
- State the knowledge point being tested.
- Provide the complete worked solution with all steps.
- Include the correct final answer with explanation.
- Explain why the student's answer was wrong, if applicable.`;
        break;
      default:
        levelInstruction = "Provide a brief thinking direction hint.";
    }

    const systemPrompt = `You are an encouraging and patient K-12 tutor helping a student understand their mistake.
Subject: ${subject}
${grade ? `Student grade level: ${grade}` : ""}

${levelInstruction}

Tone guidelines:
- Be warm and encouraging — never condescending.
- Use age-appropriate language for the student's grade level.
- Use markdown formatting for clarity (bold for key terms, numbered lists for steps).
- For math, use LaTeX notation wrapped in $...$ for inline and $$...$$ for display.

Respond ONLY with valid JSON matching this exact format:
{
  "helpText": "markdown content here",
  "level": ${helpLevel},
  "knowledgePoint": "the knowledge point being tested"
}

Output language: ${lang}`;

    const userParts = [
      `Question: ${questionContent}`,
      `Student's answer: ${studentAnswer}`,
    ];
    if (correctAnswer) {
      userParts.push(`Correct answer: ${correctAnswer}`);
    }
    userParts.push(`Please provide Level ${helpLevel} help for this question.`);

    return [
      { role: "system", content: systemPrompt },
      { role: "user", content: userParts.join("\n") },
    ];
  },

  defaultOptions: {
    maxTokens: 1024,
    temperature: 0.7,
    responseFormat: "json_object",
  },
};
