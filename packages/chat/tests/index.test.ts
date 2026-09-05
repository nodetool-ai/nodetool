import { describe, it, expect } from "vitest";

describe("chat index exports", () => {
  // The first cold import of `../src/index.js` pulls in a large module
  // graph. On CI runners that cold transform is regularly ~10–15 s, well
  // past Vitest's 5 s default. This test is just a smoke check on the
  // public surface, so bump the timeout rather than slim it down.
  //
  // Raised from 60 s after it timed out on the `test-packages-core` leg. That
  // is the runner being slow, not the graph growing: measured on one machine
  // against a worktree of `main` with the same node_modules, the cold import
  // is 9.37 s / 8.02 s on `main` and 8.18 s / 8.66 s on the branch that hit
  // the timeout — overlapping, no systematic difference. Slimming the import
  // would change what the check covers, and the cost is not the regression.
  it("exports all public API", { timeout: 180_000 }, async () => {
    const mod = await import("../src/index.js");
    expect(mod).toBeDefined();

    expect(mod.runTool).toBeDefined();
    expect(mod.processChat).toBeDefined();
  });
});
