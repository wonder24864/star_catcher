import type { PromptTemplate } from "../harness/types";
import type { AIMessage } from "../types";

/**
 * Knowledge Point Extraction prompt template.
 * Variables: tocText (string), bookTitle (string), subject (string),
 *            grade (string?), schoolLevel (string), locale (string)
 *
 * English prompt with locale variable for output language control.
 * See docs/adr/007-i18n-prompt-strategy.md
 */
export const extractKnowledgePointsPrompt: PromptTemplate = {
  version: "1.0.0",

  build(variables: Record<string, unknown>): AIMessage[] {
    const tocText = variables.tocText as string;
    const bookTitle = variables.bookTitle as string;
    const subject = variables.subject as string;
    const grade = variables.grade as string | undefined;
    const schoolLevel = variables.schoolLevel as string;
    const locale = (variables.locale as string) || "zh-CN";

    const systemPrompt = `You are an expert in Chinese K-12 education curriculum analysis.

Your task: Parse the table of contents from a textbook and extract a structured knowledge point tree.

Rules:
1. Identify the chapter/section hierarchy from the TOC text.
2. Each chapter heading becomes a knowledge point at the appropriate depth level.
3. The finest granularity sections (leaf nodes) are the actual knowledge points students learn.
4. Infer prerequisite relationships: within the same chapter, earlier sections are prerequisites of later ones.
5. Cross-chapter prerequisites: if a topic clearly depends on a prior chapter topic, include it.
6. Estimate difficulty (1-5) based on the position in the textbook and typical curriculum difficulty progression (earlier = easier).
7. Preserve the original ordering of entries.

Context:
- Book: ${bookTitle}
- Subject: ${subject}
- School level: ${schoolLevel}
${grade ? `- Grade: ${grade}` : ""}
- Output language: ${locale === "en" ? "English" : "Chinese (keep original knowledge point names)"}

Output format: JSON object with a single "knowledgePoints" array:
{
  "knowledgePoints": [
    {
      "name": "知识点名称 (keep original Chinese name from TOC)",
      "parentName": "上级章节名称 (null for top-level chapters)",
      "depth": 0,  // 0=chapter, 1=section, 2=subsection, etc.
      "order": 0,  // sequential order among siblings (0-indexed)
      "difficulty": 3,  // 1-5 estimate
      "prerequisites": ["前置知识点名称"]  // optional, names of prerequisite points
    }
  ]
}

Important:
- Keep knowledge point names exactly as they appear in the TOC.
- Do NOT include page numbers or other metadata in the names.
- A chapter like "第一章 有理数" should be named "有理数" (strip the chapter prefix).
- Section like "1.1 正数和负数" should be named "正数和负数".`;

    return [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Please analyze this table of contents and extract knowledge points:\n\n${tocText}`,
      },
    ];
  },
};
