import type { PromptTemplate } from "./types";
import type { AIMessage } from "../types";

/**
 * Central registry for prompt templates.
 * All prompts are registered here and resolved at call time.
 */
const registry = new Map<string, PromptTemplate>();

export function registerPrompt(name: string, template: PromptTemplate): void {
  registry.set(name, template);
}

export function getPrompt(name: string): PromptTemplate {
  const template = registry.get(name);
  if (!template) {
    throw new Error(`Prompt template not found: ${name}`);
  }
  return template;
}

/**
 * Build messages from a registered template with variable injection.
 */
export function buildMessages(
  templateName: string,
  variables: Record<string, unknown>
): AIMessage[] {
  const template = getPrompt(templateName);
  return template.build(variables);
}

export function listRegisteredPrompts(): string[] {
  return Array.from(registry.keys());
}
