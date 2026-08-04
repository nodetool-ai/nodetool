/**
 * Tests for the TimelineSequenceVersion model.
 *
 * Covers: snapshot field copying and version assignment, listForTimeline
 * ordering/filtering/limit, findByVersion, autosave pruning, bulk delete, and
 * the unique-index retry when two writers pick the same version number.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ModelObserver } from "../src/base-model.js";
import { initTestDb } from "../src/db.js";
import { TimelineSequence } from "../src/timeline-sequence.js";
import { TimelineSequenceVersion } from "../src/timeline-sequence-version.js";

const DOC = JSON.stringify({
  tracks: [{ id: "t1" }],
  clips: [],
  markers: []
});

async function createSequence(id = "seq-1"): Promise<TimelineSequence> {
  return TimelineSequence.create<TimelineSequence>({
    id,
    user_id: "user-1",
    project_id: "proj-1",
    name: "My sequence",
    fps: 24,
    width: 1280,
    height: 720,
    duration_ms: 5000,
    document: DOC
  });
}

describe("TimelineSequenceVersion model", () => {
  beforeEach(() => {
    initTestDb();
  });
  afterEach(() => ModelObserver.clear());

  it("snapshot copies the sequence fields and starts at version 1", async () => {
    const seq = await createSequence();
    const snap = await TimelineSequenceVersion.snapshot(seq, {
      saveType: "manual",
      name: "before edit"
    });

    expect(snap.timeline_id).toBe(seq.id);
    expect(snap.user_id).toBe("user-1");
    expect(snap.name).toBe("before edit");
    expect(snap.save_type).toBe("manual");
    expect(snap.fps).toBe(24);
    expect(snap.width).toBe(1280);
    expect(snap.height).toBe(720);
    expect(snap.duration_ms).toBe(5000);
    expect(snap.document).toBe(DOC);
    expect(snap.version).toBe(1);
    expect(snap.id).toBeTruthy();
    expect(snap.created_at).toBeTruthy();
  });

  it("snapshot assigns monotonically increasing versions per timeline", async () => {
    const seq = await createSequence();
    const other = await createSequence("seq-2");

    const first = await TimelineSequenceVersion.snapshot(seq, {
      saveType: "manual"
    });
    const second = await TimelineSequenceVersion.snapshot(seq, {
      saveType: "autosave"
    });
    const otherFirst = await TimelineSequenceVersion.snapshot(other, {
      saveType: "manual"
    });

    expect(first.version).toBe(1);
    expect(second.version).toBe(2);
    expect(second.name).toBeNull();
    // Versions are per timeline, not global.
    expect(otherFirst.version).toBe(1);
    expect(await TimelineSequenceVersion.nextVersion(seq.id)).toBe(3);
  });

  it("retries once when a concurrent writer takes the version number", async () => {
    const seq = await createSequence();
    await TimelineSequenceVersion.snapshot(seq, { saveType: "manual" });

    // Stand in for the racing writer: nextVersion() reports 2, but by the time
    // the insert runs version 2 is already taken, so the unique index rejects
    // it and the retry lands on 3.
    const original = TimelineSequenceVersion.nextVersion;
    let calls = 0;
    TimelineSequenceVersion.nextVersion = async (timelineId: string) => {
      const next = await original.call(TimelineSequenceVersion, timelineId);
      if (calls++ === 0) {
        await TimelineSequenceVersion.create<TimelineSequenceVersion>({
          timeline_id: timelineId,
          user_id: "user-2",
          version: next,
          save_type: "manual",
          document: DOC
        });
      }
      return next;
    };

    try {
      const snap = await TimelineSequenceVersion.snapshot(seq, {
        saveType: "manual"
      });
      expect(snap.version).toBe(3);
      expect(calls).toBe(2);
    } finally {
      TimelineSequenceVersion.nextVersion = original;
    }
  });

  it("rethrows errors that are not unique-constraint violations", async () => {
    const seq = await createSequence();
    const original = TimelineSequenceVersion.nextVersion;
    TimelineSequenceVersion.nextVersion = async () => {
      throw new Error("db is on fire");
    };
    try {
      await expect(
        TimelineSequenceVersion.snapshot(seq, { saveType: "manual" })
      ).rejects.toThrow("db is on fire");
    } finally {
      TimelineSequenceVersion.nextVersion = original;
    }
  });

  it("listForTimeline returns newest first and honours limit and saveType", async () => {
    const seq = await createSequence();
    await TimelineSequenceVersion.snapshot(seq, { saveType: "manual" });
    await TimelineSequenceVersion.snapshot(seq, { saveType: "autosave" });
    await TimelineSequenceVersion.snapshot(seq, { saveType: "autosave" });
    await TimelineSequenceVersion.snapshot(seq, { saveType: "restore" });
    // A sibling timeline's versions must not leak in.
    const other = await createSequence("seq-2");
    await TimelineSequenceVersion.snapshot(other, { saveType: "manual" });

    const all = await TimelineSequenceVersion.listForTimeline(seq.id);
    expect(all.map((v: TimelineSequenceVersion) => v.version)).toEqual([
      4, 3, 2, 1
    ]);

    const limited = await TimelineSequenceVersion.listForTimeline(seq.id, {
      limit: 2
    });
    expect(limited.map((v: TimelineSequenceVersion) => v.version)).toEqual([
      4, 3
    ]);

    const autosaves = await TimelineSequenceVersion.listForTimeline(seq.id, {
      saveType: "autosave"
    });
    expect(autosaves.map((v: TimelineSequenceVersion) => v.version)).toEqual([
      3, 2
    ]);
  });

  it("findByVersion returns the row or null", async () => {
    const seq = await createSequence();
    await TimelineSequenceVersion.snapshot(seq, { saveType: "manual" });

    const found = await TimelineSequenceVersion.findByVersion(seq.id, 1);
    expect(found?.version).toBe(1);
    expect(found?.timeline_id).toBe(seq.id);

    expect(await TimelineSequenceVersion.findByVersion(seq.id, 99)).toBeNull();
    expect(await TimelineSequenceVersion.findByVersion("nope", 1)).toBeNull();
  });

  it("pruneAutosaves drops the oldest autosaves and keeps manual and restore", async () => {
    const seq = await createSequence();
    await TimelineSequenceVersion.snapshot(seq, { saveType: "manual" }); // v1
    await TimelineSequenceVersion.snapshot(seq, { saveType: "autosave" }); // v2
    await TimelineSequenceVersion.snapshot(seq, { saveType: "autosave" }); // v3
    await TimelineSequenceVersion.snapshot(seq, { saveType: "restore" }); // v4
    await TimelineSequenceVersion.snapshot(seq, { saveType: "autosave" }); // v5

    await TimelineSequenceVersion.pruneAutosaves(seq.id, 1);

    const remaining = await TimelineSequenceVersion.listForTimeline(seq.id);
    expect(remaining.map((v: TimelineSequenceVersion) => v.version)).toEqual([
      5, 4, 1
    ]);
  });

  it("pruneAutosaves is a no-op when under the limit", async () => {
    const seq = await createSequence();
    await TimelineSequenceVersion.snapshot(seq, { saveType: "autosave" });
    await TimelineSequenceVersion.pruneAutosaves(seq.id, 5);
    expect((await TimelineSequenceVersion.listForTimeline(seq.id)).length).toBe(
      1
    );
  });

  it("deleteForTimeline removes only that timeline's versions", async () => {
    const seq = await createSequence();
    const other = await createSequence("seq-2");
    await TimelineSequenceVersion.snapshot(seq, { saveType: "manual" });
    await TimelineSequenceVersion.snapshot(seq, { saveType: "autosave" });
    await TimelineSequenceVersion.snapshot(other, { saveType: "manual" });

    await TimelineSequenceVersion.deleteForTimeline(seq.id);

    expect(await TimelineSequenceVersion.listForTimeline(seq.id)).toEqual([]);
    expect(
      (await TimelineSequenceVersion.listForTimeline(other.id)).length
    ).toBe(1);
  });
});
