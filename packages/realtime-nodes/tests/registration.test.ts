import { describe, expect, it } from "vitest";
import { NodeRegistry } from "@nodetool/node-sdk";
import {
  Parameter,
  REALTIME_NODES,
  registerRealtimeNodes,
  VideoPassthrough,
  VideoSink
} from "../src/index.js";

describe("realtime node registration", () => {
  it("registers MVP realtime nodes only", () => {
    const registry = new NodeRegistry();
    const expectedNodeTypes = [
      "nodetool.realtime.VideoSink",
      "nodetool.realtime.VideoPassthrough",
      "nodetool.realtime.Parameter"
    ];

    registerRealtimeNodes(registry);

    expect(REALTIME_NODES).toEqual([VideoSink, VideoPassthrough, Parameter]);
    expect(registry.list()).toEqual(expectedNodeTypes);
    for (const nodeType of expectedNodeTypes) {
      expect(registry.has(nodeType)).toBe(true);
    }
  });
});
