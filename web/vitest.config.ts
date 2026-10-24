import viteTsConfigPaths from "vite-tsconfig-paths"
// vitest.config.ts — unit test config (jsdom env + setup file).
import { defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [
    viteTsConfigPaths({
      projects: ["./tsconfig.json"],
    }),
  ],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globals: false,
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["node_modules", "dist", ".tanstack", "e2e/**"],
  },
})
