/**
 * Atomic server-side step pattern folder rename & delete tests (packages/agents).
 *
 * Verifies that a failure halfway through updating patterns or deleting folder
 * markers rolls back the database transaction and leaves no partial move in DB
 * rows or stored asset bytes.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import {
  Asset,
  ModelObserver,
  TimelineSequence,
  getRawDb,
  initTestDb,
  type TimelineDocument
} from "@nodetool-ai/models";
import {
  DEFAULT_MIDI_INSTRUMENT,
  DEFAULT_TEMPO,
  makeClip,
  makeTrack,
  patternFromText
} from "@nodetool-ai/timeline";
import { createCapabilityRun, UNGATED } from "../src/capabilities/invoke.js";
import { applyOps } from "../src/capabilities/timeline-operations.js";

const USER_ID = "sq43-atomic-user";

function makeServerAssetContext(projectId = "proj-atomic") {
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
    updateAssetBytes: async (args: { assetId: string; content: Uint8Array }) => {
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
        pattern: patternFromText("Kick: x... x... x... x...", { name: "Beat" })
      })
    ],
    markers: []
  };
}

async function seedTree() {
  const { context, bytesById } = makeServerAssetContext();
  const run = createCapabilityRun({ context, gate: UNGATED });
  const doc = makeDoc();
  const seq = await TimelineSequence.create<TimelineSequence>({
    user_id: USER_ID,
    project_id: "proj-atomic",
    name: "Atomic Folder Test",
    fps: 30,
    width: 1920,
    height: 1080,
    duration_ms: 2000,
    document: JSON.stringify(doc)
  });

  const drums = (
    await applyOps(run, seq, doc, [
      { op: "ui_timeline_create_step_pattern_folder", input: { kind: "pattern", name: "Drums" } }
    ])
  ).records[0]!.result as { id: string };
  const trap = (
    await applyOps(run, seq, doc, [
      {
        op: "ui_timeline_create_step_pattern_folder",
        input: { name: "Trap", parentFolder: drums.id }
      }
    ])
  ).records[0]!.result as { id: string };
  const patternA = (
    await applyOps(run, seq, doc, [
      {
        op: "ui_timeline_save_step_pattern",
        input: { clipId: "c1", name: "Beat A", kind: "pattern", folder: drums.id }
      }
    ])
  ).records[0]!.result as { id: string };
  const patternB = (
    await applyOps(run, seq, doc, [
      {
        op: "ui_timeline_save_step_pattern",
        input: { clipId: "c1", name: "Beat B", kind: "pattern", folder: trap.id }
      }
    ])
  ).records[0]!.result as { id: string };

  return { run, seq, doc, bytesById, drumsId: drums.id, trapId: trap.id, patternAId: patternA.id, patternBId: patternB.id };
}

function folderInBytes(bytesById: Map<string, Uint8Array>, id: string): string {
  return (JSON.parse(new TextDecoder().decode(bytesById.get(id)!)) as { folder: string }).folder;
}

describe("SQ43 atomic server step pattern folder rename & delete", () => {
  beforeEach(() => initTestDb());
  afterEach(() => ModelObserver.clear());

  it("rolls back the entire folder rename when updating the second pattern fails halfway", async () => {
    const { run, seq, doc, bytesById, drumsId, trapId, patternAId, patternBId } = await seedTree();
    const drumsBefore = (await Asset.find(USER_ID, drumsId))!;
    const patternABefore = (await Asset.find(USER_ID, patternAId))!;

    getRawDb().exec(`
      CREATE TRIGGER fail_pattern_b_rename
      BEFORE UPDATE ON nodetool_assets
      WHEN NEW.id = '${patternBId}'
      BEGIN
        SELECT RAISE(ABORT, 'simulated halfway rename failure');
      END;
    `);

    const outcome = await applyOps(run, seq, doc, [
      {
        op: "ui_timeline_rename_step_pattern_folder",
        input: { folder: drumsId, newName: "Percussion" }
      }
    ]);

    expect(outcome.records[0]!.ok).toBe(false);
    expect(outcome.records[0]!.error).toContain("simulated halfway rename failure");

    // Zero partial move in DB rows
    const drumsAfter = (await Asset.find(USER_ID, drumsId))!;
    const trapAfter = (await Asset.find(USER_ID, trapId))!;
    const patternAAfter = (await Asset.find(USER_ID, patternAId))!;
    const patternBAfter = (await Asset.find(USER_ID, patternBId))!;

    expect((drumsAfter.metadata?.["step_pattern_folder"] as Record<string, unknown>)["folder"]).toBe(
      "Step Patterns/Patterns/Drums"
    );
    expect(drumsAfter.parent_id).toBe(drumsBefore.parent_id);
    expect((trapAfter.metadata?.["step_pattern_folder"] as Record<string, unknown>)["folder"]).toBe(
      "Step Patterns/Patterns/Drums/Trap"
    );
    expect((patternAAfter.metadata?.["step_pattern"] as Record<string, unknown>)["folder"]).toBe(
      "Step Patterns/Patterns/Drums"
    );
    expect(patternAAfter.parent_id).toBe(patternABefore.parent_id);
    expect((patternBAfter.metadata?.["step_pattern"] as Record<string, unknown>)["folder"]).toBe(
      "Step Patterns/Patterns/Drums/Trap"
    );

    // Zero partial rewrite in stored JSON bytes
    expect(folderInBytes(bytesById, drumsId)).toBe("Step Patterns/Patterns/Drums");
    expect(folderInBytes(bytesById, trapId)).toBe("Step Patterns/Patterns/Drums/Trap");
    expect(folderInBytes(bytesById, patternAId)).toBe("Step Patterns/Patterns/Drums");
    expect(folderInBytes(bytesById, patternBId)).toBe("Step Patterns/Patterns/Drums/Trap");
  });

  it("rolls back moved patterns when deleting a folder marker fails halfway", async () => {
    const { run, seq, doc, bytesById, drumsId, trapId, patternAId, patternBId } = await seedTree();

    getRawDb().exec(`
      CREATE TRIGGER fail_drums_marker_delete
      BEFORE DELETE ON nodetool_assets
      WHEN OLD.id = '${drumsId}'
      BEGIN
        SELECT RAISE(ABORT, 'simulated halfway delete failure');
      END;
    `);

    const outcome = await applyOps(run, seq, doc, [
      {
        op: "ui_timeline_delete_step_pattern_folder",
        input: { folder: drumsId }
      }
    ]);

    expect(outcome.records[0]!.ok).toBe(false);
    expect(outcome.records[0]!.error).toContain("simulated halfway delete failure");

    // Both folder markers remain intact and neither pattern moved
    expect(await Asset.find(USER_ID, drumsId)).not.toBeNull();
    expect(await Asset.find(USER_ID, trapId)).not.toBeNull();
    const patternAAfter = (await Asset.find(USER_ID, patternAId))!;
    const patternBAfter = (await Asset.find(USER_ID, patternBId))!;
    expect((patternAAfter.metadata?.["step_pattern"] as Record<string, unknown>)["folder"]).toBe(
      "Step Patterns/Patterns/Drums"
    );
    expect((patternBAfter.metadata?.["step_pattern"] as Record<string, unknown>)["folder"]).toBe(
      "Step Patterns/Patterns/Drums/Trap"
    );
    expect(folderInBytes(bytesById, patternAId)).toBe("Step Patterns/Patterns/Drums");
    expect(folderInBytes(bytesById, patternBId)).toBe("Step Patterns/Patterns/Drums/Trap");
  });

  it("rolls back earlier pattern moves when deleting a folder fails halfway on the second pattern update", async () => {
    const { run, seq, doc, bytesById, drumsId, trapId, patternAId, patternBId } = await seedTree();

    getRawDb().exec(`
      CREATE TRIGGER fail_pattern_b_delete_move
      BEFORE UPDATE ON nodetool_assets
      WHEN NEW.id = '${patternBId}'
      BEGIN
        SELECT RAISE(ABORT, 'simulated pattern move failure');
      END;
    `);

    const outcome = await applyOps(run, seq, doc, [
      {
        op: "ui_timeline_delete_step_pattern_folder",
        input: { folder: drumsId }
      }
    ]);

    expect(outcome.records[0]!.ok).toBe(false);
    expect(outcome.records[0]!.error).toContain("simulated pattern move failure");

    expect(await Asset.find(USER_ID, drumsId)).not.toBeNull();
    expect(await Asset.find(USER_ID, trapId)).not.toBeNull();
    const patternAAfter = (await Asset.find(USER_ID, patternAId))!;
    expect((patternAAfter.metadata?.["step_pattern"] as Record<string, unknown>)["folder"]).toBe(
      "Step Patterns/Patterns/Drums"
    );
    expect(folderInBytes(bytesById, patternAId)).toBe("Step Patterns/Patterns/Drums");
    expect(folderInBytes(bytesById, patternBId)).toBe("Step Patterns/Patterns/Drums/Trap");
  });
});
