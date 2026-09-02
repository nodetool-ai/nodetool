/**
 * The `timelines` capability module.
 *
 * Three things must hold for a port: the module is well-formed and classified
 * the way the gate's map classifies it, each spec is byte-identical to the
 * wire surface it replaces, and the implementations still do the work.
 * `tests/timeline-version-tools.test.ts` and `tests/document-edit-tools.test.ts`
 * run unmodified against those classes and are the behavioural net; the round
 * trips here prove the same work happens when a run invokes the capability
 * directly.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import {
  Asset,
  ModelObserver,
  TimelineSequence,
  TimelineSequenceVersion,
  initTestDb
} from "@nodetool-ai/models";
import { module as timelines } from "../src/capabilities/timelines.js";
import { createCapabilityRun, UNGATED } from "../src/capabilities/invoke.js";
import { capabilityModuleIssues } from "../src/capabilities/registry.js";
import { toolForCapabilityName } from "../src/capabilities/lazy-tool.js";
import { permissionCategoryFor } from "../src/tools/tool-permissions.js";
import { Tool } from "../src/tools/base-tool.js";

const ctx = (userId = "u1") => ({ userId }) as unknown as ProcessingContext;

const run = (userId = "u1") =>
  createCapabilityRun({ context: ctx(userId), gate: UNGATED });

const document = () =>
  JSON.stringify({
    tracks: [
      {
        id: "track-1",
        name: "Video 1",
        type: "video",
        index: 0,
        visible: true,
        locked: false
      }
    ],
    clips: [
      {
        id: "clip-1",
        trackId: "track-1",
        name: "Shot 1",
        startMs: 0,
        durationMs: 2000,
        mediaType: "video",
        sourceType: "imported",
        status: "generated",
        locked: false,
        versions: []
      }
    ],
    markers: []
  });

async function makeTimeline(
  overrides: Record<string, unknown> = {}
): Promise<TimelineSequence> {
  return TimelineSequence.create<TimelineSequence>({
    user_id: "u1",
    project_id: "default",
    name: "Trailer cut",
    fps: 30,
    width: 1920,
    height: 1080,
    duration_ms: 2000,
    document: document(),
    ...overrides
  });
}

/** Every capability paired with the `Tool` the belt builds for it. */
const PAIRS: Array<[string, () => Tool]> = [
  ["list_timelines", () => toolForCapabilityName("list_timelines")],
  ["create_timeline", () => toolForCapabilityName("create_timeline")],
  ["get_timeline", () => toolForCapabilityName("get_timeline")],
  [
    "list_timeline_versions",
    () => toolForCapabilityName("list_timeline_versions")
  ],
  ["get_timeline_version", () => toolForCapabilityName("get_timeline_version")],
  [
    "create_timeline_version",
    () => toolForCapabilityName("create_timeline_version")
  ],
  [
    "restore_timeline_version",
    () => toolForCapabilityName("restore_timeline_version")
  ],
  [
    "delete_timeline_version",
    () => toolForCapabilityName("delete_timeline_version")
  ],
  ["edit_timeline", () => toolForCapabilityName("edit_timeline")],
  ["validate_timeline", () => toolForCapabilityName("validate_timeline")],
  [
    "set_timeline_document",
    () => toolForCapabilityName("set_timeline_document")
  ]
];

