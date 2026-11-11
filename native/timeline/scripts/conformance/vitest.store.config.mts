import { resolve } from "node:path";
import { defineConfig } from "vitest/config";
const here = import.meta.dirname;
export default defineConfig({
  root: resolve(here, "../../../../web"),
  test: { include: (process.env.NT_CONFORMANCE_TESTS ?? "").split(",").filter(Boolean), environment: "jsdom", testTimeout: 120000 }
});
