export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { ensureBucket } = await import("@/lib/storage");
    try {
      await ensureBucket();
    } catch (e) {
      // Non-fatal: MinIO may not be running in dev/test. Log and continue.
      console.warn("[storage] Failed to ensure MinIO bucket:", e);
    }
  }
}
