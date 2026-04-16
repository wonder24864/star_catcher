import { z } from "zod";

/**
 * Zod schema for learning suggestion output.
 * Validates the AI response that generates personalized learning suggestions
 * based on weakness data, mastery states, and intervention history.
 *
 * Output has three sections:
 *   - suggestions: prioritized learning recommendations
 *   - attentionItems: risk alerts requiring attention
 *   - parentActions: actionable guidance for parents
 *
 * See: US-061 (parent-analytics-phase4.md)
 */

const suggestionCategoryEnum = z.enum([
  "review_priority",
  "practice_focus",
  "learning_strategy",
]);

const suggestionPriorityEnum = z.enum(["high", "medium", "low"]);

const suggestionItemSchema = z.object({
  category: suggestionCategoryEnum,
  title: z.string().min(1),
  description: z.string().min(1),
  relatedKnowledgePoints: z.array(z.string()),
  priority: suggestionPriorityEnum,
});

const attentionTypeEnum = z.enum([
  "regression_risk",
  "foundational_gap",
  "overload_warning",
]);

const attentionItemSchema = z.object({
  type: attentionTypeEnum,
  description: z.string().min(1),
  actionRequired: z.boolean(),
});

const frequencyEnum = z.enum(["daily", "weekly", "as_needed"]);

const parentActionSchema = z.object({
  action: z.string().min(1),
  reason: z.string().min(1),
  frequency: frequencyEnum,
});

export const learningSuggestionSchema = z.object({
  suggestions: z.array(suggestionItemSchema).min(1),
  attentionItems: z.array(attentionItemSchema),
  parentActions: z.array(parentActionSchema),
});

export type LearningSuggestionOutput = z.infer<typeof learningSuggestionSchema>;
