import { describe, it, expect } from "vitest";
import { getRegisteredProvider } from "@nodetool-ai/runtime";
import { registerTransformersJsProvider } from "../src/index.js";

describe("registerTransformersJsProvider", () => {
  it("registers transformers.js as an in-process provider, not a remote API", () => {
    registerTransformersJsProvider();
    expect(getRegisteredProvider("transformers_js")?.metadata).toEqual({
      access: "in_process",
      displayName: "Transformers.js"
    });
  });
});
