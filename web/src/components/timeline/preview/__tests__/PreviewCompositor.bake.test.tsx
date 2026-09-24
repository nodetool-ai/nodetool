/**
 * T11: the live preview seeks a baked 3D clip by clip-local time (§D6).
 *
 * The pooled `<video>` element is the preview's decoder, so this renders the
 * compositor with a stub GPU backend and reads the element's `currentTime`.
 * A clip trimmed five seconds into its model and played at 2x still plays its
 * bake from zero, because the bake is that clip already evaluated.
 */

import React from "react";
import { act, render } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../../__mocks__/themeMock";
import {
  computeModel3DBakeHash,
  DEFAULT_MODEL3D_STYLE,
  makeClip,
  makeTrack
} from "@nodetool-ai/timeline";
import type { TimelineClip, TimelineTrack } from "@nodetool-ai/timeline";

const FPS = 30;
const WIDTH = 1920;
const HEIGHT = 1080;

const track: TimelineTrack = makeTrack({
  id: "picture",
  type: "video",
  index: 0
});

/** A trimmed, sped-up 3D clip carrying a bake of its current picture. */
function bakedClip(): TimelineClip {
  const clip = makeClip({
    id: "cube",
    trackId: track.id,
    name: "Cube",
    mediaType: "model3d",
    sourceType: "imported",
    status: "generated",
    startMs: 1000,
    durationMs: 4000,
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

let mockClips: TimelineClip[] = [];
let mockTimeMs = 0;

jest.mock("../../../../stores/timeline/TimelineStore", () => {
  const getState = () => ({
    tracks: [track],
    clips: mockClips,
    width: WIDTH,
    height: HEIGHT,
    fps: FPS,
    patchClip: jest.fn()
  });
  const useTimelineStore = <T,>(selector: (s: unknown) => T): T =>
    selector(getState());
  useTimelineStore.getState = getState;
  return { useTimelineStore, useTimelineStoreApi: () => ({ getState }) };
});

jest.mock("../../../../stores/timeline/TimelinePlaybackStore", () => {
  const getState = () => ({
    currentTimeMs: mockTimeMs,
    isPlaying: false,
    getTimeMs: () => mockTimeMs,
    subscribeTime: () => () => {}
  });
  const useTimelinePlaybackStore = <T,>(selector: (s: unknown) => T): T =>
    selector(getState());
  useTimelinePlaybackStore.getState = getState;
  return { useTimelinePlaybackStore };
});

jest.mock("../../../../stores/timeline/TimelineUIStore", () => {
  const getState = () => ({ selectedClipIds: new Set<string>() });
  const useTimelineUIStore = <T,>(selector: (s: unknown) => T): T =>
    selector(getState());
  useTimelineUIStore.getState = getState;
  return { useTimelineUIStore };
});

jest.mock("../../../../stores/timeline/useTimelineHistoryBatch", () => ({
  useTimelineHistoryBatch: () => ({ begin: jest.fn(), end: jest.fn() })
}));

jest.mock("../../../../stores/AssetStore", () => {
  const getState = () => ({
    get: async (id: string) => ({ id, get_url: `blob:${id}` })
  });
  const useAssetStore = <T,>(selector: (s: unknown) => T): T =>
    selector(getState());
  useAssetStore.getState = getState;
  return { useAssetStore };
});

jest.mock("../gpu/createCompositor", () => ({
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

jest.mock("../TransformGizmoOverlay", () => ({
  TransformGizmoOverlay: () => null
}));

jest.mock("../Model3DLayerSource", () => ({
  Model3DLayerSource: jest.fn().mockImplementation(() => ({
    frame: () => null,
    retain: jest.fn(),
    state: () => undefined,
    prune: jest.fn(),
    dispose: jest.fn()
  }))
}));

const rasterizer = () =>
  jest.fn().mockImplementation(() => ({
    rasterize: () => null,
    dispose: jest.fn()
  }));

jest.mock("../captionRender", () => ({ CaptionRasterizer: rasterizer() }));
jest.mock("../textRender", () => ({ TextRasterizer: rasterizer() }));
jest.mock("../shapeRender", () => ({ ShapeRasterizer: rasterizer() }));

import { PreviewCompositor } from "../PreviewCompositor";

/**
 * jsdom's media element reports no metadata and refuses `load`/`play`, so the
 * pool would defer every seek forever. Reporting HAVE_METADATA and accepting
 * `currentTime` is exactly the browser behaviour the seek path needs.
 */
function stubMediaElement(): void {
  Object.defineProperty(HTMLMediaElement.prototype, "readyState", {
    configurable: true,
    get: () => 1
  });
  const times = new WeakMap<HTMLMediaElement, number>();
  Object.defineProperty(HTMLMediaElement.prototype, "currentTime", {
    configurable: true,
    get(this: HTMLMediaElement) {
      return times.get(this) ?? 0;
    },
    set(this: HTMLMediaElement, value: number) {
      times.set(this, value);
    }
  });
  HTMLMediaElement.prototype.load = jest.fn();
  HTMLMediaElement.prototype.play = jest.fn().mockResolvedValue(undefined);
  HTMLMediaElement.prototype.pause = jest.fn();
}

/** Render the preview at `atMs` and answer the bound element's seek time. */
async function seekAt(atMs: number, asset = "asset-bake", clipId?: string): Promise<number | undefined> {
  mockTimeMs = atMs;
  const view = render(
    <ThemeProvider theme={mockTheme}>
      <PreviewCompositor />
    </ThemeProvider>
  );
  // The asset URL resolves on a microtask, and the pool binds on the render
  // that follows it.
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  const bound = [...view.container.querySelectorAll("video")].find(
    (el) => el.getAttribute("data-asset") === `blob:${asset}` &&
      (clipId === undefined || el.dataset.clipId === clipId)
  );
  const seeked = bound?.currentTime;
  view.unmount();
  return seeked;
}

describe("PreviewCompositor — a baked 3D clip", () => {
  beforeAll(stubMediaElement);

  beforeEach(() => {
    mockClips = [bakedClip()];
  });

  it("seeks the bake to zero at the clip's first frame", async () => {
    expect(await seekAt(1000)).toBe(0);
  });

  it("seeks one second in one second later", async () => {
    expect(await seekAt(2000)).toBe(1);
  });

  it("binds no video element while the bake is stale", async () => {
    const stale = bakedClip();
    stale.model3dStyle = {
      ...stale.model3dStyle!,
      bake: { assetId: "asset-bake", dependencyHash: "not-the-hash" }
    };
    mockClips = [stale];
    expect(await seekAt(2000)).toBeUndefined();
  });
});

describe("PreviewCompositor — repeated video", () => {
  beforeAll(stubMediaElement);

  it("seeks each expanded copy using its own shifted start", async () => {
    mockClips = [makeClip({
      id: "shot",
      trackId: track.id,
      name: "Shot",
      mediaType: "video",
      sourceType: "imported",
      status: "generated",
      startMs: 0,
      durationMs: 2000,
      inPointMs: 1000,
      currentAssetId: "asset-video",
      repeater: { count: 2, positionStep: { x: 20, y: 0 }, timeStepMs: 100 },
      temporalEcho: { copies: 1, intervalMs: 200, opacityDecay: 0.5 }
    })];
    expect(await seekAt(500, "asset-video", "shot:repeat:1")).toBeCloseTo(1.4);
    expect(await seekAt(500, "asset-video", "shot:repeat:1:echo:1")).toBeCloseTo(1.2);
  });
});
