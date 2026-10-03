/**
 * The browser export's format choice (T27): which container the muxer is
 * built for, which codecs go into it, and the PNG-sequence path that leaves
 * the muxer out entirely.
 *
 * The compositor, mediabunny and the rasterizers are faked — what is under
 * test is the routing, not the encode. The one assertion that is about bytes
 * is the zip: it has to hold one entry per frame plus a manifest, because
 * that is the contract the server's own `png_sequence` render writes.
 */
import { makeClip, makeTrack } from "@nodetool-ai/timeline";
import { unzipSync, strFromU8 } from "fflate";

const mockAddFrame = jest.fn().mockResolvedValue(undefined);
const mockCloseVideo = jest.fn();
/** Every `new Output({format})` and `new CanvasSource(_, config)` this run made. */
const outputFormats: string[] = [];
const videoConfigs: Array<Record<string, unknown>> = [];
const audioConfigs: Array<Record<string, unknown>> = [];

const mockSetAlpha = jest.fn();
const mockCancel = jest.fn().mockResolvedValue(undefined);
const mockRenderAudio = jest.fn().mockResolvedValue({ length: 1 });

jest.mock("../../preview/gpu/createCompositor", () => ({
  createCompositor: jest.fn().mockResolvedValue({
    backend: "canvas2d",
    init: { ok: true },
    compositor: {
      resize: jest.fn(),
      setReferenceSize: jest.fn(),
      setAlpha: mockSetAlpha,
      setLayers: jest.fn(),
      render: jest.fn(),
      flush: jest.fn().mockResolvedValue(undefined),
      dispose: jest.fn()
    }
  })
}));

jest.mock("mediabunny", () => {
  class BufferTarget {
    buffer = new ArrayBuffer(4);
  }
  class Mp4OutputFormat {
    readonly name = "mp4";
  }
  class WebMOutputFormat {
    readonly name = "webm";
  }
  class Output {
    target: BufferTarget;
    constructor({
      target,
      format
    }: {
      target: BufferTarget;
      format: { name: string };
    }) {
      this.target = target;
      outputFormats.push(format.name);
    }
    state = "pending";
    addVideoTrack() {}
    addAudioTrack() {}
    async start() {
      this.state = "started";
    }
    async finalize() {
      this.state = "finalized";
    }
    cancel = async () => {
      this.state = "canceled";
      await mockCancel();
    };
  }
  class CanvasSource {
    add = mockAddFrame;
    close = mockCloseVideo;
    constructor(_canvas: unknown, config: Record<string, unknown>) {
      videoConfigs.push(config);
    }
  }
  class AudioBufferSource {
    constructor(config: Record<string, unknown>) {
      audioConfigs.push(config);
    }
    async add() {}
    close() {}
  }
  return {
    BufferTarget,
    Output,
    CanvasSource,
    Mp4OutputFormat,
    WebMOutputFormat,
    AudioBufferSource,
    QUALITY_HIGH: 1,
    QUALITY_MEDIUM: 1
  };
});

/** A one-sample buffer, so the audio branch is exercised. */
jest.mock("../renderAudio", () => ({
  renderTimelineAudio: (opts: unknown) => mockRenderAudio(opts)
}));

jest.mock("../../preview/textRender", () => ({
  TextRasterizer: jest.fn().mockImplementation(() => ({
    rasterize: jest.fn(() => ({ width: 32, height: 32, close: jest.fn() })),
    dispose: jest.fn()
  }))
}));

jest.mock("../../preview/captionRender", () => ({
  CaptionRasterizer: jest.fn().mockImplementation(() => ({
    rasterize: jest.fn(),
    dispose: jest.fn()
  }))
}));

jest.mock("../../preview/shapeRender", () => ({
  ShapeRasterizer: jest.fn().mockImplementation(() => ({
    rasterize: jest.fn(),
    dispose: jest.fn()
  }))
}));

import { renderTimeline } from "../TimelineRenderer";

/** jsdom's canvas has no encoder, so `toBlob` is stubbed with fixed bytes. */
const PNG_BYTES = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

function stubCanvasToBlob(): void {
  HTMLCanvasElement.prototype.toBlob = function toBlob(
    callback: BlobCallback
  ): void {
    callback({
      arrayBuffer: async () =>
        PNG_BYTES.buffer.slice(0) as ArrayBuffer
    } as unknown as Blob);
  };
}

const track = makeTrack({ id: "titles", type: "overlay", index: 0 });
const clip = makeClip({
  id: "title",
  trackId: track.id,
  name: "Title",
  mediaType: "text",
  sourceType: "imported",
  status: "generated",
  startMs: 0,
  durationMs: 1500,
  textStyle: { text: "Hi", fontSizePx: 96, color: "#ffffff" }
});

function blobBytes(blob: Blob): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

const render = (
  format?: "mp4" | "webm" | "png_sequence",
  alpha?: boolean
) =>
  renderTimeline({
    tracks: [track],
    clips: [clip],
    width: 32,
    height: 32,
    fps: 2,
    durationMs: 1500,
    format,
    alpha,
    resolveUrl: jest.fn().mockResolvedValue(undefined)
  });

