export async function register() {
  // Validate env once on the Node server at startup; fail fast on misconfig.
  // Skipped on the edge runtime, where server-only secrets aren't present.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("@/lib/env");
  }
}
