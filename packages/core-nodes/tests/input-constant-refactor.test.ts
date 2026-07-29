import { describe, it, expect } from "vitest";
import {
  FloatInputNode,
  IntegerInputNode,
  ImageInputNode,
  MessageDeconstructorNode
} from "../src/nodes/input.js";
import {
  CONSTANT_NODES,
  ConstantBaseNode,
  ConstantDateNode,
  ConstantDateTimeNode,
  ConstantImageNode
} from "../src/nodes/constant.js";

describe("FloatInputNode / IntegerInputNode clamping", () => {
  it("clamps float value into [min, max]", async () => {
    const node = new FloatInputNode();
    node.assign({ value: 150, min: 0, max: 100 });
    await expect(node.process()).resolves.toEqual({ output: 100 });
    node.assign({ value: -5, min: 0, max: 100 });
    await expect(node.process()).resolves.toEqual({ output: 0 });
    node.assign({ value: 2.5, min: 0, max: 100 });
    await expect(node.process()).resolves.toEqual({ output: 2.5 });
  });

  it("clamps and truncates integer value", async () => {
    const node = new IntegerInputNode();
    node.assign({ value: 7.9, min: 0, max: 5 });
    await expect(node.process()).resolves.toEqual({ output: 5 });
    node.assign({ value: 3.9, min: 0, max: 10 });
    await expect(node.process()).resolves.toEqual({ output: 3 });
    node.assign({ value: -2.9, min: 0, max: 10 });
    await expect(node.process()).resolves.toEqual({ output: 0 });
  });
});

describe("MessageDeconstructorNode", () => {
  it("prefers image_url over image for image_url blocks", async () => {
    const node = new MessageDeconstructorNode();
    node.assign({
      value: {
        type: "message",
        role: "user",
        content: [{ type: "image_url", image_url: "http://x/a.png" }]
      }
    });
    const out = await node.process();
    expect(out.image).toBe("http://x/a.png");
  });

  it("returns empty strings for absent id/thread_id/role", async () => {
    const node = new MessageDeconstructorNode();
    node.assign({ value: { type: "message", content: "hi" } });
    const out = await node.process();
    expect(out.id).toBe("");
    expect(out.thread_id).toBe("");
    expect(out.role).toBe("");
    expect(out.text).toBe("hi");
    expect(out.image).toBeNull();
    expect(out.audio).toBeNull();
    expect(out.model).toBeNull();
  });
});

describe("ConstantDate / ConstantDateTime fallbacks", () => {
  it("date fallbacks match prop defaults when values are null", async () => {
    const node = new ConstantDateNode();
    node.assign({ year: null, month: null, day: null });
    await expect(node.process()).resolves.toEqual({
      output: { year: 1900, month: 1, day: 1 }
    });
  });

  it("datetime fallbacks match prop defaults when values are null", async () => {
    const node = new ConstantDateTimeNode();
    node.assign({
      year: null,
      month: null,
      day: null,
      hour: null,
      minute: null,
      second: null,
      millisecond: null,
      tzinfo: null,
      utc_offset: null
    });
    const out = (await node.process()).output as Record<string, unknown>;
    expect(out.year).toBe(1900);
    expect(out.month).toBe(1);
    expect(out.day).toBe(1);
    expect(out.tzinfo).toBe("UTC");
  });
});

describe("Constant registration", () => {
  it("does not ship ConstantBaseNode to the palette", () => {
    expect(CONSTANT_NODES).not.toContain(ConstantBaseNode);
    expect(
      CONSTANT_NODES.some((c) => c.nodeType === "nodetool.constant.Constant")
    ).toBe(false);
  });
});

describe("Shared ref defaults produce isolated instances", () => {
  it("mutating one node's default value does not affect another", () => {
    const a = new ImageInputNode();
    const b = new ConstantImageNode();
    (a.value as { uri: string }).uri = "mutated";
    expect((b.value as { uri: string }).uri).toBe("");
  });
});
