import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  "packages/agent/vitest.config.ts",
  "apps/web/vitest.config.ts",
]);
