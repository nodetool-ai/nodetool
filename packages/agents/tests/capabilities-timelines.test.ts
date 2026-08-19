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
  ModelObserver,
  TimelineSequence,
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
  ["edit_timeline", () => toolForCapabilityName("edit_timeline")],
  ["validate_timeline", () => toolForCapabilityName("validate_timeline")]
];

describe("timelines capability module", () => {
  it("is well-formed and declares itself as timelines", () => {
    expect(capabilityModuleIssues("timelines", timelines)).toEqual([]);
    expect(timelines.exports.map((e) => e.spec.name)).toEqual([
      "list_timelines",
      "list_timeline_versions",
      "get_timeline_version",
      "create_timeline_version",
      "restore_timeline_version",
      "edit_timeline",
      "validate_timeline",
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
