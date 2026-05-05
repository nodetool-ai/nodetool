/**
 * Tests for the TimelineSequence model.
 *
 * Covers: create, read, list-by-user, list-by-project, update bumps
 * updated_at, delete, JSON round-trip preserving all fields including
 * optional ones.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { initTestDb } from "../src/db.js";
import { TimelineSequence } from "../src/timeline-sequence.js";
import type { TimelineDocument } from "../src/timeline-sequence.js";
import type {
  TimelineSequence as TimelineSequenceDoc,
  TimelineTrack,
  TimelineClip,
  TimelineMarker
} from "@nodetool-ai/timeline";

// ── Helpers ───────────────────────────────────────────────────────────

function setup() {
  initTestDb();
}

function makeDocument(overrides: Partial<TimelineDocument> = {}): TimelineDocument {
  return {
    tracks: [],
    clips: [],
    markers: [],
    ...overrides
  };
}

async function createSeq(
  userId = "u1",
  projectId = "p1",
  name = "My Sequence",
  doc: TimelineDocument = makeDocument()
): Promise<TimelineSequence> {
  return TimelineSequence.create<TimelineSequence>({
    user_id: userId,
    project_id: projectId,
    name,
    document: JSON.stringify(doc)
  });
}

// ── Tests ─────────────────────────────────────────────────────────────

describe("TimelineSequence model", () => {
  beforeEach(setup);

  // ── Create & defaults ───────────────────────────────────────────────

  it("creates with defaults", async () => {
    const seq = await createSeq();
    expect(seq.id).toBeTruthy();
    expect(seq.user_id).toBe("u1");
    expect(seq.project_id).toBe("p1");
    expect(seq.name).toBe("My Sequence");
    expect(seq.fps).toBe(30);
    expect(seq.width).toBe(1920);
    expect(seq.height).toBe(1080);
    expect(seq.duration_ms).toBe(0);
    expect(seq.workflow_id).toBeNull();
    expect(seq.created_at).toBeTruthy();
    expect(seq.updated_at).toBeTruthy();
  });

  it("creates with custom fields", async () => {
    const seq = await TimelineSequence.create<TimelineSequence>({
      user_id: "u2",
      project_id: "p2",
      workflow_id: "wf1",
      name: "Custom",
      fps: 60,
      width: 1280,
      height: 720,
      duration_ms: 5000,
      document: JSON.stringify(makeDocument())
    });
    expect(seq.fps).toBe(60);
    expect(seq.width).toBe(1280);
    expect(seq.height).toBe(720);
    expect(seq.duration_ms).toBe(5000);
    expect(seq.workflow_id).toBe("wf1");
  });

  // ── Read ────────────────────────────────────────────────────────────

  it("findById returns existing sequence", async () => {
    const seq = await createSeq();
    const found = await TimelineSequence.findById(seq.id);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(seq.id);
    expect(found!.name).toBe("My Sequence");
  });

  it("findById returns null for missing id", async () => {
    const found = await TimelineSequence.findById("nonexistent");
    expect(found).toBeNull();
  });

  // ── List by user ────────────────────────────────────────────────────

  it("listByUser returns all sequences for a user", async () => {
    await createSeq("u1", "p1", "S1");
    await createSeq("u1", "p1", "S2");
    await createSeq("u2", "p1", "S3");

    const seqs = await TimelineSequence.listByUser("u1");
    expect(seqs).toHaveLength(2);
    const names = seqs.map((s) => s.name).sort();
    expect(names).toEqual(["S1", "S2"]);
  });

  it("listByUser returns empty array for unknown user", async () => {
    const seqs = await TimelineSequence.listByUser("nobody");
    expect(seqs).toHaveLength(0);
  });

  it("listByUser respects limit", async () => {
    await createSeq("u1", "p1", "S1");
    await createSeq("u1", "p1", "S2");
    await createSeq("u1", "p1", "S3");

    const seqs = await TimelineSequence.listByUser("u1", 2);
    expect(seqs).toHaveLength(2);
  });

  // ── List by project ─────────────────────────────────────────────────

  it("listByProject returns sequences for a project", async () => {
    await createSeq("u1", "p1", "S1");
    await createSeq("u1", "p1", "S2");
    await createSeq("u1", "p2", "S3");

    const seqs = await TimelineSequence.listByProject("p1");
    expect(seqs).toHaveLength(2);
    const names = seqs.map((s) => s.name).sort();
    expect(names).toEqual(["S1", "S2"]);
  });

  it("listByProject returns empty array for unknown project", async () => {
    const seqs = await TimelineSequence.listByProject("nobody");
    expect(seqs).toHaveLength(0);
  });

  it("listByProject respects limit", async () => {
    await createSeq("u1", "p1", "S1");
    await createSeq("u1", "p1", "S2");
    await createSeq("u1", "p1", "S3");

    const seqs = await TimelineSequence.listByProject("p1", 2);
    expect(seqs).toHaveLength(2);
  });

  // ── Update bumps updated_at ─────────────────────────────────────────

  it("update bumps updated_at", async () => {
    const seq = await createSeq();
    const original = seq.updated_at;

    await new Promise((r) => setTimeout(r, 10));

    const updated = await TimelineSequence.update(seq.id, { name: "Renamed" });
    expect(updated).not.toBeNull();
    expect(updated!.name).toBe("Renamed");
    expect(updated!.updated_at >= original).toBe(true);
  });

  it("update returns null for unknown id", async () => {
    const result = await TimelineSequence.update("nonexistent", { name: "X" });
    expect(result).toBeNull();
  });

  it("update rejects invalid JSON in document", async () => {
    const seq = await createSeq();
    await expect(
      TimelineSequence.update(seq.id, { document: "not json{{" })
    ).rejects.toThrow();
  });

  // ── Delete ──────────────────────────────────────────────────────────

  it("delete removes the sequence", async () => {
    const seq = await createSeq();
    await seq.delete();
    const found = await TimelineSequence.findById(seq.id);
    expect(found).toBeNull();
  });

  // ── touchUpdatedAt ──────────────────────────────────────────────────

  it("touchUpdatedAt bumps updated_at without other changes", async () => {
    const seq = await createSeq();
    const original = seq.updated_at;

    await new Promise((r) => setTimeout(r, 10));
    await seq.touchUpdatedAt();

    const reloaded = await TimelineSequence.findById(seq.id);
    expect(reloaded!.updated_at >= original).toBe(true);
    expect(reloaded!.name).toBe("My Sequence");
  });

  // ── JSON round-trip ─────────────────────────────────────────────────

  it("toDocument / fromDocument round-trips preserve all fields", async () => {
    const track: TimelineTrack = {
      id: "t1",
      name: "Video",
      type: "video",
      index: 0,
      visible: true,
      locked: false,
      muted: false,
      solo: false,
      heightPx: 80
    };
    const clip: TimelineClip = {
      id: "c1",
      trackId: "t1",
      name: "Clip 1",
      startMs: 0,
      durationMs: 2000,
      inPointMs: 0,
      outPointMs: 2000,
      mediaType: "video",
      sourceType: "generated",
      workflowId: "wf1",
      paramOverrides: { prompt: "sunset" },
      status: "draft",
      locked: false,
      muted: false,
      hidden: false,
      versions: [],
      opacity: 0.8,
      blendMode: "normal",
      speedMultiplier: 1,
      volumeDb: -3,
      fadeInMs: 100,
      fadeOutMs: 100
    };
    const marker: TimelineMarker = {
      id: "m1",
      timeMs: 1000,
      label: "Beat drop",
      color: "#ff0000",
      note: "important"
    };

    const doc: TimelineDocument = { tracks: [track], clips: [clip], markers: [marker] };
    const seq = await TimelineSequence.create<TimelineSequence>({
      user_id: "u1",
      project_id: "p1",
      name: "Round-trip",
      document: JSON.stringify(doc)
    });

    const parsed = seq.toDocument();
    expect(parsed.tracks).toHaveLength(1);
    expect(parsed.tracks[0]).toEqual(track);
    expect(parsed.clips).toHaveLength(1);
    expect(parsed.clips[0]).toEqual(clip);
    expect(parsed.markers).toHaveLength(1);
    expect(parsed.markers[0]).toEqual(marker);
  });

  it("toDocument preserves optional clip fields", async () => {
    const clip: TimelineClip = {
      id: "c2",
      trackId: "t1",
      name: "Minimal",
      startMs: 500,
      durationMs: 1000,
      mediaType: "audio",
      sourceType: "imported",
      status: "locked",
      locked: true,
      versions: []
    };
    const doc: TimelineDocument = { tracks: [], clips: [clip], markers: [] };
    const seq = await TimelineSequence.create<TimelineSequence>({
      user_id: "u1",
      project_id: "p1",
      name: "Minimal clip",
      document: JSON.stringify(doc)
    });
    const parsed = seq.toDocument();
    expect(parsed.clips[0]).toEqual(clip);
    // Optional fields should be undefined, not null
    expect(parsed.clips[0].workflowId).toBeUndefined();
    expect(parsed.clips[0].opacity).toBeUndefined();
  });

  it("toTimelineSequence converts correctly", async () => {
    const seq = await TimelineSequence.create<TimelineSequence>({
      user_id: "u1",
      project_id: "p1",
      workflow_id: "wf1",
      name: "Seq",
      fps: 24,
      width: 1280,
      height: 720,
      duration_ms: 3000,
      document: JSON.stringify(makeDocument())
    });

    const tls: TimelineSequenceDoc = seq.toTimelineSequence();
    expect(tls.id).toBe(seq.id);
    expect(tls.projectId).toBe("p1");
    expect(tls.workflowId).toBe("wf1");
    expect(tls.fps).toBe(24);
    expect(tls.width).toBe(1280);
    expect(tls.height).toBe(720);
    expect(tls.durationMs).toBe(3000);
  });

  it("fromTimelineSequence round-trips via toTimelineSequence", async () => {
    const original: TimelineSequenceDoc = {
      id: "original-id",
      projectId: "p1",
      workflowId: "wf1",
      name: "Original",
      fps: 30,
      width: 1920,
      height: 1080,
      durationMs: 10000,
      tracks: [],
      clips: [],
      markers: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const row = TimelineSequence.fromTimelineSequence("u1", original);
    // Persist the row
    await row.save();

    const loaded = await TimelineSequence.findById("original-id");
    expect(loaded).not.toBeNull();

    const roundTripped = loaded!.toTimelineSequence();
    expect(roundTripped.id).toBe(original.id);
    expect(roundTripped.projectId).toBe(original.projectId);
    expect(roundTripped.workflowId).toBe(original.workflowId);
    expect(roundTripped.name).toBe(original.name);
    expect(roundTripped.fps).toBe(original.fps);
    expect(roundTripped.durationMs).toBe(original.durationMs);
  });

  it("fromDocument sets document from a valid TimelineDocument", async () => {
    const seq = await createSeq();
    const doc = { tracks: [], clips: [], markers: [] };
    seq.fromDocument(doc);
    expect(seq.toDocument()).toEqual(doc);
  });

  it("rejects invalid JSON document on save", async () => {
    const seq = await createSeq();
    seq.document = "not valid json{{";
    await expect(seq.save()).rejects.toThrow();
  });

  it("rejects structurally invalid document on save", async () => {
    const seq = await createSeq();
    seq.document = JSON.stringify({ tracks: [], clips: "not-an-array" });
    await expect(seq.save()).rejects.toThrow(
      "document must contain tracks, clips, and markers arrays"
    );
  });
});