beforeEach(() => {
  jest.clearAllMocks();
  outputFormats.length = 0;
  videoConfigs.length = 0;
  audioConfigs.length = 0;
  stubCanvasToBlob();
});

describe("renderTimeline — containers", () => {
  it("defaults to MP4 with H.264 and AAC", async () => {
    const result = await render();
    expect(outputFormats).toEqual(["mp4"]);
    expect(videoConfigs[0]).toMatchObject({ codec: "avc" });
    expect(audioConfigs[0]).toMatchObject({ codec: "aac" });
    expect(result).toMatchObject({ mimeType: "video/mp4", extension: "mp4" });
  });

  it("writes WebM with VP9 and Opus — AAC is not a WebM track", async () => {
    const result = await render("webm");
    expect(outputFormats).toEqual(["webm"]);
    expect(videoConfigs[0]).toMatchObject({ codec: "vp9" });
    expect(audioConfigs[0]).toMatchObject({ codec: "opus" });
    expect(result).toMatchObject({ mimeType: "video/webm", extension: "webm" });
  });
});

describe("renderTimeline — alpha", () => {
  it("refuses mp4 with alpha and names the formats that carry it", async () => {
    // Encoding it opaque and handing it back would look like it worked, which
    // is the failure this refusal exists to prevent.
    await expect(render("mp4", true)).rejects.toThrow(
      /no alpha channel.*webm or png_sequence/s
    );
    expect(outputFormats).toEqual([]);
  });

  it("seeds the compositor transparent only when alpha is asked for", async () => {
    await render("webm", true);
    expect(mockSetAlpha).toHaveBeenCalledWith(true);
    mockSetAlpha.mockClear();
    await render("webm");
    expect(mockSetAlpha).toHaveBeenCalledWith(false);
  });

  it("tells the encoder to keep the channel on a WebM alpha export", async () => {
    // mediabunny defaults to `discard`: without this the compositor draws a
    // transparent frame and the encoder throws the channel away.
    await render("webm", true);
    expect(videoConfigs[0]).toMatchObject({ codec: "vp9", alpha: "keep" });
  });

  it("discards alpha when it was not asked for", async () => {
    await render("webm");
    expect(videoConfigs[0]).toMatchObject({ alpha: "discard" });
    videoConfigs.length = 0;
    await render();
    expect(videoConfigs[0]).toMatchObject({ alpha: "discard" });
  });
});

describe("renderTimeline — png_sequence", () => {
  it("builds no muxer and mixes no audio", async () => {
    await render("png_sequence");
    expect(outputFormats).toEqual([]);
    expect(videoConfigs).toEqual([]);
    expect(audioConfigs).toEqual([]);
    expect(mockAddFrame).not.toHaveBeenCalled();
  });

  it("zips one PNG per frame with a manifest naming the rate and size", async () => {
    const result = await render("png_sequence");
    expect(result).toMatchObject({
      mimeType: "application/zip",
      extension: "zip"
    });

    // The archive comes back as a Blob built from per-frame parts (F34).
    expect(result.bytes).toBeInstanceOf(Blob);
    const entries = unzipSync(await blobBytes(result.bytes as Blob));
    expect(Object.keys(entries).sort()).toEqual([
      "frame_000001.png",
      "frame_000002.png",
      "frame_000003.png",
      "manifest.json"
    ]);
    expect(entries["frame_000001.png"]).toEqual(PNG_BYTES);
    expect(JSON.parse(strFromU8(entries["manifest.json"]))).toEqual({
      format: "png_sequence",
      fps: 2,
      width: 32,
      height: 32,
      count: 3,
      pattern: "frame_%06d.png"
    });
  });
});

describe("renderTimeline — cancel and length", () => {
  it("cancels a started muxer when the render is aborted (F32)", async () => {
    const controller = new AbortController();
    mockAddFrame.mockImplementationOnce(async () => {
      controller.abort();
    });
    await expect(
      renderTimeline({
        tracks: [track],
        clips: [clip],
        width: 32,
        height: 32,
        fps: 2,
        durationMs: 1500,
        resolveUrl: jest.fn().mockResolvedValue(undefined),
        signal: controller.signal
      })
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(mockCancel).toHaveBeenCalledTimes(1);
  });

  it("does not cancel a muxer that finalized", async () => {
    await render();
    expect(mockCancel).not.toHaveBeenCalled();
  });

  it("passes the abort signal into the audio mix (F33)", async () => {
    const controller = new AbortController();
    await renderTimeline({
      tracks: [track],
      clips: [clip],
      width: 32,
      height: 32,
      fps: 2,
      durationMs: 1500,
      resolveUrl: jest.fn().mockResolvedValue(undefined),
      signal: controller.signal
    });
    expect(mockRenderAudio.mock.calls[0][0].signal).toBe(controller.signal);
  });

  it("mixes exactly totalFrames * 1000 / fps of audio (F62)", async () => {
    // 1400 ms at 2 fps rounds to 3 frames = 1500 ms of video.
    await renderTimeline({
      tracks: [track],
      clips: [clip],
      width: 32,
      height: 32,
      fps: 2,
      durationMs: 1400,
      resolveUrl: jest.fn().mockResolvedValue(undefined)
    });
    expect(mockRenderAudio.mock.calls[0][0]).toMatchObject({ durationMs: 1500 });
  });
});
