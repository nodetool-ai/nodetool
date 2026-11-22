/**
 * SQ1 Fix Round Wave 4 — Agents & headless timeline defects (F4 bridge, F7
 * server persistence, F23, F27, F29, F30, F31, F33, F36).
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
import {
  DEFAULT_MIDI_INSTRUMENT,
  DEFAULT_TEMPO,
  STEP_PATTERN_ASSET_CONTENT_TYPE,
  findInstrumentPreset,
  makeClip,
  makeTrack,
  normalizePattern,
  patternFromText,
  type StepRow
} from "@nodetool-ai/timeline";
import { createCapabilityRun, UNGATED } from "../src/capabilities/invoke.js";
import { createTimelineToolBridge } from "../src/capabilities/timeline-bridge.js";
import {
  applyOps,
  isReadOnlyRecord
} from "../src/capabilities/timeline-operations.js";
import {
  module as timelines,
  resolveTimelineOpInput,
  resultUnitIds
} from "../src/capabilities/timelines.js";
import { EDIT_TIMELINE_SCHEMA } from "../src/capabilities/timelines.specs.js";
import { searchTools } from "../src/tools/tool-search.js";
import {
  renderFocusedToolCatalog,
  type ToolSignatureSource
} from "../src/codeact/tool-api.js";
import { findJob } from "../src/jtbd/registry.js";
import { focusedSurfaceTools, uiGraft } from "./fixtures/focused-surface-tools.js";
import type { TimelineBridgeFinalState } from "../src/capabilities/timeline-bridge.js";

const USER_ID = "sq1-fix-user";

function makeAssetContext() {
  const bytesById = new Map<string, Uint8Array>();
  const context = {
    userId: USER_ID,
    createAsset: async (args: {
      name: string;
      contentType: string;
      content: Uint8Array;
    }) => {
      const asset = (await Asset.create({
        user_id: USER_ID,
        name: args.name,
        content_type: args.contentType
      })) as Asset;
      bytesById.set(asset.id, args.content);
      return { id: asset.id };
    },
    resolveAssetBytes: async (uri: string) => {
      const id = uri.replace(/^asset:\/\//, "").replace(/\.[A-Za-z0-9]+$/, "");
      return { bytes: bytesById.get(id) ?? null, attempts: [] };
    }
  } as unknown as ProcessingContext;
  return { context, bytesById };
}

function makeRow(overrides: Partial<StepRow> = {}): StepRow {
  const lengthSteps = overrides.lengthSteps ?? 16;
  return {
    id: overrides.id ?? "r1",
    assignment: overrides.assignment ?? { type: "note", pitch: 36 },
    mute: false,
    solo: false,
    lengthSteps,
    loopStart: 0,
    loopEnd: lengthSteps,
    stepRate: "1/16",
    playback: "forward",
    midiChannel: 1,
    automationMode: "latch",
    subrows: ["velocity", "gate"],
    steps: Array.from({ length: lengthSteps }, () => ({})),
    ...overrides
  };
}

describe("SQ1 Fix Round — Agents & headless timeline (Wave 4)", () => {
  beforeEach(() => initTestDb());

  afterEach(() => {
    ModelObserver.clear();
  });

  it("F4 (timeline-bridge): ui_timeline_get_state reports chord-resolved audibleNoteCount for degree rows", async () => {
    const degPat = normalizePattern({
      lengthSteps: 4,
      stepRate: "1/4",
      pitchSource: "chords",
      rows: [
        makeRow({
          id: "d1",
          assignment: { type: "degree", degree: "root", octave: 3 },
          lengthSteps: 4,
          loopEnd: 4,
          stepRate: "1/4",
          steps: [{ on: true }, {}, {}, {}]
        })
      ]
    });
    const bridge = createTimelineToolBridge({
      sequence: {
        tempo: DEFAULT_TEMPO,
        tracks: [
          makeTrack({
            id: "t_chords",
            type: "chord",
            name: "Chords",
            index: 0,
            chords: [
              { id: "ch1", startTick: 0, durationTick: 3840, root: 7, quality: "maj", inversion: 0 }
            ]
          }),
          makeTrack({
            id: "t_midi",
            type: "midi",
            name: "Keys",
            index: 1,
            instrument: DEFAULT_MIDI_INSTRUMENT
          })
        ],
        clips: [
          makeClip({
            id: "c_deg",
            trackId: "t_midi",
            name: "Deg",
            startMs: 0,
            durationMs: 2000,
            mediaType: "midi",
            sourceType: "imported",
            status: "generated",
            pattern: degPat
          })
        ]
      }
    });
    const getState = bridge.tools.find((t) => t.name === "ui_timeline_get_state")!;
    const res = (await getState.execute({})) as {
      clips: Array<{ id: string; audibleNoteCount?: number }>;
    };
    expect(res.clips[0]!.audibleNoteCount).toBe(1);
  });

  it("F7 (server): save_step_pattern persists across separate applyOps calls via application/x-nodetool-step-pattern assets", async () => {
    const { context } = makeAssetContext();
    const run = createCapabilityRun({ context, gate: UNGATED });
    const pat = patternFromText("Kick: x... x... x... x...");
    const doc: TimelineDocument = {
      tempo: DEFAULT_TEMPO,
      tracks: [
        makeTrack({
          id: "t1",
          type: "midi",
          name: "Drums",
          index: 0,
          instrument: DEFAULT_MIDI_INSTRUMENT
        })
      ],
      clips: [
        makeClip({
          id: "c1",
          trackId: "t1",
          name: "Beat",
          startMs: 0,
          durationMs: 2000,
          mediaType: "midi",
          sourceType: "imported",
          status: "generated",
          pattern: pat
        })
      ],
      markers: []
    };
    const seq = await TimelineSequence.create<TimelineSequence>({
      user_id: USER_ID,
      project_id: "default",
      name: "Persist Test",
      fps: 30,
      width: 1920,
      height: 1080,
      duration_ms: 2000,
      document: JSON.stringify(doc)
    });

    // Call 1: save pattern
    const saveOut = await applyOps(run, seq, doc, [
      {
        op: "ui_timeline_save_step_pattern",
        input: { clipId: "c1", name: "My Groove", kind: "pattern" }
      }
    ]);
    expect(saveOut.records[0]!.ok).toBe(true);
    const saved = saveOut.records[0]!.result as { id: string; assetId?: string };
    expect(saved.assetId).toBeTruthy();

    // Asset persisted in DB with SQ44 / D92 content type
    const [assets] = await Asset.paginate(USER_ID, {
      contentType: STEP_PATTERN_ASSET_CONTENT_TYPE,
      limit: 50
    });
    expect(assets.some((a) => a.id === saved.assetId)).toBe(true);

    // Call 2 (separate applyOps invocation): list and apply by name AND by 12-char short ID
    const secondOut = await applyOps(run, seq, doc, [
      { op: "ui_timeline_list_step_patterns", input: {} },
      {
        op: "ui_timeline_apply_step_pattern",
        input: { clipId: "c1", pattern: "My Groove" }
      },
      {
        op: "ui_timeline_apply_step_pattern",
        input: { clipId: "c1", pattern: saved.id.slice(0, 12) }
      }
    ]);
    expect(secondOut.records[0]!.ok).toBe(true);
    const entries = (secondOut.records[0]!.result as { entries: Array<{ name: string; source: string }> }).entries;
    expect(entries.some((e) => e.name === "My Groove" && e.source === "user")).toBe(true);
    expect(secondOut.records[1]!.ok).toBe(true);
    expect(secondOut.records[2]!.ok).toBe(true);
  });

  it("F23: get_pattern, list_step_patterns, and save_step_pattern are read-only on the timeline document", async () => {
    expect(isReadOnlyRecord({ op: "ui_timeline_get_pattern", input: {} }, { ok: true })).toBe(true);
    expect(isReadOnlyRecord({ op: "ui_timeline_list_step_patterns", input: {} }, { ok: true })).toBe(true);
    expect(isReadOnlyRecord({ op: "ui_timeline_save_step_pattern", input: {} }, { ok: true })).toBe(true);

    const { context } = makeAssetContext();
    const run = createCapabilityRun({ context, gate: UNGATED });
    const doc: TimelineDocument = {
      tempo: DEFAULT_TEMPO,
      tracks: [makeTrack({ id: "t1", type: "midi", name: "Drums", index: 0 })],
      clips: [
        makeClip({
          id: "c1",
          trackId: "t1",
          name: "Beat",
          startMs: 0,
          durationMs: 2000,
          mediaType: "midi",
          sourceType: "imported",
          status: "generated",
          pattern: patternFromText("Kick: x... x... x... x...")
        })
      ],
      markers: []
    };
    const seq = await TimelineSequence.create<TimelineSequence>({
      user_id: USER_ID,
      project_id: "default",
      name: "ReadOnly Test",
      fps: 30,
      width: 1920,
      height: 1080,
      duration_ms: 2000,
      document: JSON.stringify(doc)
    });

    const events: unknown[] = [];
    ModelObserver.subscribe((ev) => events.push(ev));
    try {
      const edit = timelines.exports.find((e) => e.spec.name === "edit_timeline")!;
      const res = (await edit.impl(run, {
        timeline_id: seq.id,
        ops: [
          { op: "get_pattern", clipId: "c1" },
          { op: "list_step_patterns" }
        ]
      })) as { updated_at: string; applied: number; failed: number };
      expect(res.failed).toBe(0);
      expect(res.applied).toBe(2);
      expect(res.updated_at).toBe(seq.updated_at);
      expect(events).toHaveLength(0);
    } finally {
      ModelObserver.clear();
    }
  });

  it("F27 & F33: searchTools defaults return core step sequencer tools and do not pad narrow +prefix queries", async () => {
    const timelineTools = await focusedSurfaceTools("timeline");
    const catalog = timelineTools.map((t) => ({
      name: t.name,
      description: t.description
    }));

    // Default limit (no explicit maxResults) on the exact prompt query
    const seqHits = searchTools(catalog, "+ui_timeline_ step sequencer").map((h) => h.name);
    for (const essential of [
      "ui_timeline_create_pattern_region",
      "ui_timeline_get_pattern",
      "ui_timeline_set_pattern",
      "ui_timeline_set_pattern_text",
      "ui_timeline_set_steps",
      "ui_timeline_add_pattern_rows",
      "ui_timeline_rotate_pattern"
    ]) {
      expect(seqHits).toContain(essential);
    }

    // Narrow topic must NOT pad unrelated alphabetically-first tools like add_group/add_marker.
    const masterHits = searchTools(catalog, "+ui_timeline_ master").map((h) => h.name);
    expect(masterHits).toContain("ui_timeline_set_track");
    expect(masterHits).not.toContain("ui_timeline_add_group");
    expect(masterHits).not.toContain("ui_timeline_add_marker");
  });

  it("F29: resolveTimelineOpInput and resultUnitIds canonicalize step pattern clip/track keys", () => {
    const before = {
      tracks: [{ id: "T1", name: "Drums" }],
      clips: [{ id: "C1", name: "Drums 1" }]
    } as unknown as TimelineDocument;
    const state = {
      tracks: [
        { id: "T1", name: "Drums" },
        { id: "T2", name: "Bass" }
      ],
      clips: [
        { id: "C1", name: "Drums 1" },
        { id: "C2", name: "Bass 1" }
      ]
    } as unknown as TimelineBridgeFinalState;

    expect(resultUnitIds({ ok: true, clipId: "C1" })).toEqual(["C1"]);
    expect(
      resolveTimelineOpInput(
        {
          clipId: "Drums 1",
          trackId: "Bass",
          toClipId: "Bass 1",
          fromClipId: "Drums 1",
          clipIds: ["Drums 1", "Bass 1"]
        },
        before,
        state,
        { ok: true, clipId: "C1" }
      )
    ).toEqual({
      clipId: "C1",
      trackId: "T2",
      toClipId: "C2",
      fromClipId: "C1",
      clipIds: ["C1", "C2"],
      id: "C1"
    });
  });

  it("F30: renderFocusedToolCatalog still collapses ui_timeline_* when a non-timeline tool shares the specifier", async () => {
    const base = await focusedSurfaceTools("timeline");
    const stray: ToolSignatureSource = {
      name: "custom_surface_helper",
      description: "Custom helper in the same specifier group.",
      inputSchema: { type: "object", properties: {} }
    };
    const combined = [...base, stray];
    const text = renderFocusedToolCatalog(combined, uiGraft(combined));
    expect(text).toContain('nodetool.searchTools("+ui_timeline_');
    expect(text).toContain("custom_surface_helper");
    expect(text.length).toBeLessThanOrEqual(3300);
  });

  it("F31: EDIT_TIMELINE_SCHEMA documents step sequencer op parameters", () => {
    const desc = (
      EDIT_TIMELINE_SCHEMA.properties as Record<string, { description?: string }>
    )["ops"]!.description!;
    expect(desc).toContain("create_pattern_region");
    expect(desc).toMatch(/create_pattern_region[^.]*trackId/);
    expect(desc).toMatch(/set_steps[^.]*clipId/);
    expect(desc).toMatch(/set_steps[^.]*steps/);
    expect(desc).toMatch(/get_pattern[^.]*modes/);
  });

  it("F36: JTBD step-sequencer-boom-bap rejects muted, skipped, single-step hats and checks the 4-bar clip", async () => {
    const job = findJob("step-sequencer-boom-bap")!;

    // 1. Muted hat row must fail hats-70-chance
    const world1 = await job.start();
    const byName1 = Object.fromEntries(world1.tools.map((t) => [t.name, t]));
    const created1 = (await byName1["ui_timeline_create_pattern_region"]!.execute({
      trackId: "track_drums",
      atBar: 1,
      bars: 4,
      text: "Kick: x... .... x... ....\nSnare: .... X.o. .... X...\nClosed hat: x.x. x.x. x.x. x.x."
    })) as { clip: { id: string } };
    await byName1["ui_timeline_set_steps"]!.execute({
      clipId: created1.clip.id,
      row: "Closed hat",
      steps: "1,3,5,7,9,11,13,15",
      values: { chance: 70 }
    });
    await byName1["ui_timeline_set_pattern_row"]!.execute({
      clipId: created1.clip.id,
      row: "Closed hat",
      mute: true
    });
    const grade1 = world1.grade();
    expect(grade1.find((o) => o.name === "hats-70-chance")!.passed).toBe(false);

    // 2. Single active hat step at 70% (rest skipped) must fail hats-70-chance
    const world2 = await job.start();
    const byName2 = Object.fromEntries(world2.tools.map((t) => [t.name, t]));
    const created2 = (await byName2["ui_timeline_create_pattern_region"]!.execute({
      trackId: "track_drums",
      atBar: 1,
      bars: 4,
      text: "Kick: x... .... x... ....\nSnare: .... X.o. .... X...\nClosed hat: x___ ____ ____ ____"
    })) as { clip: { id: string } };
    await byName2["ui_timeline_set_steps"]!.execute({
      clipId: created2.clip.id,
      row: "Closed hat",
      steps: "1",
      values: { chance: 70 }
    });
    const grade2 = world2.grade();
    expect(grade2.find((o) => o.name === "hats-70-chance")!.passed).toBe(false);
  });

  it("F40: save_step_pattern supplies folder path and parentId to createAsset for SQ44 placement", async () => {
    const createCalls: Array<Record<string, unknown>> = [];
    const bytesById = new Map<string, Uint8Array>();
    const context = {
      userId: USER_ID,
      projectId: "proj-sq44",
      createAsset: async (args: Record<string, unknown>) => {
        createCalls.push({ ...args });
        const asset = (await Asset.create({
          user_id: USER_ID,
          project_id: "proj-sq44",
          name: String(args["name"]),
          content_type: String(args["contentType"]),
          parent_id: typeof args["parentId"] === "string" ? args["parentId"] : null,
          workspace_path: typeof args["path"] === "string" ? args["path"] : null,
          metadata: (args["metadata"] as Record<string, unknown> | undefined) ?? undefined
        })) as Asset;
        bytesById.set(asset.id, args["content"] as Uint8Array);
        return { id: asset.id };
      },
      resolveAssetBytes: async (uri: string) => {
        const id = uri.replace(/^asset:\/\//, "").replace(/\.[A-Za-z0-9]+$/, "");
        return { bytes: bytesById.get(id) ?? null, attempts: [] };
      }
    } as unknown as ProcessingContext;
    const run = createCapabilityRun({ context, gate: UNGATED });
    const doc: TimelineDocument = {
      tempo: DEFAULT_TEMPO,
      tracks: [makeTrack({ id: "t1", type: "midi", name: "Drums", index: 0 })],
      clips: [
        makeClip({
          id: "c1",
          trackId: "t1",
          name: "Beat",
          startMs: 0,
          durationMs: 2000,
          mediaType: "midi",
          sourceType: "imported",
          status: "generated",
          pattern: patternFromText("Kick: x... x... x... x...")
        })
      ],
      markers: []
    };
    const seq = await TimelineSequence.create<TimelineSequence>({
      user_id: USER_ID,
      project_id: "proj-sq44",
      name: "SQ44 Folder Test",
      fps: 30,
      width: 1920,
      height: 1080,
      duration_ms: 2000,
      document: JSON.stringify(doc)
    });

    const out = await applyOps(run, seq, doc, [
      {
        op: "ui_timeline_save_step_pattern",
        input: {
          clipId: "c1",
          name: "Drum Kit",
          kind: "template",
          folder: "Drums"
        }
      }
    ]);
    expect(out.records[0]!.ok).toBe(true);
    expect(createCalls).toHaveLength(1);
    expect(String(createCalls[0]!["path"])).toMatch(
      /^Step Patterns\/Templates\/Drums\/Drum-Kit-[0-9a-f]{32}\.step-pattern\.json$/
    );
    expect(typeof createCalls[0]!["parentId"]).toBe("string");
    expect(decodeURIComponent(String(createCalls[0]!["parentId"]))).toContain(
      "Step Patterns/Templates/Drums"
    );
  });

  it("F41: server step pattern library paginates past 500 user assets for listing and applying by full ID", async () => {
    const bytesById = new Map<string, Uint8Array>();
    const context = {
      userId: USER_ID,
      createAsset: async () => {
        throw new Error("unexpected createAsset");
      },
      resolveAssetBytes: async (uri: string) => {
        const id = uri.replace(/^asset:\/\//, "").replace(/\.[A-Za-z0-9]+$/, "");
        return { bytes: bytesById.get(id) ?? null, attempts: [] };
      }
    } as unknown as ProcessingContext;
    const run = createCapabilityRun({ context, gate: UNGATED });

    const basePat = patternFromText("Kick: x... x... x... x...");
    const encoder = new TextEncoder();
    const total = 502;
    let oldestId = "";
    const baseTime = Date.UTC(2026, 0, 1, 0, 0, 0);
    for (let i = 0; i < total; i++) {
      // Stagger timestamps except intentionally tie across the 500-item boundary (i = 1, 2)
      const ms = i <= 2 ? baseTime : baseTime + i * 1000;
      const name = i === 0 ? "Oldest Pattern 000" : `Pattern ${String(i).padStart(3, "0")}`;
      const asset = new Asset({
        user_id: USER_ID,
        project_id: "default",
        name: `${name}.step-pattern.json`,
        content_type: STEP_PATTERN_ASSET_CONTENT_TYPE,
        created_at: new Date(ms).toISOString(),
        updated_at: new Date(ms).toISOString(),
        metadata: {
          step_pattern: {
            name,
            kind: "pattern",
            folder: "Step Patterns/Patterns",
            category: "user",
            tags: ["pattern", "user"]
          }
        }
      });
      await asset.save();
      if (i === 0) oldestId = asset.id;
      bytesById.set(
        asset.id,
        encoder.encode(
          JSON.stringify({
            version: 1,
            name,
            kind: "pattern",
            category: "user",
            tags: ["pattern", "user"],
            folder: "Step Patterns/Patterns",
            pattern: basePat
          })
        )
      );
    }

    const doc: TimelineDocument = {
      tempo: DEFAULT_TEMPO,
      tracks: [makeTrack({ id: "t1", type: "midi", name: "Drums", index: 0 })],
      clips: [
        makeClip({
          id: "c1",
          trackId: "t1",
          name: "Beat",
          startMs: 0,
          durationMs: 2000,
          mediaType: "midi",
          sourceType: "imported",
          status: "generated",
          pattern: normalizePattern({ name: "Empty", lengthSteps: 16, rows: [] })
        })
      ],
      markers: []
    };
    const seq = await TimelineSequence.create<TimelineSequence>({
      user_id: USER_ID,
      project_id: "default",
      name: "Pagination Test",
      fps: 30,
      width: 1920,
      height: 1080,
      duration_ms: 2000,
      document: JSON.stringify(doc)
    });

    const out = await applyOps(run, seq, doc, [
      { op: "ui_timeline_list_step_patterns", input: {} },
      { op: "ui_timeline_apply_step_pattern", input: { clipId: "c1", pattern: oldestId } }
    ]);
    expect(out.records[0]!.ok).toBe(true);
    const entries = (
      out.records[0]!.result as { entries: Array<{ id: string; name: string; source: string }> }
    ).entries;
    const userEntries = entries.filter((e) => e.source === "user");
    expect(userEntries.length).toBe(total);
    expect(userEntries.some((e) => e.id === oldestId && e.name === "Oldest Pattern 000")).toBe(
      true
    );
    expect(out.records[1]!.ok).toBe(true);
  }, 30_000);

  it("F43: save_step_pattern gives distinct paths when pattern names sanitize to the same slug", async () => {
    const createCalls: Array<Record<string, unknown>> = [];
    const bytesById = new Map<string, Uint8Array>();
    const context = {
      userId: USER_ID,
      projectId: "proj-f43",
      createAsset: async (args: Record<string, unknown>) => {
        createCalls.push({ ...args });
        const workspacePath = typeof args["path"] === "string" ? args["path"] : null;
        // Model saveProjectAsset: an exact path that already has an Asset row
        // overwrites that file and row in place instead of creating a new entry.
        const existing = workspacePath
          ? await Asset.findByWorkspacePath(USER_ID, "proj-f43", workspacePath)
          : [];
        if (existing[0]) {
          existing[0].name = String(args["name"]);
          existing[0].content_type = String(args["contentType"]);
          existing[0].metadata =
            (args["metadata"] as Record<string, unknown> | undefined) ?? existing[0].metadata;
          await existing[0].save();
          bytesById.set(existing[0].id, args["content"] as Uint8Array);
          return { id: existing[0].id };
        }
        const asset = (await Asset.create({
          user_id: USER_ID,
          project_id: "proj-f43",
          name: String(args["name"]),
          content_type: String(args["contentType"]),
          parent_id: typeof args["parentId"] === "string" ? args["parentId"] : null,
          workspace_path: workspacePath,
          metadata: (args["metadata"] as Record<string, unknown> | undefined) ?? undefined
        })) as Asset;
        bytesById.set(asset.id, args["content"] as Uint8Array);
        return { id: asset.id };
      },
      resolveAssetBytes: async (uri: string) => {
        const id = uri.replace(/^asset:\/\//, "").replace(/\.[A-Za-z0-9]+$/, "");
        return { bytes: bytesById.get(id) ?? null, attempts: [] };
      }
    } as unknown as ProcessingContext;
    const run = createCapabilityRun({ context, gate: UNGATED });
    const doc: TimelineDocument = {
      tempo: DEFAULT_TEMPO,
      tracks: [makeTrack({ id: "t1", type: "midi", name: "Drums", index: 0 })],
      clips: [
        makeClip({
          id: "c1",
          trackId: "t1",
          name: "Beat A",
          startMs: 0,
          durationMs: 2000,
          mediaType: "midi",
          sourceType: "imported",
          status: "generated",
          pattern: patternFromText("Kick: x... .... .... ....")
        }),
        makeClip({
          id: "c2",
          trackId: "t1",
          name: "Beat B",
          startMs: 2000,
          durationMs: 2000,
          mediaType: "midi",
          sourceType: "imported",
          status: "generated",
          pattern: patternFromText("Snare: .... x... .... ....")
        })
      ],
      markers: []
    };
    const seq = await TimelineSequence.create<TimelineSequence>({
      user_id: USER_ID,
      project_id: "proj-f43",
      name: "F43 Collision Test",
      fps: 30,
      width: 1920,
      height: 1080,
      duration_ms: 4000,
      document: JSON.stringify(doc)
    });

    const out = await applyOps(run, seq, doc, [
      {
        op: "ui_timeline_save_step_pattern",
        input: { clipId: "c1", name: "Drum Kit", kind: "pattern", folder: "Drums" }
      },
      {
        op: "ui_timeline_save_step_pattern",
        input: { clipId: "c2", name: "Drum-Kit", kind: "pattern", folder: "Drums" }
      },
      {
        op: "ui_timeline_list_step_patterns",
        input: {}
      }
    ]);

    expect(out.records[0]!.ok).toBe(true);
    expect(out.records[1]!.ok).toBe(true);
    expect(out.records[2]!.ok).toBe(true);
    expect(createCalls).toHaveLength(2);
    expect(createCalls[0]!["path"]).not.toBe(createCalls[1]!["path"]);
    expect(String(createCalls[0]!["path"])).toMatch(/^Step Patterns\/Patterns\/Drums\//);
    expect(String(createCalls[1]!["path"])).toMatch(/^Step Patterns\/Patterns\/Drums\//);

    const saved1 = out.records[0]!.result as { id: string; assetId?: string };
    const saved2 = out.records[1]!.result as { id: string; assetId?: string };
    expect(saved1.assetId).not.toBe(saved2.assetId);

    const entries = (
      out.records[2]!.result as { entries: Array<{ id: string; name: string; source: string }> }
    ).entries.filter((e) => e.source === "user");
    expect(entries.map((e) => e.name).sort()).toEqual(["Drum Kit", "Drum-Kit"]);
  });

  it("master pan: headless bridge writes and reports master.pan through ui_timeline_set_track and ui_timeline_get_state", async () => {
    const bridge = createTimelineToolBridge({
      sequence: { tracks: [], clips: [] }
    });
    const setTrack = bridge.tools.find((t) => t.name === "ui_timeline_set_track")!;
    const getState = bridge.tools.find((t) => t.name === "ui_timeline_get_state")!;

    const before = (await getState.execute({})) as { master: { volumeDb: number; pan?: number } };
    expect(before.master.pan).toBe(0);

    const res = (await setTrack.execute({ track: "master", pan: -0.4 })) as {
      ok: boolean;
      master: { volumeDb: number; pan?: number };
    };
    expect(res.ok).toBe(true);
    expect(res.master.pan).toBe(-0.4);
    expect(bridge.finalState().master?.pan).toBe(-0.4);

    const after = (await getState.execute({})) as { master: { volumeDb: number; pan?: number } };
    expect(after.master.pan).toBe(-0.4);
  });
});
