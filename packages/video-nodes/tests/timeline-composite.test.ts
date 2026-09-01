/**
 * RenderTimeline's two render paths: the composited one (the GPU compositor
 * the editor uses) and the rough-cut fallback taken when no GPU device can be
 * acquired. `compositeRender` is mocked so the orchestration around it — what
 * gets rendered, what audio is mixed, what the fallback does — is what's under
 * test; child_process is mocked the same way as `timeline-nodes.test.ts`.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
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
    clips: [],
    transcript: [],
    ...overrides
  };
}

function videoClip(overrides: Record<string, unknown> = {}) {
  return {
    id: "clip-v",
    trackId: "t-video",
    name: "Shot",
    startMs: 0,
    durationMs: 4000,
    mediaType: "video",
    status: "generated",
    currentAssetId: "asset-v",
    ...overrides
  };
}

function audioClip(overrides: Record<string, unknown> = {}) {
  return {
    id: "clip-a",
    trackId: "t-audio",
    name: "Music",
    startMs: 1000,
    durationMs: 3000,
    mediaType: "audio",
    status: "generated",
    currentAssetId: "asset-a",
    ...overrides
  };
}

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

/** Log lines the node posted, joined for substring assertions. */
function logs(severity: string): string {
  return posted
    .filter((m) => m.type === "log_update" && m.severity === severity)
    .map((m) => String(m.content))
    .join(" ");
}

function ffmpegArgs(): string[] {
  return execFileCalls
    .filter((c) => c.cmd === "ffmpeg")
    .map((c) => c.args.join(" "));
}

beforeEach(() => {
  execFileCalls = [];
  posted = [];
  renderComposited.mockReset();
  renderComposited.mockResolvedValue({ totalFrames: 120, skippedClips: [] });
});

describe("RenderTimeline — composited path", () => {
  it("composites the whole sequence at its resolution and rate", async () => {
    await render(sequence({ clips: [videoClip()] }));

    expect(renderComposited).toHaveBeenCalledTimes(1);
    const opts = renderComposited.mock.calls[0][0];
    expect(opts).toMatchObject({
      width: 1280,
      height: 720,
      fps: 30,
      durationMs: 4000
    });
    // No segment-per-clip encode: the rough cut is not involved.
    expect(ffmpegArgs().some((a) => a.includes("-f concat"))).toBe(false);
  });

  it("reports which path produced the bytes", async () => {
    const out = await render(sequence({ clips: [videoClip()] }));
    expect(out.output.metadata).toEqual({ render_mode: "composited" });
  });

  it("passes the run's abort signal down to the frame loop", async () => {
    await render(sequence({ clips: [videoClip()] }));
    expect(renderComposited.mock.calls[0][0].signal).toBeInstanceOf(
      AbortSignal
    );
  });

  it("posts node_progress at most four times a second, last frame included", () => {
    const node = new RenderTimelineNode();
    Object.assign(node, { __node_id: "node-1" });
    const context = contextFor(null);
    const report = (
      node as unknown as {
        progressReporter: (
          c: unknown
        ) => (frame: number, total: number) => void;
      }
    ).progressReporter(context);

    const now = vi.spyOn(Date, "now");
    now.mockReturnValue(1_000);
    report(1, 4);
    now.mockReturnValue(1_100);
    report(2, 4);
    now.mockReturnValue(1_150);
    report(3, 4);
    now.mockReturnValue(1_160);
    report(4, 4);
    now.mockRestore();

    const progress = posted.filter((m) => m.type === "node_progress");
    // Frames 2 and 3 fall inside the 250 ms window; the final frame always posts.
    expect(progress.map((m) => m.progress)).toEqual([1, 4]);
    expect(progress[1]).toMatchObject({ node_id: "node-1", total: 4 });
  });

  it("renders a text-only timeline, which has no clip media at all", async () => {
    const seq = sequence({
      clips: [
        videoClip({
          id: "clip-t",
          mediaType: "text",
          currentAssetId: null,
          textStyle: { text: "Hello", fontSizePx: 64, color: "#fff" }
        })
      ]
    });
    await expect(render(seq)).resolves.toBeDefined();
    expect(renderComposited).toHaveBeenCalledTimes(1);
  });

  it("mixes a video clip's own audio in, since a composite carries none", async () => {
    await render(sequence({ clips: [videoClip(), audioClip()] }));

    const mix = ffmpegArgs().find((a) => a.includes("amix"));
    expect(mix).toBeDefined();
    // Both the audio-track clip and the video clip's embedded audio, and no
    // `[0:a]` — the composited base video is silent.
    expect(mix).toContain("amix=inputs=2");
    expect(mix).not.toContain("[0:a]");
    expect(mix).toContain("-shortest");
  });

  it("leaves a video clip's audio out when it was extracted onto an audio track", async () => {
    const seq = sequence({
      clips: [
        videoClip({ linkId: "link-1" }),
        audioClip({ linkId: "link-1", trackId: "t-audio" })
      ]
    });
    await render(seq);

    const mix = ffmpegArgs().find((a) => a.includes("apad"));
    expect(mix).toBeDefined();
    // One source only: the extracted audio clip.
    expect(mix).not.toContain("amix");
  });

  it("skips audio entirely when include_audio is off", async () => {
    await render(sequence({ clips: [videoClip(), audioClip()] }), {
      include_audio: false
    });
    expect(ffmpegArgs().some((a) => a.includes("amix"))).toBe(false);
  });

  it("rejects a timeline with nothing to render", async () => {
    await expect(render(sequence())).rejects.toThrow(/no renderable clips/);
  });
});

describe("RenderTimeline — fallback when no GPU is available", () => {
  beforeEach(() => {
    renderComposited.mockRejectedValue(
      new CompositorUnavailableError(new Error("no adapter"))
    );
  });

  it("falls back to the rough cut and says so on the job log", async () => {
    const out = await render(sequence({ clips: [videoClip()] }));

    expect(ffmpegArgs().some((a) => a.includes("-f concat"))).toBe(true);
    expect(logs("warning")).toMatch(/rough cut/);
    expect(logs("warning")).toMatch(/no adapter/);
    expect(out.output.metadata).toEqual({ render_mode: "rough_cut" });
  });

  it("keeps the rough cut's own soundtrack in the mix", async () => {
    await render(sequence({ clips: [videoClip(), audioClip()] }));

    const mix = ffmpegArgs().find((a) => a.includes("amix"));
    expect(mix).toContain("[0:a]");
  });

  it("surfaces a non-GPU failure instead of silently degrading", async () => {
    renderComposited.mockRejectedValue(new Error("encoder exploded"));
    await expect(render(sequence({ clips: [videoClip()] }))).rejects.toThrow(
      /encoder exploded/
    );
  });
});
