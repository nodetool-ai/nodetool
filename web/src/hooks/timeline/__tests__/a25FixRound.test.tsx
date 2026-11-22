/**
 * @jest-environment jsdom
 */
/**
 * Fix-round regressions for A25 in web (F2, F3, F7, F8, F10).
 */
import { renderHook } from "@testing-library/react";
import { makeClip, makeTrack } from "@nodetool-ai/timeline";
import {
  FrontendToolRegistry,
  type FrontendToolState
} from "../../../lib/tools/frontendTools";
import "../../../lib/tools/builtin/timeline";
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
import {
  getTimelineAgentHandler,
  setTimelineAgentHandler
} from "../../../components/timeline/timelineAgentBridge";
import { useTimelineAgentBridge } from "../useTimelineAgentBridge";
import {
  mergeTimelineDocuments,
  timelineUnitsTouchedByOp,
  type TimelineMergeDoc
} from "../../../stores/timeline/merge";

let mockDoc: TimelineStoreApi;
let mockUi: TimelineUIStoreApi;
let mockPlayback: TimelinePlaybackStoreApi;

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
  useTimelineDirectGenJob: () => ({ start: jest.fn(), startEdit: jest.fn() })
}));

const SEQ_ID = "seq-a25";
const toolCtx = { getState: () => ({}) as FrontendToolState };

function mountBridge() {
  mockDoc = createTimelineStore();
  mockUi = createTimelineUIStore();
  mockPlayback = createTimelinePlaybackStore();
  mockDoc.setState({
    sequenceId: SEQ_ID,
    fps: 30,
    width: 1920,
    height: 1080,
    durationMs: 4000,
    tracks: [
      makeTrack({
        id: "t-midi",
        type: "midi",
        name: "Keys",
        index: 0,
        volumeDb: -3,
        effects: [{ id: "fx1", type: "gain", enabled: true, gainDb: 0 }],
        automation: [
          {
            id: "lane1",
            target: { kind: "mixer", param: "volumeDb" },
            points: [{ timeMs: 0, value: -3 }]
          }
        ]
      })
    ],
    clips: [
      makeClip({
        id: "c-midi",
        trackId: "t-midi",
        name: "Riff",
        startMs: 0,
        durationMs: 4000,
        mediaType: "midi",
        notes: [
          { id: "n1", pitch: 60, velocity: 80, startTick: 30, durationTick: 480 },
          { id: "n2", pitch: 64, velocity: 100, startTick: 500, durationTick: 480 }
        ]
      })
    ],
    markers: [],
    mediaTracks: [],
    tempo: {
      bpm: 120,
      offsetMs: 0,
      timeSignature: { beatsPerBar: 4, beatUnit: 4 }
    },
    music: { autoCrossfadeMs: 10 }
  });
  timelineTemporalOf(mockDoc).clear();
  return renderHook(() => useTimelineAgentBridge(SEQ_ID));
}

afterEach(() => {
  setTimelineAgentHandler(SEQ_ID, null);
});

describe("F2: web get_state reports key, signature, music, autoCrossfadeMs, and controllerLaneCount", () => {
  it("returns key, signature, music and autoCrossfadeMs without detail selectors", async () => {
    const view = mountBridge();
    await FrontendToolRegistry.call(
      "ui_timeline_set_tempo",
      {
        timeline_id: SEQ_ID,
        bpm: 120,
        key: { tonic: "D", mode: "minor" },
        auto_crossfade_ms: 30
      },
      "t1",
      toolCtx
    );

    const state = (await FrontendToolRegistry.call(
      "ui_timeline_get_state",
      { timeline_id: SEQ_ID },
      "t2",
      toolCtx
    )) as Record<string, unknown>;
    expect(state.key).toBe("D minor");
    expect(state.signature).toBe("4/4");
    expect(state.autoCrossfadeMs).toBe(30);
    expect(state.music).toEqual({ autoCrossfadeMs: 30 });
    view.unmount();
  });

  it("returns key, signature, music and autoCrossfadeMs with detail selectors", async () => {
    const view = mountBridge();
    await FrontendToolRegistry.call(
      "ui_timeline_set_tempo",
      {
        timeline_id: SEQ_ID,
        bpm: 120,
        key: { tonic: "D", mode: "minor" },
        auto_crossfade_ms: 30
      },
      "t1",
      toolCtx
    );

    const detailed = (await FrontendToolRegistry.call(
      "ui_timeline_get_state",
      { timeline_id: SEQ_ID, clip: "Riff" },
      "t2",
      toolCtx
    )) as Record<string, unknown>;
    expect(detailed.key).toBe("D minor");
    expect(detailed.signature).toBe("4/4");
    expect(detailed.autoCrossfadeMs).toBe(30);
    expect(detailed.music).toEqual({ autoCrossfadeMs: 30 });
    expect(detailed.clipDetail).toBeDefined();
    view.unmount();
  });

  it("returns controllerLaneCount on clips from get_state", async () => {
    const view = mountBridge();
    await FrontendToolRegistry.call(
      "ui_timeline_set_notes",
      {
        timeline_id: SEQ_ID,
        clip: "Riff",
        controllers: [{ kind: "cc", cc: 1, points: [{ tick: 0, value: 64 }] }]
      },
      "t1",
      toolCtx
    );

    const state = (await FrontendToolRegistry.call(
      "ui_timeline_get_state",
      { timeline_id: SEQ_ID },
      "t2",
      toolCtx
    )) as Record<string, unknown>;
    expect(
      (state.clips as Array<{ controllerLaneCount?: number }>)[0]?.controllerLaneCount
    ).toBe(1);
    view.unmount();
  });
});

