/**
 * Browser-eligibility guard for the GPU image nodes.
 *
 * The in-browser workflow runner (`web/.../browserWorkflowRunner.ts`) routes a
 * sub-graph client-side only when every node type is in a registry built with
 * `createBrowserRegistry`, which keeps a class iff
 * `supportsPlatform(cls.platforms, "browser")`. These GPU node groups are tagged
 * `tagAsHybrid` (`["node","browser"]`) and run their shader pass on
 * `navigator.gpu`. This test pins that contract: a server-only retag would
 * silently drop them back to the server, and this fails loudly instead.
 */
import { describe, it, expect } from "vitest";
import { supportsPlatform, type Platform } from "@nodetool-ai/protocol";
import {
  LIB_IMAGE_COLOR_GRADING_NODES,
  LIB_IMAGE_COLOR_NODES,
  LIB_IMAGE_EFFECTS_NODES,
  LIB_IMAGE_GENERATORS_NODES,
  LIB_IMAGE_KEYER_NODES,
  LIB_IMAGE_MASK_NODES,
  LIB_IMAGE_WARP_NODES
} from "@nodetool-ai/image-nodes";

type NodeClassLike = {
  nodeType?: string;
  platforms?: readonly Platform[];
};

const GROUPS: Record<string, readonly unknown[]> = {
  "lib.image.color_grading": LIB_IMAGE_COLOR_GRADING_NODES,
  "lib.image.color": LIB_IMAGE_COLOR_NODES,
  "lib.image.effects": LIB_IMAGE_EFFECTS_NODES,
  "lib.image.generators": LIB_IMAGE_GENERATORS_NODES,
  "lib.image.keyer": LIB_IMAGE_KEYER_NODES,
  "lib.image.mask": LIB_IMAGE_MASK_NODES,
  "lib.image.warp": LIB_IMAGE_WARP_NODES
};

describe("GPU image nodes declare browser platform support", () => {
  for (const [group, nodes] of Object.entries(GROUPS)) {
    it(`${group}.* are all browser-capable`, () => {
      expect(nodes.length).toBeGreaterThan(0);
      for (const cls of nodes as NodeClassLike[]) {
        expect(
          supportsPlatform(cls.platforms, "browser"),
          `${cls.nodeType} must support the browser platform`
        ).toBe(true);
      }
    });
  }

  it("includes lib.image.color_grading.Curves as browser-capable", () => {
    const curves = (LIB_IMAGE_COLOR_GRADING_NODES as NodeClassLike[]).find(
      (c) => c.nodeType === "lib.image.color_grading.Curves"
    );
    expect(curves).toBeDefined();
    expect(supportsPlatform(curves?.platforms, "browser")).toBe(true);
  });
});

describe("GPU image nodes render as content cards", () => {
  for (const [group, nodes] of Object.entries(GROUPS)) {
    it(`${group}.* declare body = "content_card"`, () => {
      expect(nodes.length).toBeGreaterThan(0);
      for (const cls of nodes as Array<NodeClassLike & { body?: string }>) {
        expect(cls.body, `${cls.nodeType} should be a content card`).toBe(
          "content_card"
        );
      }
    });
  }
});

describe("image-namespace content-card invariant", () => {
  it("every browser-capable lib.image.*/nodetool.image.* node is a content card", async () => {
    const mod = (await import("@nodetool-ai/image-nodes")) as Record<
      string,
      unknown
    >;
    const seen = new Map<string, NodeClassLike & { body?: string }>();
    const add = (c: unknown) => {
      if (
        typeof c === "function" &&
        typeof (c as NodeClassLike).nodeType === "string"
      ) {
        const cls = c as NodeClassLike & { body?: string };
        seen.set(cls.nodeType as string, cls);
      }
    };
    for (const v of Object.values(mod)) {
      if (Array.isArray(v)) v.forEach(add);
      else add(v);
    }
    const imageNs = [...seen.values()].filter((c) =>
      /^(lib|nodetool)\.image\./.test(c.nodeType ?? "")
    );
    expect(imageNs.length).toBeGreaterThan(20);
    const offenders = imageNs
      .filter((c) => supportsPlatform(c.platforms, "browser"))
      .filter((c) => c.body !== "content_card")
      .map((c) => c.nodeType);
    expect(offenders).toEqual([]);
  });
});
