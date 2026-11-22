/**
 * SQ43 Step Pattern Library Folder Operations — Headless bridge, server persistence,
 * CodeAct 12-char ID compaction boundary, and schema/search discovery.
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
  makeClip,
  makeTrack,
  patternFromText
} from "@nodetool-ai/timeline";
import { createCapabilityRun, UNGATED } from "../src/capabilities/invoke.js";
import { createTimelineToolBridge } from "../src/capabilities/timeline-bridge.js";
import {
  applyOps,
  isReadOnlyRecord
} from "../src/capabilities/timeline-operations.js";
import { module as timelines } from "../src/capabilities/timelines.js";
import { EDIT_TIMELINE_SCHEMA } from "../src/capabilities/timelines.specs.js";
import { compactResourceIds } from "../src/codeact/compact-ids.js";
import { searchTools } from "../src/tools/tool-search.js";
import { focusedSurfaceTools } from "./fixtures/focused-surface-tools.js";

const USER_ID = "sq43-folder-user";

function makeServerAssetContext(projectId = "proj-sq43") {
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

function makeDoc(): TimelineDocument {
  return {
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
        pattern: patternFromText("Kick: x... x... x... x...", { name: "Club Beat" })
      })
    ],
    markers: []
  };
}

describe("SQ43 step pattern folder operations (agents & server)", () => {
  beforeEach(() => initTestDb());
  afterEach(() => ModelObserver.clear());

  it("exposes all four folder tools on the headless bridge, searchTools, EDIT_TIMELINE_SCHEMA, and READ_ONLY_OPS", async () => {
    const bridge = createTimelineToolBridge();
    const names = bridge.tools.map((t) => t.name);
    for (const toolName of [
      "ui_timeline_create_step_pattern_folder",
      "ui_timeline_rename_step_pattern_folder",
      "ui_timeline_delete_step_pattern_folder",
      "ui_timeline_move_step_pattern"
    ]) {
      expect(names).toContain(toolName);
      expect(isReadOnlyRecord({ op: toolName, input: {} }, { ok: true })).toBe(true);
    }

    const catalog = (await focusedSurfaceTools("timeline")).map((t) => ({
      name: t.name,
      description: t.description
    }));
    const hits = searchTools(catalog, "+ui_timeline_ step pattern folder").map(
      (h) => h.name
    );
    expect(hits).toContain("ui_timeline_create_step_pattern_folder");
    expect(hits).toContain("ui_timeline_rename_step_pattern_folder");
    expect(hits).toContain("ui_timeline_delete_step_pattern_folder");
    expect(hits).toContain("ui_timeline_move_step_pattern");

    const desc = (
      EDIT_TIMELINE_SCHEMA.properties as Record<string, { description?: string }>
    )["ops"]!.description!;
    expect(desc).toContain("create_step_pattern_folder");
    expect(desc).toContain("rename_step_pattern_folder");
    expect(desc).toContain("delete_step_pattern_folder");
    expect(desc).toContain("move_step_pattern");
  });

  it("persists create, rename, move, and delete folder across separate applyOps calls using compacted 12-char IDs", async () => {
    const { context, bytesById } = makeServerAssetContext();
    const run = createCapabilityRun({ context, gate: UNGATED });
    const doc = makeDoc();
    const seq = await TimelineSequence.create<TimelineSequence>({
      user_id: USER_ID,
      project_id: "proj-sq43",
      name: "Folder Persist Test",
      fps: 30,
      width: 1920,
      height: 1080,
      duration_ms: 2000,
      document: JSON.stringify(doc)
    });

    // Call 1: create folder & nested subfolder (using compacted 12-char parent ID)
    const createParentOut = await applyOps(run, seq, doc, [
      {
        op: "ui_timeline_create_step_pattern_folder",
        input: { kind: "pattern", name: "Drums" }
      }
    ]);
    expect(createParentOut.records[0]!.ok).toBe(true);
    const compactedParent = compactResourceIds(createParentOut.records[0]!.result) as {
      id: string;
      folder: string;
    };
    expect(compactedParent.id).toMatch(/^[0-9a-f]{12}$/);
    expect(compactedParent.folder).toBe("Step Patterns/Patterns/Drums");

    // Call 2: create nested folder and save a pattern into it via 12-char IDs
    const createNestedOut = await applyOps(run, seq, doc, [
      {
        op: "ui_timeline_create_step_pattern_folder",
        input: { name: "Trap", parentFolder: compactedParent.id }
      }
    ]);
    expect(createNestedOut.records[0]!.ok).toBe(true);
    const compactedTrap = compactResourceIds(createNestedOut.records[0]!.result) as {
      id: string;
      folder: string;
    };
    expect(compactedTrap.id).toMatch(/^[0-9a-f]{12}$/);
    expect(compactedTrap.folder).toBe("Step Patterns/Patterns/Drums/Trap");

    const saveOut = await applyOps(run, seq, doc, [
      {
        op: "ui_timeline_save_step_pattern",
        input: {
          clipId: "c1",
          name: "808 Bounce",
          kind: "pattern",
          folder: compactedTrap.id
        }
      }
    ]);
    expect(saveOut.records[0]!.ok).toBe(true);
    const compactedSaved = compactResourceIds(saveOut.records[0]!.result) as {
      id: string;
      folder: string;
    };
    expect(compactedSaved.id).toMatch(/^[0-9a-f]{12}$/);
    expect(compactedSaved.folder).toBe("Step Patterns/Patterns/Drums/Trap");

    // Call 3: list returns both folders and user pattern (folder markers are NOT returned as pattern entries)
    const listOut = await applyOps(run, seq, doc, [
      { op: "ui_timeline_list_step_patterns", input: { kind: "pattern" } }
    ]);
    expect(listOut.records[0]!.ok).toBe(true);
    const listed = listOut.records[0]!.result as {
      entries: Array<{ id: string; name: string; source: string; folder?: string }>;
      folders: Array<{ id?: string; folder: string; name: string }>;
    };
    const userEntries = listed.entries.filter((e) => e.source === "user");
    expect(userEntries).toHaveLength(1);
    expect(userEntries[0]!.name).toBe("808 Bounce");
    expect(listed.folders.map((f) => f.folder)).toEqual([
      "Step Patterns/Patterns/Drums",
      "Step Patterns/Patterns/Drums/Trap"
    ]);

    // Call 4: rename parent folder via 12-char prefix -> updates nested folder & pattern bytes/metadata
    const renameOut = await applyOps(run, seq, doc, [
      {
        op: "ui_timeline_rename_step_pattern_folder",
        input: { folder: compactedParent.id, newName: "Percussion" }
      }
    ]);
    expect(renameOut.records[0]!.ok).toBe(true);
    expect(renameOut.records[0]!.result).toMatchObject({
      ok: true,
      previousFolder: "Step Patterns/Patterns/Drums",
      folder: "Step Patterns/Patterns/Percussion",
      movedPatternCount: 1
    });

    // Verify pattern asset JSON bytes & metadata both updated in DB/storage
    const patternRow = await Asset.find(USER_ID, compactedSaved.id);
    expect(patternRow).not.toBeNull();
    expect(
      (patternRow!.metadata?.["step_pattern"] as Record<string, unknown>)["folder"]
    ).toBe("Step Patterns/Patterns/Percussion/Trap");
    expect(decodeURIComponent(String(patternRow!.parent_id))).toContain(
      "Step Patterns/Patterns/Percussion/Trap"
    );
    const parsedBytes = JSON.parse(
      new TextDecoder().decode(bytesById.get(patternRow!.id)!)
    ) as { folder: string };
    expect(parsedBytes.folder).toBe("Step Patterns/Patterns/Percussion/Trap");

    // Call 5: create Bass folder, move pattern into Bass via 12-char IDs, then back into Percussion/Trap
    const createBassOut = await applyOps(run, seq, doc, [
      {
        op: "ui_timeline_create_step_pattern_folder",
        input: { kind: "pattern", name: "Bass" }
      }
    ]);
    const compactedBass = compactResourceIds(createBassOut.records[0]!.result) as {
      id: string;
    };

    const moveOut = await applyOps(run, seq, doc, [
      {
        op: "ui_timeline_move_step_pattern",
        input: { pattern: compactedSaved.id, folder: compactedBass.id }
      }
    ]);
    expect(moveOut.records[0]!.ok).toBe(true);
    expect(moveOut.records[0]!.result).toMatchObject({
      ok: true,
      previousFolder: "Step Patterns/Patterns/Percussion/Trap",
      folder: "Step Patterns/Patterns/Bass"
    });

    await applyOps(run, seq, doc, [
      {
        op: "ui_timeline_move_step_pattern",
        input: { pattern: compactedSaved.id, folder: compactedTrap.id }
      }
    ]);

    // Call 6: delete Percussion via 12-char ID -> moves pattern to root & deletes Percussion + Trap folder markers
    const deleteOut = await applyOps(run, seq, doc, [
      {
        op: "ui_timeline_delete_step_pattern_folder",
        input: { folder: compactedParent.id }
      }
    ]);
    expect(deleteOut.records[0]!.ok).toBe(true);
    expect(deleteOut.records[0]!.result).toMatchObject({
      ok: true,
      deletedFolder: "Step Patterns/Patterns/Percussion",
      parentFolder: "Step Patterns/Patterns",
      movedPatternCount: 1
    });

    // Verify in a fresh list call: pattern sits in root, only Bass folder remains
    const afterDelete = await applyOps(run, seq, doc, [
      { op: "ui_timeline_list_step_patterns", input: { kind: "pattern" } }
    ]);
    const afterList = afterDelete.records[0]!.result as {
      entries: Array<{ name: string; source: string; folder?: string }>;
      folders: Array<{ folder: string }>;
    };
    const movedUser = afterList.entries.filter((e) => e.source === "user");
    expect(movedUser).toHaveLength(1);
    expect(movedUser[0]!.folder).toBe("Step Patterns/Patterns");
    expect(afterList.folders.map((f) => f.folder)).toEqual([
      "Step Patterns/Patterns/Bass"
    ]);
  });

  it("folder ops through edit_timeline do not rewrite TimelineSequence.updated_at and reject ambiguous 12-char IDs", async () => {
    const { context, bytesById } = makeServerAssetContext("default");
    const run = createCapabilityRun({ context, gate: UNGATED });
    const doc = makeDoc();
    const seq = await TimelineSequence.create<TimelineSequence>({
      user_id: USER_ID,
      project_id: "default",
      name: "ReadOnly Folder Edit Test",
      fps: 30,
      width: 1920,
      height: 1080,
      duration_ms: 2000,
      document: JSON.stringify(doc)
    });

    const edit = timelines.exports.find((e) => e.spec.name === "edit_timeline")!;
    const res = (await edit.impl(run, {
      timeline_id: seq.id,
      ops: [{ op: "create_step_pattern_folder", kind: "pattern", name: "House" }]
    })) as { updated_at: string; applied: number; failed: number };
    expect(res.failed).toBe(0);
    expect(res.applied).toBe(1);
    expect(res.updated_at).toBe(seq.updated_at);

    // Seed two folder assets sharing a 12-char prefix
    const prefix = "abcdef123456";
    for (const [suffix, name] of [
      ["00000000000000000001", "One"],
      ["00000000000000000002", "Two"]
    ] as const) {
      const folderPath = `Step Patterns/Patterns/${name}`;
      const asset = new Asset({
        id: `${prefix}${suffix}`,
        user_id: USER_ID,
        project_id: "default",
        name: `folder-${name}.step-pattern.json`,
        content_type: STEP_PATTERN_ASSET_CONTENT_TYPE,
        metadata: {
          step_pattern_folder: { kind: "pattern", name, folder: folderPath }
        }
      });
      await asset.save();
      bytesById.set(
        asset.id,
        new TextEncoder().encode(
          JSON.stringify({
            version: 1,
            entryType: "folder",
            kind: "pattern",
            name,
            folder: folderPath
          })
        )
      );
    }

    const ambig = await applyOps(run, seq, doc, [
      {
        op: "ui_timeline_delete_step_pattern_folder",
        input: { folder: prefix }
      }
    ]);
    expect(ambig.records[0]!.ok).toBe(false);
    expect(ambig.records[0]!.error).toMatch(/matches 2 folders/i);
  });
});
