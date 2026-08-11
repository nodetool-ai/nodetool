import { describe, expect, it } from "vitest";
import { GetSecretLibNode } from "../src/index.js";
import type { ProcessingContext } from "@nodetool-ai/runtime";

describe("native lib.secret", () => {
  it("reads secret from context with default fallback", async () => {
    const context = {
      getSecret: async (key: string) =>
        key === "API_KEY" ? "secret-123" : null
    } as unknown as ProcessingContext;

    const node1 = new GetSecretLibNode();
    Object.assign(node1, { name: "API_KEY", default: "x" });
    await expect(node1.process(context)).resolves.toEqual({
      output: "secret-123"
    });

    const node2 = new GetSecretLibNode();
    Object.assign(node2, { name: "MISSING", default: "fallback" });
    await expect(node2.process(context)).resolves.toEqual({
      output: "fallback"
    });
  });
});
