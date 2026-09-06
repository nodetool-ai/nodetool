/**
 * T11: the browser export seeks a baked 3D clip by clip-local time (§D6).
 *
 * A bake is the clip's evaluated picture from its own first frame, so a clip
 * trimmed five seconds into its model and played at 2x still plays its bake
 * from zero. The video pool is mocked because what is under test is the
 * timestamp the export asks for, not what a decoder returns for it.
 */

import { computeModel3DBakeHash, DEFAULT_MODEL3D_STYLE, makeClip, makeTrack } from "@nodetool-ai/timeline";
import type { TimelineClip } from "@nodetool-ai/timeline";

const mockSeek = jest.fn();

jest.mock("../OffscreenVideoPool", () => ({
  OffscreenVideoPool: jest.fn().mockImplementation(() => ({
    seek: mockSeek,
    release: jest.fn(),
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

/** A trimmed, sped-up 3D clip whose bake still names its current picture. */
function bakedClip(): TimelineClip {
  const clip = makeClip({
    id: "cube",
    trackId: track.id,
    name: "Cube",
    mediaType: "model3d",
    sourceType: "imported",
    status: "generated",
    startMs: 1000,
    durationMs: 2000,
    inPointMs: 5000,
    speedMultiplier: 2,
    currentAssetId: "asset-glb",
    model3dStyle: {
      ...DEFAULT_MODEL3D_STYLE,
      background: { transparent: false, color: "#101010" }
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

async function exportWith(clip: TimelineClip): Promise<void> {
  await renderTimeline({
    tracks: [track],
    clips: [clip],
    width: WIDTH,
    height: HEIGHT,
    fps: FPS,
    // The sequence runs a second past the clip, so every frame of the clip
    // is exported: 1000, 1500, 2000 and 2500ms.
    durationMs: 3000,
    resolveUrl: jest.fn().mockResolvedValue("blob:bake")
  });
}

describe("renderTimeline — baked 3D clips", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSeek.mockResolvedValue({ videoWidth: WIDTH, videoHeight: HEIGHT });
  });

  it("seeks the bake from its own zero, one frame per second at 2 fps", async () => {
    await exportWith(bakedClip());

    // The clip is on screen from 1000ms; at 2 fps the frames inside it are
    // 1000, 1500, 2000 and 2500ms — 0, 0.5, 1 and 1.5s into the bake.
    const seeks = mockSeek.mock.calls.map((call) => call[2]);
    expect(seeks[0]).toBe(0);
    expect(seeks).toEqual([0, 0.5, 1, 1.5]);
    expect(mockSeek.mock.calls[0][1]).toBe("blob:bake");
  });

  it("does not decode a video at all while the bake is stale", async () => {
    const stale = bakedClip();
    stale.model3dStyle = {
      ...stale.model3dStyle!,
      bake: { assetId: "asset-bake", dependencyHash: "not-the-hash" }
    };
    await exportWith(stale);
    expect(mockSeek).not.toHaveBeenCalled();
  });

  it("still seeks an ordinary video clip by its source mapping", async () => {
    const video = makeClip({
      id: "shot",
      trackId: track.id,
      name: "Shot",
      mediaType: "video",
      sourceType: "imported",
      status: "generated",
      startMs: 1000,
      durationMs: 2000,
      inPointMs: 5000,
      speedMultiplier: 2,
      currentAssetId: "asset-mp4"
    });
    await exportWith(video);
    expect(mockSeek.mock.calls.map((call) => call[2])).toEqual([5, 6, 7, 8]);
  });
});
