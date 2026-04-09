import type { PromptTemplate } from "../harness/types";
import type { AIMessage } from "../types";

/**
 * Prompt template for automatic subject detection from question text.
 *
 * Used in the manual input flow (US-010): student types a question,
 * AI auto-detects the subject and content type.
 *
 * Designed for fast classification — low token budget.
 */
export const subjectDetectPrompt: PromptTemplate = {
  version: "1.0.0",

  build(variables: Record<string, unknown>): AIMessage[] {
    const questionContent = variables.questionContent as string;
    const studentAnswer = (variables.studentAnswer as string) || "";

    const systemPrompt = `You are a K-12 education content classifier.

Given a question (and optionally a student's answer), determine:
1. The academic subject
2. Your confidence level (0-1)
3. The content type if identifiable

Subject must be one of: MATH, CHINESE, ENGLISH, PHYSICS, CHEMISTRY, BIOLOGY, POLITICS, HISTORY, GEOGRAPHY, OTHER

Content type (optional) must be one of: EXAM, HOMEWORK, DICTATION, COPYWRITING, ORAL_CALC, COMPOSITION, OTHER

Classification rules:
- Arithmetic, algebra, geometry, statistics → MATH
- Chinese language, reading comprehension, pinyin, characters → CHINESE
- English vocabulary, grammar, reading, writing → ENGLISH
- Forces, motion, energy, circuits, optics → PHYSICS
- Elements, reactions, compounds, solutions → CHEMISTRY
- Cells, organisms, ecology, genetics → BIOLOGY
- Government, law, citizenship, philosophy → POLITICS
- Historical events, dates, figures, civilizations → HISTORY
- Maps, climate, terrain, demographics → GEOGRAPHY
- If the question clearly spans multiple subjects or is unrecognizable → OTHER
- Set confidence ≥ 0.9 for clear single-subject questions
- Set confidence 0.5-0.8 for ambiguous or cross-disciplinary questions
- Set confidence < 0.5 if truly uncertain

Respond ONLY with valid JSON:
{ "subject": "MATH", "confidence": 0.95, "contentType": "HOMEWORK" }`;

    let userMsg = `Question: ${questionContent}`;
    if (studentAnswer) {
      userMsg += `\nStudent's answer: ${studentAnswer}`;
    }
    userMsg += "\n\nClassify this question.";

    return [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMsg },
    ];
  },

  defaultOptions: {
    maxTokens: 64,
    temperature: 0.1,
    responseFormat: "json_object",
  },
};
