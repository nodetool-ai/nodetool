import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { makeClip, makeTrack } from "@nodetool-ai/timeline";
import { createTimelineStore } from "../../stores/timeline/TimelineStore";
import {
  applyTimelineExtension,
  attachTimelineExtension,
  prepareTimelineExtension
} from "../timelineExtension";

jest.mock("../websocket/GlobalWebSocketManager", () => ({
  globalWebSocketManager: {}
}));
jest.mock("../websocket/generationWatch", () => ({
  watchGeneration: jest.fn()
}));
jest.mock("../websocket/lookupGenerations", () => ({
  lookupGenerations: jest.fn()
}));

function setup(direction: "start" | "end" = "end") {
  const timeline = createTimelineStore();
  const track = makeTrack({ type: "video", name: "Video" });
  const clip = makeClip({
    id: "hero",
    trackId: track.id,
    mediaType: "video",
    sourceType: "imported",
    currentAssetId: "source",
    startMs: 5000,
    durationMs: 4000,
    inPointMs: 40000,
    outPointMs: 44000,
    status: "generated"
  });
  timeline.setState({ sequenceId: "sequence", tracks: [track], clips: [clip] });
  const request = prepareTimelineExtension(timeline, {
    clipId: clip.id,
    direction,
    addedSourceDurationMs: 2000,
    prompt: "Continue the pan",
    model: {
      id: "extend-model",
      provider: "fal_ai",
      supportedTasks: ["extend_video"]
    }
  });
  return { timeline, clip, request, track };
}

describe("timeline extension attachment and undo", () => {
  beforeEach(() => localStorage.clear());

  it("ripples authored voiceover with the cut instead of reflowing it to zero", async () => {
    const { timeline, request } = setup();
    const audioTrack = makeTrack({ type: "audio", name: "Voiceover" });
    const voiceover = makeClip({
      id: "voiceover",
      trackId: audioTrack.id,
      mediaType: "audio",
      sourceType: "generated",
      bindingKind: "text-to-audio",
      startMs: 9000,
      durationMs: 1000,
      currentAssetId: "voice",
      status: "generated"
    });
    timeline.setState({
      tracks: [...timeline.getState().tracks, audioTrack],
      clips: [...timeline.getState().clips, voiceover]
    });
    await attachTimelineExtension(
      timeline,
      request,
      "candidate",
      async () => 6000
    );
    applyTimelineExtension(timeline, request, "ripple");
    expect(
      timeline.getState().clips.find((clip) => clip.id === "voiceover")
    ).toEqual({ ...voiceover, startMs: 11000 });
    expect(timeline.getState().durationMs).toBe(12000);
  });

  it.each(["keep-cut", "available-space", "ripple"] as const)(
    "applies %s as one undoable operation",
    async (timing) => {
      const { timeline, request } = setup();
      await attachTimelineExtension(
        timeline,
        request,
        "candidate",
        async () => 6000
      );
      const before = timeline.getState().clips;
      expect(before[0].currentAssetId).toBe("source");
      timeline.temporal.getState().clear();
      applyTimelineExtension(timeline, request, timing);
      const after = timeline.getState().clips;
      expect(after[0]).toMatchObject({
        currentAssetId: "candidate",
        inPointMs: 0,
        durationMs: timing === "keep-cut" ? 4000 : 6000
      });
      expect(timeline.temporal.getState().pastStates).toHaveLength(1);
      timeline.temporal.getState().undo();
      expect(timeline.getState().clips).toEqual(before);
      timeline.temporal.getState().redo();
      expect(timeline.getState().clips).toEqual(after);
    }
  );

  it("maps a start extension's original window to the added-source offset", async () => {
    const { timeline, request } = setup("start");
    await attachTimelineExtension(
      timeline,
      request,
      "candidate",
      async () => 6000
    );
    applyTimelineExtension(timeline, request, "keep-cut");
    expect(timeline.getState().clips[0]).toMatchObject({
      inPointMs: 2000,
      outPointMs: 6000,
      startMs: 5000,
      durationMs: 4000
    });
  });

  it("deduplicates recovered results and refuses a different destination", async () => {
    const { timeline, request } = setup();
    const measure = async (): Promise<number> => 6000;
    await attachTimelineExtension(timeline, request, "candidate", measure);
    await attachTimelineExtension(timeline, request, "candidate", measure);
    expect(
      timeline
        .getState()
        .clips[0].versions?.filter((take) => take.id === request.requestId)
    ).toHaveLength(1);
    timeline.setState({ sequenceId: "other" });
    const before = timeline.getState().clips;
    await expect(
      attachTimelineExtension(timeline, request, "candidate", measure)
    ).rejects.toThrow(/original timeline/);
    expect(timeline.getState().clips).toBe(before);
  });

  it("refuses collisions and a short continuation without changing the cut", async () => {
    const { timeline, request, track } = setup();
    await expect(
      attachTimelineExtension(timeline, request, "short", async () => 2000)
    ).rejects.toThrow(/source window/);
    await attachTimelineExtension(
      timeline,
      request,
      "candidate",
      async () => 6000
    );
    timeline.getState().addClips([
      makeClip({
        trackId: track.id,
        startMs: 9000,
        durationMs: 1000,
        mediaType: "video",
        sourceType: "imported",
        currentAssetId: "next"
      })
    ]);
    const before = timeline.getState().clips;
    expect(() =>
      applyTimelineExtension(timeline, request, "available-space")
    ).toThrow(/colli|overlap|space/i);
    expect(timeline.getState().clips).toBe(before);
  });
});