describe("F3: web note tools return consistent headless schema regardless of optional A25 params", () => {
  it("ui_timeline_quantize_notes keeps headless schema and clip url with and without swing", async () => {
    const view = mountBridge();
    const qBase = (await FrontendToolRegistry.call(
      "ui_timeline_quantize_notes",
      { timeline_id: SEQ_ID, clip: "Riff", division: "1/16" },
      "q1",
      toolCtx
    )) as Record<string, unknown>;
    const qSwing = (await FrontendToolRegistry.call(
      "ui_timeline_quantize_notes",
      { timeline_id: SEQ_ID, clip: "Riff", division: "1/16", swing: 0 },
      "q2",
      toolCtx
    )) as Record<string, unknown>;
    expect(qBase.noteCount).toBe(2);
    expect(typeof qBase.movedNoteCount).toBe("number");
    expect(qSwing.noteCount).toBe(2);
    expect(typeof qSwing.movedNoteCount).toBe("number");
    expect(Object.keys(qBase).sort()).toEqual(Object.keys(qSwing).sort());
    expect(qBase.url).toContain("clip=c-midi");
    expect(qSwing.url).toContain("clip=c-midi");
    view.unmount();
  });

  it("ui_timeline_transpose_clip keeps headless schema and clip url with and without note_ids", async () => {
    const view = mountBridge();
    const tBase = (await FrontendToolRegistry.call(
      "ui_timeline_transpose_clip",
      { timeline_id: SEQ_ID, clip: "Riff", semitones: 2 },
      "tr1",
      toolCtx
    )) as Record<string, unknown>;
    const tSel = (await FrontendToolRegistry.call(
      "ui_timeline_transpose_clip",
      { timeline_id: SEQ_ID, clip: "Riff", semitones: -2, note_ids: ["n1"] },
      "tr2",
      toolCtx
    )) as Record<string, unknown>;
    expect(tBase.noteCount).toBe(2);
    expect(tSel.noteCount).toBe(2);
    expect(Object.keys(tBase).sort()).toEqual(Object.keys(tSel).sort());
    expect(tBase.url).toContain("clip=c-midi");
    expect(tSel.url).toContain("clip=c-midi");
    view.unmount();
  });

  it("ui_timeline_scale_velocity keeps headless schema and clip url with and without note_ids", async () => {
    const view = mountBridge();
    const vBase = (await FrontendToolRegistry.call(
      "ui_timeline_scale_velocity",
      { timeline_id: SEQ_ID, clip: "Riff", factor: 1.1 },
      "v1",
      toolCtx
    )) as Record<string, unknown>;
    const vSel = (await FrontendToolRegistry.call(
      "ui_timeline_scale_velocity",
      { timeline_id: SEQ_ID, clip: "Riff", factor: 0.9, note_ids: ["n1"] },
      "v2",
      toolCtx
    )) as Record<string, unknown>;
    expect(vBase.noteCount).toBe(2);
    expect(vSel.noteCount).toBe(2);
    expect(Object.keys(vBase).sort()).toEqual(Object.keys(vSel).sort());
    expect(vBase.url).toContain("clip=c-midi");
    expect(vSel.url).toContain("clip=c-midi");
    view.unmount();
  });

  it("ui_timeline_set_notes keeps headless schema and clip url for notes and function calls", async () => {
    const view = mountBridge();
    const sNotes = (await FrontendToolRegistry.call(
      "ui_timeline_set_notes",
      {
        timeline_id: SEQ_ID,
        clip: "Riff",
        notes: [{ id: "n1", pitch: 60, start_tick: 0, duration_tick: 480 }]
      },
      "sn1",
      toolCtx
    )) as Record<string, unknown>;
    const sFunc = (await FrontendToolRegistry.call(
      "ui_timeline_set_notes",
      { timeline_id: SEQ_ID, clip: "Riff", function: "mute" },
      "sn2",
      toolCtx
    )) as Record<string, unknown>;
    expect(sNotes.url).toContain("clip=c-midi");
    expect(sFunc.url).toContain("clip=c-midi");
    expect(Object.keys(sNotes.clip as Record<string, unknown>).sort()).toEqual(
      Object.keys(sFunc.clip as Record<string, unknown>).sort()
    );
    expect((sNotes.clip as Record<string, unknown>).startBarsBeats).toBeDefined();
    expect(sFunc.function).toBe("mute");
    expect(sFunc.selectedNoteCount).toBe(1);
    view.unmount();
  });
});

