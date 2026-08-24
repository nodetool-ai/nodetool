/**
 * The `ffprobe` capability: the `inputs` staging that lets an asset reach it,
 * and the numeric summary over ffprobe's all-strings JSON.
 *
 * The binary is not assumed to be installed: staging happens before the spawn,
 * and the summary is a pure function over a payload.
 */

import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { createLocalWorkspace } from "@nodetool-ai/runtime";
import { toolFromCapability } from "../src/capabilities/adapters.js";
import { UNGATED, createCapabilityRun } from "../src/capabilities/invoke.js";
import { ffprobe, ffprobeSummary } from "../src/capabilities/media.js";
import type { CapabilityExport } from "../src/capabilities/types.js";
import { Tool } from "../src/tools/base-tool.js";

/** A context with a real workspace directory on disk. */
function workspaceContext(dir: string): ProcessingContext {
  return {
    userId: "user-1",
    workspace: createLocalWorkspace(dir),
    resolveWorkspacePath: (relative: string) => resolve(dir, relative)
  } as unknown as ProcessingContext;
}

function asTool(entry: CapabilityExport): Tool {
  return toolFromCapability(entry.spec, entry.impl, (context) =>
    createCapabilityRun({ context, gate: UNGATED })
  );
}

describe("ffprobe staging", () => {
  it("ffprobe stages an inputs ref the way ffmpeg does", async () => {
    // Without this, a session that had just staged a clip for ffmpeg could not
    // ask ffprobe how long it was: `path` takes a workspace file, and the only
    // way to get an asset into the workspace was a no-op ffmpeg copy. The
    // binary may not be installed here; staging happens before the spawn, so
    // the file on disk is what this pins.
    const dir = await mkdtemp(join(tmpdir(), "ffprobe-inputs-"));
    try {
      await asTool(ffprobe).process(workspaceContext(dir), {
        path: "a.txt",
        inputs: { "a.txt": "data:text/plain;base64,aGk=" }
      });
      expect(await readFile(join(dir, "a.txt"), "utf8")).toBe("hi");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("ffprobe refuses an inputs name that escapes the workspace", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ffprobe-inputs-"));
    try {
      const result = (await asTool(ffprobe).process(workspaceContext(dir), {
        path: "a.txt",
        inputs: { "../escaped.txt": "data:text/plain;base64,aGk=" }
      })) as Record<string, unknown>;
      expect(String(result["error"])).toMatch(/outside the workspace/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("ffprobe's numeric summary", () => {
  // ffprobe reports every number as a string. A live session read
  // `format.duration` straight out of the payload and got
  // `"8.000000".toFixed is not a function` — three clips, three probes, one
  // unusable answer each.
  const payload = {
    format: { duration: "8.000000", size: "123456" },
    streams: [
      { codec_type: "video", width: 1280, height: 720, duration: "8.000000" },
      { codec_type: "audio", sample_rate: "44100" }
    ]
  };

  it("reports duration, size and audio presence as numbers and booleans", () => {
    expect(ffprobeSummary(payload)).toEqual({
      duration_seconds: 8,
      has_video: true,
      has_audio: true,
      width: 1280,
      height: 720
    });
  });

  it("falls back to the video stream when the container declares no duration", () => {
    const summary = ffprobeSummary({
      format: {},
      streams: [{ codec_type: "video", duration: "4.5", width: 1080, height: 1920 }]
    });
    expect(summary["duration_seconds"]).toBe(4.5);
    expect(summary["has_audio"]).toBe(false);
  });

  it("answers null rather than NaN when nothing declares a duration", () => {
    const summary = ffprobeSummary({ format: { duration: "N/A" }, streams: [] });
    expect(summary["duration_seconds"]).toBeNull();
    expect(summary["has_video"]).toBe(false);
  });
});
