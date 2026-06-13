import { describe, expect, it } from "@jest/globals";
import { nodeTypeDisplayName } from "../nodeTypes";

describe("nodeTypeDisplayName", () => {
  it("extracts the last segment and inserts spaces before capitals", () => {
    expect(nodeTypeDisplayName("nodetool.image.ResizeImage")).toBe(
      "Resize Image"
    );
  });

  it("handles single-segment input", () => {
    expect(nodeTypeDisplayName("Preview")).toBe("Preview");
  });

  it("handles multiple consecutive capitals correctly", () => {
    expect(nodeTypeDisplayName("nodetool.image.HSLAdjust")).toBe("HSLAdjust");
  });

  it("splits digit-to-uppercase boundaries", () => {
    expect(nodeTypeDisplayName("nodetool.Sam3Image")).toBe("Sam3 Image");
  });

  it("returns the input unchanged if no dots and no camelCase", () => {
    expect(nodeTypeDisplayName("simple")).toBe("simple");
  });

  it("handles empty string", () => {
    expect(nodeTypeDisplayName("")).toBe("");
  });

  it("handles trailing dot", () => {
    expect(nodeTypeDisplayName("foo.")).toBe("");
  });
});
