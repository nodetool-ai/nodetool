import { describe, it, expect } from "vitest";
import { BaseNode } from "../src/base-node.js";
import {
  defaultForPropType,
  propertyOf,
  unsetZeroBelowMin
} from "../src/manifest-node-values.js";

describe("defaultForPropType", () => {
  it("starts scalar types at their type-empty value", () => {
    expect(defaultForPropType("bool")).toBe(false);
    expect(defaultForPropType("int")).toBe(0);
    expect(defaultForPropType("float")).toBe(0);
    expect(defaultForPropType("str")).toBe("");
    expect(defaultForPropType("enum")).toBe("");
  });

  it("returns an empty AssetRef for image and audio", () => {
    for (const type of ["image", "audio"]) {
      expect(defaultForPropType(type)).toEqual({
        type,
        uri: "",
        asset_id: null,
        data: null,
        metadata: null
      });
    }
  });

  it("carries duration and format on video only", () => {
    expect(defaultForPropType("video")).toEqual({
      type: "video",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null,
      duration: null,
      format: null
    });
  });

  it("matches every list element type by prefix", () => {
    // The provider manifests name hundreds of element types (list[Image],
    // list[LoraWeight], list[list[TrackPoint]]); all of them start empty.
    for (const type of [
      "list[image]",
      "list[video]",
      "list[audio]",
      "list[str]",
      "list[Image]",
      "list[LoraWeight]",
      "list[dict[str, any]]"
    ]) {
      expect(defaultForPropType(type)).toEqual([]);
    }
  });

  it("starts a dict property at null, not at an empty string", () => {
    expect(defaultForPropType("dict[str, any]")).toBeNull();
    expect(defaultForPropType("dict[str, int]")).toBeNull();
  });

  it("falls back to an empty string for an unrecognized type", () => {
    expect(defaultForPropType("something_new")).toBe("");
  });
});

describe("propertyOf", () => {
  it("reads a declared property by the name the manifest gave it", () => {
    class ManifestNode extends BaseNode {
      prompt = "a red fox";
      steps = 20;
      async process(): Promise<Record<string, unknown>> {
        return {};
      }
    }
    const node = new ManifestNode();
    expect(propertyOf(node, "prompt")).toBe("a red fox");
    expect(propertyOf(node, "steps")).toBe(20);
  });

  it("returns undefined for a name the node does not declare", () => {
    class EmptyNode extends BaseNode {
      async process(): Promise<Record<string, unknown>> {
        return {};
      }
    }
    expect(propertyOf(new EmptyNode(), "missing")).toBeUndefined();
  });
});

describe("unsetZeroBelowMin", () => {
  it("unsets a zero that a positive minimum forbids", () => {
    expect(unsetZeroBelowMin(0, 256, 0)).toBeNull();
    expect(unsetZeroBelowMin(0, 0.01, 0)).toBeNull();
  });

  it("keeps a zero that the minimum allows or that has no minimum", () => {
    expect(unsetZeroBelowMin(0, 0, 0)).toBe(0);
    expect(unsetZeroBelowMin(0, -1, 0)).toBe(0);
    expect(unsetZeroBelowMin(0, undefined, 0)).toBe(0);
    expect(unsetZeroBelowMin(0, 256, 512)).toBe(0);
  });

  it("keeps every non-zero value, in range or not", () => {
    expect(unsetZeroBelowMin(512, 256, 0)).toBe(512);
    expect(unsetZeroBelowMin(100, 256, 0)).toBe(100);
    expect(unsetZeroBelowMin(false, 1, 0)).toBe(false);
    expect(unsetZeroBelowMin("0", 1, 0)).toBe("0");
  });
});
