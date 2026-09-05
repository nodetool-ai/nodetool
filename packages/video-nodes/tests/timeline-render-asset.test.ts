/**
 * Where a finished render's bytes end up (B10).
 *
 * A minute of 1080p is tens of megabytes, and base64 of that is at V8's
 * string cap: encoding it into the ref fails *after* the whole render has
 * been paid for. When the host has an asset store the artifact is written
 * there and the ref names it by id; when it has none the inline encoding
 * stays, which is what every other test in this directory exercises.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import fsSync from "node:fs";

let execFileCalls: Array<{ cmd: string; args: string[] }> = [];

function mockResponse(
  cmd: string,
  args: string[]
): { stdout: string; stderr: string } {
  if (cmd === "ffprobe") {
    const argsStr = args.join(" ");
    if (argsStr.includes("codec_type")) return { stdout: "audio\n", stderr: "" };
    if (argsStr.includes("format=duration")) return { stdout: "4\n", stderr: "" };
    return { stdout: "", stderr: "" };
  }
  if (args.includes("-encoders")) {
    return {
      stdout: ["Encoders:", " V....D libx264 x264", " V....D libvpx-vp9 vp9"].join(
        "\n"
      ),
      stderr: ""
    };
  }
  const outputPath = args[args.length - 1];
  fsSync.writeFileSync(outputPath, Buffer.from(`fake:${outputPath}`));
  return { stdout: "", stderr: "" };
}

vi.mock("node:child_process", async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>;
  const mockExecFile = (
    cmd: string,
    args: string[],
    optionsOrCb: unknown,
    maybeCb?: unknown
  ) => {
    execFileCalls.push({ cmd, args: [...args] });
    const cb =
      typeof optionsOrCb === "function"
        ? (optionsOrCb as (e: Error | null, o: string, s: string) => void)
        : typeof maybeCb === "function"
          ? (maybeCb as (e: Error | null, o: string, s: string) => void)
          : null;
    if (!cb) return;
    const resp = mockResponse(cmd, args);
    cb(null, resp.stdout, resp.stderr);
  };
  (mockExecFile as unknown as Record<symbol, unknown>)[
    Symbol.for("nodejs.util.promisify.custom")
  ] = (cmd: string, args: string[]) => {
    execFileCalls.push({ cmd, args: [...args] });
    return Promise.resolve(mockResponse(cmd, args));
  };
  return { ...original, execFile: mockExecFile };
});

vi.mock("../src/nodes/timeline/compositeRender.js", async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>;
  return {
    ...original,
    renderTimelineComposited: (opts: { outPath: string }) => {
      fsSync.writeFileSync(opts.outPath, Buffer.from("composited-bytes"));
      return Promise.resolve({ totalFrames: 10, skippedClips: [] });
    }
  };
});

const { RenderTimelineNode } = await import("../src/nodes/timeline.js");
const VIDEO_TRACK = { id: "t-video", type: "video", index: 0, visible: true };

function sequence() {
  return {
    id: "seq-1",
    name: "Test",
    width: 1280,
    height: 720,
    fps: 30,
    durationMs: 4000,
    tracks: [VIDEO_TRACK],
    clips: [
      {
        id: "clip-v",
        trackId: "t-video",
        name: "Shot",
        startMs: 0,
        durationMs: 4000,
        mediaType: "video",
        status: "generated",
        currentAssetId: "asset-v"
      }
    ],
    transcript: []
  };
}

let created: Array<Record<string, unknown>> = [];

function contextFor(seq: unknown, withAssetStore: boolean) {
  const base: Record<string, unknown> = {
    getTimelineSequence: vi.fn().mockResolvedValue(seq),
    resolveAssetBytes: vi
      .fn()
      .mockResolvedValue({ bytes: new Uint8Array([1, 2, 3]) }),
    postMessage: () => {},
    workflowId: "wf-1",
    signal: new AbortController().signal
  };
  if (withAssetStore) {
    base["createAsset"] = vi.fn(async (args: Record<string, unknown>) => {
      created.push(args);
      return { id: `asset-${created.length}`, get_url: "https://cdn/x" };
    });
  }
  return base;
}

async function render(
  props: Record<string, unknown> = {},
  withAssetStore = true
) {
  const node = new RenderTimelineNode();
  Object.assign(node, {
    timeline: { type: "timeline", id: "seq-1" },
    __node_id: "node-1",
    ...props
  });
  return node.process(contextFor(sequence(), withAssetStore) as never);
}

beforeEach(() => {
  execFileCalls = [];
  created = [];
});

describe("RenderTimeline — artifact storage", () => {
  it("stores the video as an asset and leaves no inline data", async () => {
    const result = await render();
    expect(created).toHaveLength(1);
    expect(created[0]!["contentType"]).toBe("video/mp4");
    expect(result.output.asset_id).toBe("asset-1");
    expect(result.output.data).toBeNull();
    expect(result.output.uri).toBe("asset://asset-1");
  });

  it("stores the png_sequence zip as an asset, not base64 in the ref", async () => {
    const result = await render({ format: "png_sequence" });
    expect(created).toHaveLength(1);
    expect(created[0]!["contentType"]).toBe("application/zip");
    expect(result.frames.asset_id).toBe("asset-1");
    expect(result.frames.data ?? null).toBeNull();
  });

  it("keeps inline bytes when the host has no asset store", async () => {
    const result = await render({}, false);
    expect(created).toHaveLength(0);
    expect(typeof result.output.data).toBe("string");
  });

});
