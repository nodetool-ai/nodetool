/**
 * @jest-environment jsdom
 */
import { renderHook } from "@testing-library/react";
import { createMediaEditRequest, makeClip } from "@nodetool-ai/timeline";
import type { MidiInstrument, TimelineClip } from "@nodetool-ai/timeline";

import {
  createTimelineStore,
  timelineTemporalOf,
  type TimelineStoreApi
} from "../../../stores/timeline/TimelineStore";
import {
  createTimelineUIStore,
  type TimelineUIStoreApi
} from "../../../stores/timeline/TimelineUIStore";
import {
  createTimelinePlaybackStore,
  type TimelinePlaybackStoreApi
} from "../../../stores/timeline/TimelinePlaybackStore";
import { getTimelineAgentHandler } from "../../../components/timeline/timelineAgentBridge";
import { useTimelineAgentBridge } from "../useTimelineAgentBridge";
import { useLastModelStore } from "../../../stores/lastModelStore";

/** The waveform of a voice, when the voice is the built-in synth. */
const waveformOf = (instrument: MidiInstrument | undefined) =>
  instrument?.type === "subtractive" ? instrument.waveform : undefined;

let mockDoc: TimelineStoreApi;
let mockUi: TimelineUIStoreApi;
let mockPlayback: TimelinePlaybackStoreApi;
const mockStartEdit = jest.fn();

// The hook reads its three stores off the surrounding editor's contexts; a test
// hands it standalone instances instead of mounting a whole TimelineEditor.
jest.mock("../../../stores/timeline/TimelineStore", () => ({
  ...jest.requireActual("../../../stores/timeline/TimelineStore"),
  useTimelineStoreApi: () => mockDoc
}));
jest.mock("../../../stores/timeline/TimelineUIStore", () => ({
  ...jest.requireActual("../../../stores/timeline/TimelineUIStore"),
  useTimelineUIStoreApi: () => mockUi
}));
jest.mock("../../../stores/timeline/TimelinePlaybackStore", () => ({
  ...jest.requireActual("../../../stores/timeline/TimelinePlaybackStore"),
  useTimelinePlaybackStoreApi: () => mockPlayback
}));
jest.mock("../useTimelineDirectGenJob", () => ({
  ...jest.requireActual("../useTimelineDirectGenJob"),
  useTimelineDirectGenJob: () => ({ start: jest.fn(), startEdit: mockStartEdit })
}));

const { landMediaEdit } = jest.requireActual<
  typeof import("../useTimelineDirectGenJob")
>("../useTimelineDirectGenJob");

const SEQ_ID = "seq-1";

const clipById = (id: string): TimelineClip => {
  const clip = mockDoc.getState().clips.find((c) => c.id === id);
  if (!clip) throw new Error(`no clip ${id}`);
  return clip;
};

/** A group holding two clips, plus a loose clip on the same track. */
const seedGroup = (): void => {
  mockDoc.getState().addTrack("video", "Video 1");
  const trackId = mockDoc.getState().tracks[0].id;
  mockDoc.getState().addClip(
    makeClip({
      id: "group-1",
      name: "Group 1",
      trackId,
      mediaType: "group",
      sourceType: "imported",
      startMs: 1000,
      durationMs: 2000
    })
  );
  for (const [index, id] of ["child-a", "child-b"].entries()) {
    mockDoc.getState().addClip(
      makeClip({
        id,
        name: id,
        trackId,
        mediaType: "video",
        sourceType: "imported",
        startMs: 1000 + index * 500,
        durationMs: 500,
        parentId: "group-1"
      })
    );
  }
};

beforeEach(() => {
  mockDoc = createTimelineStore();
  mockUi = createTimelineUIStore();
  mockPlayback = createTimelinePlaybackStore();
  mockStartEdit.mockReset();
  useLastModelStore.setState({ byKind: {}, byTask: {} });
});

