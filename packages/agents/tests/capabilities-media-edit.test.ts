/**
 * `media_edit` and `media_probe` through the capability seam: a real
 * workspace, real media made without the CLI, and the answers read back.
 * The operations themselves are covered in media-edit.test.ts; these pin the
 * staging, the confinement and the report the capability adds around them.
 */

import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import type { ProcessingContext } from "@nodetool-ai/runtime";
import { createLocalWorkspace } from "@nodetool-ai/runtime";
import { generateMedia } from "@nodetool-ai/runtime/media/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { toolFromCapability } from "../src/capabilities/adapters.js";
import { UNGATED, createCapabilityRun } from "../src/capabilities/invoke.js";
import { mediaEdit, mediaProbe } from "../src/capabilities/media.js";
import type { CapabilityExport } from "../src/capabilities/types.js";
import type { Tool } from "../src/tools/base-tool.js";

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

let dir = "";
let clipDataUri = "";

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "media-capability-"));
  await generateMedia({
    outPath: join(dir, "clip.mp4"),
    video: { source: "testsrc2=size=64x48:rate=24:duration=2" },
    audio: { source: "sine=frequency=440:sample_rate=48000:duration=2" }
  });
  clipDataUri = `data:video/mp4;base64,${(await readFile(join(dir, "clip.mp4"))).toString("base64")}`;
}, 60_000);

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("media_probe", () => {
  it("reports duration, size and streams as numbers and booleans", async () => {
    const result = (await asTool(mediaProbe).process(workspaceContext(dir), {
      path: "clip.mp4"
    })) as Record<string, unknown>;
    expect(result).toMatchObject({
      path: "clip.mp4",
      has_video: true,
      has_audio: true,
      width: 64,
      height: 48,
      fps: 24,
      sample_rate: 48000
    });
    expect(result["duration_seconds"]).toBeCloseTo(2, 1);
  });

  it("stages a ref named in path itself", async () => {
    const result = (await asTool(mediaProbe).process(workspaceContext(dir), {
      path: clipDataUri
    })) as Record<string, unknown>;
    expect(result["has_video"]).toBe(true);
    expect(await stat(join(dir, "media-input/input-0"))).toBeTruthy();
  });

  it("answers an error, not a crash, for bytes that are no media", async () => {
    const result = (await asTool(mediaProbe).process(workspaceContext(dir), {
      path: "notes.txt",
      inputs: { "notes.txt": "data:text/plain;base64,aGk=" }
    })) as Record<string, unknown>;
    expect(String(result["error"])).toMatch(/media_probe could not read notes\.txt/);
  });
});

describe("media_edit", () => {
  it("writes the output, saves it to the workspace and probes it", async () => {
    const result = (await asTool(mediaEdit).process(workspaceContext(dir), {
      operation: "trim",
      input: "clip.mp4",
      output_file: "cuts/first-second.mp4",
      start: 0,
      end: 1
    })) as Record<string, unknown>;
    expect(result).toMatchObject({ success: true, operation: "trim", output_file: "cuts/first-second.mp4" });
    const probe = result["probe"] as Record<string, unknown>;
    expect(probe["duration_seconds"]).toBeCloseTo(1, 1);
  });

  it("edits an asset named directly as the input", async () => {
    const result = (await asTool(mediaEdit).process(workspaceContext(dir), {
      operation: "extract_audio",
      input: clipDataUri,
      output_file: "sound.wav"
    })) as Record<string, unknown>;
    expect(result["success"]).toBe(true);
    expect((result["probe"] as Record<string, unknown>)["has_video"]).toBe(false);
  });

  it("lists every frame extract_frames wrote", async () => {
    const result = (await asTool(mediaEdit).process(workspaceContext(dir), {
      operation: "extract_frames",
      input: "clip.mp4",
      output_file: "stills",
      fps: 1,
      max_frames: 2
    })) as Record<string, unknown>;
    const frames = result["frames"] as Array<Record<string, unknown>>;
    expect(frames.map((frame) => frame["output_file"])).toEqual([
      "stills/frame_0001.png",
      "stills/frame_0002.png"
    ]);
  });

  it("reports a failed operation as an error naming it", async () => {
    const result = (await asTool(mediaEdit).process(workspaceContext(dir), {
      operation: "scale",
      input: "clip.mp4",
      output_file: "scaled.wav",
      width: 32
    })) as Record<string, unknown>;
    expect(String(result["error"])).toMatch(/media_edit scale failed: scale writes video/);
  });
});
