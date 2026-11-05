/**
 * The export frees each pooled decoder once its clip has passed, including
 * the repeater and echo copies the scene decodes under their own ids.
 */
import { makeClip, makeTrack } from "@nodetool-ai/timeline";

const mockSetLayers = jest.fn();
const mockRender = jest.fn();
const mockFlush = jest.fn().mockResolvedValue(undefined);
const mockDispose = jest.fn();
const mockAddFrame = jest.fn().mockResolvedValue(undefined);
const mockCloseVideo = jest.fn();
const mockSeekVideo = jest.fn().mockResolvedValue({ width: 1920, height: 1080 });

const mockRelease = jest.fn();

jest.mock("../OffscreenVideoPool", () => ({
  OffscreenVideoPool: jest.fn().mockImplementation(() => ({
    seek: mockSeekVideo,
    release: mockRelease,
    dispose: jest.fn()
  }))
}));

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
    windowOf: jest.fn(),
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

describe("renderTimeline decoder release", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("releases a repeated and echoed video's copies after they pass", async () => {
    const track = makeTrack({ id: "picture", type: "video", index: 0 });
    const clip = makeClip({
      id: "shot",
      trackId: track.id,
      mediaType: "video",
      sourceType: "imported",
      status: "generated",
      currentAssetId: "asset-video",
      startMs: 0,
      durationMs: 500,
      repeater: { count: 2, positionStep: { x: 0, y: 0 }, timeStepMs: 500 },
      temporalEcho: { copies: 1, intervalMs: 250, opacityDecay: 0.5 }
    });

    await renderTimeline({
      tracks: [track],
      clips: [clip],
      width: 640,
      height: 360,
      fps: 4,
      durationMs: 2000,
      resolveUrl: jest.fn().mockResolvedValue("blob:video")
    });

    const released = mockRelease.mock.calls.map(([id]) => id);
    expect(released).toEqual(
      expect.arrayContaining([
        "shot",
        "shot:echo:1",
        "shot:repeat:1",
        "shot:repeat:1:echo:1"
      ])
    );
  });
  it("decodes and retires temporal neighbors at source time",async()=>{
    const track=makeTrack({id:"v",type:"video",index:0});
    const clip=makeClip({id:"noise",trackId:"v",mediaType:"video",status:"generated",sourceType:"imported",currentAssetId:"asset",
      startMs:0,durationMs:500,inPointMs:200,effects:[{id:"d",type:"denoise",enabled:true,temporalStrength:1}]});
    await renderTimeline({tracks:[track],clips:[clip],width:64,height:36,fps:4,durationMs:1000,resolveUrl:async()=>"blob:video"});
    expect(mockSeekVideo.mock.calls.some(([id,,time])=>id==="noise#denoise-before"&&Math.abs(time-.2)<.00001)).toBe(true);
    expect(mockSeekVideo.mock.calls.some(([id,,time])=>id==="noise#denoise-after"&&Math.abs(time-(.2+1/30))<.00001)).toBe(true);
    const layers=mockSetLayers.mock.calls.flatMap(([layers])=>layers);
    expect(layers.some(layer=>layer.temporalSources?.before&&layer.temporalSources?.after)).toBe(true);
    expect(mockRelease).toHaveBeenCalledWith("noise#denoise-before");expect(mockRelease).toHaveBeenCalledWith("noise#denoise-after");
  });

});

it.each([2, 3])("refuses working color space %s before rendering", async (workingColorSpaceVersion) => {
  const options = { workingColorSpaceVersion, tracks: [], clips: [], width: 32, height: 32, fps: 30, durationMs: 1000, resolveUrl: jest.fn() };
  const saved = JSON.stringify(options);
  await expect(renderTimeline(options)).rejects.toThrow(`Document workingColorSpaceVersion is ${workingColorSpaceVersion}. This build supports versions up to 1. Open it with a build that supports this value.`);
  expect(options.resolveUrl).not.toHaveBeenCalled();
  expect(JSON.stringify(options)).toBe(saved);
});