describe("timelines capability module", () => {
  it("is well-formed and declares itself as timelines", () => {
    expect(capabilityModuleIssues("timelines", timelines)).toEqual([]);
    expect(timelines.exports.map((e) => e.spec.name)).toEqual([
      "list_timelines",
      "create_timeline",
      "get_timeline",
      "list_timeline_versions",
      "get_timeline_version",
      "create_timeline_version",
      "restore_timeline_version",
      "delete_timeline_version",
      "edit_timeline",
      "validate_timeline",
      "set_timeline_document",
      "preview_timeline_frame",
      "delete_timeline"
    ]);
  });

  it("classifies every export the way the gate's map does", () => {
    for (const entry of timelines.exports) {
      expect([entry.spec.name, entry.spec.category]).toEqual([
        entry.spec.name,
        permissionCategoryFor(entry.spec.name)
      ]);
    }
  });

  it("keeps the wire surface the belt offers", () => {
    for (const [name, make] of PAIRS) {
      const spec = timelines.exports.find((e) => e.spec.name === name)?.spec;
      const tool = make();
      expect(spec).toBeDefined();
      expect(tool.name).toBe(name);
      expect(tool.description).toBe(spec?.description);
      expect(tool.inputSchema).toEqual(spec?.inputSchema);
    }
  });

  it("renders the user-facing messages", () => {
    const args = { timeline_id: "t1", version: 3, ops: [{ op: "get_state" }] };
    for (const [name, make] of PAIRS) {
      const spec = timelines.exports.find((e) => e.spec.name === name)!.spec;
      expect([name, spec.userMessage?.(args)]).toEqual([
        name,
        make().userMessage(args)
      ]);
    }
  });
});

