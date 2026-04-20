import type { PromptTemplate } from "../harness/types";
import type { AIMessage } from "../types";

/**
 * OCR Recognition prompt template.
 * Variables: imageUrls (string[]), locale (string), grade (string?)
 *
 * English prompt with locale variable for output language control.
 * See docs/adr/007-i18n-prompt-strategy.md
 */
export const recognizeHomeworkPrompt: PromptTemplate = {
  version: "1.0.0",

  build(variables: Record<string, unknown>): AIMessage[] {
    const imageUrls = variables.imageUrls as string[];
    const locale = (variables.locale as string) || "zh";
    const grade = variables.grade as string | undefined;
    const hasExif = variables.hasExif as boolean | undefined;

    const systemPrompt = `You are an expert homework recognition AI for K-12 education.

Your task:
1. Analyze the homework image(s) and extract each question.
2. Identify the student's handwritten answers.
3. Determine the correct answer for each question based on curriculum knowledge.
4. Judge each question as correct or incorrect.
5. Auto-detect the subject, content type, and grade level.

Rules:
- Extract ALL visible questions, do not skip any.
- For handwritten answers, do your best to read them accurately.
- If a student answer is unclear, set confidence below 0.7 and mark needsReview.
- Calculate: correctCount = number of correct answers, totalScore = (correctCount / totalQuestions) × 100 rounded to integer.
- Provide imageRegion coordinates as percentages (0-100) relative to the image dimensions.
- For any math formula in content / studentAnswer / correctAnswer, wrap it in LaTeX delimiters: use $...$ for inline (e.g. $\\frac{3}{4}$, $x^2+1$) and $$...$$ for display/block math. Plain text around the formula must stay outside the delimiters. Bare LaTeX without delimiters will NOT render on the frontend.
${grade ? `- The student is in ${grade}, adjust difficulty expectations accordingly.` : ""}
${!hasExif ? "- The image may not have EXIF orientation data. Try to read content in the most natural orientation." : ""}

Output format: JSON matching this schema exactly:
{
  "subject": "MATH" | "CHINESE" | "ENGLISH" | "PHYSICS" | "CHEMISTRY" | "BIOLOGY" | "POLITICS" | "HISTORY" | "GEOGRAPHY" | "OTHER",
  "subjectConfidence": 0.0-1.0,
  "contentType": "EXAM" | "HOMEWORK" | "DICTATION" | "COPYWRITING" | "ORAL_CALC" | "COMPOSITION" | "OTHER",
  "grade": "string or omit",
  "title": "title if visible, or omit",
  "questions": [
    {
      "questionNumber": 1,
      "questionType": "CHOICE" | "FILL_BLANK" | "TRUE_FALSE" | "SHORT_ANSWER" | "CALCULATION" | "ESSAY" | "DICTATION_ITEM" | "COPY_ITEM" | "OTHER",
      "content": "question text",
      "studentAnswer": "student's answer or null",
      "correctAnswer": "correct answer or null",
      "isCorrect": true/false/null,
      "confidence": 0.0-1.0,
      "imageRegion": {"x": %, "y": %, "w": %, "h": %},
      "knowledgePoint": "knowledge point name"
    }
  ],
  "totalScore": integer 0-100,
  "correctCount": integer
}

Respond ONLY with valid JSON. Output language for question content: preserve original language from the image. Output language for knowledgePoint: use ${locale === "zh" ? "Chinese" : "English"}.`;

    // Build user message with images
    const userContent: Array<{ type: "text" | "image_url"; text?: string; image_url?: { url: string; detail: "high" } }> = [
      { type: "text", text: "Please recognize and check the following homework:" },
    ];

    for (const url of imageUrls) {
      userContent.push({
        type: "image_url",
        image_url: { url, detail: "high" },
      });
    }

    return [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ];
  },

  defaultOptions: {
    maxTokens: 4096,
    temperature: 0.1,
    responseFormat: "json_object",
  },
};
