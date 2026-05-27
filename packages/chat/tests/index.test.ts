import { describe, it, expect } from "vitest";

describe("chat index exports", () => {
  // The first cold import of `../src/index.js` transitively loads
  // `@nodetool-ai/agents/memory`, which pulls in vectorstore + provider
  // modules. On CI runners that cold transform is regularly ~10–15 s,
  // well past Vitest's 5 s default. This test is just a smoke check on
  // the public surface, so bump the timeout rather than slim down the
  // module graph for one test.
  it("exports all public API", { timeout: 60_000 }, async () => {
    const mod = await import("../src/index.js");
    expect(mod).toBeDefined();

    expect(mod.countTextTokens).toBeDefined();
    expect(mod.countMessageTokens).toBeDefined();
    expect(mod.countMessagesTokens).toBeDefined();
    expect(mod.runTool).toBeDefined();
    expect(mod.processChat).toBeDefined();
  });
});
