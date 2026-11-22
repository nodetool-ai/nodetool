/**
 * @jest-environment jsdom
 *
 * SQ43 Step Pattern Saved Instrument — Web tool parity, browser AssetStore
 * persistence, and single-undo grouping when `add_track` + `apply_step_pattern`
 * run together.
 */
import React from "react";
import { act, renderHook } from "@testing-library/react";
import { stepPatternAssetEnvelope } from "@nodetool-ai/protocol/api-schemas/timeline.js";
import {
  DEFAULT_TEMPO,
  STEP_PATTERN_ASSET_CONTENT_TYPE,
  findInstrumentPreset,
  makeClip,
  makeTrack,
  patternFromText,
  type WavetableMidiInstrument
} from "@nodetool-ai/timeline";
import {
  FrontendToolRegistry,
  type FrontendToolState
} from "../../../lib/tools/frontendTools";
import "../../../lib/tools/builtin/timeline";
import {
  createTimelineInstance,
  TimelineProvider
} from "../../../stores/timeline/TimelineInstance";
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
import { DEFAULT_TIMELINE_INSTRUMENT } from "../../../stores/timeline/instrumentPresets";
import { useAssetStore } from "../../../stores/AssetStore";
import { useTimelineAgentBridge } from "../useTimelineAgentBridge";
import { useStepPatternOps } from "../../../components/timeline/stepSequencer/useStepPatternOps";
import { patternDropOps } from "../../../components/timeline/Tracks/stepPatternDrop";

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

const SEQ_ID = "seq-sq43-instr";
const toolCtx = {
  getState: () => ({}) as FrontendToolState,
  abortSignal: new AbortController().signal
};

interface MockAssetRow {
  id: string;
  name: string;
  content_type: string;
  get_url: string;
  project_id?: string;
  parent_id?: string;
  metadata?: Record<string, unknown>;
}

