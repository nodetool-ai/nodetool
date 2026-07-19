import { makeClip } from "@nodetool-ai/timeline";

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

jest.mock("../sceneModel", () => ({
  createAnimationCompileCache: jest.fn(() => new Map()),
  resolveAnimatedLayerProps
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
});
