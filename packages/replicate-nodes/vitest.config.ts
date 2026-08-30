import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@nodetool-ai/node-sdk/cost-estimate": resolve(
        __dirname,
        "../node-sdk/src/cost-estimate.ts"
      ),
      "@nodetool-ai/node-sdk/pricing-params": resolve(
        __dirname,
        "../node-sdk/src/pricing-params.ts"
      ),
      "@nodetool-ai/node-sdk/code-body": resolve(
        __dirname,
        "../node-sdk/src/code-body.ts"
      ),
      "@nodetool-ai/node-sdk": resolve(__dirname, "../node-sdk/src/index.ts")
    }
  },
  test: {
    include: ["tests/**/*.test.ts"]
  }
});
