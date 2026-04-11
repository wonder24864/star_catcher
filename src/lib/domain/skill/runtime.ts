/**
 * SkillRuntime — manages worker_threads lifecycle for skill execution.
 *
 * For each skill invocation:
 *   1. Spawns a worker_threads Worker with resource limits
 *   2. Routes IPC requests (harness.call / memory.read / memory.write) to handlers
 *   3. Enforces timeout by terminating the worker
 *   4. Returns structured result with timing and termination info
 *
 * See: docs/adr/008-agent-architecture.md
 */
import { Worker } from "worker_threads";
import path from "path";
import type {
  SkillRuntimeConfig,
  SkillIPCHandlers,
  SkillExecutionContext,
  SkillExecutionResult,
  WorkerOutMessage,
  SkillIPCResponse,
} from "./types";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MEMORY_LIMIT_MB = 128;

export class SkillRuntime {
  private readonly timeoutMs: number;
  private readonly memoryLimitMb: number;
  private readonly workerPath: string;
  private readonly handlers: SkillIPCHandlers;

  constructor(handlers: SkillIPCHandlers, config?: SkillRuntimeConfig) {
    this.handlers = handlers;
    this.timeoutMs = config?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.memoryLimitMb = config?.memoryLimitMb ?? DEFAULT_MEMORY_LIMIT_MB;
    this.workerPath =
      config?.workerPath ??
      path.resolve(__dirname, "sandbox-worker.js");
  }

  /**
   * Execute a skill bundle in an isolated worker sandbox.
   *
   * @param bundlePath - Absolute path to compiled skill bundle (.js)
   * @param input      - Input data passed to skill's execute(input, ctx)
   * @param context    - Execution context (studentId, traceId, locale, etc.)
   * @param config     - Optional skill-specific config from SkillDefinition
   */
  async execute(
    bundlePath: string,
    input: unknown,
    context: SkillExecutionContext,
    config?: Record<string, unknown>,
  ): Promise<SkillExecutionResult> {
    const startTime = Date.now();

    return new Promise<SkillExecutionResult>((resolve) => {
      let settled = false;
      let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

      const settle = (result: SkillExecutionResult) => {
        if (settled) return;
        settled = true;
        if (timeoutHandle) clearTimeout(timeoutHandle);
        resolve(result);
      };

      // ─── Create Worker ──────────────────────────
      const worker = new Worker(this.workerPath, {
        workerData: {
          bundlePath,
          input,
          executionContext: context,
          config: config ?? {},
        },
        resourceLimits: {
          maxOldGenerationSizeMb: this.memoryLimitMb,
          maxYoungGenerationSizeMb: Math.ceil(this.memoryLimitMb / 4),
        },
      });

      // ─── Handle Worker Messages ─────────────────
      worker.on("message", (msg: WorkerOutMessage) => {
        if (msg.type === "ipc-request") {
          this.routeIPCRequest(msg)
            .then((response) => {
              this.safePostMessage(worker, response);
            })
            .catch((err) => {
              this.safePostMessage(worker, {
                type: "ipc-response" as const,
                id: msg.id,
                success: false,
                error: err instanceof Error ? err.message : String(err),
              });
            });
        } else if (msg.type === "result") {
          worker.terminate().catch(() => {});
          settle({
            success: msg.success,
            data: msg.data,
            error: msg.error,
            durationMs: Date.now() - startTime,
          });
        } else if (msg.type === "log") {
          const prefix = `[skill:${context.traceId}]`;
          switch (msg.level) {
            case "warn":
              console.warn(prefix, msg.message);
              break;
            case "error":
              console.error(prefix, msg.message);
              break;
            default:
              console.log(prefix, msg.message);
          }
        }
      });

      // ─── Handle Worker Errors ───────────────────
      worker.on("error", (err) => {
        const isOOM =
          err.message?.includes("out of memory") ||
          err.message?.includes("allocation failed") ||
          err.message?.includes("heap limit");

        settle({
          success: false,
          error: err.message,
          durationMs: Date.now() - startTime,
          terminated: true,
          terminationReason: isOOM ? "memory" : "error",
        });
      });

      // ─── Handle Unexpected Exit ─────────────────
      worker.on("exit", (code) => {
        if (!settled) {
          settle({
            success: false,
            error: `Worker exited unexpectedly with code ${code}`,
            durationMs: Date.now() - startTime,
            terminated: true,
            terminationReason: "error",
          });
        }
      });

      // ─── Timeout Enforcement ────────────────────
      timeoutHandle = setTimeout(() => {
        if (!settled) {
          worker.terminate().catch(() => {});
          settle({
            success: false,
            error: `Skill execution timed out after ${this.timeoutMs}ms`,
            durationMs: Date.now() - startTime,
            terminated: true,
            terminationReason: "timeout",
          });
        }
      }, this.timeoutMs);
    });
  }

  /**
   * Route an IPC request to the appropriate handler.
   */
  private async routeIPCRequest(
    msg: WorkerOutMessage & { type: "ipc-request" },
  ): Promise<SkillIPCResponse> {
    const { id, method, params } = msg;

    try {
      let data: unknown;

      switch (method) {
        case "harness.call": {
          const operation = params.operation as string;
          const callData = (params.data ?? {}) as Record<string, unknown>;
          data = await this.handlers.onCallAI(operation, callData);
          break;
        }
        case "memory.read": {
          const readMethod = params.method as string;
          const readData = (params.data ?? {}) as Record<string, unknown>;
          data = await this.handlers.onReadMemory(readMethod, readData);
          break;
        }
        case "memory.write": {
          const writeMethod = params.method as string;
          const writeData = (params.data ?? {}) as Record<string, unknown>;
          await this.handlers.onWriteMemory(writeMethod, writeData);
          data = undefined;
          break;
        }
        case "query": {
          const queryName = params.queryName as string;
          const queryData = (params.data ?? {}) as Record<string, unknown>;
          data = await this.handlers.onQuery(queryName, queryData);
          break;
        }
        default:
          throw new Error(`Unknown IPC method: ${method}`);
      }

      return { type: "ipc-response", id, success: true, data };
    } catch (err) {
      return {
        type: "ipc-response",
        id,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Safely post a message to worker (may have been terminated).
   */
  private safePostMessage(worker: Worker, msg: SkillIPCResponse): void {
    try {
      worker.postMessage(msg);
    } catch {
      // Worker already terminated — ignore
    }
  }
}
