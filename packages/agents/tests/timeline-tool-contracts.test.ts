import { describe, expect, it } from "vitest";
import {
  ANIMATED_PROPERTIES,
  DEFAULT_BEAT_TOLERANCE_MS,
  STAGGER_UNITS
} from "@nodetool-ai/timeline";
import {
  BROWSER_ONLY_TIMELINE_TOOL_NAMES,
  HEADLESS_ONLY_TIMELINE_TOOL_NAMES,
  buildTimelineToolContracts
} from "@nodetool-ai/protocol/api-schemas/timeline-tool-contracts.js";
import { createTimelineToolBridge } from "../src/evals/surfaces/timeline.js";

/**
 * The headless surface and the browser registry
 * (`web/src/lib/tools/builtin/timeline.ts`) register the same tools, and
 * neither package can import the other. Each side asserts against the shared
 * contracts instead: a tool added to one host and not the other fails here or
 * in `web/src/lib/tools/__tests__/timelineToolContracts.test.ts`.
 */
const contracts = buildTimelineToolContracts({
  staggerUnits: STAGGER_UNITS,
  animatedProperties: ANIMATED_PROPERTIES,
  beatToleranceMs: DEFAULT_BEAT_TOLERANCE_MS
});

const registered = createTimelineToolBridge().tools;

describe("headless timeline tools", () => {
  it("registers every shared tool and nothing outside the two lists", () => {
    const expected = [
      ...Object.keys(contracts),
      ...HEADLESS_ONLY_TIMELINE_TOOL_NAMES
    ].sort();
    expect(registered.map((t) => t.name).sort()).toEqual(expected);
  });

  it("registers no tool the browser is meant to own alone", () => {
    for (const name of BROWSER_ONLY_TIMELINE_TOOL_NAMES) {
      expect(registered.map((t) => t.name)).not.toContain(name);
    }
  });

  it("reads each shared tool's description from the contract", () => {
    for (const [name, contract] of Object.entries(contracts)) {
      const tool = registered.find((t) => t.name === name);
      expect(tool?.description, name).toBe(contract.description);
    }
  });

  it("takes the timing keys `set_clip_params` used to strip", async () => {
    const bridge = createTimelineToolBridge({
      tracks: [{ type: "video" }],
      clips: [{ name: "shot", trackIndex: 0, startMs: 0, durationMs: 1000 }]
    });
    const setParams = bridge.tools.find(
      (t) => t.name === "ui_timeline_set_clip_params"
    )!;
    const result = (await setParams.execute({
      target: "shot",
      startMs: 500,
      durationMs: 250
    })) as { clip: { startMs: number; durationMs: number } };
    expect(result.clip.startMs).toBe(500);
    expect(result.clip.durationMs).toBe(250);
  });
});
