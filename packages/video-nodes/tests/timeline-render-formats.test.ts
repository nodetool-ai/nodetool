/**
 * `RenderTimeline`'s format and alpha props (F13, T27): what reaches the frame
 * loop, what the mux is told, and the four things the node refuses.
 *
 * Every refusal is driven by an input that triggers it — an `mp4 + alpha`
 * request, an ffmpeg with no `prores_ks`, an alpha request on a host with no
 * compositor — so none of these checks can pass by never firing (I12).
 * `compositeRender` and `child_process` are faked the same way
 * `timeline-composite.test.ts` fakes them: what is under test is the
 * orchestration, not the encode.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import fsSync from "node:fs";

let execFileCalls: Array<{ cmd: string; args: string[] }> = [];
/** Encoders this fake ffmpeg build reports from `-encoders`. */
let availableEncoders = ["libx264", "libvpx-vp9", "prores_ks", "aac", "libopus"];

function encoderListing(): string {
  return [
    "Encoders:",
    " V..... = Video",
    " ------",
    ...availableEncoders.map((name) => ` V....D ${name} some description`)
  ].join("\n");
}

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
    return { stdout: encoderListing(), stderr: "" };
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

const renderComposited = vi.fn();

vi.mock("../src/nodes/timeline/compositeRender.js", async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>;
  return {
    ...original,
    renderTimelineComposited: (opts: { outPath: string }) => {
      fsSync.writeFileSync(opts.outPath, Buffer.from("fake:composited"));
      return renderComposited(opts);
    }
  };
});

const { RenderTimelineNode } = await import("../src/nodes/timeline.js");
const { CompositorUnavailableError } = await import(
  "../src/nodes/timeline/compositeRender.js"
);

const VIDEO_TRACK = { id: "t-video", type: "video", index: 0, visible: true };
const AUDIO_TRACK = { id: "t-audio", type: "audio", index: 1, visible: true };

function sequence(overrides: Record<string, unknown> = {}) {
  return {
    id: "seq-1",
    name: "Test",
    width: 1280,
    height: 720,
    fps: 30,
    durationMs: 4000,
    tracks: [VIDEO_TRACK, AUDIO_TRACK],
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
    transcript: [],
    ...overrides
  };
}

const audioClip = {
  id: "clip-a",
  trackId: "t-audio",
  name: "Music",
  startMs: 1000,
  durationMs: 3000,
  mediaType: "audio",
  status: "generated",
  currentAssetId: "asset-a"
};

let posted: Array<Record<string, unknown>> = [];

function contextFor(seq: unknown) {
  return {
    getTimelineSequence: vi.fn().mockResolvedValue(seq),
    resolveAssetBytes: vi
      .fn()
      .mockResolvedValue({ bytes: new Uint8Array([1, 2, 3]) }),
    postMessage: (msg: Record<string, unknown>) => posted.push(msg),
    workflowId: "wf-1",
    signal: new AbortController().signal
  };
}

async function render(seq: unknown, props: Record<string, unknown> = {}) {
  const node = new RenderTimelineNode();
  Object.assign(node, {
    timeline: { type: "timeline", id: "seq-1" },
    __node_id: "node-1",
    ...props
  });
  return node.process(contextFor(seq) as never);
}

function ffmpegArgs(): string[] {
  return execFileCalls
    .filter((c) => c.cmd === "ffmpeg")
    .map((c) => c.args.join(" "));
}

function logs(severity: string): string {
  return posted
    .filter((m) => m.type === "log_update" && m.severity === severity)
    .map((m) => String(m.content))
    .join(" ");
}

beforeEach(() => {
  execFileCalls = [];
  posted = [];
  availableEncoders = ["libx264", "libvpx-vp9", "prores_ks", "aac", "libopus"];
  renderComposited.mockReset();
  renderComposited.mockResolvedValue({ totalFrames: 120, skippedClips: [] });
});

