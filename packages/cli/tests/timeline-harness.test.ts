/**
 * Tests for the timeline debug harness (src/timeline-debug/): the `--interact`
 * script parser and the orchestrator, with the validator core and the headless
 * bridge injected — neither the execution core nor `@nodetool-ai/agents` is
 * loaded here.
 */
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  normalizeToolName,
  parseInteractionScript
} from "../src/timeline-debug/interactions.js";
import {
  runTimelineDebug,
  runTimelineValidate,
  type TimelineDebugCore
} from "../src/timeline-debug/harness.js";

const track = {
  id: "t1",
  name: "Video",
  type: "video",
  index: 0,
  visible: true,
  locked: false
};

const clip = {
  id: "c1",
  trackId: "t1",
  name: "shot",
  startMs: 0,
  durationMs: 4000,
  mediaType: "video",
  sourceType: "imported",
  status: "generated",
  locked: false,
  versions: []
};

const timelineFile = (): string => {
  const file = join(mkdtempSync(join(tmpdir(), "timeline-harness-")), "timeline.json");
  writeFileSync(
    file,
    JSON.stringify({ fps: 24, width: 1280, height: 720, document: { tracks: [track], clips: [clip], markers: [] } }),
    "utf8"
  );
  return file;
};

const outDir = (): string => join(mkdtempSync(join(tmpdir(), "timeline-out-")), "bundle");

const cleanValidation = { ok: true, errors: [], warnings: [] };

/** A core that records what it was handed and answers with a fixed report. */
function fakeCore(): TimelineDebugCore & {
  calls: { validate: unknown[]; build: unknown[] };
} {
  const calls = { validate: [] as unknown[], build: [] as unknown[] };
  return {
    calls,
    validateTimelineSequence: (raw, meta) => {
      calls.validate.push({ raw, meta });
      return cleanValidation;
    },
    buildTimelineDebugReport: (input) => {
      calls.build.push(input);
      return {
        target: input.target,
        meta: {
          fps: 24,
          width: 1280,
          height: 720,
          durationMs: 4000,
          trackCount: 1,
          clipCount: 1
        },
        validation: cleanValidation,
        interactions: input.interactions ?? [],
        ...(input.finalState ? { finalState: input.finalState } : {}),
        notSimulated: ["rendering"],
        verdict: { ok: true, headline: "timeline ok", issues: [] }
      };
    },
    renderTimelineReportMarkdown: (report) => `# ${report.verdict.headline}\n`
  };
}

/** A bridge whose one tool succeeds and whose other always throws. */
function fakeBridge() {
  const tracks = [{ ...track }];
  const clips = [{ ...clip }];
  return {
    tools: [
      {
        name: "ui_timeline_add_track",
        execute: async (args: Record<string, unknown>) => {
          tracks.push({ ...track, id: `t${tracks.length + 1}`, name: String(args.name ?? "") });
          return { ok: true };
        }
      },
      {
        name: "ui_timeline_delete_clip",
        execute: async () => {
          throw new Error("No clip found matching \"nope\".");
        }
      }
    ],
    finalState: () => ({ documentTracks: tracks, documentClips: clips })
  };
}

describe("parseInteractionScript", () => {
  it("normalizes bare and prefixed tool names alike", () => {
    const steps = parseInteractionScript(
      JSON.stringify([
        { tool: "add_track", input: { type: "audio" } },
        { tool: "ui_timeline_seek", input: { timeMs: 100 } },
        { tool: "ui_select_clip" }
      ])
    );
    expect(steps.map((s) => s.tool)).toEqual([
      "ui_timeline_add_track",
      "ui_timeline_seek",
      "ui_timeline_select_clip"
    ]);
    expect(steps[2].input).toEqual({});
  });

  it("rejects invalid JSON with the parser's own message", () => {
    expect(() => parseInteractionScript("[{")).toThrow(/--interact is not valid JSON/);
  });

  it("rejects a non-array script", () => {
    expect(() => parseInteractionScript('{"tool":"add_track"}')).toThrow(
      /must be a JSON array/
    );
  });

  it("names the step that has no tool", () => {
    expect(() =>
      parseInteractionScript(JSON.stringify([{ tool: "seek" }, { input: {} }]))
    ).toThrow(/step 2 has no `tool` name/);
  });

  it("rejects a non-object input", () => {
    expect(() =>
      parseInteractionScript(JSON.stringify([{ tool: "seek", input: 5 }]))
    ).toThrow(/step 1: `input` must be an object/);
  });

  it("leaves an already-canonical name alone", () => {
    expect(normalizeToolName("ui_timeline_add_track")).toBe("ui_timeline_add_track");
  });
});

