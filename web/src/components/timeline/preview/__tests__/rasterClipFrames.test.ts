import { DEFAULT_MODEL3D_STYLE, makeClip } from "@nodetool-ai/timeline";

import { stub } from "../../../../test-utils/doubles";
import type { Model3DFrameRequest } from "../../Tracks/model3dClipFrames";

const setLayers = jest.fn();
const render = jest.fn();
const dispose = jest.fn();
const rasterizeText = jest.fn(() => ({
  width: 1920,
  height: 1080,
  close: jest.fn()
}));
const resolveAnimatedLayerProps = jest.fn(
  (layer: { opacity: number }, timelineTimeMs: number) => ({
    opacity: layer.opacity,
    transform: {
      position: { x: timelineTimeMs, y: 0 },
      scale: { x: 1, y: 1 },
      rotation: 0,
      anchor: { x: 0.5, y: 0.5 }
    }
  })
);

jest.mock("../gpu/canvas2dCompositor", () => ({
  Canvas2DCompositor: jest.fn().mockImplementation(() => ({
    init: jest.fn().mockResolvedValue({ ok: true }),
    resize: jest.fn(),
    setReferenceSize: jest.fn(),
    setLayers,
    render,
    dispose
  }))
}));

jest.mock("@nodetool-ai/timeline/render", () => ({
  createAnimationCompileCache: jest.fn(() => new Map()),
  resolveAnimatedLayerProps,
  resolveTextStaggerContext: jest.fn(() => null)
}));

jest.mock("../textRender", () => ({
  TextRasterizer: jest.fn().mockImplementation(() => ({
    rasterize: rasterizeText,
    dispose: jest.fn()
  }))
}));

jest.mock("../shapeRender", () => ({
  ShapeRasterizer: jest.fn().mockImplementation(() => ({
    rasterize: jest.fn(),
    dispose: jest.fn()
  }))
}));

/** The canvas a render session would hand back, one per requested frame. */
const model3dCanvas = stub<OffscreenCanvas>({ width: 320, height: 180 });
const drawModel3DClipFrames = jest.fn(
  async (
    _clip: unknown,
    frames: readonly Model3DFrameRequest[],
    _size: unknown,
    draw: (canvas: OffscreenCanvas, index: number) => unknown
  ) => frames.map((_frame, index) => draw(model3dCanvas, index))
);

jest.mock("../../Tracks/model3dClipFrames", () => ({
  drawModel3DClipFrames: (...args: unknown[]) =>
    (drawModel3DClipFrames as unknown as (...a: unknown[]) => unknown)(...args),
  model3dSourceTimeSec: (_clip: unknown, timelineTimeMs: number) =>
    timelineTimeMs / 1000
}));

import { renderRasterClipFrames } from "../rasterClipFrames";

describe("renderRasterClipFrames", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest
      .spyOn(HTMLCanvasElement.prototype, "toDataURL")
      .mockReturnValue("data:image/jpeg;base64,frame");
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("renders every requested animated text frame through the compositor", async () => {
    const clip = makeClip({
      id: "title-1",
      trackId: "overlay-1",
      name: "Title",
      mediaType: "text",
      sourceType: "imported",
      startMs: 1000,
      durationMs: 2000,
      opacity: 0.8,
      textStyle: {
        text: "Motion",
        fontSizePx: 96,
        color: "#ffffff"
      }
    });

    const frames = await renderRasterClipFrames(
      clip,
      [1000, 1500],
      320,
      1920,
      1080
    );

    expect(rasterizeText).toHaveBeenCalledWith(
      clip.textStyle,
      1920,
      1080
    );
    expect(resolveAnimatedLayerProps).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ clip, opacity: 0.8 }),
      1000,
      { width: 1920, height: 1080 },
      expect.any(Map)
    );
    expect(resolveAnimatedLayerProps).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ clip, opacity: 0.8 }),
      1500,
      { width: 1920, height: 1080 },
      expect.any(Map)
    );
    expect(setLayers).toHaveBeenCalledTimes(2);
    expect(render).toHaveBeenCalledTimes(2);
    expect(frames).toEqual([
      {
        width: 320,
        height: 180,
        dataUrl: "data:image/jpeg;base64,frame"
      },
      {
        width: 320,
        height: 180,
        dataUrl: "data:image/jpeg;base64,frame"
      }
    ]);
    expect(dispose).toHaveBeenCalled();
  });

  it("composites a 3D clip's session frames, one data URL per time", async () => {
    // T4 left `model3d` throwing here on purpose; `ui_timeline_get_clip_frames`
    // now returns real frames for one, so the throw must be gone.
    const clip = makeClip({
      id: "cube-1",
      trackId: "overlay-1",
      name: "Cube",
      mediaType: "model3d",
      sourceType: "imported",
      status: "generated",
      currentAssetId: "glb-1",
      startMs: 1000,
      durationMs: 4000,
      model3dStyle: DEFAULT_MODEL3D_STYLE
    });

    const frames = await renderRasterClipFrames(
      clip,
      [1000, 3000],
      320,
      1920,
      1080
    );

    expect(frames).toEqual([
      { width: 320, height: 180, dataUrl: "data:image/jpeg;base64,frame" },
      { width: 320, height: 180, dataUrl: "data:image/jpeg;base64,frame" }
    ]);
    // One request per timecode, at the clip's own glTF clock and rendered at
    // the output size rather than the full sequence.
    const call = drawModel3DClipFrames.mock.calls[0];
    expect(call[1].map((frame) => frame.timeSec)).toEqual([1, 3]);
    expect(call[2]).toEqual({ width: 320, height: 180 });
    // Each frame goes through the compositor as a canvas source, so the clip's
    // transform, opacity and effects apply the way they do to any other layer.
    expect(setLayers).toHaveBeenCalledTimes(2);
    expect(render).toHaveBeenCalledTimes(2);
    expect(dispose).toHaveBeenCalled();
  });

  it("still refuses a media type it cannot rasterize", async () => {
    const clip = makeClip({
      id: "vid-1",
      trackId: "video-1",
      name: "Take 1",
      mediaType: "video",
      sourceType: "imported",
      durationMs: 1000
    });

    await expect(
      renderRasterClipFrames(clip, [0], 320, 1920, 1080)
    ).rejects.toThrow(/Cannot rasterize video clip/);
  });
});
