/**
 * Skill Plugin System — Type Definitions
 *
 * IPC protocol between main thread (SkillRuntime) and worker thread (sandbox).
 * See: docs/adr/008-agent-architecture.md
 */

// ─── IPC Protocol ─────────────────────────────────

/** IPC method categories */
export type SkillIPCMethod = "harness.call" | "memory.read" | "memory.write";

/** Worker → Main: service request via IPC */
export interface SkillIPCRequest {
  type: "ipc-request";
  /** Unique correlation ID */
  id: string;
  /** IPC service method */
  method: SkillIPCMethod;
  /** Method-specific parameters */
  params: Record<string, unknown>;
}

/** Main → Worker: service response */
export interface SkillIPCResponse {
  type: "ipc-response";
  /** Matches request ID */
  id: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

/** Worker → Main: final execution result */
export interface SkillResultMessage {
  type: "result";
  success: boolean;
  data?: unknown;
  error?: string;
}

/** Worker → Main: forwarded console output */
export interface SkillLogMessage {
  type: "log";
  level: "info" | "warn" | "error";
  message: string;
}

/** Union of all Worker → Main message types */
export type WorkerOutMessage =
  | SkillIPCRequest
  | SkillResultMessage
  | SkillLogMessage;

// ─── Execution Context ────────────────────────────

/** Runtime context provided to skill during execution */
export interface SkillExecutionContext {
  /** Student being served */
  studentId: string;
  /** Agent that invoked this skill (ADR-008) */
  agentId?: string;
  /** Optional session reference */
  sessionId?: string;
  /** Agent trace ID for auditing */
  traceId: string;
  /** UI locale (e.g., 'zh-CN') */
  locale: string;
  /** Student grade level */
  grade?: string;
}

/**
 * API exposed to skill code inside the sandbox.
 * All external access goes through IPC proxy — no direct DB/FS/network.
 */
export interface SkillContext {
  /** Call AI via Harness pipeline */
  callAI(
    operation: string,
    params: Record<string, unknown>,
  ): Promise<unknown>;
  /** Read from Student Memory layer */
  readMemory(
    method: string,
    params: Record<string, unknown>,
  ): Promise<unknown>;
  /** Write to Student Memory layer */
  writeMemory(
    method: string,
    params: Record<string, unknown>,
  ): Promise<void>;
  /** Skill-specific configuration (from SkillDefinition.config) */
  config: Readonly<Record<string, unknown>>;
  /** Execution context */
  context: Readonly<SkillExecutionContext>;
}

// ─── Runtime Config ───────────────────────────────

export interface SkillRuntimeConfig {
  /** Max execution time in ms (default: 30000) */
  timeoutMs?: number;
  /** Max V8 old generation memory in MB (default: 128) */
  memoryLimitMb?: number;
  /** Absolute path to sandbox-worker.js */
  workerPath?: string;
}

/** Main-thread handlers for IPC requests from sandbox */
export interface SkillIPCHandlers {
  /** Handle harness.call → AI Harness pipeline */
  onCallAI(
    operation: string,
    data: Record<string, unknown>,
  ): Promise<unknown>;
  /** Handle memory.read → Student Memory layer */
  onReadMemory(
    method: string,
    data: Record<string, unknown>,
  ): Promise<unknown>;
  /** Handle memory.write → Student Memory layer */
  onWriteMemory(
    method: string,
    data: Record<string, unknown>,
  ): Promise<void>;
}

// ─── Execution Result ─────────────────────────────

export interface SkillExecutionResult {
  success: boolean;
  data?: unknown;
  error?: string;
  /** Wall-clock duration in ms */
  durationMs: number;
  /** True if worker was forcefully terminated */
  terminated?: boolean;
  /** Reason for termination */
  terminationReason?: "timeout" | "memory" | "error";
}
