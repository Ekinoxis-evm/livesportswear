import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    setupFiles: ["tests/setup.ts"],
    include: ["tests/**/*.spec.ts"],
    coverage: {
      provider: "v8",
      include: ["src/lib/scheduling/**"],
      thresholds: {
        // Coverage gate: the scheduling engine must stay fully covered.
        "src/lib/scheduling/**": {
          lines: 100,
          functions: 100,
          statements: 100,
        },
      },
    },
  },
});
