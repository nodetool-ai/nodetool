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

jest.mock("../../preview/gpu/createCompositor", () => ({
  createCompositor: jest.fn().mockResolvedValue({
    backend: "canvas2d",
    init: { ok: true },
    compositor: {
      resize: jest.fn(),
      setReferenceSize: jest.fn(),
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
    addVideoTrack() {}
    addAudioTrack() {}
    async start() {}
    async finalize() {}
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
  renderTimelineAudio: jest.fn().mockResolvedValue({ length: 1 })
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

const render = (format?: "mp4" | "webm" | "png_sequence") =>
  renderTimeline({
    tracks: [track],
    clips: [clip],
    width: 32,
    height: 32,
    fps: 2,
    durationMs: 1500,
    format,
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

    const entries = unzipSync(result.bytes);
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
