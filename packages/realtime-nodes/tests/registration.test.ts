import { describe, expect, it } from "vitest";
import { NodeRegistry } from "@nodetool/node-sdk";
import {
  AudioSink,
  AudioSource,
  Parameter,
  REALTIME_NODES,
  registerRealtimeNodes,
  SessionInfo,
  VideoSink
} from "../src/index.js";

describe("realtime node registration", () => {
  it("exports all first realtime nodes and registers them", () => {
    const registry = new NodeRegistry();
    const expectedNodeTypes = [
      "nodetool.realtime.VideoSink",
      "nodetool.realtime.AudioSource",
      "nodetool.realtime.AudioSink",
      "nodetool.realtime.Parameter",
      "nodetool.realtime.SessionInfo"
    ];

    registerRealtimeNodes(registry);

    expect(REALTIME_NODES).toEqual([
      VideoSink,
      AudioSource,
      AudioSink,
      Parameter,
      SessionInfo
    ]);
    expect(registry.list()).toEqual(expectedNodeTypes);
    for (const nodeType of expectedNodeTypes) {
      expect(registry.has(nodeType)).toBe(true);
    }
  });
});
