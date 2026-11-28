/**
 * SQ43 Step Pattern Saved Instrument — Headless bridge parity & server asset persistence.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import {
  Asset,
  ModelObserver,
  TimelineSequence,
  initTestDb,
  type TimelineDocument
} from "@nodetool-ai/models";
import { stepPatternAssetEnvelope } from "@nodetool-ai/protocol/api-schemas/timeline.js";
import {
  DEFAULT_MIDI_INSTRUMENT,
  DEFAULT_TEMPO,
  STEP_PATTERN_ASSET_CONTENT_TYPE,
  findInstrumentPreset,
  makeClip,
  makeTrack,
  patternFromText,
  type WavetableMidiInstrument
} from "@nodetool-ai/timeline";
import {
  applyTimelineOp,
  createMemoryStepPatternLibrary,
  timelineOpFromToolArgs,
  type TimelineOpIdKind,
  type TimelineOpState
} from "@nodetool-ai/timeline/ops";
import { createCapabilityRun, UNGATED } from "../src/capabilities/invoke.js";
import { createTimelineToolBridge } from "../src/capabilities/timeline-bridge.js";
import { applyOps } from "../src/capabilities/timeline-operations.js";

const USER_ID = "sq43-instr-user";

function makeServerAssetContext(projectId = "proj-sq43-instr") {
  const bytesById = new Map<string, Uint8Array>();
  const context = {
    userId: USER_ID,
    projectId,
    createAsset: async (args: {
      name: string;
      contentType: string;
      content: Uint8Array;
      parentId?: string | null;
      path?: string | null;
      metadata?: Record<string, unknown> | null;
    }) => {
      const asset = (await Asset.create({
        user_id: USER_ID,
        project_id: projectId,
        name: args.name,
        content_type: args.contentType,
        parent_id: args.parentId ?? null,
        workspace_path: args.path ?? null,
        metadata: args.metadata ?? null
      })) as Asset;
      bytesById.set(asset.id, args.content);
      return { id: asset.id };
    },
    updateAssetBytes: async (args: {
      assetId: string;
      content: Uint8Array;
    }) => {
      const asset = await Asset.find(USER_ID, args.assetId);
      if (!asset) return null;
      bytesById.set(asset.id, args.content);
      return {
        id: asset.id,
        content_type: asset.content_type,
        name: asset.name,
        metadata: asset.metadata ?? null
      };
    },
    resolveAssetBytes: async (uri: string) => {
      const id = uri.replace(/^asset:\/\//, "").replace(/\.[A-Za-z0-9]+$/, "");
      return { bytes: bytesById.get(id) ?? null, attempts: [] };
    }
  } as unknown as ProcessingContext;
  return { context, bytesById };
}

describe("SQ43 step pattern saved instrument (headless bridge & server persistence)", () => {
  beforeEach(() => initTestDb());
  afterEach(() => ModelObserver.clear());

  it("forwards defaultMidiInstrument on createTimelineToolBridge and matches applyTimelineOp parity", async () => {
    const wt1Lead = findInstrumentPreset("wt1-prime-lead")!.instrument;
    const dr1 = findInstrumentPreset("dr1-tr-void")!.instrument;

    const makeIds = () => {
      let n = 0;
      return (kind: string) => `${kind}_${++n}`;
    };

    const bridge = createTimelineToolBridge({
      newId: makeIds(),
      defaultMidiInstrument: wt1Lead,
      sequence: { tempo: DEFAULT_TEMPO, tracks: [], clips: [] },
      stepPatternLibrary: createMemoryStepPatternLibrary()
    });
    const byName = Object.fromEntries(bridge.tools.map((t) => [t.name, t]));

    const addedBridge = (await byName["ui_timeline_add_track"]!.execute({
      type: "midi",
      name: "Drums"
    })) as { track: { id: string; instrument: unknown } };
    expect(addedBridge.track.instrument).toEqual(wt1Lead);

    const appliedBridge = await byName["ui_timeline_apply_step_pattern"]!.execute({
      trackId: addedBridge.track.id,
      atBar: 1,
      pattern: "Boom Bap"
    });

    // Direct applyTimelineOp with the same host default & id sequence
    const directIds = makeIds();
    const directCtx = {
      newId: (k: TimelineOpIdKind) => directIds(k),
      defaultMidiInstrument: wt1Lead,
      stepPatternLibrary: createMemoryStepPatternLibrary()
    };
    const initState: TimelineOpState = {
      fps: 30,
      width: 1920,
      height: 1080,
      tempo: DEFAULT_TEMPO,
      tracks: [],
      clips: [],
      markers: [],
      playheadMs: 0,
      selectedClipIds: []
    };
    const addedDirect = await applyTimelineOp(
      initState,
      timelineOpFromToolArgs("add_track", { type: "midi", name: "Drums" }),
      directCtx
    );
    const appliedDirect = await applyTimelineOp(
      addedDirect.state,
      timelineOpFromToolArgs("apply_step_pattern", {
        trackId: (addedDirect.result.track as { id: string }).id,
        atBar: 1,
        pattern: "Boom Bap"
      }),
      directCtx
    );

    expect(appliedBridge).toMatchObject(appliedDirect.result);
    expect(bridge.finalState().documentTracks).toEqual(
      appliedDirect.state.tracks
    );
    expect(bridge.finalState().documentClips).toEqual(
      appliedDirect.state.clips
    );
    expect(bridge.finalState().documentTracks[0]!.instrument).toEqual(dr1);
  });

  it("persists saved instrument and preset on server assets, preserves them across folder rename/move, and applies to new tracks only", async () => {
    const { context, bytesById } = makeServerAssetContext();
    const run = createCapabilityRun({ context, gate: UNGATED });
    const bl1Acid = findInstrumentPreset("bl1-acid")!.instrument;
    const wt1SoftKeys = findInstrumentPreset("wt1-soft-keys")!.instrument;
    const customSynth: WavetableMidiInstrument = {
      ...(structuredClone(wt1SoftKeys) as WavetableMidiInstrument),
      cutoffHz: 1850
    };

    const doc: TimelineDocument = {
      tempo: DEFAULT_TEMPO,
      tracks: [
        makeTrack({
          id: "t_acid",
          type: "midi",
          name: "Acid",
          index: 0,
          instrument: structuredClone(bl1Acid)
        }),
        makeTrack({
          id: "t_custom",
          type: "midi",
          name: "Custom",
          index: 1,
          instrument: structuredClone(customSynth)
        })
      ],
      clips: [
        makeClip({
          id: "c_acid",
          trackId: "t_acid",
          name: "Acid Clip",
          startMs: 0,
          durationMs: 2000,
          mediaType: "midi",
          sourceType: "imported",
          status: "generated",
          pattern: patternFromText("C2: x.x. .... x.x. ....", { name: "Acid" })
        }),
        makeClip({
          id: "c_custom",
          trackId: "t_custom",
          name: "Custom Clip",
          startMs: 0,
          durationMs: 2000,
          mediaType: "midi",
          sourceType: "imported",
          status: "generated",
          pattern: patternFromText("C4: x... x... x... x...", { name: "Keys" })
        })
      ],
      markers: []
    };

    const seq = await TimelineSequence.create({
      user_id: USER_ID,
      project_id: "proj-sq43-instr",
      name: "SQ43 Instr",
      fps: 30,
      width: 1920,
      height: 1080,
      duration_ms: 2000,
      document: JSON.stringify(doc)
    });

    // 1. Save both patterns (preset-backed and custom-tweaked) into a folder
    const saveOut = await applyOps(run, seq, doc, [
      {
        op: "ui_timeline_create_step_pattern_folder",
        input: { kind: "pattern", name: "Synths" }
      },
      {
        op: "ui_timeline_save_step_pattern",
        input: {
          clipId: "c_acid",
          name: "Saved Acid",
          kind: "pattern",
          folder: "Synths"
        }
      },
      {
        op: "ui_timeline_save_step_pattern",
        input: {
          clipId: "c_custom",
          name: "Saved Custom Synth",
          kind: "pattern",
          folder: "Synths"
        }
      }
    ]);
    expect(saveOut.records.every((r) => r.ok)).toBe(true);
    const acidId = (saveOut.records[1]!.result as { id: string }).id;
    const customId = (saveOut.records[2]!.result as { id: string }).id;

    // Asset JSON validates against protocol stepPatternAssetEnvelope with instrument
    const rawAcid = JSON.parse(
      new TextDecoder().decode(bytesById.get(acidId)!)
    );
    const parsedAcid = stepPatternAssetEnvelope.parse(rawAcid);
    expect(parsedAcid.instrumentPreset).toBe("bl1-acid");
    expect(parsedAcid.instrument).toEqual(bl1Acid);

    const rawCustom = JSON.parse(
      new TextDecoder().decode(bytesById.get(customId)!)
    );
    const parsedCustom = stepPatternAssetEnvelope.parse(rawCustom);
    expect(parsedCustom.instrumentPreset).toBeUndefined();
    expect(parsedCustom.instrument).toEqual(customSynth);

    // 2. Rename folder -> instrument and instrumentPreset must survive rewrite
    const renameOut = await applyOps(run, seq, doc, [
      {
        op: "ui_timeline_rename_step_pattern_folder",
        input: { folder: "Synths", newName: "Leads", kind: "pattern" }
      }
    ]);
    expect(renameOut.records[0]!.ok).toBe(true);

    // Also seed a preset-only user asset (no instrument object, only instrumentPreset)
    const presetOnlyPayload = {
      version: 1,
      name: "Preset Only Bell",
      kind: "pattern",
      category: "user",
      tags: ["pattern", "user"],
      folder: "Step Patterns/Patterns",
      pattern: patternFromText("C5: x... .... x... ....", { name: "Bell" }),
      instrumentPreset: "wt1-chime-bell"
    };
    const presetOnlyAsset = (await Asset.create({
      user_id: USER_ID,
      project_id: "proj-sq43-instr",
      name: "preset-only.step-pattern.json",
      content_type: STEP_PATTERN_ASSET_CONTENT_TYPE,
      metadata: {
        step_pattern: {
          name: "Preset Only Bell",
          kind: "pattern",
          folder: "Step Patterns/Patterns"
        }
      }
    })) as Asset;
    bytesById.set(
      presetOnlyAsset.id,
      new TextEncoder().encode(JSON.stringify(presetOnlyPayload))
    );

    // 3. Apply in a separate applyOps call:
    //    - new tracks take saved instrument / preset
    //    - track with clips keeps existing instrument
    //    - empty track with user-chosen instrument keeps chosen instrument
    const emptyDoc: TimelineDocument = {
      tempo: DEFAULT_TEMPO,
      tracks: [
        makeTrack({
          id: "t_busy",
          type: "midi",
          name: "Busy",
          index: 0,
          instrument: DEFAULT_MIDI_INSTRUMENT
        })
      ],
      clips: [
        makeClip({
          id: "c_busy",
          trackId: "t_busy",
          name: "Existing",
          startMs: 0,
          durationMs: 1000,
          mediaType: "midi",
          sourceType: "imported",
          status: "generated",
          notes: []
        })
      ],
      markers: []
    };
    const applyOut = await applyOps(run, seq, emptyDoc, [
      { op: "ui_timeline_add_track", input: { type: "midi", name: "New Acid" } },
      {
        op: "ui_timeline_apply_step_pattern",
        input: { trackId: "New Acid", atBar: 1, pattern: acidId.slice(0, 12) }
      },
      { op: "ui_timeline_add_track", input: { type: "midi", name: "New Custom" } },
      {
        op: "ui_timeline_apply_step_pattern",
        input: { trackId: "New Custom", atBar: 1, pattern: customId.slice(0, 12) }
      },
      { op: "ui_timeline_add_track", input: { type: "midi", name: "New Bell" } },
      {
        op: "ui_timeline_apply_step_pattern",
        input: { trackId: "New Bell", atBar: 1, pattern: "Preset Only Bell" }
      },
      { op: "ui_timeline_add_track", input: { type: "midi", name: "User Chosen" } },
      {
        op: "ui_timeline_set_track_instrument",
        input: { track: "User Chosen", instrument: { preset: "dr1-cinematic" } }
      },
      {
        op: "ui_timeline_apply_step_pattern",
        input: { trackId: "User Chosen", atBar: 1, pattern: "Saved Acid" }
      },
      {
        op: "ui_timeline_apply_step_pattern",
        input: { trackId: "Busy", atBar: 2, pattern: "Boom Bap" }
      }
    ]);
    expect(applyOut.records.every((r) => r.ok)).toBe(true);

    const byTrackName = (name: string) =>
      applyOut.state.documentTracks.find((t) => t.name === name)!;
    expect(byTrackName("New Acid").instrument).toEqual(bl1Acid);
    expect(byTrackName("New Custom").instrument).toEqual(customSynth);
    expect(byTrackName("New Bell").instrument).toEqual(
      findInstrumentPreset("wt1-chime-bell")!.instrument
    );
    expect(byTrackName("User Chosen").instrument).toEqual(
      findInstrumentPreset("dr1-cinematic")!.instrument
    );
    expect(byTrackName("Busy").instrument).toEqual(DEFAULT_MIDI_INSTRUMENT);
  });
});