describe("timelines capability behaviour", () => {
  beforeEach(() => initTestDb());
  afterEach(() => ModelObserver.clear());

  it("lists, filters, and hides another user's sequences", async () => {
    const trailer = await makeTimeline();
    await makeTimeline({ name: "Behind the scenes" });

    const all = (await run().invoke("list_timelines", {})) as {
      timelines: Array<{ id: string }>;
    };
    expect(all.timelines).toHaveLength(2);

    const filtered = (await run().invoke("list_timelines", {
      query: "trail"
    })) as { timelines: Array<{ id: string; fps: number }> };
    expect(filtered.timelines).toEqual([
      expect.objectContaining({ id: trailer.id, fps: 30 })
    ]);

    const other = (await run("other").invoke("list_timelines", {})) as {
      timelines: unknown[];
    };
    expect(other.timelines).toEqual([]);
  });

  it("creates an empty sequence the caller can then edit", async () => {
    // Every other document surface could make one and timelines could not, so
    // "cut these clips together" meant editing whatever sequence the user had
    // open. A live session did that and wiped six clips of somebody's work.
    const created = (await run().invoke("create_timeline", {
      name: "The Last Drop",
      width: 1080,
      height: 1920
    })) as { ok: boolean; timeline_id: string; width: number; height: number };
    expect(created.ok).toBe(true);
    expect(created).toMatchObject({ width: 1080, height: 1920 });

    const read = (await run().invoke("get_timeline", {
      timeline_id: created.timeline_id
    })) as { timeline: { name: string; fps: number; clips: unknown[] } };
    expect(read.timeline).toMatchObject({ name: "The Last Drop", fps: 30 });
    expect(read.timeline.clips).toEqual([]);

    // It belongs to the caller, not to everyone.
    const other = (await run("other").invoke("get_timeline", {
      timeline_id: created.timeline_id
    })) as { error: string };
    expect(other.error).toContain("was not found");
  });

  it("refuses a nameless sequence and a non-positive size", async () => {
    const unnamed = (await run().invoke("create_timeline", { name: "  " })) as {
      error: string;
    };
    expect(unnamed.error).toContain("name is required");
    const bad = (await run().invoke("create_timeline", {
      name: "Cut",
      fps: 0
    })) as { error: string };
    expect(bad.error).toContain("fps must be a positive number");
  });

  it("reads a stored sequence, and hides another user's", async () => {
    const row = await makeTimeline();

    const read = (await run().invoke("get_timeline", {
      timeline_id: row.id
    })) as { timeline: { id: string; fps: number; clips: unknown[] } };
    expect(read.timeline).toMatchObject({ id: row.id, fps: 30 });
    expect(read.timeline.clips).toHaveLength(1);

    const other = (await run("other").invoke("get_timeline", {
      timeline_id: row.id
    })) as { error: string };
    expect(other.error).toContain("was not found");
  });

  it("snapshots, reads, and restores a version", async () => {
    const row = await makeTimeline();

    const created = (await run().invoke("create_timeline_version", {
      timeline_id: row.id,
      name: "before the recut"
    })) as { ok: boolean; version: number };
    expect(created.ok).toBe(true);

    const listed = (await run().invoke("list_timeline_versions", {
      timeline_id: row.id
    })) as { versions: Array<{ version: number; name: string }> };
    expect(listed.versions[0]).toMatchObject({ name: "before the recut" });

    const read = (await run().invoke("get_timeline_version", {
      timeline_id: row.id,
      version: created.version
    })) as { document: { clips: unknown[] } };
    expect(read.document.clips).toHaveLength(1);

    const restored = (await run().invoke("restore_timeline_version", {
      timeline_id: row.id,
      version: created.version
    })) as { ok: boolean; restored_version: number; undo_version: number };
    expect(restored).toMatchObject({
      ok: true,
      restored_version: created.version
    });
    expect(restored.undo_version).toBeGreaterThan(created.version);
  });

  it("refuses a version number that is not a positive integer", async () => {
    const row = await makeTimeline();
    const result = (await run().invoke("get_timeline_version", {
      timeline_id: row.id,
      version: 0
    })) as { error: string };
    expect(result.error).toContain("positive integer");
  });

  it("applies edit ops against the stored document", async () => {
    const row = await makeTimeline();
    const result = (await run().invoke("edit_timeline", {
      timeline_id: row.id,
      ops: [{ op: "add_track", type: "audio", name: "Music" }]
    })) as { applied: number; failed: number; tracks: Array<{ name: string }> };
    expect(result).toMatchObject({ applied: 1, failed: 0 });
    expect(result.tracks.map((t) => t.name)).toContain("Music");
  });

  it("lays two library videos end to end with add_media_clip", async () => {
    const row = await makeTimeline();
    const first = (await Asset.create({
      user_id: "u1",
      name: "skateboarding_red_panda.mp4",
      content_type: "video/mp4",
      duration: 3
    })) as Asset;
    const second = (await Asset.create({
      user_id: "u1",
      name: "second.mp4",
      content_type: "video/mp4"
    })) as Asset;

    const result = (await run().invoke("edit_timeline", {
      timeline_id: row.id,
      ops: [
        { op: "add_media_clip", asset: `asset://${first.id}.mp4` },
        { op: "add_media_clip", asset: second.id }
      ]
    })) as {
      applied: number;
      failed: number;
      clips: Array<{
        name: string;
        start_ms: number;
        duration_ms: number;
        track_id: string;
      }>;
    };
    expect(result).toMatchObject({ applied: 2, failed: 0 });

    // The seed document already holds a 2000ms clip on the only video track,
    // so the two appends land after it, back to back — which is what
    // "stitch my videos" means on a timeline.
    const added = result.clips.slice(1);
    expect(added.map((c) => c.name)).toEqual([
      "skateboarding_red_panda.mp4",
      "second.mp4"
    ]);
    expect(added[0]).toMatchObject({ start_ms: 2000, duration_ms: 3000 });
    expect(added[1].start_ms).toBe(5000);
    expect(added[0].track_id).toBe(added[1].track_id);
  });

  it("refuses an asset that is not this user's, and one that is not media", async () => {
    const row = await makeTimeline();
    const theirs = (await Asset.create({
      user_id: "u2",
      name: "private.mp4",
      content_type: "video/mp4"
    })) as Asset;
    const notMedia = (await Asset.create({
      user_id: "u1",
      name: "notes.md",
      content_type: "text/markdown"
    })) as Asset;

    const result = (await run().invoke("edit_timeline", {
      timeline_id: row.id,
      ops: [
        { op: "add_media_clip", asset: theirs.id },
        { op: "add_media_clip", asset: notMedia.id }
      ]
    })) as { failed: number; ops: Array<{ error?: string }> };
    expect(result.failed).toBe(2);
    expect(result.ops[0].error).toContain("No asset found");
    expect(result.ops[1].error).toContain("cannot go on a timeline");
  });

  it("records an unknown edit op instead of throwing", async () => {
    const row = await makeTimeline();
    const result = (await run().invoke("edit_timeline", {
      timeline_id: row.id,
      ops: [{ op: "levitate_clip" }]
    })) as { failed: number; ops: Array<{ error?: string }> };
    expect(result.failed).toBe(1);
    expect(result.ops[0].error).toContain("No timeline operation named");
  });

  it("validates an inline document and says so without a loader", async () => {
    const inline = (await run().invoke("validate_timeline", {
      document: JSON.parse(document())
    })) as { summary: string; errors: unknown[] };
    expect(inline.summary).toBe("No issues found.");

    const noLoader = (await run().invoke("validate_timeline", {
      timeline_id: "t1"
    })) as { error: string; validated: boolean };
    expect(noLoader.validated).toBe(false);
    expect(noLoader.error).toContain("no timeline loader is available");
  });

  it("reads a saved sequence through the run's loader", async () => {
    const loaded = createCapabilityRun({
      context: ctx(),
      gate: UNGATED,
      loaders: {
        timeline: async () => ({
          document: document(),
          fps: 30,
          width: 1920,
          height: 1080,
          name: "Trailer cut"
        })
      }
    });
    const result = (await loaded.invoke("validate_timeline", {
      timeline_id: "t1"
    })) as { timeline_id: string; name: string; summary: string };
    expect(result).toMatchObject({
      timeline_id: "t1",
      name: "Trailer cut",
      summary: "No issues found."
    });
  });
});

