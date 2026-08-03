import { describe, it, expect } from "vitest";
import {
  RESOURCE_KINDS,
  formatResourceUri,
  isResourceUri,
  parseResourceUri
} from "../src/resource-uri.js";
import type { ResourceUri } from "../src/resource-uri.js";

describe("parseResourceUri / formatResourceUri", () => {
  it("round-trips every kind", () => {
    for (const kind of RESOURCE_KINDS) {
      const ref: ResourceUri = { kind, id: `id_${kind}` };
      const uri = formatResourceUri(ref);
      expect(uri).toBe(`nodetool://${kind}/id_${kind}`);
      expect(parseResourceUri(uri)).toEqual(ref);
    }
  });

  it("round-trips sub-target fragments", () => {
    const cases: ResourceUri[] = [
      {
        kind: "storyboard",
        id: "sb_01hxyz",
        subTarget: { key: "shot", value: "s3" }
      },
      {
        kind: "timeline",
        id: "tl_01hqrs",
        subTarget: { key: "clip", value: "cl_9" }
      },
      { kind: "timeline", id: "tl_1", subTarget: { key: "t", value: "12.5" } },
      { kind: "sketch", id: "sk_1", subTarget: { key: "layer", value: "l2" } },
      { kind: "script", id: "sc_1", subTarget: { key: "scene", value: "4" } },
      { kind: "workflow", id: "wf_1", subTarget: { key: "node", value: "n1" } },
      { kind: "app", id: "ap_1", subTarget: { key: "component", value: "c1" } }
    ];
    for (const ref of cases) {
      expect(parseResourceUri(formatResourceUri(ref))).toEqual(ref);
    }
  });

  it("parses a fragment written by hand", () => {
    expect(parseResourceUri("nodetool://timeline/tl_01hqrs#clip=cl_9")).toEqual({
      kind: "timeline",
      id: "tl_01hqrs",
      subTarget: { key: "clip", value: "cl_9" }
    });
  });

  it("treats asset:// as shorthand for nodetool://asset/", () => {
    expect(parseResourceUri("asset://as_01hab2")).toEqual({
      kind: "asset",
      id: "as_01hab2"
    });
    expect(parseResourceUri("asset://as_1#region=top")).toEqual({
      kind: "asset",
      id: "as_1",
      subTarget: { key: "region", value: "top" }
    });
  });

  it("formats asset refs in canonical form", () => {
    expect(formatResourceUri({ kind: "asset", id: "as_1" })).toBe(
      "nodetool://asset/as_1"
    );
  });

  it("ignores surrounding whitespace", () => {
    expect(parseResourceUri("  nodetool://app/ap_1  ")).toEqual({
      kind: "app",
      id: "ap_1"
    });
  });

  it("returns null for malformed input", () => {
    const malformed = [
      "",
      "   ",
      "not a uri",
      "https://example.com/asset/as_1",
      "nodetool:/asset/as_1",
      "nodetool://unknown/x_1",
      "nodetool://chat/th_1",
      "nodetool://asset/",
      "nodetool:///as_1",
      "nodetool://asset",
      "nodetool://asset/a/b",
      "asset://",
      "asset://as_1#",
      "asset://as_1#shot",
      "nodetool://storyboard/sb_1#=s3",
      "nodetool://storyboard/sb_1#shot=",
      "nodetool://storyboard/sb_1#shot=a=b"
    ];
    for (const uri of malformed) {
      expect(parseResourceUri(uri), uri).toBeNull();
    }
  });
});

describe("isResourceUri", () => {
  it("accepts valid uris and rejects everything else", () => {
    expect(isResourceUri("nodetool://sketch/sk_1")).toBe(true);
    expect(isResourceUri("asset://as_1")).toBe(true);
    expect(isResourceUri("nodetool://chat/th_1")).toBe(false);
    expect(isResourceUri("")).toBe(false);
  });
});
