import { describe, it, expect } from "vitest";

describe("chat index exports", () => {
  it("exports all public API", async () => {
    const mod = await import("../src/index.js");
    expect(mod).toBeDefined();

    expect(mod.countTextTokens).toBeDefined();
    expect(mod.countMessageTokens).toBeDefined();
    expect(mod.countMessagesTokens).toBeDefined();
    expect(mod.runTool).toBeDefined();
    expect(mod.processChat).toBeDefined();
  });
});
