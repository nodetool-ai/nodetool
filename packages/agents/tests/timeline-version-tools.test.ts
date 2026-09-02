import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import {
  ModelObserver,
  TimelineSequence,
  TimelineSequenceVersion,
  initTestDb
} from "@nodetool-ai/models";
import { toolForCapabilityName } from "../src/capabilities/lazy-tool.js";
import { permissionCategoryFor } from "../src/tools/tool-permissions.js";
import { BUILTIN_TOOL_NAMES } from "../src/tools/builtin-tools.js";

const ctx = (userId = "u1") => ({ userId }) as unknown as ProcessingContext;

const track = (overrides: Record<string, unknown> = {}) => ({
  id: "track-1",
  name: "Video 1",
  type: "video",
  index: 0,
  visible: true,
  locked: false,
  ...overrides
});

const clip = (overrides: Record<string, unknown> = {}) => ({
  id: "clip-1",
  trackId: "track-1",
  name: "Shot 1",
  startMs: 0,
  durationMs: 2000,
  mediaType: "video",
  sourceType: "imported",
  status: "generated",
  locked: false,
  versions: [],
  ...overrides
});

const document = (trackId = "track-1") =>
  JSON.stringify({
    tracks: [track()],
    clips: [clip({ trackId })],
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

describe("timeline version tools", () => {
  beforeEach(() => initTestDb());
  afterEach(() => ModelObserver.clear());

  it("registers as built-ins with sane permissions", () => {
    const names = BUILTIN_TOOL_NAMES;
    expect(names).toEqual(
      expect.arrayContaining([
        "list_timelines",
        "list_timeline_versions",
        "get_timeline_version",
        "create_timeline_version",
        "restore_timeline_version",
        "delete_timeline_version"
      ])
    );
    expect(permissionCategoryFor("list_timelines")).toBe("read");
    expect(permissionCategoryFor("list_timeline_versions")).toBe("read");
    expect(permissionCategoryFor("get_timeline_version")).toBe("read");
    expect(permissionCategoryFor("create_timeline_version")).toBe("write");
    expect(permissionCategoryFor("restore_timeline_version")).toBe("write");
    expect(permissionCategoryFor("delete_timeline_version")).toBe("write");
  });

  /**
   * `validate_timeline` used to refuse the `timeline_id` path unless the host
   * put a loader on the run, so a belt that could edit a sequence could not
   * check the edit. Every other capability in the module reads the row
   * directly; this one does too when no loader is injected.
   */
  it("validates a saved timeline without an injected loader", async () => {
    const row = await makeTimeline();
    const report = (await toolForCapabilityName("validate_timeline").process(
      ctx(),
      { timeline_id: row.id }
    )) as { timeline_id?: string; errors?: unknown[]; error?: string };
    expect(report.error).toBeUndefined();
    expect(report.timeline_id).toBe(row.id);
    expect(report.errors).toEqual([]);
  });

  it("hides another user's timeline from validate_timeline", async () => {
    const row = await makeTimeline();
    const report = (await toolForCapabilityName("validate_timeline").process(
      ctx("other"),
      { timeline_id: row.id }
    )) as { error?: string };
    expect(report.error).toContain("was not found");
  });

  it("lists the caller's timelines and filters by name", async () => {
    const trailer = await makeTimeline();
    await makeTimeline({ name: "Behind the scenes" });

    const all = (await toolForCapabilityName("list_timelines").process(ctx(), {})) as {
      timelines: Array<{ id: string; name: string }>;
    };
    expect(all.timelines).toHaveLength(2);

    const filtered = (await toolForCapabilityName("list_timelines").process(ctx(), {
      query: "trail"
    })) as { timelines: Array<{ id: string; fps: number }> };
    expect(filtered.timelines).toHaveLength(1);
    expect(filtered.timelines[0]).toMatchObject({ id: trailer.id, fps: 30 });
  });

  it("hides another user's timelines", async () => {
    const row = await makeTimeline();
    const listed = (await toolForCapabilityName("list_timelines").process(ctx("other"), {})) as {
      timelines: unknown[];
    };
    expect(listed.timelines).toEqual([]);

    const versions = (await toolForCapabilityName("list_timeline_versions").process(
      ctx("other"),
      { timeline_id: row.id }
    )) as { error: string };
    expect(versions.error).toContain("was not found");
  });

  it("creates a manual snapshot and lists it", async () => {
    const row = await makeTimeline();

    const created = (await toolForCapabilityName("create_timeline_version").process(ctx(), {
      timeline_id: row.id,
      name: "before the recut"
    })) as { ok: boolean; version: number; saveType: string; name: string };
    expect(created).toMatchObject({
      ok: true,
      version: 1,
      saveType: "manual",
      name: "before the recut",
      fps: 30,
      durationMs: 2000
    });

    await TimelineSequenceVersion.snapshot(row, { saveType: "autosave" });

    const listed = (await toolForCapabilityName("list_timeline_versions").process(ctx(), {
      timeline_id: row.id
    })) as { versions: Array<{ version: number; saveType: string }> };
    // Newest first.
    expect(listed.versions.map((v) => [v.version, v.saveType])).toEqual([
      [2, "autosave"],
      [1, "manual"]
    ]);

    const manualOnly = (await toolForCapabilityName("list_timeline_versions").process(ctx(), {
      timeline_id: row.id,
      save_type: "manual"
    })) as { versions: Array<{ version: number }> };
    expect(manualOnly.versions.map((v) => v.version)).toEqual([1]);
  });

  it("reads one version's document without restoring it", async () => {
    const row = await makeTimeline();
    await toolForCapabilityName("create_timeline_version").process(ctx(), {
      timeline_id: row.id,
      name: "the good cut"
    });

    const result = (await toolForCapabilityName("get_timeline_version").process(ctx(), {
      timeline_id: row.id,
      version: 1
    })) as {
      version: number;
      saveType: string;
      name: string;
      document: { clips: unknown[] };
    };
    expect(result).toMatchObject({
      version: 1,
      saveType: "manual",
      name: "the good cut",
      fps: 30
    });
    expect(result.document.clips).toHaveLength(1);

    // Reading is not restoring: the sequence row is untouched.
    const after = (await TimelineSequence.findById(row.id))!;
    expect(after.updated_at).toBe(row.updated_at);

    const missing = (await toolForCapabilityName("get_timeline_version").process(ctx(), {
      timeline_id: row.id,
      version: 7
    })) as { error: string };
    expect(missing.error).toContain("no version 7");

    const otherUser = (await toolForCapabilityName("get_timeline_version").process(ctx("other"), {
      timeline_id: row.id,
      version: 1
    })) as { error: string };
    expect(otherUser.error).toContain("was not found");
  });

  it("restores a version, snapshots the overwritten state, and validates the result", async () => {
    const row = await makeTimeline();
    await toolForCapabilityName("create_timeline_version").process(ctx(), {
      timeline_id: row.id,
      name: "the good cut"
    });

    // Move the sequence on, so the restore has something to undo.
    const edited = (await TimelineSequence.findById(row.id))!;
    await TimelineSequence.updateFieldsIfUnchanged(row.id, edited.updated_at, {
      document: JSON.stringify({ tracks: [], clips: [], markers: [] }),
      width: 1280,
      duration_ms: 0
    });

    const result = (await toolForCapabilityName("restore_timeline_version").process(ctx(), {
      timeline_id: row.id,
      version: 1
    })) as {
      ok: boolean;
      restored_version: number;
      undo_version: number;
      width: number;
      validation: { ok: boolean };
      summary: string;
    };

    expect(result).toMatchObject({
      ok: true,
      restored_version: 1,
      undo_version: 2,
      width: 1920,
      duration_ms: 2000
    });
    expect(result.validation.ok).toBe(true);
    expect(result.summary).toBe("No issues found.");

    const restored = (await TimelineSequence.findById(row.id))!;
    expect(restored.width).toBe(1920);
    expect(JSON.parse(restored.document).clips).toHaveLength(1);

    // The restore is undoable: v2 holds the state it overwrote.
    const undo = (await TimelineSequenceVersion.findByVersion(row.id, 2))!;
    expect(undo.save_type).toBe("restore");
    expect(undo.name).toBe("Before restore to v1");
    expect(undo.width).toBe(1280);
  });

  it("reports the findings when the restored document no longer validates", async () => {
    const row = await makeTimeline({ document: document("ghost") });
    await toolForCapabilityName("create_timeline_version").process(ctx(), {
      timeline_id: row.id
    });

    const result = (await toolForCapabilityName("restore_timeline_version").process(ctx(), {
      timeline_id: row.id,
      version: 1
    })) as {
      ok: boolean;
      validation: { ok: boolean; errors: Array<{ code: string }> };
      summary: string;
    };

    expect(result.ok).toBe(true);
    expect(result.validation.ok).toBe(false);
    expect(result.validation.errors.map((e) => e.code)).toContain(
      "clip_track_missing"
    );
    expect(result.summary).toContain("1 error");
  });

  it("refuses to restore a version the timeline does not have", async () => {
    const row = await makeTimeline();
    const result = (await toolForCapabilityName("restore_timeline_version").process(ctx(), {
      timeline_id: row.id,
      version: 7
    })) as { error: string };
    expect(result.error).toContain("no version 7");
    expect(result.error).toContain("list_timeline_versions");
  });

  it("refuses to restore another user's timeline", async () => {
    const row = await makeTimeline();
    await toolForCapabilityName("create_timeline_version").process(ctx(), {
      timeline_id: row.id
    });

    const result = (await toolForCapabilityName("restore_timeline_version").process(ctx("other"), {
      timeline_id: row.id,
      version: 1
    })) as { error: string };
    expect(result.error).toContain("was not found");
  });

  it("reports a snapshot the sequence write refuses instead of throwing", async () => {
    const row = await makeTimeline();
    // A document from before tracks/clips/markers were required — the write
    // rejects it, and the tool has to say so rather than fail the call.
    await TimelineSequenceVersion.create<TimelineSequenceVersion>({
      timeline_id: row.id,
      user_id: row.user_id,
      version: 1,
      save_type: "manual",
      fps: 30,
      width: 1920,
      height: 1080,
      duration_ms: 0,
      document: JSON.stringify({ tracks: [] })
    });

    const result = (await toolForCapabilityName("restore_timeline_version").process(ctx(), {
      timeline_id: row.id,
      version: 1
    })) as { error: string; undo_version: number };
    expect(result.error).toContain("cannot be restored");
    expect(result.undo_version).toBe(2);
  });
});
