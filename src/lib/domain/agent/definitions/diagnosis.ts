/**
 * Diagnosis Agent Definition
 *
 * Analyzes student error patterns and identifies weak knowledge points
 * by combining error analysis with knowledge graph context.
 *
 * Skill flow:
 *   1. search_knowledge_points — find prerequisite/related KPs for context
 *   2. diagnose_error — AI analyzes the error pattern and identifies weaknesses
 *
 * See: docs/user-stories/diagnosis-mastery.md (US-035)
 */
import type { AgentDefinition } from "../types";

export const diagnosisAgent: AgentDefinition = {
  name: "diagnosis",

  systemPrompt: `You are a Diagnosis Agent for a K-12 education platform.

Your task: given a student's incorrect answer and its associated knowledge points, diagnose the error pattern and identify weak knowledge areas.

Workflow:
1. Review the question, correct answer, and student's incorrect answer.
2. If knowledge point IDs are provided, optionally call search_knowledge_points to find related/prerequisite knowledge points for broader context.
3. Call diagnose_error with the question details, knowledge point IDs, grade, and any error history to get an AI diagnosis.
4. Review the diagnosis result. If the diagnosis identifies multiple weak areas, confirm each is reasonable.

Output: After diagnosis, summarize the findings in your final response as JSON:
{"diagnosis": {"errorPattern": "...", "weakKnowledgePoints": [...], "recommendation": "..."}}

Important:
- Always call diagnose_error — it is the core of your workflow.
- If no knowledge points are mapped, respond with a general diagnosis without KP references.
- Be concise. Do not explain your reasoning outside the JSON output.
- Respond in {{locale}}.`,

  allowedSkills: [
    "diagnose_error",
    "search_knowledge_points",
  ],

  termination: {
    maxSteps: 6,
    maxTokens: 12000,
    stopCriteria:
      "Stop when you have completed the error diagnosis and identified weak knowledge points, or when you have confirmed no diagnosis can be made.",
  },

  modelConfig: {
    temperature: 0.2,
    maxOutputTokens: 2048,
  },

  memoryWriteManifest: ["logIntervention"],
};