describe("F7: TimelineStore.setTempo and handler.setTempo handle key changes", () => {
  it("TimelineStore.setTempo updates key when timing is unchanged", () => {
    const store = createTimelineStore();
    store.setState({
      tempo: {
        bpm: 120,
        offsetMs: 0,
        timeSignature: { beatsPerBar: 4, beatUnit: 4 },
        key: { tonic: "C", mode: "major" }
      }
    });
    store.getState().setTempo({
      bpm: 120,
      offsetMs: 0,
      timeSignature: { beatsPerBar: 4, beatUnit: 4 },
      key: { tonic: "A", mode: "minor" }
    });
    expect(store.getState().tempo?.key).toEqual({ tonic: "A", mode: "minor" });
  });

  it("TimelineStore.setTempo clears key when timing is unchanged", () => {
    const store = createTimelineStore();
    store.setState({
      tempo: {
        bpm: 120,
        offsetMs: 0,
        timeSignature: { beatsPerBar: 4, beatUnit: 4 },
        key: { tonic: "A", mode: "minor" }
      }
    });
    store.getState().setTempo({
      bpm: 120,
      offsetMs: 0,
      timeSignature: { beatsPerBar: 4, beatUnit: 4 }
    });
    expect(store.getState().tempo?.key).toBeUndefined();
  });

  it("handler.setTempo forwards key to set_tempo", async () => {
    const view = mountBridge();
    const snap = await getTimelineAgentHandler(SEQ_ID).setTempo({
      bpm: 120,
      offsetMs: 0,
      timeSignature: { beatsPerBar: 4, beatUnit: 4 },
      key: { tonic: "E", mode: "minor" }
    });
    expect(snap.tempo.key).toEqual({ tonic: "E", mode: "minor" });
    expect(mockDoc.getState().tempo?.key).toEqual({ tonic: "E", mode: "minor" });
    view.unmount();
  });
});

describe("F8: music.autoCrossfadeMs is undoable and no-op ops push zero undo entries", () => {
  it("undoes music.autoCrossfadeMs via ui_timeline_undo", async () => {
    const view = mountBridge();
    expect(mockDoc.getState().music?.autoCrossfadeMs).toBe(10);
    await FrontendToolRegistry.call(
      "ui_timeline_set_tempo",
      { timeline_id: SEQ_ID, bpm: 120, auto_crossfade_ms: 50 },
      "u1",
      toolCtx
    );
    expect(mockDoc.getState().music?.autoCrossfadeMs).toBe(50);
    expect(timelineTemporalOf(mockDoc).pastStates).toHaveLength(1);

    await FrontendToolRegistry.call(
      "ui_timeline_undo",
      { timeline_id: SEQ_ID, steps: 1 },
      "u2",
      toolCtx
    );
    expect(mockDoc.getState().music?.autoCrossfadeMs).toBe(10);
    view.unmount();
  });

  it("pushes no phantom undo entry on value-identical set_notes op", async () => {
    const view = mountBridge();
    expect(timelineTemporalOf(mockDoc).pastStates).toHaveLength(0);

    await FrontendToolRegistry.call(
      "ui_timeline_set_notes",
      { timeline_id: SEQ_ID, clip: "Riff", function: "delete_duplicates" },
      "noop1",
      toolCtx
    );
    expect(timelineTemporalOf(mockDoc).pastStates).toHaveLength(0);
    view.unmount();
  });

  it("pushes no phantom undo entry on value-identical set_track op", async () => {
    const view = mountBridge();
    expect(timelineTemporalOf(mockDoc).pastStates).toHaveLength(0);

    await FrontendToolRegistry.call(
      "ui_timeline_set_track",
      { timeline_id: SEQ_ID, track: "Keys", volumeDb: -3 },
      "noop2",
      toolCtx
    );
    expect(timelineTemporalOf(mockDoc).pastStates).toHaveLength(0);
    view.unmount();
  });

  it("pushes no phantom undo entry on value-identical set_tempo op", async () => {
    const view = mountBridge();
    expect(timelineTemporalOf(mockDoc).pastStates).toHaveLength(0);

    await FrontendToolRegistry.call(
      "ui_timeline_set_tempo",
      { timeline_id: SEQ_ID, bpm: 120 },
      "noop3",
      toolCtx
    );
    expect(timelineTemporalOf(mockDoc).pastStates).toHaveLength(0);
    view.unmount();
  });
});

