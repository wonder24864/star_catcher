/**
 * Skill Sandbox Worker
 *
 * Runs inside worker_threads. Loads skill bundle code in a vm sandbox
 * with restricted globals. All external access goes through IPC.
 *
 * Security model:
 *   - No require / process / Buffer / fs / net in sandbox
 *   - No setTimeout / setInterval (prevents DoS)
 *   - No globalThis (prevents sandbox escape)
 *   - Console forwarded to main thread via IPC
 *   - Bundle compilation timeout: 5s
 *   - Execution timeout: enforced by main thread (worker.terminate)
 *   - Memory limit: enforced by worker_threads resourceLimits
 *
 * See: docs/adr/008-agent-architecture.md
 */
/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unused-vars */
"use strict";

const { parentPort, workerData } = require("worker_threads");
const vm = require("vm");
const fs = require("fs");
const crypto = require("crypto");

if (!parentPort) {
  throw new Error("sandbox-worker must run as a worker_thread");
}

// ─── IPC Request/Response Correlation ─────────────

/** @type {Map<string, { resolve: Function, reject: Function }>} */
const pendingRequests = new Map();

parentPort.on("message", (msg) => {
  if (msg && msg.type === "ipc-response") {
    const pending = pendingRequests.get(msg.id);
    if (pending) {
      pendingRequests.delete(msg.id);
      if (msg.success) {
        pending.resolve(msg.data);
      } else {
        pending.reject(new Error(msg.error || "IPC request failed"));
      }
    }
  }
});

/**
 * Send an IPC request to main thread and wait for response.
 * @param {string} method - IPC method (harness.call | memory.read | memory.write)
 * @param {Record<string, unknown>} params
 * @returns {Promise<unknown>}
 */
function ipcRequest(method, params) {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    pendingRequests.set(id, { resolve, reject });
    parentPort.postMessage({
      type: "ipc-request",
      id,
      method,
      params: params || {},
    });
  });
}

// ─── SkillContext Factory ─────────────────────────

/**
 * Create the SkillContext proxy exposed to bundle code.
 * All methods route through IPC — no direct external access.
 */
function createSkillContext(executionContext, config) {
  return {
    callAI: function (operation, params) {
      return ipcRequest("harness.call", {
        operation: operation,
        data: params || {},
      });
    },
    readMemory: function (method, params) {
      return ipcRequest("memory.read", {
        method: method,
        data: params || {},
      });
    },
    writeMemory: function (method, params) {
      return ipcRequest("memory.write", {
        method: method,
        data: params || {},
      });
    },
    query: function (queryName, params) {
      return ipcRequest("query", {
        queryName: queryName,
        data: params || {},
      });
    },
    config: Object.freeze(config || {}),
    context: Object.freeze(executionContext || {}),
  };
}

// ─── Sandbox Context ──────────────────────────────

/**
 * Create a restricted vm context for skill bundle execution.
 * Only safe JavaScript globals are exposed.
 */
function createSandbox() {
  const fakeModule = { exports: {} };

  const context = vm.createContext({
    // CommonJS module system (for bundle output)
    module: fakeModule,
    exports: fakeModule.exports,

    // Standard JavaScript globals
    Object,
    Array,
    String,
    Number,
    Boolean,
    Symbol,
    BigInt,
    RegExp,
    Math,
    Date,
    JSON,
    Promise,
    Map,
    Set,
    WeakMap,
    WeakSet,
    WeakRef,
    Proxy,
    Reflect,

    // Error types
    Error,
    TypeError,
    RangeError,
    SyntaxError,
    URIError,
    ReferenceError,
    EvalError,
    AggregateError,

    // Utility functions
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    encodeURIComponent,
    decodeURIComponent,
    encodeURI,
    decodeURI,

    // Text encoding
    TextEncoder,
    TextDecoder,

    // Primitives
    NaN,
    Infinity,
    undefined,

    // Structured clone
    structuredClone,

    // Console (forwarded to main thread via IPC)
    console: {
      log: function () {
        forwardLog("info", Array.from(arguments));
      },
      info: function () {
        forwardLog("info", Array.from(arguments));
      },
      warn: function () {
        forwardLog("warn", Array.from(arguments));
      },
      error: function () {
        forwardLog("error", Array.from(arguments));
      },
    },

    // ─── EXPLICITLY EXCLUDED ───
    // require, process, Buffer, __dirname, __filename,
    // setTimeout, setInterval, setImmediate, clearTimeout, clearInterval,
    // fetch, XMLHttpRequest, Request, Response,
    // globalThis, global, self, window,
    // queueMicrotask (prevents event loop manipulation)
  });

  return { context, fakeModule };
}

/**
 * Forward console output from sandbox to main thread.
 */
function forwardLog(level, args) {
  try {
    const message = args
      .map(function (a) {
        if (typeof a === "string") return a;
        try {
          return JSON.stringify(a);
        } catch (_e) {
          return String(a);
        }
      })
      .join(" ");

    parentPort.postMessage({ type: "log", level: level, message: message });
  } catch (_e) {
    // Ignore log forwarding errors — never crash the worker for a log
  }
}

// ─── Main Execution ───────────────────────────────

async function main() {
  const { bundlePath, input, executionContext, config } = workerData;

  try {
    // 1. Read bundle code from disk
    const bundleCode = fs.readFileSync(bundlePath, "utf-8");

    // 2. Create restricted sandbox
    const { context, fakeModule } = createSandbox();

    // 3. Run bundle code to populate module.exports (5s compilation timeout)
    vm.runInContext(bundleCode, context, {
      filename: "skill-bundle.js",
      timeout: 5000,
    });

    // 4. Extract execute function
    const execute =
      fakeModule.exports.execute ||
      (fakeModule.exports.default && fakeModule.exports.default.execute);

    if (typeof execute !== "function") {
      parentPort.postMessage({
        type: "result",
        success: false,
        error: "Bundle does not export an execute function",
      });
      return;
    }

    // 5. Create SkillContext proxy (IPC-backed)
    const ctx = createSkillContext(executionContext, config);

    // 6. Execute skill — the bundle function runs in sandbox context
    //    but receives ctx from worker scope (IPC bridge)
    const result = await execute(input, ctx);

    // 7. Send result back to main thread
    parentPort.postMessage({
      type: "result",
      success: true,
      data: result,
    });
  } catch (err) {
    parentPort.postMessage({
      type: "result",
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

main().catch(function (err) {
  try {
    parentPort.postMessage({
      type: "result",
      success: false,
      error: "Worker fatal: " + (err && err.message ? err.message : String(err)),
    });
  } catch (_e) {
    // parentPort may be closed, nothing we can do
  }
});
