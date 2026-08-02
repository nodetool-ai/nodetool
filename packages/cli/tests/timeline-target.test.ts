/**
 * Tests for the timeline debug target loader (src/timeline-debug/target.ts):
 * file vs. row-id precedence, the two document shapes a file can carry, and
 * where the sequence settings come from.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { resolveTimelineTarget } from "../src/timeline-debug/target.js";

const document = {
  tracks: [
    {
      id: "t1",
      name: "Video",
      type: "video",
      index: 0,
      visible: true,
      locked: false
    }
  ],
  clips: [
    {
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
    }
  ],
  markers: []
};

const writeJson = (name: string, value: unknown): string => {
  const file = join(mkdtempSync(join(tmpdir(), "timeline-target-")), name);
  writeFileSync(file, JSON.stringify(value), "utf8");
  return file;
};

const noSequences = vi.fn(async () => null);

describe("resolveTimelineTarget", () => {
  it("reads a bare TimelineDocument file", async () => {
    const file = writeJson("timeline.json", document);
    const resolved = await resolveTimelineTarget(file, {
      loadSequence: noSequences
    });

    expect(resolved.target).toEqual({ kind: "file", ref: file });
    expect(resolved.document.clips).toHaveLength(1);
    expect(resolved.meta).toEqual({});
    expect(noSequences).not.toHaveBeenCalled();
  });

  it("unwraps a `document` field and takes fps/width/height from the wrapper", async () => {
    const file = writeJson("sequence.json", {
      id: "seq-1",
      name: "My Cut",
      fps: 24,
      width: 1280,
      height: 720,
      document
    });
    const resolved = await resolveTimelineTarget(file, {
      loadSequence: noSequences
    });

    expect(resolved.target).toEqual({ kind: "file", ref: file, name: "My Cut" });
    expect(resolved.meta).toEqual({ fps: 24, width: 1280, height: 720 });
    expect(resolved.document.tracks[0].id).toBe("t1");
  });

  it("loads a row id through the injected loader", async () => {
    const loadSequence = vi.fn(async (id: string) => ({
      id,
      name: "Row",
      fps: 30,
      width: 1920,
      height: 1080,
      document: JSON.stringify(document)
    }));
    const resolved = await resolveTimelineTarget("seq-1", { loadSequence });

    expect(loadSequence).toHaveBeenCalledWith("seq-1");
    expect(resolved.target).toEqual({ kind: "id", ref: "seq-1", name: "Row" });
    expect(resolved.meta.fps).toBe(30);
    expect(resolved.document.clips[0].id).toBe("c1");
  });

  it("prefers an existing file over a row of the same name", async () => {
    const file = writeJson("seq-1", document);
    const loadSequence = vi.fn(async () => {
      throw new Error("should not be consulted");
    });
    const resolved = await resolveTimelineTarget(file, { loadSequence });

    expect(resolved.target.kind).toBe("file");
    expect(loadSequence).not.toHaveBeenCalled();
  });

  it("names the ref when no row exists", async () => {
    await expect(
      resolveTimelineTarget("missing", { loadSequence: noSequences })
    ).rejects.toThrow(/Timeline sequence not found: missing/);
  });

  it("rejects a file that is not a timeline document", async () => {
    const file = writeJson("other.json", { hello: "world" });
    await expect(
      resolveTimelineTarget(file, { loadSequence: noSequences })
    ).rejects.toThrow(/not a timeline document/);
  });

  it("rejects a file that is not JSON", async () => {
    const dir = mkdtempSync(join(tmpdir(), "timeline-target-"));
    const file = join(dir, "broken.json");
    writeFileSync(file, "{ nope", "utf8");
    await expect(
      resolveTimelineTarget(file, { loadSequence: noSequences })
    ).rejects.toThrow(/is not valid JSON/);
  });
});
