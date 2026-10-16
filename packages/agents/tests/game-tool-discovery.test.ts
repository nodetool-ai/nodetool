import { describe, expect, it } from "vitest";
import { gameSpecs } from "../src/capabilities/game.specs.js";
import { availableBuiltinToolNames } from "../src/tools/builtin-tools.js";

describe("game tool discovery", () => {
  it("offers every declared game capability on the built-in chat and MCP belt", () => {
    const names = new Set(availableBuiltinToolNames());
    expect(gameSpecs.length).toBeGreaterThan(0);
    for (const spec of gameSpecs) {
      expect(names.has(spec.name), spec.name).toBe(true);
    }
  });
});