describe("useTimelineAgentBridge AI edit", () => {
  it("keeps a trimmed source active until explicit apply, then undoes once", async () => {
    mockDoc.getState().addTrack("video", "Video 1");
    const trackId = mockDoc.getState().tracks[0].id;
    const original = makeClip({
      id: "clip-edit",
      name: "Station",
      trackId,
      mediaType: "video",
      sourceType: "imported",
      startMs: 1200,
      durationMs: 4000,
      currentAssetId: "asset-original",
      activeTakeId: "take-original",
      inPointMs: 40000,
      outPointMs: 44000,
      versions: [
        {
          id: "take-original",
          createdAt: "2026-01-01T00:00:00.000Z",
          jobId: "original-job",
          assetId: "asset-original",
          workflowUpdatedAt: "2026-01-01T00:00:00.000Z",
          dependencyHash: "",
          paramOverridesSnapshot: {},
          durationMs: 4000,
          status: "success"
        }
      ]
    });
    mockDoc.getState().addClip(original);
    mockStartEdit.mockResolvedValue("generation-edit");
    renderHook(() => useTimelineAgentBridge(SEQ_ID));
    const handler = getTimelineAgentHandler(SEQ_ID);

    const submitted = await handler.generativelyEditClip({
      clipId: original.id,
      instruction: "Make this station deserted at night",
      provider: "fal",
      model: "video-edit-model"
    });

    expect(mockStartEdit).toHaveBeenCalledWith({
      clipId: original.id,
      instruction: "Make this station deserted at night",
      provider: "fal",
      model: "video-edit-model"
    });
    expect(submitted).toMatchObject({
      generationId: "generation-edit",
      activeTakeId: "take-original",
      candidate: { id: "generation-edit", status: "pending" }
    });
    expect(clipById(original.id).currentAssetId).toBe("asset-original");

    // The production landing path rejects a stale destination. This store is
    // assembled directly for the bridge test, so give it the same sequence id
    // the mounted editor registered under before settling the request.
    mockDoc.setState({ sequenceId: SEQ_ID });

    // Settle through the production edit landing path. Directly patching a
    // take here would let this selfcheck pass without exercising candidate
    // creation, destination validation, or its inactive state.
    landMediaEdit(
      mockDoc,
      original.id,
      "generation-edit",
      SEQ_ID,
      createMediaEditRequest({
        sourceContext: {
          sequenceId: SEQ_ID,
          clipId: original.id,
          sourceAssetId: "asset-original",
          sourceStartMs: 40000,
          sourceEndMs: 44000,
          timelineStartMs: 1200,
          timelineDurationMs: 4000,
          speedMultiplier: 1
        },
        instruction: "Make this station deserted at night",
        provider: "fal",
        model: "video-edit-model"
      }),
      { assetIds: ["asset-edited"], errored: false }
    );
    timelineTemporalOf(mockDoc).clear();

    const inactiveCandidate = clipById(original.id).versions?.find(
      (take) => take.id === "generation-edit"
    );
    expect(inactiveCandidate).toMatchObject({
      assetId: "asset-edited",
      status: "success",
      mediaEdit: {
        requestId: "generation-edit",
        sourceContext: { sourceStartMs: 40000, sourceEndMs: 44000 }
      }
    });
    expect(clipById(original.id).activeTakeId).toBe("take-original");

    handler.applyTake(original.id, "generation-edit");
    expect(clipById(original.id)).toMatchObject({
      currentAssetId: "asset-edited",
      activeTakeId: "generation-edit",
      inPointMs: 0,
      outPointMs: 4000
    });
    expect(timelineTemporalOf(mockDoc).pastStates).toHaveLength(1);

    timelineTemporalOf(mockDoc).undo();
    expect(clipById(original.id)).toEqual({
      ...original,
      versions: expect.any(Array)
    });
    expect(clipById(original.id).currentAssetId).toBe("asset-original");
    expect(clipById(original.id).inPointMs).toBe(40000);
    expect(clipById(original.id).outPointMs).toBe(44000);
  });

  it("uses the remembered video-to-video pair instead of a clip's text-to-video model", async () => {
    mockDoc.getState().addTrack("video", "Video 1");
    const trackId = mockDoc.getState().tracks[0].id;
    const clip = makeClip({
      id: "clip-text-to-video",
      name: "Generated station",
      trackId,
      mediaType: "video",
      sourceType: "generated",
      bindingKind: "text-to-video",
      startMs: 0,
      durationMs: 4000,
      currentAssetId: "asset-text-to-video",
      provider: "fal",
      model: "text-to-video-only"
    });
    mockDoc.getState().addClip(clip);
    useLastModelStore.getState().remember("video", {
      provider: "fal",
      model: "text-to-video-only"
    });
    useLastModelStore.getState().rememberForTask("video", "video_to_video", {
      provider: "fal",
      model: "video-edit-model"
    });
    mockStartEdit.mockResolvedValue("generation-edit");
    renderHook(() => useTimelineAgentBridge(SEQ_ID));

    await getTimelineAgentHandler(SEQ_ID).generativelyEditClip({
      clipId: clip.id,
      instruction: "Make it nighttime"
    });

    expect(mockStartEdit).toHaveBeenCalledWith({
      clipId: clip.id,
      instruction: "Make it nighttime",
      provider: "fal",
      model: "video-edit-model"
    });
  });
});

