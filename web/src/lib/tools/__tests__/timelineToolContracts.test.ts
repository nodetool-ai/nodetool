/**
 * @jest-environment node
 */
import {
  ANIMATED_PROPERTIES,
  DEFAULT_BEAT_TOLERANCE_MS,
  STAGGER_UNITS,
  makeClip,
  makeTrack
} from "@nodetool-ai/timeline";
import {
  applyTimelineOp,
  type TimelineOp,
  type TimelineOpState
} from "@nodetool-ai/timeline/ops";
import {
  BROWSER_ONLY_TIMELINE_TOOL_NAMES,
  HEADLESS_ONLY_TIMELINE_TOOL_NAMES,
  buildTimelineToolContracts
} from "@nodetool-ai/protocol/api-schemas/timeline-tool-contracts.js";
import { FrontendToolRegistry } from "../frontendTools";
import type { FrontendToolState } from "../frontendTools";
import {
  setTimelineAgentHandler,
  type TimelineAgentHandler,
  type TimelineClipNode
} from "../../../components/timeline/timelineAgentBridge";
import "../builtin/timeline";

/**
 * The browser registry and the headless eval bridge
 * (`packages/agents/src/capabilities/timeline-bridge.ts`) register the same tools,
 * and neither package can import the other. Each side asserts against the
 * shared contracts instead: a tool added to one host and not the other fails
 * here or in `packages/agents/tests/timeline-tool-contracts.test.ts`.
 */
const contracts = buildTimelineToolContracts({
  staggerUnits: STAGGER_UNITS,
  animatedProperties: ANIMATED_PROPERTIES,
  beatToleranceMs: DEFAULT_BEAT_TOLERANCE_MS
});

const timelineToolNames = () =>
  FrontendToolRegistry.getManifest()
    .map((tool) => tool.name)
    .filter((name) => name.startsWith("ui_timeline_"));

const ctx = { getState: () => ({}) as FrontendToolState };
const SEQ_ID = "seq-contracts";

function handlerWithClip(): TimelineAgentHandler {
  let state: TimelineOpState = {
    fps: 30,
    width: 1920,
    height: 1080,
    tracks: [
      makeTrack({ id: "track-1", name: "Video 1", type: "video", index: 0 })
    ],
    clips: [
      makeClip({
        id: "clip-1",
        name: "Clip 1",
        trackId: "track-1",
        mediaType: "video",
        sourceType: "imported",
        startMs: 0,
        durationMs: 4000,
        status: "generated"
      })
    ],
    markers: [],
    playheadMs: 0,
    selectedClipIds: []
  };
  return {
    applyOp: jest.fn(async (op: TimelineOp) => {
      const outcome = await applyTimelineOp(state, op, {
        newId: () => "unused"
      });
      if (outcome.error) {
        throw new Error(outcome.error);
      }
      state = outcome.state;
      return outcome.result;
    })
  } as unknown as TimelineAgentHandler;
}

afterEach(() => {
  setTimelineAgentHandler(SEQ_ID, null);
});

describe("browser timeline tools", () => {
  it("registers every shared tool and nothing outside the two lists", () => {
    const expected = [
      ...Object.keys(contracts),
      ...BROWSER_ONLY_TIMELINE_TOOL_NAMES
    ].sort();
    expect(timelineToolNames().sort()).toEqual(expected);
  });

  it("registers no tool the headless bridge is meant to own alone", () => {
    for (const name of HEADLESS_ONLY_TIMELINE_TOOL_NAMES) {
      expect(timelineToolNames()).not.toContain(name);
    }
  });

  it("reads each shared tool's description from the contract", () => {
    const manifest = FrontendToolRegistry.getManifest();
    for (const [name, contract] of Object.entries(contracts)) {
      const tool = manifest.find((t) => t.name === name);
      expect([name, tool?.description]).toEqual([name, contract.description]);
    }
  });

  it("applies the timing keys `set_clip_params` used to strip", async () => {
    const handler = handlerWithClip();
    setTimelineAgentHandler(SEQ_ID, handler);

    const result = (await FrontendToolRegistry.call(
      "ui_timeline_set_clip_params",
      {
        timeline_id: SEQ_ID,
        target: "Clip 1",
        startMs: 500,
        durationMs: 250
      },
      "contracts-1",
      ctx
    )) as { clip: TimelineClipNode };

    expect(handler.applyOp).toHaveBeenCalledTimes(1);
    expect(handler.applyOp).toHaveBeenCalledWith({
      op: "set_clip_params",
      target: "Clip 1",
      patch: { startMs: 500, durationMs: 250 }
    });
    expect(result.clip.startMs).toBe(500);
    expect(result.clip.durationMs).toBe(250);
  });

  it("refuses a key `set_clip_params` does not read, naming the op that does", async () => {
    setTimelineAgentHandler(SEQ_ID, handlerWithClip());

    await expect(
      FrontendToolRegistry.call(
        "ui_timeline_set_clip_params",
        { timeline_id: SEQ_ID, target: "Clip 1", transition: { type: "wipe" } },
        "contracts-2",
        ctx
      )
    ).rejects.toThrow("use set_transition");
  });
});
