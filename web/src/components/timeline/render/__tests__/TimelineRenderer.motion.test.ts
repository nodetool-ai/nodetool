import { makeClip, makeTrack } from "@nodetool-ai/timeline";

const mockSetLayers = jest.fn();
const mockRender = jest.fn();
const mockFlush = jest.fn().mockResolvedValue(undefined);
const mockDispose = jest.fn();
const mockAddFrame = jest.fn().mockResolvedValue(undefined);
const mockCloseVideo = jest.fn();

jest.mock("../../preview/gpu/createCompositor", () => ({
  createCompositor: jest.fn().mockResolvedValue({
    backend: "canvas2d",
    init: { ok: true },
    compositor: {
      resize: jest.fn(),
      setReferenceSize: jest.fn(),
      setAlpha: jest.fn(),
      setLayers: mockSetLayers,
      render: mockRender,
      flush: mockFlush,
      dispose: mockDispose
    }
  })
}));

jest.mock("mediabunny", () => {
  class BufferTarget {
    buffer = new ArrayBuffer(4);
  }

  class Output {
    target: BufferTarget;

    constructor({ target }: { target: BufferTarget }) {
      this.target = target;
    }

    addVideoTrack() {}
    addAudioTrack() {}
    async start() {}
    async finalize() {}
  }

  class CanvasSource {
    add = mockAddFrame;
    close = mockCloseVideo;
  }

  return {
    BufferTarget,
    Output,
    CanvasSource,
    Mp4OutputFormat: class {},
    AudioBufferSource: class {},
    QUALITY_HIGH: 1,
    QUALITY_MEDIUM: 1
  };
});

jest.mock("../renderAudio", () => ({
  renderTimelineAudio: jest.fn().mockResolvedValue(null)
}));

const textBitmap = {
  width: 1920,
  height: 1080,
  close: jest.fn()
};

jest.mock("../../preview/textRender", () => ({
  TextRasterizer: jest.fn().mockImplementation(() => ({
    rasterize: jest.fn(() => textBitmap),
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

import {
  createAnimationCompileCache,
  resolveAnimatedLayerProps
} from "@nodetool-ai/timeline/render";
import { renderTimeline } from "../TimelineRenderer";

describe("renderTimeline motion", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("samples authored motion for every exported frame", async () => {
    const track = makeTrack({ id: "titles", type: "overlay", index: 0 });
    const clip = makeClip({
      id: "title",
      trackId: track.id,
      name: "Motion title",
      mediaType: "text",
      sourceType: "imported",
      status: "generated",
      startMs: 0,
      durationMs: 1500,
      textStyle: {
        text: "Move",
        fontSizePx: 96,
        color: "#ffffff"
      },
      animations: [
        {
          id: "slide-in",
          role: "in",
          preset: "slide",
          durationMs: 1000,
          easing: "linear",
          params: { direction: "left", distance: 0.25 }
        }
      ]
    });

    const result = await renderTimeline({
      tracks: [track],
      clips: [clip],
      width: 1920,
      height: 1080,
      fps: 2,
      durationMs: 1500,
      resolveUrl: jest.fn().mockResolvedValue(undefined)
    });

    expect(result.mimeType).toBe("video/mp4");
    expect(result.bytes).toHaveLength(4);
    expect(mockSetLayers).toHaveBeenCalledTimes(3);
    expect(mockAddFrame).toHaveBeenCalledTimes(3);

    const expectedCache = createAnimationCompileCache();
    const baseLayer = {
      clip,
      transform: clip.transform,
      opacity: clip.opacity ?? 1
    };
    [0, 500, 1000].forEach((timeMs, index) => {
      const expected = resolveAnimatedLayerProps(
        baseLayer,
        timeMs,
        { width: 1920, height: 1080 },
        expectedCache
      );
      expect(mockSetLayers.mock.calls[index][0][0]).toEqual(
        expect.objectContaining({
          id: "t:title",
          opacity: expected.opacity,
          transform: expected.transform
        })
      );
    });
    expect(mockRender).toHaveBeenCalledTimes(3);
    expect(mockFlush).toHaveBeenCalledTimes(3);
    expect(mockCloseVideo).toHaveBeenCalled();
    expect(mockDispose).toHaveBeenCalled();
  });

  it("composites one instant per sample when motion blur is on", async () => {
    const track = makeTrack({ id: "titles", type: "overlay", index: 0 });
    const clip = makeClip({
      id: "title",
      trackId: track.id,
      name: "Motion title",
      mediaType: "text",
      sourceType: "imported",
      status: "generated",
      startMs: 0,
      durationMs: 1500,
      textStyle: { text: "Move", fontSizePx: 96, color: "#ffffff" },
      animations: [
        {
          id: "slide-in",
          role: "in",
          preset: "slide",
          durationMs: 1000,
          easing: "linear",
          params: { direction: "left", distance: 0.25 }
        }
      ]
    });

    const samplesPerFrame = 4;
    await renderTimeline({
      tracks: [track],
      clips: [clip],
      width: 1920,
      height: 1080,
      fps: 2,
      durationMs: 1500,
      resolveUrl: jest.fn().mockResolvedValue(undefined),
      motionBlur: { samplesPerFrame, shutterAngle: 180 }
    });

    // Three frames, four instants each — and still three encoded frames, since
    // the samples are averaged rather than emitted.
    expect(mockSetLayers).toHaveBeenCalledTimes(3 * samplesPerFrame);
    expect(mockAddFrame).toHaveBeenCalledTimes(3);

    // At 2fps a frame is 500ms and a 180-degree shutter is open for 250 of
    // them, so the four instants sit at the midpoints of that window's
    // quarters: 31.25ms, 93.75ms, 156.25ms and 218.75ms into the frame.
    const cache = createAnimationCompileCache();
    const baseLayer = {
      clip,
      transform: clip.transform,
      opacity: clip.opacity ?? 1
    };
    [31.25, 93.75, 156.25, 218.75].forEach((timeMs, index) => {
      const expected = resolveAnimatedLayerProps(
        baseLayer,
        timeMs,
        { width: 1920, height: 1080 },
        cache
      );
      expect(mockSetLayers.mock.calls[index][0][0]).toEqual(
        expect.objectContaining({ transform: expected.transform })
      );
    });
  });
});