describe("useTimelineAgentBridge group-aware edits", () => {
  it("moves a group's children with it", () => {
    seedGroup();
    renderHook(() => useTimelineAgentBridge(SEQ_ID));

    getTimelineAgentHandler(SEQ_ID).moveClip("group-1", { startMs: 3000 });

    // The group moved by +2000ms, so everything it holds did too. Writing
    // startMs straight onto the group left the children behind.
    expect(clipById("group-1").startMs).toBe(3000);
    expect(clipById("child-a").startMs).toBe(3000);
    expect(clipById("child-b").startMs).toBe(3500);
  });

  it("trims a group's children inside the shorter window", () => {
    seedGroup();
    renderHook(() => useTimelineAgentBridge(SEQ_ID));

    getTimelineAgentHandler(SEQ_ID).trimClip("group-1", { durationMs: 1200 });

    expect(clipById("group-1").durationMs).toBe(1200);
    // child-b ran 1500–2000; the group now ends at 2200, so it stays inside.
    const childB = clipById("child-b");
    expect(childB.startMs + childB.durationMs).toBeLessThanOrEqual(
      clipById("group-1").startMs + clipById("group-1").durationMs
    );
  });

  it("moves a lone clip to an absolute start", () => {
    mockDoc.getState().addTrack("video", "Video 1");
    const trackId = mockDoc.getState().tracks[0].id;
    mockDoc.getState().addClip(
      makeClip({
        id: "solo",
        name: "Solo",
        trackId,
        mediaType: "video",
        sourceType: "imported",
        startMs: 200,
        durationMs: 800
      })
    );
    renderHook(() => useTimelineAgentBridge(SEQ_ID));

    const node = getTimelineAgentHandler(SEQ_ID).moveClip("solo", {
      startMs: 4000
    });

    expect(node.startMs).toBe(4000);
    expect(clipById("solo").durationMs).toBe(800);
  });
});

describe("useTimelineAgentBridge setTimeRemap", () => {
  const seedClip = (): void => {
    mockDoc.getState().addTrack("video", "Video 1");
    const trackId = mockDoc.getState().tracks[0].id;
    mockDoc.getState().addClip(
      makeClip({
        id: "clip-1",
        name: "Clip 1",
        trackId,
        mediaType: "video",
        sourceType: "imported",
        startMs: 0,
        durationMs: 2000
      })
    );
  };

  it("stores a curve and clears it with null", () => {
    seedClip();
    renderHook(() => useTimelineAgentBridge(SEQ_ID));
    const handler = getTimelineAgentHandler(SEQ_ID);

    handler.setTimeRemap("clip-1", {
      keyframes: [
        { t: 0, sourceMs: 0 },
        { t: 0.5, sourceMs: 200, easing: "easeInOut" },
        { t: 1, sourceMs: 2000 }
      ]
    });
    expect(clipById("clip-1").timeRemap?.keyframes).toHaveLength(3);

    handler.setTimeRemap("clip-1", null);
    expect(clipById("clip-1").timeRemap).toBeUndefined();
  });

  it("refuses a curve that does not span the clip", () => {
    seedClip();
    renderHook(() => useTimelineAgentBridge(SEQ_ID));

    expect(() =>
      getTimelineAgentHandler(SEQ_ID).setTimeRemap("clip-1", {
        keyframes: [
          { t: 0.3, sourceMs: 0 },
          { t: 1, sourceMs: 2000 }
        ]
      })
    ).toThrow(/must span the clip/);
    expect(clipById("clip-1").timeRemap).toBeUndefined();
  });
});

// The frame extractor and the asset lookup are the two things a frame grab
// touches outside the store; both are stubbed so the test is about which
// times the bridge asks for.
jest.mock("../../../components/timeline/Tracks/clipThumbnails", () => ({
  extractVideoFrames: jest.fn(
    async (_url: string, timesSec: number[], width: number) =>
      timesSec.map((time) => ({
        time,
        width,
        height: width,
        dataUrl: "data:image/jpeg;base64,"
      }))
  )
}));
jest.mock("../../../stores/AssetStore", () => {
  const getState = () => ({
    get: async () => ({ id: "asset-1", get_url: "https://example.test/a.mp4" }),
    createAsset: jest.fn()
  });
  // The bridge reads the store both ways: `getState()` for a one-off lookup,
  // and as a selector hook from `useModel3DBake`.
  const useAssetStore = <T,>(selector?: (s: unknown) => T): unknown =>
    selector ? selector(getState()) : getState();
  useAssetStore.getState = getState;
  return { useAssetStore };
});