describe("RenderTimeline — refusals", () => {
  it("refuses mp4 with alpha before decoding anything", async () => {
    await expect(
      render(sequence(), { format: "mp4", alpha: true })
    ).rejects.toThrow(/no alpha channel[\s\S]*webm, mov, png_sequence/);
    expect(renderComposited).not.toHaveBeenCalled();
  });

  it("refuses a format this ffmpeg build has no encoder for", async () => {
    availableEncoders = ["libx264", "aac"];
    await expect(render(sequence(), { format: "mov" })).rejects.toThrow(
      /no "prores_ks" encoder/
    );
    expect(renderComposited).not.toHaveBeenCalled();
  });

  it("renders mov once prores_ks is present — the same input, the other way", async () => {
    await expect(render(sequence(), { format: "mov" })).resolves.toBeDefined();
    expect(renderComposited).toHaveBeenCalledTimes(1);
  });

  it("refuses an unknown format and names the ones it has", async () => {
    await expect(render(sequence(), { format: "gif" })).rejects.toThrow(
      /Unknown render format "gif"/
    );
  });

  it("refuses to answer an alpha request with the opaque rough cut", async () => {
    renderComposited.mockRejectedValue(
      new CompositorUnavailableError(new Error("no adapter"))
    );
    await expect(
      render(sequence(), { format: "webm", alpha: true })
    ).rejects.toThrow(/rough-cut fallback only writes opaque MP4/);
    expect(ffmpegArgs().some((a) => a.includes("-f concat"))).toBe(false);
  });
});

describe("RenderTimeline — format pass-through", () => {
  it("hands the resolved encoder arguments to the frame loop", async () => {
    await render(sequence(), { format: "webm", alpha: true });
    const opts = renderComposited.mock.calls[0][0];
    expect(opts.output).toMatchObject({
      format: "webm",
      alpha: true,
      encoderArgs: ["-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p"]
    });
    expect(String(opts.outPath)).toMatch(/\.webm$/);
  });

  it("passes a codec override and a bitrate through to the encoder arguments", async () => {
    await render(sequence(), {
      format: "mp4",
      video_codec: "libx265",
      bitrate: 6_000_000
    });
    expect(renderComposited.mock.calls[0][0].output.encoderArgs).toEqual([
      "-c:v",
      "libx265",
      "-pix_fmt",
      "yuv420p",
      "-b:v",
      "6000000"
    ]);
  });

  it("muxes a webm's audio as Opus, which is what the container carries", async () => {
    const seq = sequence();
    seq.clips.push(audioClip as never);
    await render(seq, { format: "webm" });
    const mix = ffmpegArgs().find((a) => a.includes("apad"));
    expect(mix).toContain("-c:a libopus");
    expect(mix).toMatch(/mixed\.webm/);
  });

  it("reports the format and alpha it actually wrote", async () => {
    const out = await render(sequence(), { format: "mov", alpha: true });
    expect(out.output.format).toBe("mov");
    expect(out.output.metadata).toEqual({
      render_mode: "composited",
      format: "mov",
      alpha: true
    });
    expect(out.frames.data).toBeNull();
  });
});

describe("RenderTimeline — png_sequence", () => {
  it("puts the archive on the frames handle and leaves the video handle empty", async () => {
    const out = await render(sequence(), {
      format: "png_sequence",
      alpha: true
    });
    expect(out.output.data).toBeNull();
    expect(out.output.uri).toBe("");
    expect(out.frames.type).toBe("document");
    expect(typeof out.frames.data).toBe("string");
    expect(out.frames.metadata).toMatchObject({
      format: "png_sequence",
      alpha: true,
      content_type: "application/zip"
    });
  });

  it("says the audio was not mixed rather than dropping it silently", async () => {
    const seq = sequence();
    seq.clips.push(audioClip as never);
    await render(seq, { format: "png_sequence" });
    expect(logs("warning")).toMatch(/PNG sequence carries no audio/);
    expect(ffmpegArgs().some((a) => a.includes("amix"))).toBe(false);
  });
});