describe("F10: live external merge surfaces master/tempo/music conflicts without over-attributing tracks", () => {
  const docOf = (extra: Partial<TimelineMergeDoc> = {}): TimelineMergeDoc => ({
    tracks: [
      { id: "T1", type: "audio", name: "Bass", index: 0, visible: true, locked: false }
    ],
    trackFolders: [],
    clips: [],
    markers: [],
    mediaTracks: [],
    transcript: [],
    scriptEnabled: false,
    fps: 30,
    width: 1920,
    height: 1080,
    master: { volumeDb: 0 },
    tempo: { bpm: 120, offsetMs: 0, timeSignature: { beatsPerBar: 4, beatUnit: 4 } },
    music: { autoCrossfadeMs: 10 },
    ...extra
  });

  it("attributes master set_track edits to field master only", () => {
    expect(
      timelineUnitsTouchedByOp({
        tool: "ui_timeline_set_track",
        input: { track: "master", volumeDb: -6 }
      })
    ).toEqual([{ kind: "field", unitId: "master" }]);
  });

  it("attributes set_tempo edits to tempo and music fields", () => {
    expect(
      timelineUnitsTouchedByOp({
        tool: "ui_timeline_set_tempo",
        input: { bpm: 96, auto_crossfade_ms: 25 }
      })
    ).toEqual(
      expect.arrayContaining([
        { kind: "field", unitId: "tempo" },
        { kind: "field", unitId: "music" }
      ])
    );
  });

  it("attributes set_track folder edits to track and trackFolder", () => {
    expect(
      timelineUnitsTouchedByOp({
        tool: "ui_timeline_set_track",
        input: { id: "T1", track: "T1", folder: "Drums" }
      })
    ).toEqual(
      expect.arrayContaining([
        { kind: "track", unitId: "T1" },
        { kind: "trackFolder" }
      ])
    );
  });

  it("surfaces contested master field without false track conflicts", () => {
    const base = docOf();
    const draft = docOf({
      tracks: [
        { id: "T1", type: "audio", name: "Bass Local", index: 0, visible: true, locked: false }
      ],
      master: { volumeDb: -2 }
    });
    const server = docOf({
      tracks: [
        { id: "T1", type: "audio", name: "Bass Server", index: 0, visible: true, locked: false }
      ],
      master: { volumeDb: -6 }
    });
    const mergedMaster = mergeTimelineDocuments(base, draft, server, [
      { tool: "ui_timeline_set_track", input: { track: "master", volumeDb: -6 } }
    ]);
    expect(mergedMaster.conflicts.map((c) => c.unit)).toEqual([
      { kind: "field", id: "master", label: "master" }
    ]);
  });

  it("surfaces contested tempo and music fields", () => {
    const base = docOf();
    const mergedTempoMusic = mergeTimelineDocuments(
      base,
      docOf({
        tempo: { bpm: 110, offsetMs: 0, timeSignature: { beatsPerBar: 4, beatUnit: 4 } },
        music: { autoCrossfadeMs: 15 }
      }),
      docOf({
        tempo: { bpm: 90, offsetMs: 0, timeSignature: { beatsPerBar: 4, beatUnit: 4 } },
        music: { autoCrossfadeMs: 30 }
      }),
      [
        {
          tool: "ui_timeline_set_tempo",
          input: { bpm: 90, auto_crossfade_ms: 30 }
        }
      ]
    );
    expect(mergedTempoMusic.conflicts.map((c) => c.unit.id).sort()).toEqual([
      "music",
      "tempo"
    ]);
  });
});
