import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      // "server-only" só funciona no bundler do Next; nos testes vira módulo vazio.
      "server-only": path.resolve(import.meta.dirname, "src/server/__testes__/vazio.ts"),
    },
  },
  test: { include: ["src/**/*.test.ts"] },
});
