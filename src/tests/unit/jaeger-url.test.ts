/**
 * Unit Tests: buildJaegerUrl + captureOtelTraceId（Sprint 15）
 *
 * 覆盖四种组合：OTEL 启用/未启用 × traceId 有/无 × env 有/无。
 */
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { buildJaegerUrl } from "@/lib/infra/telemetry/jaeger-url";

describe("buildJaegerUrl", () => {
  const originalEnv = process.env.JAEGER_UI_URL;

  afterEach(() => {
    process.env.JAEGER_UI_URL = originalEnv;
  });

  test("returns null when traceId is null", () => {
    process.env.JAEGER_UI_URL = "http://localhost:16686";
    expect(buildJaegerUrl(null)).toBeNull();
  });

  test("returns null when traceId is undefined", () => {
    process.env.JAEGER_UI_URL = "http://localhost:16686";
    expect(buildJaegerUrl(undefined)).toBeNull();
  });

  test("returns null when JAEGER_UI_URL is not set", () => {
    delete process.env.JAEGER_UI_URL;
    expect(buildJaegerUrl("abc123")).toBeNull();
  });

  test("returns null when traceId empty string", () => {
    process.env.JAEGER_UI_URL = "http://localhost:16686";
    expect(buildJaegerUrl("")).toBeNull();
  });

  test("builds URL when both env + traceId present", () => {
    process.env.JAEGER_UI_URL = "http://localhost:16686";
    expect(buildJaegerUrl("deadbeefcafe1234")).toBe(
      "http://localhost:16686/trace/deadbeefcafe1234",
    );
  });

  test("strips trailing slash from env", () => {
    process.env.JAEGER_UI_URL = "http://jaeger.internal/";
    expect(buildJaegerUrl("abc123")).toBe("http://jaeger.internal/trace/abc123");
  });

  test("supports custom path prefix in env", () => {
    process.env.JAEGER_UI_URL = "https://obs.example.com/jaeger";
    expect(buildJaegerUrl("abc123")).toBe(
      "https://obs.example.com/jaeger/trace/abc123",
    );
  });
});

describe("captureOtelTraceId", () => {
  const originalOtel = process.env.OTEL_ENABLED;

  afterEach(() => {
    process.env.OTEL_ENABLED = originalOtel;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  beforeEach(() => {
    vi.resetModules();
  });

  test("returns null when OTEL_ENABLED != 'true'", async () => {
    process.env.OTEL_ENABLED = "false";
    const { captureOtelTraceId } = await import("@/lib/infra/telemetry/capture");
    expect(captureOtelTraceId()).toBeNull();
  });

  test("returns null when OTEL_ENABLED undefined", async () => {
    delete process.env.OTEL_ENABLED;
    const { captureOtelTraceId } = await import("@/lib/infra/telemetry/capture");
    expect(captureOtelTraceId()).toBeNull();
  });

  test("returns null when no active span (OTEL enabled)", async () => {
    process.env.OTEL_ENABLED = "true";
    vi.doMock("@opentelemetry/api", () => ({
      trace: {
        getActiveSpan: () => undefined,
      },
    }));
    const { captureOtelTraceId } = await import("@/lib/infra/telemetry/capture");
    expect(captureOtelTraceId()).toBeNull();
  });

  test("returns traceId when active span has valid traceId", async () => {
    process.env.OTEL_ENABLED = "true";
    vi.doMock("@opentelemetry/api", () => ({
      trace: {
        getActiveSpan: () => ({
          spanContext: () => ({ traceId: "deadbeefcafe1234" }),
        }),
      },
    }));
    const { captureOtelTraceId } = await import("@/lib/infra/telemetry/capture");
    expect(captureOtelTraceId()).toBe("deadbeefcafe1234");
  });

  test("returns null when traceId is all-zeros (unsampled span)", async () => {
    process.env.OTEL_ENABLED = "true";
    vi.doMock("@opentelemetry/api", () => ({
      trace: {
        getActiveSpan: () => ({
          spanContext: () => ({ traceId: "00000000000000000000000000000000" }),
        }),
      },
    }));
    const { captureOtelTraceId } = await import("@/lib/infra/telemetry/capture");
    expect(captureOtelTraceId()).toBeNull();
  });
});
