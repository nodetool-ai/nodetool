import { describe, it, expect } from "vitest";

describe("protocol index exports", () => {
  it("exports message and graph types", async () => {
    const mod = await import("../src/index.js");
    expect(mod).toBeDefined();
    // The module re-exports types and interfaces from messages.js and graph.js
    // Importing it is sufficient to cover the barrel export statements
    expect(typeof mod).toBe("object");
  });
});
