/**
 * Skill Plugin System
 *
 * IPC sandbox runtime for executing skill bundles in isolated worker_threads.
 * Skills access AI Harness and Student Memory exclusively via IPC proxy.
 *
 * See: docs/adr/008-agent-architecture.md
 */
export { SkillRuntime } from "./runtime";
export {
  adaptSchema,
  adaptSchemas,
} from "./schema-adapter";
export {
  validateManifest,
  validateSchema,
  checkBundleNoPrisma,
  skillManifestSchema,
  canonicalSkillSchemaDefinition,
} from "./bundle";
export { scaffoldSkill } from "./scaffold";
export { buildSkill } from "./build";
export { SkillRegistry } from "./registry";
export type {
  SkillIPCMethod,
  SkillIPCRequest,
  SkillIPCResponse,
  SkillResultMessage,
  SkillLogMessage,
  WorkerOutMessage,
  SkillExecutionContext,
  SkillContext,
  SkillRuntimeConfig,
  SkillIPCHandlers,
  SkillExecutionResult,
} from "./types";
export type {
  SupportedProvider,
  OpenAIFunctionTool,
  AnthropicTool,
  OllamaFunctionTool,
  ProviderTool,
} from "./schema-adapter";
export type {
  SkillManifest,
  CanonicalSkillSchema,
} from "./bundle";
export type { ScaffoldOptions, ScaffoldResult } from "./scaffold";
export type { BuildOptions, BuildResult } from "./build";
export type { CachedSkill } from "./registry";
