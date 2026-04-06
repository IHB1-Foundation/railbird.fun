import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  esbuild: {
    // Enable the automatic React JSX transform so components don't need
    // explicit `import React from 'react'` statements in test builds.
    jsx: "automatic",
  },
});
