/**
 * @jest-environment jsdom
 *
 * SQ1 Fix Round Wave 5 — Browser agent bridge defects (F6, F7 browser, F32 web, F37).
 */
import { renderHook } from "@testing-library/react";
import {
  DEFAULT_MIDI_INSTRUMENT,
  DEFAULT_TEMPO,
  STEP_PATTERN_ASSET_CONTENT_TYPE,
  makeClip,
  makeTrack,
  patternFromText
} from "@nodetool-ai/timeline";
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
import { useAssetStore } from "../../../stores/AssetStore";
import { useTimelineAgentBridge } from "../useTimelineAgentBridge";

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
  useTimelineDirectGenJob: () => ({
    start: jest.fn(),
    startEdit: jest.fn()
  })
}));
jest.mock("../useModel3DBake", () => ({
  ...jest.requireActual("../useModel3DBake"),
  useModel3DBake: () => ({ bakeClip: jest.fn() })
}));

const SEQ_ID = "seq-sq1-fix";
const toolCtx = {
  getState: () => ({}) as FrontendToolState,
  abortSignal: new AbortController().signal
};

async function runTool(
  name: string,
  args: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const tool = FrontendToolRegistry.get(name);
  if (!tool) throw new Error(`Tool not registered: ${name}`);
  return (await tool.execute(args as never, toolCtx)) as Record<string, unknown>;
}