function readFileText(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

function installMockAssetStore(seed?: {
  rows?: MockAssetRow[];
  bodies?: Record<string, string>;
}) {
  const storedAssets: MockAssetRow[] = [...(seed?.rows ?? [])];
  const storedTextByUrl = new Map<string, string>(
    Object.entries(seed?.bodies ?? {})
  );
  let seq = storedAssets.length;

  const createAssetSpy = jest.fn(async (file: File) => {
    seq += 1;
    const id = `${seq.toString(16).padStart(8, "0")}c0c000000000000000000000`;
    const url = `https://assets.test/${id}`;
    const text = await readFileText(file);
    storedTextByUrl.set(url, text);
    const row: MockAssetRow = {
      id,
      name: file.name,
      content_type: file.type,
      get_url: url,
      project_id: "proj-browser",
      metadata: {}
    };
    storedAssets.push(row);
    return row;
  });

  const loadSpy = jest.fn(async () => ({
    assets: [...storedAssets],
    next: null
  }));

  const updateSpy = jest.fn(
    async (patch: {
      id: string;
      parent_id?: string;
      metadata?: Record<string, unknown>;
      data?: string;
    }) => {
      const row = storedAssets.find((a) => a.id === patch.id);
      if (!row) throw new Error(`Asset not found: ${patch.id}`);
      if (patch.parent_id !== undefined) row.parent_id = patch.parent_id;
      if (patch.metadata !== undefined) row.metadata = patch.metadata;
      if (patch.data !== undefined) storedTextByUrl.set(row.get_url, patch.data);
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

  return { storedAssets, storedTextByUrl };
}

async function runTool(
  name: string,
  args: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const tool = FrontendToolRegistry.get(name);
  if (!tool) throw new Error(`Tool not registered: ${name}`);
  return (await tool.execute(args as never, toolCtx)) as Record<string, unknown>;
}

describe("SQ43 step pattern saved instrument (web tools, browser library & single undo)", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    mockDoc = createTimelineStore();
    mockUi = createTimelineUIStore();
    mockPlayback = createTimelinePlaybackStore();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("persists saved instrument and preset through browser AssetStore, survives folder rename, and applies via web tools with undo and guards", async () => {
    const bl1Acid = findInstrumentPreset("bl1-acid")!.instrument;
    const wt1SoftKeys = findInstrumentPreset("wt1-soft-keys")!.instrument;
    const dr1Cinematic = findInstrumentPreset("dr1-cinematic")!.instrument;
    const customSynth: WavetableMidiInstrument = {
      ...(structuredClone(wt1SoftKeys) as WavetableMidiInstrument),
      cutoffHz: 1750
    };

    const presetOnlyId = "00000099c0c000000000000000000001";
    const presetOnlyUrl = `https://assets.test/${presetOnlyId}`;
    const storeMock = installMockAssetStore({
      rows: [
        {
          id: presetOnlyId,
          name: "preset-only.step-pattern.json",
          content_type: STEP_PATTERN_ASSET_CONTENT_TYPE,
          get_url: presetOnlyUrl,
          metadata: {
            step_pattern: {
              name: "Browser Bell Preset",
              kind: "pattern",
              folder: "Step Patterns/Patterns"
            }
          }
        }
      ],
      bodies: {
        [presetOnlyUrl]: JSON.stringify({
          version: 1,
          name: "Browser Bell Preset",
          kind: "pattern",
          category: "user",
          tags: ["pattern", "user"],
          folder: "Step Patterns/Patterns",
          pattern: patternFromText("C5: x... .... x... ....", { name: "Bell" }),
          instrumentPreset: "wt1-chime-bell"
        })
      }
    });

    mockDoc.setState({
      sequenceId: SEQ_ID,
      tempo: DEFAULT_TEMPO,
      tracks: [
        makeTrack({
          id: "t-acid",
          type: "midi",
          name: "Acid",
          index: 0,
          instrument: structuredClone(bl1Acid)
        }),
        makeTrack({
          id: "t-custom",
          type: "midi",
          name: "Custom",
          index: 1,
          instrument: structuredClone(customSynth)
        }),
        makeTrack({
          id: "t-empty-default",
          type: "midi",
          name: "Empty Default",
          index: 2,
          instrument: structuredClone(DEFAULT_TIMELINE_INSTRUMENT)
        }),
        makeTrack({
          id: "t-empty-chosen",
          type: "midi",
          name: "Empty Chosen",
          index: 3,
          instrument: structuredClone(dr1Cinematic)
        })
      ],
      clips: [
        makeClip({
          id: "c-acid",
          trackId: "t-acid",
          name: "Acid Clip",
          startMs: 0,
          durationMs: 2000,
          mediaType: "midi",
          sourceType: "imported",
          status: "generated",
          pattern: patternFromText("C2: x.x. .... x.x. ....", { name: "Acid" })
        }),
        makeClip({
          id: "c-custom",
          trackId: "t-custom",
          name: "Custom Clip",
          startMs: 0,
          durationMs: 2000,
          mediaType: "midi",
          sourceType: "imported",
          status: "generated",
          pattern: patternFromText("C4: x... x... x... x...", { name: "Keys" })
        })
      ]
    });
    timelineTemporalOf(mockDoc).clear();

    const { unmount } = renderHook(() => useTimelineAgentBridge(SEQ_ID));
    try {
      await runTool("ui_timeline_create_step_pattern_folder", {
        timeline_id: SEQ_ID,
        kind: "pattern",
        name: "My Voices"
      });
      const savedAcid = await runTool("ui_timeline_save_step_pattern", {
        timeline_id: SEQ_ID,
        clipId: "c-acid",
        name: "Browser Acid",
        kind: "pattern",
        folder: "My Voices"
      });
      const savedCustom = await runTool("ui_timeline_save_step_pattern", {
        timeline_id: SEQ_ID,
        clipId: "c-custom",
        name: "Browser Custom Synth",
        kind: "pattern",
        folder: "My Voices"
      });

      // Validate persisted JSON envelopes against protocol schema
      const acidBody = JSON.parse(
        storeMock.storedTextByUrl.get(`https://assets.test/${String(savedAcid.id)}`)!
      );
      const parsedAcid = stepPatternAssetEnvelope.parse(acidBody);
      expect(parsedAcid.instrumentPreset).toBe("bl1-acid");
      expect(parsedAcid.instrument).toEqual(bl1Acid);

      const customBody = JSON.parse(
        storeMock.storedTextByUrl.get(`https://assets.test/${String(savedCustom.id)}`)!
      );
      const parsedCustom = stepPatternAssetEnvelope.parse(customBody);
      expect(parsedCustom.instrumentPreset).toBeUndefined();
      expect(parsedCustom.instrument).toEqual(customSynth);

      // Rename folder and verify saved instrument survives rewrite
      await runTool("ui_timeline_rename_step_pattern_folder", {
        timeline_id: SEQ_ID,
        folder: "My Voices",
        newName: "Archived Voices",
        kind: "pattern"
      });

      // Apply saved acid pattern to empty track with DEFAULT_TIMELINE_INSTRUMENT -> 1 undo step
      const undoBefore = timelineTemporalOf(mockDoc).pastStates.length;
      const appliedAcid = await runTool("ui_timeline_apply_step_pattern", {
        timeline_id: SEQ_ID,
        trackId: "t-empty-default",
        atBar: 1,
        pattern: "Browser Acid"
      });
      expect(appliedAcid.ok).toBe(true);
      expect(appliedAcid.instrumentApplied).toBe(true);
      expect(
        mockDoc.getState().tracks.find((t) => t.id === "t-empty-default")!.instrument
      ).toEqual(bl1Acid);
      expect(timelineTemporalOf(mockDoc).pastStates.length).toBe(undoBefore + 1);

      // Single undo restores both empty clips AND DEFAULT_TIMELINE_INSTRUMENT
      act(() => timelineTemporalOf(mockDoc).undo());
      expect(
        mockDoc.getState().tracks.find((t) => t.id === "t-empty-default")!.instrument
      ).toEqual(DEFAULT_TIMELINE_INSTRUMENT);
      expect(
        mockDoc.getState().clips.filter((c) => c.trackId === "t-empty-default")
      ).toHaveLength(0);

      // Apply saved customized synth onto the now-empty track
      await runTool("ui_timeline_apply_step_pattern", {
        timeline_id: SEQ_ID,
        trackId: "t-empty-default",
        atBar: 1,
        pattern: "Browser Custom Synth"
      });
      expect(
        mockDoc.getState().tracks.find((t) => t.id === "t-empty-default")!.instrument
      ).toEqual(customSynth);

      // Apply preset-only user asset onto a fresh track
      const addedBell = await runTool("ui_timeline_add_track", {
        timeline_id: SEQ_ID,
        type: "midi",
        name: "Bell Track"
      });
      await runTool("ui_timeline_apply_step_pattern", {
        timeline_id: SEQ_ID,
        trackId: (addedBell.track as { id: string }).id,
        atBar: 1,
        pattern: "Browser Bell Preset"
      });
      expect(
        mockDoc.getState().tracks.find((t) => t.name === "Bell Track")!.instrument
      ).toEqual(findInstrumentPreset("wt1-chime-bell")!.instrument);

      // Guards: track with user-chosen instrument & track with existing clips stay untouched
      await runTool("ui_timeline_apply_step_pattern", {
        timeline_id: SEQ_ID,
        trackId: "t-empty-chosen",
        atBar: 1,
        pattern: "Browser Acid"
      });
      expect(
        mockDoc.getState().tracks.find((t) => t.id === "t-empty-chosen")!.instrument
      ).toEqual(dr1Cinematic);

      await runTool("ui_timeline_apply_step_pattern", {
        timeline_id: SEQ_ID,
        trackId: "t-acid",
        atBar: 2,
        pattern: "Boom Bap"
      });
      expect(
        mockDoc.getState().tracks.find((t) => t.id === "t-acid")!.instrument
      ).toEqual(bl1Acid);
    } finally {
      unmount();
    }
  });

  it("keeps one undo step when add_track and apply_step_pattern run together and sets the new track's saved instrument", async () => {
    const wt1SoftKeys = findInstrumentPreset("wt1-soft-keys")!.instrument;
    const customSynth: WavetableMidiInstrument = {
      ...(structuredClone(wt1SoftKeys) as WavetableMidiInstrument),
      cutoffHz: 2100
    };
    const userPatId = "00000077c0c000000000000000000001";
    const userPatUrl = `https://assets.test/${userPatId}`;
    installMockAssetStore({
      rows: [
        {
          id: userPatId,
          name: "custom-drop.step-pattern.json",
          content_type: STEP_PATTERN_ASSET_CONTENT_TYPE,
          get_url: userPatUrl,
          metadata: {
            step_pattern: {
              name: "Dropped Custom",
              kind: "pattern",
              folder: "Step Patterns/Patterns"
            }
          }
        }
      ],
      bodies: {
        [userPatUrl]: JSON.stringify({
          version: 1,
          name: "Dropped Custom",
          kind: "pattern",
          category: "user",
          tags: ["pattern", "user"],
          folder: "Step Patterns/Patterns",
          pattern: patternFromText("C4: x... x... x... x...", {
            name: "Dropped Custom"
          }),
          instrument: customSynth
        })
      }
    });

    const instance = createTimelineInstance();
    mockDoc = instance.doc;
    mockUi = instance.ui;
    mockPlayback = instance.playback;
    act(() => {
      instance.doc.setState({ tracks: [], clips: [], tempo: DEFAULT_TEMPO });
    });
    timelineTemporalOf(instance.doc).clear();

    const { result, unmount } = renderHook(() => useStepPatternOps(), {
      wrapper: ({ children }) => (
        <TimelineProvider instance={instance}>{children}</TimelineProvider>
      )
    });
    try {
      // 1. Factory drum pattern dropped below last track: add_track + apply_step_pattern = 1 undo step
      const beforeFactory = timelineTemporalOf(instance.doc).pastStates.length;
      await act(async () => {
        await result.current.run(patternDropOps("four-on-the-floor", 0, null));
      });
      expect(instance.doc.getState().tracks).toHaveLength(1);
      expect(instance.doc.getState().clips).toHaveLength(1);
      expect(instance.doc.getState().tracks[0]!.instrument).toEqual(
        findInstrumentPreset("dr1-tr-void")!.instrument
      );
      expect(timelineTemporalOf(instance.doc).pastStates.length).toBe(
        beforeFactory + 1
      );

      // Single undo removes BOTH the new track and its pattern clip
      act(() => timelineTemporalOf(instance.doc).undo());
      expect(instance.doc.getState().tracks).toHaveLength(0);
      expect(instance.doc.getState().clips).toHaveLength(0);

      // 2. User-saved pattern with custom instrument dropped below last track = 1 undo step
      const beforeUser = timelineTemporalOf(instance.doc).pastStates.length;
      await act(async () => {
        await result.current.run(patternDropOps(userPatId, 0, null));
      });
      expect(instance.doc.getState().tracks).toHaveLength(1);
      expect(instance.doc.getState().tracks[0]!.instrument).toEqual(customSynth);
      expect(timelineTemporalOf(instance.doc).pastStates.length).toBe(
        beforeUser + 1
      );

      act(() => timelineTemporalOf(instance.doc).undo());
      expect(instance.doc.getState().tracks).toHaveLength(0);
      expect(instance.doc.getState().clips).toHaveLength(0);
    } finally {
      unmount();
    }
  });
});
