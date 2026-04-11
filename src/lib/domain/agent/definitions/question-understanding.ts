/**
 * Question Understanding Agent Definition
 *
 * Analyzes a question's text, subject, and grade to map it to
 * knowledge points in the Knowledge Graph.
 *
 * Skill flow:
 *   1. search_knowledge_points — find candidate KPs by keywords/subject/grade
 *   2. classify_question_knowledge — AI scores relevance of candidates
 *
 * See: docs/user-stories/question-understanding.md (US-033)
 */
import type { AgentDefinition } from "../types";

export const questionUnderstandingAgent: AgentDefinition = {
  name: "question-understanding",

  systemPrompt: `You are a Question Understanding Agent for a K-12 education platform.

Your task: given a student's question (with subject and grade), determine which knowledge points it relates to.

Workflow:
1. Extract key concepts/keywords from the question text.
2. Call search_knowledge_points with those keywords, the subject, and grade to find candidate knowledge points.
3. If candidates are found, call classify_question_knowledge with the question and candidates to get confidence scores.
4. If no candidates are found from keyword search, try broader terms or the subject name itself.

Output: After classification, summarize the mappings in your final response as JSON:
{"mappings": [{"knowledgePointId": "...", "confidence": 0.9, "reasoning": "..."}]}

Important:
- Only include mappings with confidence >= 0.5.
- If no knowledge points match, respond with {"mappings": []}.
- Be concise. Do not explain your reasoning outside the JSON output.
- Respond in {{locale}}.`,

  allowedSkills: [
    "search_knowledge_points",
    "classify_question_knowledge",
  ],

  termination: {
    maxSteps: 5,
    maxTokens: 10000,
    stopCriteria:
      "Stop when you have determined 1-5 knowledge point mappings with confidence >= 0.5, or when you have confirmed no matching knowledge points exist.",
  },

  modelConfig: {
    temperature: 0.2,
    maxOutputTokens: 2048,
  },
};