describe("useTimelineAgentBridge getClipFrames", () => {
  /** A clip whose media starts a long way into the cut, as an assembly lays it. */
  const seedLateClip = (): void => {
    mockDoc.getState().addTrack("video", "Shots");
    const trackId = mockDoc.getState().tracks[0].id;
    mockDoc.getState().addClip(
      makeClip({
        id: "shot-4",
        name: "Shot 4",
        trackId,
        mediaType: "video",
        sourceType: "imported",
        status: "generated",
        currentAssetId: "asset-1",
        startMs: 15552,
        durationMs: 5184
      })
    );
  };

  it("reads clip-relative times on a clip that does not start at zero", async () => {
    seedLateClip();
    renderHook(() => useTimelineAgentBridge(SEQ_ID));

    // "200ms into this clip" is what a caller inspecting one clip means. It
    // used to be refused outright: `Frame time 200ms is outside clip "Shot 4"`.
    const result = await getTimelineAgentHandler(SEQ_ID).getClipFrames(
      "shot-4",
      { timesMs: [200, 1800] }
    );
    expect(result.frames.map((f) => f.timelineTimeMs)).toEqual([15752, 17352]);
    expect(result.frames.map((f) => f.sourceTimeMs)).toEqual([200, 1800]);
  });

  it("still reads a timeline time inside the clip as a timeline time", async () => {
    seedLateClip();
    renderHook(() => useTimelineAgentBridge(SEQ_ID));

    const result = await getTimelineAgentHandler(SEQ_ID).getClipFrames(
      "shot-4",
      { timesMs: [15752, 20400] }
    );
    expect(result.frames.map((f) => f.timelineTimeMs)).toEqual([15752, 20400]);
    expect(result.frames.map((f) => f.sourceTimeMs)).toEqual([200, 4848]);
  });

  it("names both accepted ranges when a time fits neither", async () => {
    seedLateClip();
    renderHook(() => useTimelineAgentBridge(SEQ_ID));

    await expect(
      getTimelineAgentHandler(SEQ_ID).getClipFrames("shot-4", {
        timesMs: [90000]
      })
    ).rejects.toThrow(/15552–20736ms.*0–5184ms/s);
  });
});

