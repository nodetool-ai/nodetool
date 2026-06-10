import { describe, expect, it } from "vitest";
import { ToStringNode } from "@nodetool-ai/text-nodes";

describe("ToStringNode generic conversion", () => {
  it("returns empty string for undefined in repr mode", async () => {
    const node = new ToStringNode();
    node.assign({ mode: "repr" });
    // assign() treats an explicit undefined as absent (keeps the default),
    // so set the field directly to exercise process() on a raw undefined.
    node.value = undefined;
    const result = await node.process();
    expect(result.output).toBe("");
  });

  it("returns 'null' for null in repr mode", async () => {
    const node = new ToStringNode();
    node.assign({ value: null, mode: "repr" });
    const result = await node.process();
    expect(result.output).toBe("null");
  });

  it("handles circular objects without throwing and returns a string", async () => {
    const node = new ToStringNode();
    const circularObject: Record<string, unknown> = {};
    circularObject.self = circularObject;
    node.assign({ value: circularObject, mode: "str" });
    const result = await node.process();
    expect(typeof result.output).toBe("string");
    expect(result.output).toBe("[object Object]");
  });
});
