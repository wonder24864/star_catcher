export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // OTel initialization (must be early, before other imports)
    if (process.env.OTEL_ENABLED === "true") {
      const { initTelemetry } = await import("@/lib/infra/telemetry");
      initTelemetry("star-catcher-app");
    }

    const { ensureBucket } = await import("@/lib/infra/storage");
    const { createLogger } = await import("@/lib/infra/logger");
    const log = createLogger("storage");
    try {
      await ensureBucket();
      log.info("MinIO bucket ready");
    } catch (e) {
      // Non-fatal: MinIO may not be running in dev/test. Log and continue.
      log.warn({ err: e }, "Failed to ensure MinIO bucket");
    }
  }
}