describe("useTimelineAgentBridge midi", () => {
  /** One midi track with one two-note clip, addressed by name. */
  const seedMidi = (): string => {
    mockDoc.getState().addTrack("midi", "Bass");
    const trackId = mockDoc.getState().tracks[0].id;
    renderHook(() => useTimelineAgentBridge(SEQ_ID));
    return getTimelineAgentHandler(SEQ_ID).addMidiClip({
      trackId,
      startMs: 1000,
      durationMs: 2000,
      name: "Riff",
      notes: [
        { pitch: 60, startTick: 0, durationTick: 480 },
        { pitch: 64, startTick: 480, durationTick: 480 }
      ]
    }).id;
  };

  it("places a midi clip and reports its note count", () => {
    const clipId = seedMidi();
    const clip = getTimelineAgentHandler(SEQ_ID)
      .getSnapshot()
      .clips.find((c) => c.id === clipId);
    expect(clip?.mediaType).toBe("midi");
    expect(clip?.noteCount).toBe(2);
  });

  it("creates a midi track when the caller names none", () => {
    renderHook(() => useTimelineAgentBridge(SEQ_ID));
    const clip = getTimelineAgentHandler(SEQ_ID).addMidiClip({
      durationMs: 2000,
      notes: [{ pitch: 60, startTick: 0, durationTick: 480 }]
    });
    const track = mockDoc.getState().tracks.find((t) => t.id === clip.trackId);
    expect(track?.type).toBe("midi");
    // Placed after the (empty) track's content, which is the top.
    expect(clip.startMs).toBe(0);
  });

  it("refuses a midi clip on a track that is not midi", () => {
    mockDoc.getState().addTrack("video", "Video 1");
    renderHook(() => useTimelineAgentBridge(SEQ_ID));
    expect(() =>
      getTimelineAgentHandler(SEQ_ID).addMidiClip({
        trackId: "Video 1",
        startMs: 0,
        durationMs: 1000
      })
    ).toThrow(/midi track/i);
  });

  it("reports the resolved tempo even when the document stores none", () => {
    seedMidi();
    expect(getTimelineAgentHandler(SEQ_ID).getSnapshot().tempo).toEqual({
      bpm: 120,
      offsetMs: 0,
      timeSignature: { beatsPerBar: 4, beatUnit: 4 }
    });
  });

  it("replaces a clip's whole note list", () => {
    const clipId = seedMidi();
    const node = getTimelineAgentHandler(SEQ_ID).setNotes(clipId, [
      { pitch: 55, startTick: 0, durationTick: 960 }
    ]);
    expect(node.noteCount).toBe(1);
    expect(clipById(clipId).notes?.[0].pitch).toBe(55);
  });

  it("refuses a note the document cannot store", () => {
    const clipId = seedMidi();
    expect(() =>
      getTimelineAgentHandler(SEQ_ID).setNotes(clipId, [
        { pitch: 200, startTick: 0, durationTick: 480 }
      ])
    ).toThrow(/pitch/);
    expect(clipById(clipId).notes).toHaveLength(2);
  });

  it("rescales the midi clips on a tempo change and answers with the document", () => {
    const clipId = seedMidi();
    const snapshot = getTimelineAgentHandler(SEQ_ID).setTempo({
      bpm: 60,
      offsetMs: 0,
      timeSignature: { beatsPerBar: 4, beatUnit: 4 }
    });
    expect(snapshot.tempo.bpm).toBe(60);
    const clip = snapshot.clips.find((c) => c.id === clipId)!;
    expect(clip.startMs).toBe(2000);
    expect(clip.durationMs).toBe(4000);
  });

  it("sets a midi track's instrument and reports it in the snapshot", () => {
    seedMidi();
    const track = getTimelineAgentHandler(SEQ_ID).setTrackInstrument("Bass", {
      type: "subtractive",
      waveform: "square",
      attackMs: 1,
      decayMs: 50,
      sustain: 0.5,
      releaseMs: 100,
      cutoffHz: 2000,
      resonance: 1,
      gainDb: -3
    });
    expect(waveformOf(track.instrument)).toBe("square");
    expect(
      waveformOf(
        getTimelineAgentHandler(SEQ_ID).getSnapshot().tracks[0].instrument
      )
    ).toBe("square");
  });

  it("names the preset a track's voice matches, and drops it once edited", () => {
    seedMidi();
    const handler = getTimelineAgentHandler(SEQ_ID);
    expect(handler.getSnapshot().tracks[0].presetId).toBe("wt1-prime-lead");

    handler.setTrackInstrument("Bass", {
      type: "subtractive",
      waveform: "saw",
      attackMs: 5,
      decayMs: 120,
      sustain: 0.7,
      releaseMs: 150,
      cutoffHz: 1234,
      resonance: 0.7,
      gainDb: -6
    });
    expect(handler.getSnapshot().tracks[0].presetId).toBeUndefined();
  });

  it("transposes, quantizes and scales a clip's notes", () => {
    const clipId = seedMidi();
    const handler = getTimelineAgentHandler(SEQ_ID);
    const notes = () =>
      mockDoc.getState().clips.find((c) => c.id === clipId)!.notes!;

    handler.transposeClip("Riff", -12);
    expect(notes().map((n) => n.pitch)).toEqual([48, 52]);

    handler.setNotes("Riff", [
      { pitch: 48, startTick: 20, durationTick: 200 }
    ]);
    handler.quantizeClip("Riff", { division: "1/8" });
    expect(notes()[0].startTick).toBe(0);

    handler.scaleClipVelocity("Riff", 0.5);
    expect(notes()[0].velocity).toBe(50);
  });

  it("refuses a note edit on a clip that carries no notes", () => {
    seedMidi();
    mockDoc.getState().addTrack("video", "V1");
    const videoTrackId = mockDoc.getState().tracks[1].id;
    mockDoc.getState().addClip(
      makeClip({
        id: "shot-1",
        trackId: videoTrackId,
        name: "Shot",
        mediaType: "video",
        sourceType: "imported",
        startMs: 0,
        durationMs: 1000
      })
    );
    expect(() =>
      getTimelineAgentHandler(SEQ_ID).transposeClip("shot-1", 1)
    ).toThrow(/only a midi clip/i);
  });

  it("refuses an instrument on a track that is not midi", () => {
    mockDoc.getState().addTrack("audio", "VO");
    renderHook(() => useTimelineAgentBridge(SEQ_ID));
    expect(() =>
      getTimelineAgentHandler(SEQ_ID).setTrackInstrument("VO", {
        type: "subtractive",
        waveform: "sine",
        attackMs: 1,
        decayMs: 50,
        sustain: 0.5,
        releaseMs: 100,
        cutoffHz: 2000,
        resonance: 1,
        gainDb: -3
      })
    ).toThrow(/midi track/i);
  });
});