describe("SQ1 Fix Round — useTimelineAgentBridge step sequencer (Wave 5)", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    mockDoc = createTimelineStore();
    mockDoc.setState({
      sequenceId: SEQ_ID,
      tempo: DEFAULT_TEMPO,
      tracks: [
        makeTrack({
          id: "t-drums",
          type: "midi",
          name: "Drums",
          index: 0,
          instrument: DEFAULT_MIDI_INSTRUMENT
        })
      ],
      clips: []
    });
    mockUi = createTimelineUIStore();
    mockPlayback = createTimelinePlaybackStore();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("F6 & F37: ui_timeline_get_state reports pattern, patternName, and audibleNoteCount via real bridge", async () => {
    const pat = patternFromText(
      [
        "Kick: x... x... x... x...",
        "Snare: .... x... .... x...",
        "Closed Hat: x.x. x.x. x.x. x.x.",
        "Clap: .... .... .... x..."
      ].join("\n"),
      { name: "Club Groove" }
    );
    mockDoc.getState().addClip(
      makeClip({
        id: "c-pat",
        trackId: "t-drums",
        name: "Club Groove",
        startMs: 0,
        durationMs: 2000,
        mediaType: "midi",
        sourceType: "imported",
        status: "generated",
        pattern: pat
      })
    );

    const { unmount } = renderHook(() => useTimelineAgentBridge(SEQ_ID));
    try {
      const stateRes = await runTool("ui_timeline_get_state", {
        timeline_id: SEQ_ID
      });
      const clips = stateRes.clips as Array<Record<string, unknown>>;
      expect(clips).toHaveLength(1);
      expect(clips[0]!.pattern).toBe("4 rows x 16 @1/16");
      expect(clips[0]!.patternName).toBe("Club Groove");
      expect(clips[0]!.audibleNoteCount).toBe(15);
    } finally {
      unmount();
    }
  });

  it("F7 (browser) & F37: save_step_pattern persists via AssetStore and is found by list_step_patterns and apply_step_pattern", async () => {
    const pat = patternFromText("Kick: x... x... x... x...", {
      name: "My Groove"
    });
    mockDoc.getState().addClip(
      makeClip({
        id: "c-save",
        trackId: "t-drums",
        name: "Beat",
        startMs: 0,
        durationMs: 2000,
        mediaType: "midi",
        sourceType: "imported",
        status: "generated",
        pattern: pat
      })
    );

    // Mock AssetStore persistence layer in memory (persisting across hook mounts).
    const storedAssets: Array<{
      id: string;
      name: string;
      content_type: string;
      get_url: string;
      metadata?: Record<string, unknown>;
    }> = [];
    const storedTextByUrl = new Map<string, string>();
    const createAssetSpy = jest.fn(async (file: File) => {
      const id = `aabbccddeeff0011223344556677880${storedAssets.length + 1}`.slice(
        0,
        32
      );
      const url = `https://assets.test/${id}`;
      const text = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () => reject(reader.error);
        reader.readAsText(file);
      });
      storedTextByUrl.set(url, text);
      const row = {
        id,
        name: file.name,
        content_type: file.type,
        get_url: url,
        metadata: {}
      };
      storedAssets.push(row);
      return row;
    });
    const loadSpy = jest.fn(async () => ({
      assets: storedAssets,
      next: null
    }));
    const updateSpy = jest.fn(
      async (patch: { id: string; metadata?: Record<string, unknown> }) => {
        const row = storedAssets.find((a) => a.id === patch.id);
        if (row && patch.metadata) row.metadata = patch.metadata;
        return row;
      }
    );
    jest.spyOn(useAssetStore, "getState").mockReturnValue({
      ...useAssetStore.getState(),
      createAsset: createAssetSpy as never,
      load: loadSpy as never,
      update: updateSpy as never
    });
    globalThis.fetch = jest.fn(async (url: RequestInfo | URL) => {
      const body = storedTextByUrl.get(String(url));
      return {
        ok: body !== undefined,
        text: async () => body ?? "",
        json: async () => JSON.parse(body ?? "{}")
      } as Response;
    }) as typeof fetch;

    const { unmount } = renderHook(() => useTimelineAgentBridge(SEQ_ID));
    try {
      const undoBefore = timelineTemporalOf(mockDoc).pastStates.length;
      const saveRes = await runTool("ui_timeline_save_step_pattern", {
        timeline_id: SEQ_ID,
        clipId: "c-save",
        name: "My Groove",
        kind: "pattern"
      });
      expect(saveRes.ok).toBe(true);
      expect(saveRes.assetId).toBeTruthy();
      expect(createAssetSpy).toHaveBeenCalledTimes(1);
      expect((createAssetSpy.mock.calls[0]![0] as File).type).toBe(
        STEP_PATTERN_ASSET_CONTENT_TYPE
      );
      // Saving to the user library must not push a timeline undo entry.
      expect(timelineTemporalOf(mockDoc).pastStates.length).toBe(undoBefore);

      const listRes = await runTool("ui_timeline_list_step_patterns", {
        timeline_id: SEQ_ID
      });
      const entries = listRes.entries as Array<{
        id: string;
        name: string;
        source: string;
      }>;
      expect(
        entries.some((e) => e.name === "My Groove" && e.source === "user")
      ).toBe(true);

      const applyRes = await runTool("ui_timeline_apply_step_pattern", {
        timeline_id: SEQ_ID,
        clipId: "c-save",
        pattern: "My Groove"
      });
      expect(applyRes.ok).toBe(true);
      expect(applyRes.appliedPattern).toBe("My Groove");
    } finally {
      unmount();
    }
  });

  it("F32 (browser): ui_timeline_trim_clip with startMs head-trims a pattern clip and updates patternPhaseTicks", async () => {
    const pat = patternFromText("Kick: x... x... x... x...");
    mockDoc.getState().addClip(
      makeClip({
        id: "c-trim",
        trackId: "t-drums",
        name: "Beat",
        startMs: 0,
        durationMs: 2000,
        mediaType: "midi",
        sourceType: "imported",
        status: "generated",
        pattern: pat
      })
    );

    const { unmount } = renderHook(() => useTimelineAgentBridge(SEQ_ID));
    try {
      const res = await runTool("ui_timeline_trim_clip", {
        timeline_id: SEQ_ID,
        target: "c-trim",
        startMs: 500
      });
      expect(res.ok).toBe(true);
      const updated = mockDoc.getState().clips.find((c) => c.id === "c-trim")!;
      expect(updated.startMs).toBe(500);
      expect(updated.durationMs).toBe(1500);
      expect(updated.patternPhaseTicks).toBe(960);
      expect(updated.inPointMs).toBe(0);
    } finally {
      unmount();
    }
  });

  it("F39: save_step_pattern does not retry createAsset when the timeline changes concurrently during upload", async () => {
    const pat = patternFromText("Kick: x... x... x... x...", {
      name: "Original Beat"
    });
    mockDoc.getState().addClip(
      makeClip({
        id: "c-concurrent",
        trackId: "t-drums",
        name: "Beat",
        startMs: 0,
        durationMs: 2000,
        mediaType: "midi",
        sourceType: "imported",
        status: "generated",
        pattern: pat
      })
    );

    let resolveUpload!: (row: {
      id: string;
      name: string;
      content_type: string;
      get_url: string;
      metadata: Record<string, unknown>;
    }) => void;
    let uploadStarted!: () => void;
    const uploadStartedPromise = new Promise<void>((r) => {
      uploadStarted = r;
    });

    let callCount = 0;
    const createAssetSpy = jest.fn((file: File) => {
      callCount += 1;
      if (callCount === 1) {
        uploadStarted();
        return new Promise((resolve) => {
          resolveUpload = resolve as typeof resolveUpload;
        });
      }
      return Promise.resolve({
        id: `11223344556677889900aabbccddeef${callCount}`.slice(0, 32),
        name: file.name,
        content_type: file.type,
        get_url: `https://assets.test/dup-${callCount}`,
        metadata: {}
      });
    });
    const updateSpy = jest.fn(async (patch: { id: string }) => patch);
    jest.spyOn(useAssetStore, "getState").mockReturnValue({
      ...useAssetStore.getState(),
      createAsset: createAssetSpy as never,
      update: updateSpy as never
    });

    const { unmount } = renderHook(() => useTimelineAgentBridge(SEQ_ID));
    try {
      const savePromise = runTool("ui_timeline_save_step_pattern", {
        timeline_id: SEQ_ID,
        clipId: "c-concurrent",
        name: "Concurrent Beat",
        kind: "pattern"
      });
      await uploadStartedPromise;
      // Mutate the timeline document while createAsset is still in flight.
      mockDoc.setState((s) => ({
        ...s,
        clips: s.clips.map((c) =>
          c.id === "c-concurrent" ? { ...c, name: "Edited Mid-Upload" } : c
        )
      }));
      resolveUpload({
        id: "11223344556677889900aabbccddeeff",
        name: "Concurrent-Beat.step-pattern.json",
        content_type: STEP_PATTERN_ASSET_CONTENT_TYPE,
        get_url: "https://assets.test/11223344556677889900aabbccddeeff",
        metadata: {}
      });
      const res = await savePromise;
      expect(res.ok).toBe(true);
      expect(createAssetSpy).toHaveBeenCalledTimes(1);
    } finally {
      unmount();
    }
  });

  it("ui_timeline_set_pattern_row_sort persists rowSort, sorts existing rows, and keeps later added rows sorted", async () => {
    const pat = patternFromText(
      "Snare: .... x... .... x...\nKick: x... x... x... x...",
      { name: "Beat", seed: 1 }
    );
    mockDoc.getState().addClip(
      makeClip({
        id: "c-sort",
        trackId: "t-drums",
        name: "Beat",
        startMs: 0,
        durationMs: 2000,
        mediaType: "midi",
        sourceType: "imported",
        status: "generated",
        pattern: pat
      })
    );

    const { unmount } = renderHook(() => useTimelineAgentBridge(SEQ_ID));
    try {
      const undoBefore = timelineTemporalOf(mockDoc).pastStates.length;
      const setRes = await runTool("ui_timeline_set_pattern_row_sort", {
        timeline_id: SEQ_ID,
        clipId: "c-sort",
        rowSort: "typeAndNoteAsc"
      });
      expect(setRes.ok).toBe(true);
      expect(setRes.rowSort).toBe("typeAndNoteAsc");
      expect(timelineTemporalOf(mockDoc).pastStates.length).toBe(undoBefore + 1);

      const sortedPattern = mockDoc
        .getState()
        .clips.find((c) => c.id === "c-sort")!.pattern!;
      expect(sortedPattern.rowSort).toBe("typeAndNoteAsc");
      expect(sortedPattern.rows.map((r) => r.name)).toEqual(["Kick", "Snare"]);

      await runTool("ui_timeline_add_pattern_rows", {
        timeline_id: SEQ_ID,
        clipId: "c-sort",
        rows: [{ pitch: 37, name: "Rim" }]
      });
      const afterAdd = mockDoc
        .getState()
        .clips.find((c) => c.id === "c-sort")!.pattern!;
      expect(
        afterAdd.rows.map((r) => (r.assignment as { pitch: number }).pitch)
      ).toEqual([36, 37, 38]);

      const clearRes = await runTool("ui_timeline_set_pattern_row_sort", {
        timeline_id: SEQ_ID,
        clipId: "c-sort",
        rowSort: "none"
      });
      expect(clearRes.ok).toBe(true);
      expect(clearRes.rowSort).toBe("none");
      expect(
        mockDoc.getState().clips.find((c) => c.id === "c-sort")!.pattern!.rowSort
      ).toBeUndefined();

      await runTool("ui_timeline_add_pattern_rows", {
        timeline_id: SEQ_ID,
        clipId: "c-sort",
        rows: [{ pitch: 35, name: "SubKick" }]
      });
      const afterClearAdd = mockDoc
        .getState()
        .clips.find((c) => c.id === "c-sort")!.pattern!;
      expect(
        afterClearAdd.rows.map((r) => (r.assignment as { pitch: number }).pitch)
      ).toEqual([36, 37, 38, 35]);
    } finally {
      unmount();
    }
  });
});
