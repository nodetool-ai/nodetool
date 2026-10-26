/**
 * RenderTimeline's browser path and its fallbacks. Headless Chromium renders
 * first; the Node compositor runs only when no browser can be launched, and
 * says so on the node's log. Both renderers are mocked, so what is under test
 * is the choice between them and what the node records — the render itself is
 * `timeline-browser-render.test.ts`. The media module is faked as in
 * `timeline-composite.test.ts`, so the audio mix writes a stand-in file.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fsSync from "node:fs";
import { mediaCalls, resetFakeMedia } from "./_fixtures/fake-media.js";

vi.mock("@nodetool-ai/runtime/media", async (importOriginal) =>
  (await import("./_fixtures/fake-media.js")).fakeMediaModule(await importOriginal())
);

const renderComposited = vi.fn();
const renderInBrowser = vi.fn();

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

vi.mock("../src/nodes/timeline/browserRender.js", async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>;
  return {
    ...original,
    renderTimelineInBrowser: async (opts: { outPath: string }) => {
      const result = await renderInBrowser(opts);
      fsSync.writeFileSync(opts.outPath, Buffer.from("fake:browser"));
      return result;
    }
  };
});

const { RenderTimelineNode } = await import("../src/nodes/timeline.js");
const { BrowserRenderUnavailableError } = await import(
  "../src/nodes/timeline/browserRender.js"
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
    localPath: vi.fn(async () => null),
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

const BROWSER_RESULT = {
  backend: "webgpu",
  adapter: "apple metal-3",
  browser: "Google Chrome",
  encoding: { kind: "video", container: "mp4", codec: "avc" },
  transcoded: false,
  frames: 120,
  degradedBakes: 0,
  fontsUnavailable: []
};

let rendererSetting: string | undefined;

beforeEach(() => {
  rendererSetting = process.env["NODETOOL_TIMELINE_RENDERER"];
  delete process.env["NODETOOL_TIMELINE_RENDERER"];
  resetFakeMedia();
  posted = [];
  renderComposited.mockReset();
  renderComposited.mockResolvedValue({
    totalFrames: 120,
    skippedClips: [],
    fontsUnavailable: []
  });
  renderInBrowser.mockReset();
  renderInBrowser.mockResolvedValue(BROWSER_RESULT);
});

afterEach(() => {
  if (rendererSetting === undefined) delete process.env["NODETOOL_TIMELINE_RENDERER"];
  else process.env["NODETOOL_TIMELINE_RENDERER"] = rendererSetting;
});

describe("RenderTimeline — browser path", () => {
  it("renders in the browser and records it", async () => {
    const out = await render(sequence({ clips: [videoClip()] }));

    expect(renderInBrowser).toHaveBeenCalledTimes(1);
    expect(renderComposited).not.toHaveBeenCalled();
    expect(renderInBrowser.mock.calls[0][0]).toMatchObject({
      width: 1280,
      height: 720,
      fps: 30,
      durationMs: 4000
    });
    expect(renderInBrowser.mock.calls[0][0].signal).toBeInstanceOf(AbortSignal);
    expect(out.output.metadata).toEqual({
      render_mode: "browser",
      format: "mp4",
      alpha: false
    });
  });

  it("logs which compositor and encoder ran", async () => {
    await render(sequence({ clips: [videoClip()] }));
    expect(logs("info")).toContain("WebGPU compositor (apple metal-3)");
    expect(logs("info")).toContain("avc in mp4");
  });

  it("names a Canvas 2D render and an ffmpeg transcode", async () => {
    renderInBrowser.mockResolvedValue({
      ...BROWSER_RESULT,
      backend: "canvas2d",
      adapter: null,
      encoding: { kind: "video", container: "webm", codec: "vp9", intermediate: true },
      transcoded: true
    });
    await render(sequence({ clips: [videoClip()] }));
    expect(logs("info")).toContain("Canvas 2D compositor");
    expect(logs("info")).toContain("transcoded with ffmpeg");
  });

  it("mixes the timeline's audio onto the browser's picture", async () => {
    await render(sequence({ clips: [videoClip(), audioClip()] }));
    const mixes = mediaCalls.filter(
      (call) => call.fn === "muxAudioWithVideoCopy" && call.videoPath.endsWith("rendered.mp4")
    );
    expect(mixes.length).toBeGreaterThan(0);
  });
});

describe("RenderTimeline — fallback to the Node compositor", () => {
  it("renders with the Node compositor and warns when no browser launches", async () => {
    renderInBrowser.mockRejectedValue(
      new BrowserRenderUnavailableError("No Chromium could be launched for the browser render.")
    );
    const out = await render(sequence({ clips: [videoClip()] }));

    expect(renderComposited).toHaveBeenCalledTimes(1);
    expect(out.output.metadata).toMatchObject({ render_mode: "composited" });
    expect(logs("warning")).toContain("No Chromium could be launched");
    expect(logs("warning")).toContain("Node compositor");
  });

  it("fails the render on a browser error instead of rendering twice", async () => {
    renderInBrowser.mockRejectedValue(new Error("The browser render failed: boom"));
    await expect(render(sequence({ clips: [videoClip()] }))).rejects.toThrow("boom");
    expect(renderComposited).not.toHaveBeenCalled();
  });

  it("skips the browser when NODETOOL_TIMELINE_RENDERER=node", async () => {
    process.env["NODETOOL_TIMELINE_RENDERER"] = "node";
    const out = await render(sequence({ clips: [videoClip()] }));
    expect(renderInBrowser).not.toHaveBeenCalled();
    expect(out.output.metadata).toMatchObject({ render_mode: "composited" });
  });
});
