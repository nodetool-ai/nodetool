import { describe, expect, it } from "vitest";
import { NodeRegistry } from "@nodetool/node-sdk";
import { REALTIME_NODES, registerRealtimeNodes } from "../src/index.js";

describe("realtime node registration", () => {
  it("exports the realtime node collection and registration hook", () => {
    const registry = new NodeRegistry();

    registerRealtimeNodes(registry);

    expect(Array.isArray(REALTIME_NODES)).toBe(true);
    expect(registry.list()).toEqual(REALTIME_NODES.map((node) => node.nodeType));
  });
});
