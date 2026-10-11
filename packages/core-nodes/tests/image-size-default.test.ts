/**
 * Image Size nodes declared `default: null` while the editor showed
 * 1024 × 1024, so an untouched node failed pre-flight with
 * `Required property "value" is not set`.
 */

import { describe, it, expect } from "vitest";
import { getNodeMetadata } from "@nodetool-ai/node-sdk";
import { ConstantImageSizeNode } from "../src/nodes/constant.js";
import { ImageSizeInputNode } from "../src/nodes/input.js";

describe.each([
  { NodeClass: ConstantImageSizeNode },
  { NodeClass: ImageSizeInputNode }
])("$NodeClass.nodeType default", ({ NodeClass }) => {
  it("declares 1024 × 1024 as the value default", () => {
    const value = getNodeMetadata(NodeClass).properties.find(
      (p) => p.name === "value"
    );
    expect(value?.default).toEqual({ width: 1024, height: 1024 });
  });

  it("passes required-property validation with its defaults", () => {
    const defaults = new NodeClass().serialize();
    expect(NodeClass.validateProperties(defaults)).toEqual([]);
  });
});

describe("Image Size process()", () => {
  it("ImageSizeInputNode falls back to 1024 × 1024 instead of an empty object", async () => {
    const node = new ImageSizeInputNode();
    node.assign({ value: null });
    await expect(node.process()).resolves.toEqual({
      output: { width: 1024, height: 1024 }
    });
  });

  it("ConstantImageSizeNode emits the default size", async () => {
    const node = new ConstantImageSizeNode();
    await expect(node.process()).resolves.toEqual({
      image_size: { width: 1024, height: 1024 },
      width: 1024,
      height: 1024
    });
  });
});
