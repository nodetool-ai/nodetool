/**
 * Browser-eligibility guard for the Code node.
 *
 * The in-browser workflow runner routes a sub-graph client-side only when every
 * node type is in a registry built with `createBrowserRegistry`, which keeps a
 * class iff `supportsPlatform(cls.platforms, "browser")`.
 *
 * Contract: `nodetool.code.Code` (CodeNode) runs vanilla JS in a QuickJS
 * WebAssembly sandbox — no Node `vm`, no subprocess — so it is browser-capable
 * and the web runner loads it. This test pins that contract: dropping CodeNode's
 * browser support would silently force it back to the server, and dropping node
 * support would break server runs.
 */
import { describe, it, expect } from "vitest";
import { supportsPlatform, type Platform } from "@nodetool-ai/protocol";
import { CodeNode } from "@nodetool-ai/code-nodes";

type NodeClassLike = {
  nodeType?: string;
  platforms?: readonly Platform[];
};

describe("code-nodes browser eligibility", () => {
  it("CodeNode (nodetool.code.Code) supports the browser platform", () => {
    const cls = CodeNode as unknown as NodeClassLike;
    expect(cls.nodeType).toBe("nodetool.code.Code");
    expect(supportsPlatform(cls.platforms, "browser")).toBe(true);
  });

  it("CodeNode still supports the node platform (server runs unchanged)", () => {
    const cls = CodeNode as unknown as NodeClassLike;
    expect(supportsPlatform(cls.platforms, "node")).toBe(true);
  });
});
