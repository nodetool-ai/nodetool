/**
 * T13: an alpha bake this browser cannot play falls back to the live layer.
 *
 * VP9 with alpha decodes in Chromium and Firefox and not in Safari (§R6), and
 * an export that drew the bake anyway would put an opaque box over the footage
 * the clip was made to sit on. So the export probes each transparent bake once
 * before the first frame: a decode error, or a first frame with no alpha at
 * all, and the clip renders from its 3D session instead — with the swap
 * reported, because the file is then the proxy rather than the bake.
 *
 * The probe is mocked: what is under test is which source the export reaches
 * for once the answer is known, not how a video element answers.
 */

import {
  computeModel3DBakeHash,
  DEFAULT_MODEL3D_STYLE,
  makeClip,
  makeTrack
} from "@nodetool-ai/timeline";
import type { TimelineClip } from "@nodetool-ai/timeline";

const mockSeek = jest.fn();
const mockProbe = jest.fn();
const mockLoad = jest.fn();
const mockFrame = jest.fn();

jest.mock("../OffscreenVideoPool", () => ({
  OffscreenVideoPool: jest.fn().mockImplementation(() => ({
    seek: mockSeek,
    release: jest.fn(),
    dispose: jest.fn()
  }))
}));

jest.mock("../../preview/Model3DLayerSource", () => ({
  Model3DLayerSource: jest.fn().mockImplementation(() => ({
    load: mockLoad,
    frame: mockFrame,
    dispose: jest.fn()
  }))
}));

jest.mock("../../preview/bakeDecoding", () => ({
  ...jest.requireActual("../../preview/bakeDecoding"),
  probeAlphaBake: (...args: unknown[]) => mockProbe(...args)
}));

jest.mock("../../preview/gpu/createCompositor", () => ({
  createCompositor: jest.fn().mockResolvedValue({
    backend: "canvas2d",
    init: { ok: true },
    compositor: {
      resize: jest.fn(),
      setReferenceSize: jest.fn(),
      setAlpha: jest.fn(),
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
    add = jest.fn().mockResolvedValue(undefined);
    close = jest.fn();
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

import { renderTimeline } from "../TimelineRenderer";

const FPS = 2;
const WIDTH = 320;
const HEIGHT = 180;

const track = makeTrack({ id: "picture", type: "video", index: 0 });

/** A 3D clip with a transparent style whose bake still names its picture. */
function transparentBakedClip(): TimelineClip {
  const clip = makeClip({
    id: "cube",
    trackId: track.id,
    name: "Cube",
    mediaType: "model3d",
    sourceType: "imported",
    status: "generated",
    startMs: 0,
    durationMs: 1000,
    currentAssetId: "asset-glb",
    model3dStyle: {
      ...DEFAULT_MODEL3D_STYLE,
      background: { transparent: true }
    }
  });
  clip.model3dStyle = {
    ...clip.model3dStyle!,
    bake: {
      assetId: "asset-bake",
      dependencyHash: computeModel3DBakeHash(clip, {
        fps: FPS,
        width: WIDTH,
        height: HEIGHT
      })
    }
  };
  return clip;
}

function exportWith(clip: TimelineClip) {
  return renderTimeline({
    tracks: [track],
    clips: [clip],
    width: WIDTH,
    height: HEIGHT,
    fps: FPS,
    durationMs: 1000,
    resolveUrl: jest.fn().mockResolvedValue("blob:bake")
  });
}

describe("renderTimeline — an alpha bake the browser cannot decode", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSeek.mockResolvedValue({ videoWidth: WIDTH, videoHeight: HEIGHT });
    mockLoad.mockResolvedValue({});
    mockFrame.mockReturnValue({ width: WIDTH, height: HEIGHT });
  });

  it("plays the bake when the probe finds alpha", async () => {
    mockProbe.mockResolvedValue(null);
    const result = await exportWith(transparentBakedClip());

    expect(mockProbe).toHaveBeenCalledWith("blob:bake", undefined);
    expect(mockSeek).toHaveBeenCalled();
    expect(mockFrame).not.toHaveBeenCalled();
    expect(result.degradations).toEqual([]);
  });

  it("draws the live 3D layer and reports it when the frame has no alpha", async () => {
    mockProbe.mockResolvedValue("no_alpha");
    const result = await exportWith(transparentBakedClip());

    // The bake is never decoded: the clip's own session draws every frame.
    expect(mockSeek).not.toHaveBeenCalled();
    expect(mockFrame).toHaveBeenCalled();
    expect(result.degradations).toEqual([
      { clipId: "cube", assetId: "asset-bake", reason: "no_alpha" }
    ]);
  });

  it("treats a decode error the same way", async () => {
    mockProbe.mockResolvedValue("decode_error");
    const result = await exportWith(transparentBakedClip());

    expect(mockSeek).not.toHaveBeenCalled();
    expect(result.degradations[0]?.reason).toBe("decode_error");
  });

  it("does not probe an opaque bake at all", async () => {
    const clip = transparentBakedClip();
    // Same clip with an opaque background: a new hash, so the bake is stored
    // against the style it was rendered at.
    clip.model3dStyle = {
      ...clip.model3dStyle!,
      background: { transparent: false, color: "#101010" }
    };
    clip.model3dStyle = {
      ...clip.model3dStyle,
      bake: {
        assetId: "asset-bake",
        dependencyHash: computeModel3DBakeHash(clip, {
          fps: FPS,
          width: WIDTH,
          height: HEIGHT
        })
      }
    };
    const result = await exportWith(clip);

    expect(mockProbe).not.toHaveBeenCalled();
    expect(mockSeek).toHaveBeenCalled();
    expect(result.degradations).toEqual([]);
  });
});
