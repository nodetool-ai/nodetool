/**
 * @jest-environment node
 */
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
 * (`packages/agents/src/evals/surfaces/timeline.ts`) register the same tools,
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

const clip = (overrides: Partial<TimelineClipNode> = {}): TimelineClipNode => ({
  id: "clip-1",
  name: "Clip 1",
  trackId: "track-1",
  trackName: "Video 1",
  mediaType: "video",
  sourceType: "imported",
  startMs: 0,
  durationMs: 4000,
  endMs: 4000,
  status: "generated",
  hasRender: true,
  hidden: false,
  muted: false,
  locked: false,
  ...overrides
});

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
    const handler = {
      trimClip: jest.fn(() => clip({ durationMs: 250 })),
      moveClip: jest.fn(() => clip({ startMs: 500, durationMs: 250 })),
      setClipParams: jest.fn()
    } as unknown as TimelineAgentHandler;
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

    expect(handler.trimClip).toHaveBeenCalledWith("Clip 1", {
      durationMs: 250,
      inPointMs: undefined,
      outPointMs: undefined
    });
    expect(handler.moveClip).toHaveBeenCalledWith("Clip 1", {
      startMs: 500,
      trackId: undefined
    });
    // Nothing left for the params op once timing is applied.
    expect(handler.setClipParams).not.toHaveBeenCalled();
    expect(result.clip.startMs).toBe(500);
  });

  it("refuses a key `set_clip_params` does not read, naming the op that does", async () => {
    setTimelineAgentHandler(SEQ_ID, {
      setClipParams: jest.fn()
    } as unknown as TimelineAgentHandler);

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
