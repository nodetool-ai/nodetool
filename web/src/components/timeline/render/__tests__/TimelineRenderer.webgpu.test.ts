/**
 * The export on the WebGPU backend: a device loss or validation error fails
 * the export instead of encoding the remaining frames frozen or blank, and
 * text rasterizes only the window it draws in, as the preview does.
 */
import { makeClip, makeTrack } from "@nodetool-ai/timeline";

const mockSetLayers = jest.fn();
const mockRender = jest.fn();
const mockFlush = jest.fn().mockResolvedValue(undefined);
const mockDispose = jest.fn();
const mockAddFrame = jest.fn().mockResolvedValue(undefined);
const mockCloseVideo = jest.fn();
const mockSeekVideo = jest.fn().mockResolvedValue({ width: 1920, height: 1080 });

jest.mock("../OffscreenVideoPool", () => ({
  OffscreenVideoPool: jest.fn().mockImplementation(() => ({
    seek: mockSeekVideo,
    release: jest.fn(),
    dispose: jest.fn()
  }))
}));

let reportFailure: ((failure: { stage: string; error: unknown }) => void) | undefined;

jest.mock("../../preview/gpu/createCompositor", () => ({
  createCompositor: jest.fn(
    async (
      _canvas: unknown,
      onFailure?: (failure: { stage: string; error: unknown }) => void
    ) => {
      reportFailure = onFailure;
      return {
        backend: "webgpu",
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
      };
    }
  )
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

const mockTextRasterize = jest.fn((..._args: unknown[]) => textBitmap);

jest.mock("../../preview/textRender", () => ({
  TextRasterizer: jest.fn().mockImplementation(() => ({
    rasterize: mockTextRasterize,
    windowOf: () => ({ x: 64, y: 32, width: 640, height: 128 }),
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
    windowOf: jest.fn(),
    dispose: jest.fn()
  }))
}));

import { renderTimeline } from "../TimelineRenderer";

function titleClip() {
  const track = makeTrack({ id: "titles", type: "overlay", index: 0 });
  const clip = makeClip({
    id: "title",
    trackId: track.id,
    mediaType: "text",
    sourceType: "imported",
    status: "generated",
    startMs: 0,
    durationMs: 1500,
    textStyle: { text: "Hold", fontSizePx: 96, color: "#ffffff" }
  });
  return { track, clip };
}

describe("renderTimeline GPU failure", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    reportFailure = undefined;
    jest.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each(["gpu-device-lost", "gpu-validation"])(
    "fails the export on %s",
    async (stage) => {
      mockRender.mockImplementationOnce(() => {
        reportFailure?.({ stage, error: new Error("GPU gone") });
      });
      const { track, clip } = titleClip();
      await expect(
        renderTimeline({
          tracks: [track],
          clips: [clip],
          width: 1920,
          height: 1080,
          fps: 2,
          durationMs: 1500,
          resolveUrl: jest.fn().mockResolvedValue(undefined)
        })
      ).rejects.toThrow(/GPU gone/);
      expect(mockAddFrame).not.toHaveBeenCalled();
      expect(mockDispose).toHaveBeenCalled();
    }
  );

  it("passes a failure handler to the compositor", async () => {
    const { track, clip } = titleClip();
    await renderTimeline({
      tracks: [track],
      clips: [clip],
      width: 1920,
      height: 1080,
      fps: 2,
      durationMs: 1500,
      resolveUrl: jest.fn().mockResolvedValue(undefined)
    });
    expect(reportFailure).toBeInstanceOf(Function);
    expect(mockAddFrame).toHaveBeenCalledTimes(3);
  });

  it("rasterizes text into a window of the frame", async () => {
    const { track, clip } = titleClip();
    await renderTimeline({
      tracks: [track],
      clips: [clip],
      width: 1920,
      height: 1080,
      fps: 2,
      durationMs: 500,
      resolveUrl: jest.fn().mockResolvedValue(undefined)
    });
    const margin = mockTextRasterize.mock.calls[0][5];
    expect(typeof margin).toBe("number");
    expect(mockSetLayers.mock.calls[0][0][0]).toEqual(
      expect.objectContaining({
        sourceWindow: { x: 64, y: 32, frameWidth: 1920, frameHeight: 1080 }
      })
    );
  });
});
