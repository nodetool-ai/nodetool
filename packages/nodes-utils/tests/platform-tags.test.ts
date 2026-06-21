import { describe, it, expect } from "vitest";
import type { NodeClass } from "@nodetool-ai/node-sdk";
import {
  tagAsBrowserGpu,
  tagAsServer,
  tagAsHybrid,
  tagAsNode
} from "../src/platform-tags.js";

// Minimal node-class shape the taggers operate on (static `nodeType` + the
// mutable `platforms` / `requiresGpu` they stamp).
interface Taggable {
  nodeType: string;
  platforms?: readonly string[];
  requiresGpu?: boolean;
}

function makeNodeClass(nodeType: string): Taggable {
  return class {
    static nodeType = nodeType;
  } as unknown as Taggable;
}

/** The taggers want the full NodeClass[]; our fakes only carry what they touch. */
const asClasses = (classes: Taggable[]): NodeClass[] =>
  classes as unknown as NodeClass[];

describe("tagAsBrowserGpu", () => {
  it("tags classes as node + browser and marks them requiresGpu", () => {
    const A = makeNodeClass("a");
    tagAsBrowserGpu(asClasses([A]));
    expect(A.platforms).toEqual(["node", "browser"]);
    expect(A.requiresGpu).toBe(true);
  });

  it("does not mark a class already tagged server", () => {
    const Server = makeNodeClass("server");
    tagAsServer(asClasses([Server]));
    // Re-tagging via tagAsBrowserGpu must not flip platforms or mark GPU: a
    // server node can't run in the browser, so the GPU flag is irrelevant.
    tagAsBrowserGpu(asClasses([Server]));
    expect(Server.platforms).not.toContain("browser");
    expect(Server.requiresGpu).toBeUndefined();
  });

  it("leaves an explicit per-class requiresGpu override intact", () => {
    const Override = makeNodeClass("override");
    Object.defineProperty(Override, "requiresGpu", {
      value: false,
      configurable: true
    });
    tagAsBrowserGpu(asClasses([Override]));
    expect(Override.requiresGpu).toBe(false);
  });

  it("does not retroactively change tagAsHybrid (no requiresGpu)", () => {
    const Hybrid = makeNodeClass("hybrid");
    tagAsHybrid(asClasses([Hybrid]));
    expect(Hybrid.platforms).toEqual(["node", "browser"]);
    expect(Hybrid.requiresGpu).toBeUndefined();
  });
});

describe("tagAsNode", () => {
  it("stamps ['node'] only on classes with no prior platforms", () => {
    const A = makeNodeClass("a");
    const B = makeNodeClass("b");
    const returned = tagAsNode(asClasses([A, B]));

    expect(A.platforms).toEqual(["node"]);
    expect(B.platforms).toEqual(["node"]);
    // Must NOT advertise the V8-isolate or browser tiers — these nodes shell
    // out to a subprocess and/or write temp files, which only Node can do.
    expect(A.platforms).not.toContain("workers");
    expect(A.platforms).not.toContain("edge");
    expect(A.platforms).not.toContain("browser");
    // The same array is returned so it can be spread straight into a registry.
    expect(returned).toHaveLength(2);
  });

  it("leaves a class that already declares static platforms untouched", () => {
    // A per-class override always wins over the list-level tagger (tagWith
    // skips any class whose `platforms` is already defined).
    const Server = makeNodeClass("server");
    tagAsServer(asClasses([Server]));
    expect(Server.platforms).toEqual(["node", "workers", "edge"]);

    tagAsNode(asClasses([Server]));
    // tagAsNode must not clobber the existing server tag.
    expect(Server.platforms).toEqual(["node", "workers", "edge"]);
  });
});