describe("set_timeline_document", () => {
  beforeEach(() => initTestDb());
  afterEach(() => ModelObserver.clear());

  /** A two-clip cut on one track — a document worth writing, not the seed. */
  const replacement = () => ({
    tracks: [
      {
        id: "track-1",
        name: "Video 1",
        type: "video",
        index: 0,
        visible: true,
        locked: false
      }
    ],
    clips: [
      {
        id: "clip-a",
        trackId: "track-1",
        name: "Opening",
        startMs: 0,
        durationMs: 4000,
        mediaType: "video",
        sourceType: "imported",
        status: "generated",
        locked: false,
        versions: []
      },
      {
        id: "clip-b",
        trackId: "track-1",
        name: "Closing",
        startMs: 4000,
        durationMs: 2500,
        mediaType: "video",
        sourceType: "imported",
        status: "generated",
        locked: false,
        versions: []
      }
    ],
    markers: []
  });

  it("writes the document, restamps the duration, and re-validates it", async () => {
    const row = await makeTimeline();
    const result = (await run().invoke("set_timeline_document", {
      timeline_id: row.id,
      document: replacement()
    })) as {
      ok: boolean;
      written: boolean;
      duration_ms: number;
      clip_count: number;
      updated_at: string;
      summary: string;
      validation: { ok: boolean };
    };

    expect(result).toMatchObject({
      ok: true,
      written: true,
      clip_count: 2,
      // The stored duration is the end of the last clip, not the 2000ms the
      // sequence was created with — a stale one truncates every later preview.
      duration_ms: 6500,
      summary: "No issues found."
    });
    expect(result.validation.ok).toBe(true);
    expect(result.updated_at).not.toBe(row.updated_at);

    const stored = await TimelineSequence.findById(row.id);
    expect(stored?.toDocument().clips.map((c) => c.id)).toEqual([
      "clip-a",
      "clip-b"
    ]);
  });

  it("defaults absent markers and keeps the caller's render settings", async () => {
    const row = await makeTimeline();
    const { markers: _markers, ...withoutMarkers } = replacement();
    const result = (await run().invoke("set_timeline_document", {
      timeline_id: row.id,
      document: withoutMarkers,
      fps: 24,
      width: 1080,
      height: 1920
    })) as { ok: boolean; fps: number; width: number; height: number };

    expect(result).toMatchObject({ ok: true, fps: 24, width: 1080, height: 1920 });
    const stored = await TimelineSequence.findById(row.id);
    expect(stored?.toDocument().markers).toEqual([]);
    expect(stored?.fps).toBe(24);
  });

  it("refuses an invalid document and writes nothing at all", async () => {
    const row = await makeTimeline();
    const before = await TimelineSequence.findById(row.id);
    const broken = replacement();
    // A clip on a track the document does not have: an error the validator
    // raises, and a cut that cannot render.
    broken.clips[0].trackId = "track-does-not-exist";

    const result = (await run().invoke("set_timeline_document", {
      timeline_id: row.id,
      document: broken
    })) as {
      error: string;
      written: boolean;
      validation: { ok: boolean; errors: Array<{ code: string }> };
    };

    expect(result.written).toBe(false);
    expect(result.validation.ok).toBe(false);
    expect(result.validation.errors.map((e) => e.code)).toContain(
      "clip_track_missing"
    );
    expect(result.error).toContain("was not written");

    // The failure mode that matters: a refusal that still wrote. Neither the
    // document, the row's revision, nor the version history may have moved.
    const after = await TimelineSequence.findById(row.id);
    expect(after?.document).toBe(before?.document);
    expect(after?.updated_at).toBe(before?.updated_at);
    expect(after?.revision).toBe(before?.revision);
    const versions = await TimelineSequenceVersion.listForTimeline(row.id, {
      limit: 10
    });
    expect(versions).toEqual([]);
  });

  it("refuses a stale expected_updated_at without writing or snapshotting", async () => {
    const row = await makeTimeline();
    const result = (await run().invoke("set_timeline_document", {
      timeline_id: row.id,
      document: replacement(),
      expected_updated_at: "1999-01-01T00:00:00.000Z"
    })) as { error: string; written: boolean; conflict: boolean };

    expect(result).toMatchObject({ written: false, conflict: true });
    expect(result.error).toContain("modified since it was read");

    const after = await TimelineSequence.findById(row.id);
    expect(after?.document).toBe(row.document);
    const versions = await TimelineSequenceVersion.listForTimeline(row.id, {
      limit: 10
    });
    expect(versions).toEqual([]);
  });

  it("accepts the expected_updated_at it was read at", async () => {
    const row = await makeTimeline();
    const result = (await run().invoke("set_timeline_document", {
      timeline_id: row.id,
      document: replacement(),
      expected_updated_at: row.updated_at
    })) as { ok: boolean };
    expect(result.ok).toBe(true);
  });

  it("leaves the replaced state as a manual version the caller can restore", async () => {
    const row = await makeTimeline();
    const written = (await run().invoke("set_timeline_document", {
      timeline_id: row.id,
      document: replacement(),
      snapshot_name: "before the recut"
    })) as { ok: boolean; undo_version: number };
    expect(written.ok).toBe(true);

    const versions = await TimelineSequenceVersion.listForTimeline(row.id, {
      limit: 10
    });
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({
      version: written.undo_version,
      save_type: "manual",
      name: "before the recut"
    });

    // The snapshot holds what the write replaced, so restoring it undoes the
    // write — which is the only reason the snapshot is taken.
    const restored = (await run().invoke("restore_timeline_version", {
      timeline_id: row.id,
      version: written.undo_version
    })) as { ok: boolean };
    expect(restored.ok).toBe(true);
    const stored = await TimelineSequence.findById(row.id);
    expect(stored?.toDocument().clips.map((c) => c.id)).toEqual(["clip-1"]);
  });

  it("refuses a document that is not an object, and another user's timeline", async () => {
    const row = await makeTimeline();
    const notAnObject = (await run().invoke("set_timeline_document", {
      timeline_id: row.id,
      document: "tracks and clips"
    })) as { error: string };
    expect(notAnObject.error).toContain("document is required");

    const theirs = (await run("other").invoke("set_timeline_document", {
      timeline_id: row.id,
      document: replacement()
    })) as { error: string };
    expect(theirs.error).toContain("was not found");
  });
});
