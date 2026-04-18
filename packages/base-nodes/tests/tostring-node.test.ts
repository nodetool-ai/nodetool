import { describe, expect, it } from "vitest";
import { ToStringNode } from "../src/nodes/text-extra.js";

describe("ToStringNode generic conversion", () => {
  it("returns empty string for undefined in repr mode", async () => {
    const node = new ToStringNode();
    node.assign({ value: undefined, mode: "repr" });
    const result = await node.process();
    expect(result.output).toBe("");
  });

  it("handles circular objects without throwing and returns a string", async () => {
    const node = new ToStringNode();
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    node.assign({ value: circular, mode: "str" });
    const result = await node.process();
    expect(typeof result.output).toBe("string");
    expect(result.output).toBe("[object Object]");
  });
});
