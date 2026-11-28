import { describe, expect, it } from "vitest";
import { timelineTrack as protocolTimelineTrack } from "@nodetool-ai/protocol/api-schemas/timeline.js";

import {
  automationModeOf,
  automationModePlays,
  automationParamColorRole,
  thinAutomationSamples,
  writeAutomationPass,
  makeTrack
} from "../src/index.js";

const s = (...pairs: [number, number][]) => pairs.map(([timeMs, value]) => ({ timeMs, value }));

describe("automation mode", () => {
  it("defaults to read", () => {
    expect(automationModeOf({})).toBe("read");
    expect(automationModeOf({ automationMode: "latch" })).toBe("latch");
  });
  it("plays in every mode except off", () => {
    expect(automationModePlays("off")).toBe(false);
    for (const m of ["read", "touch", "latch", "write"] as const) {
      expect(automationModePlays(m)).toBe(true);
    }
  });
  it("survives the protocol schema parse", () => {
    const track = { ...makeTrack({ type: "audio", name: "A", index: 0 }), automationMode: "touch" as const };
    const parsed = protocolTimelineTrack.parse(track);
    expect(parsed.automationMode).toBe("touch");
    expect(protocolTimelineTrack.safeParse({ ...track, automationMode: "bogus" }).success).toBe(false);
  });
});

describe("thinAutomationSamples", () => {
  it("drops collinear samples", () => {
    expect(thinAutomationSamples(s([0, 0], [100, 1], [200, 2], [300, 3], [400, 0]), 0.01)).toEqual(
      s([0, 0], [300, 3], [400, 0])
    );
  });
  it("returns fewer than three samples unchanged", () => {
    expect(thinAutomationSamples(s([0, 5], [100, 5]), 0.01)).toEqual(s([0, 5], [100, 5]));
  });
});

describe("writeAutomationPass", () => {
  it("writes into an empty lane and returns to the base value", () => {
    expect(
      writeAutomationPass(
        [],
        { startMs: 1000, endMs: 2000, samples: s([1000, 0], [1500, -6], [2000, -6]) },
        0,
        200,
        0.01
      )
    ).toEqual(s([1000, 0], [1500, -6], [2000, -6], [2200, 0]));
  });
  it("returns to the old curve", () => {
    expect(
      writeAutomationPass(
        s([0, -3], [4000, -3]),
        { startMs: 1000, endMs: 2000, samples: s([1000, -3], [2000, -10]) },
        0,
        200,
        0.01
      )
    ).toEqual(s([0, -3], [1000, -3], [2000, -10], [2200, -3], [4000, -3]));
  });
  it("replaces old points inside the pass and takes the return value from the old curve", () => {
    expect(
      writeAutomationPass(
        s([0, 0], [1100, -20], [1500, -20], [5000, 0]),
        { startMs: 1000, endMs: 1200, samples: s([1000, -2], [1200, -4]) },
        0,
        200,
        0.01
      )
    ).toEqual(s([0, 0], [1000, -2], [1200, -4], [1400, -20], [1500, -20], [5000, 0]));
  });
});

describe("automationParamColorRole", () => {
  it("maps volume and pan and rotates the rest", () => {
    expect(automationParamColorRole(0, { kind: "mixer", param: "volumeDb" })).toBe("warning");
    expect(automationParamColorRole(1, { kind: "mixer", param: "pan" })).toBe("success");
    const d = { kind: "device", deviceId: "x", param: "p" } as const;
    expect([2, 3, 4, 5, 6].map((i) => automationParamColorRole(i, d))).toEqual([
      "primary", "error", "info", "secondary", "primary"
    ]);
    expect(automationParamColorRole(0, d)).toBe("info");
  });
});
