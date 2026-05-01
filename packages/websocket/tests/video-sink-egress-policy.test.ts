import { afterEach, describe, expect, it } from "vitest";
import { applyVideoSinkEgressCap } from "../src/realtime/video-sink-egress-policy.js";

const FULL = "NODETOOL_REALTIME_FULL_MULTI_SINK_EGRESS";
const MAX = "NODETOOL_REALTIME_MAX_VIDEO_SINK_EGRESS";

describe("applyVideoSinkEgressCap", () => {
  const sinks = [
    { nodeId: "a", handle: "frame" },
    { nodeId: "b", handle: "frame" },
    { nodeId: "c", handle: "frame" }
  ];

  afterEach(() => {
    delete process.env[FULL];
    delete process.env[MAX];
  });

  it("returns sinks unchanged when there is at most one sink", () => {
    expect(applyVideoSinkEgressCap([])).toEqual([]);
    expect(applyVideoSinkEgressCap([sinks[0]!])).toEqual([sinks[0]!]);
  });

  it("defaults to one sink when multiple exist", () => {
    expect(applyVideoSinkEgressCap(sinks)).toEqual([sinks[0]!]);
  });

  it("respects NODETOOL_REALTIME_MAX_VIDEO_SINK_EGRESS", () => {
    process.env[MAX] = "2";
    expect(applyVideoSinkEgressCap(sinks)).toEqual([sinks[0]!, sinks[1]!]);
  });

  it("allows all sinks when NODETOOL_REALTIME_FULL_MULTI_SINK_EGRESS=1", () => {
    process.env[FULL] = "1";
    expect(applyVideoSinkEgressCap(sinks)).toEqual(sinks);
  });
});