describe("runTimelineValidate", () => {
  it("validates the raw document with the sequence settings", async () => {
    const core = fakeCore();
    const { target, validation } = await runTimelineValidate(timelineFile(), {
      loadSequence: async () => null,
      core
    });

    expect(target.kind).toBe("file");
    expect(validation).toEqual(cleanValidation);
    expect(core.calls.validate).toHaveLength(1);
    expect((core.calls.validate[0] as { meta: unknown }).meta).toEqual({
      fps: 24,
      width: 1280,
      height: 720
    });
  });
});

describe("runTimelineDebug", () => {
  it("seeds the bridge from the document and records each step", async () => {
    const createBridge = vi.fn(() => fakeBridge());
    const dir = outDir();
    const { report } = await runTimelineDebug(
      timelineFile(),
      {
        interact: parseInteractionScript(
          JSON.stringify([{ tool: "add_track", input: { type: "audio", name: "Music" } }])
        ),
        outDir: dir
      },
      { loadSequence: async () => null, core: fakeCore(), createBridge }
    );

    expect(createBridge).toHaveBeenCalledWith({
      sequence: {
        fps: 24,
        width: 1280,
        height: 720,
        tracks: [track],
        clips: [clip],
        markers: []
      }
    });
    expect(report.interactions).toEqual([
      {
        tool: "ui_timeline_add_track",
        input: { type: "audio", name: "Music" },
        ok: true,
        result: { ok: true }
      }
    ]);
  });

  it("records a failing step and keeps going", async () => {
    const core = fakeCore();
    const { report } = await runTimelineDebug(
      timelineFile(),
      {
        interact: parseInteractionScript(
          JSON.stringify([
            { tool: "delete_clip", input: { target: "nope" } },
            { tool: "not_a_tool" },
            { tool: "add_track", input: { type: "audio" } }
          ])
        ),
        outDir: outDir()
      },
      { loadSequence: async () => null, core, createBridge: () => fakeBridge() }
    );

    expect(report.interactions.map((i) => i.ok)).toEqual([false, false, true]);
    expect(report.interactions[0].error).toMatch(/No clip found/);
    expect(report.interactions[1].error).toMatch(/No timeline tool named/);
  });

  it("passes the bridge's full final document to the report", async () => {
    const core = fakeCore();
    await runTimelineDebug(
      timelineFile(),
      {
        interact: parseInteractionScript(
          JSON.stringify([{ tool: "add_track", input: { type: "audio" } }])
        ),
        outDir: outDir()
      },
      { loadSequence: async () => null, core, createBridge: () => fakeBridge() }
    );

    const built = core.calls.build[0] as {
      finalDocument?: { tracks: unknown[]; clips: unknown[]; markers: unknown[] };
      finalState?: unknown;
    };
    expect(built.finalDocument?.tracks).toHaveLength(2);
    expect(built.finalDocument?.clips).toEqual([clip]);
    expect(built.finalDocument?.markers).toEqual([]);
    expect(built.finalState).toBeDefined();
  });

  it("takes the markers the bridge reports over the target's own", async () => {
    // The marker ops edit them, so a session that added one has to reach the
    // report — the fallback to the target's markers is for a bridge with none.
    const core = fakeCore();
    const marker = { id: "m1", timeMs: 500, label: "Beat 1" };
    await runTimelineDebug(
      timelineFile(),
      {
        interact: parseInteractionScript(
          JSON.stringify([{ tool: "add_track", input: { type: "audio" } }])
        ),
        outDir: outDir()
      },
      {
        loadSequence: async () => null,
        core,
        createBridge: () => {
          const bridge = fakeBridge();
          return {
            ...bridge,
            finalState: () => ({ ...bridge.finalState(), markers: [marker] })
          };
        }
      }
    );

    const built = core.calls.build[0] as {
      finalDocument?: { markers: unknown[] };
    };
    expect(built.finalDocument?.markers).toEqual([marker]);
  });

  it("runs no bridge at all without an interact script", async () => {
    const createBridge = vi.fn(() => fakeBridge());
    const core = fakeCore();
    const { report } = await runTimelineDebug(
      timelineFile(),
      { outDir: outDir() },
      { loadSequence: async () => null, core, createBridge }
    );

    expect(createBridge).not.toHaveBeenCalled();
    expect(report.interactions).toEqual([]);
    expect((core.calls.build[0] as { finalState?: unknown }).finalState).toBeUndefined();
  });

  it("writes the bundle: report.json, report.md and the input document", async () => {
    const dir = outDir();
    const file = timelineFile();
    const { bundleDir } = await runTimelineDebug(
      file,
      { outDir: dir },
      { loadSequence: async () => null, core: fakeCore() }
    );

    expect(bundleDir).toBe(dir);
    for (const name of ["report.json", "report.md", "timeline.json"]) {
      expect(existsSync(join(dir, name))).toBe(true);
    }
    expect(readFileSync(join(dir, "report.md"), "utf8")).toContain("timeline ok");
    const written = JSON.parse(readFileSync(join(dir, "timeline.json"), "utf8"));
    expect(written.clips).toEqual([clip]);
  });
});
