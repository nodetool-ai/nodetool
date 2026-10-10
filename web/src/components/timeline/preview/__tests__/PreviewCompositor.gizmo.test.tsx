/**
 * The transform gizmo traces the picture at the playhead, so a clip with an
 * animation or keyframes shows its box where the frame draws it, not at the
 * stored transform.
 */

import React from "react";
import { act, render } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../../__mocks__/themeMock";
import { makeClip, makeTrack } from "@nodetool-ai/timeline";
import type { TimelineClip, TimelineTrack } from "@nodetool-ai/timeline";
import {
  createAnimationCompileCache,
  resolveAnimatedLayerProps
} from "@nodetool-ai/timeline/render";

const PLAYHEAD_MS = 250;

const FPS = 30;
const WIDTH = 640;
const HEIGHT = 360;

const track: TimelineTrack = makeTrack({
  id: "picture",
  type: "video",
  index: 0
});

let mockClips: TimelineClip[] = [];
let mockSelected = new Set<string>();

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
    currentTimeMs: PLAYHEAD_MS,
    isPlaying: false,
    getTimeMs: () => PLAYHEAD_MS,
    pause: jest.fn(),
    subscribeTime: () => () => {}
  });
  const useTimelinePlaybackStore = <T,>(selector: (s: unknown) => T): T =>
    selector(getState());
  useTimelinePlaybackStore.getState = getState;
  return { useTimelinePlaybackStore };
});

jest.mock("../../../../stores/timeline/TimelineUIStore", () => {
  const getState = () => ({ selectedClipIds: mockSelected });
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

let gizmoProps: Array<{ clipId: string; displayTransform?: unknown }> = [];

jest.mock("../TransformGizmoOverlay", () => ({
  TransformGizmoOverlay: (props: { clipId: string; displayTransform?: unknown }) => {
    gizmoProps.push(props);
    return null;
  }
}));

jest.mock("../Model3DOrbitOverlay", () => ({
  Model3DOrbitOverlay: () => null
}));

jest.mock("../Model3DLayerSource", () => ({
  Model3DLayerSource: jest.fn().mockImplementation(() => ({
    revive: jest.fn(),
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

describe("PreviewCompositor — the transform gizmo", () => {
  const naturalWidth = Object.getOwnPropertyDescriptor(
    HTMLImageElement.prototype,
    "naturalWidth"
  );
  const naturalHeight = Object.getOwnPropertyDescriptor(
    HTMLImageElement.prototype,
    "naturalHeight"
  );

  const src = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src");

  beforeAll(() => {
    // jsdom fetches no images: report each one decoded instead.
    Object.defineProperty(HTMLImageElement.prototype, "src", {
      configurable: true,
      get() {
        return (this as { fakeSrc?: string }).fakeSrc ?? "";
      },
      set(value: string) {
        const img = this as HTMLImageElement & { fakeSrc?: string };
        img.fakeSrc = value;
        queueMicrotask(() => img.onload?.(new Event("load")));
      }
    });
    Object.defineProperty(HTMLImageElement.prototype, "complete", {
      configurable: true,
      get: () => true
    });
    Object.defineProperty(HTMLImageElement.prototype, "naturalWidth", {
      configurable: true,
      get: () => 400
    });
    Object.defineProperty(HTMLImageElement.prototype, "naturalHeight", {
      configurable: true,
      get: () => 200
    });
  });

  afterAll(() => {
    if (src) Object.defineProperty(HTMLImageElement.prototype, "src", src);
    delete (HTMLImageElement.prototype as { complete?: boolean }).complete;
    if (naturalWidth) {
      Object.defineProperty(HTMLImageElement.prototype, "naturalWidth", naturalWidth);
    }
    if (naturalHeight) {
      Object.defineProperty(HTMLImageElement.prototype, "naturalHeight", naturalHeight);
    }
  });

  it("draws the box at the clip's animated transform", async () => {
    const clip: TimelineClip = makeClip({
      id: "still",
      trackId: track.id,
      name: "still",
      mediaType: "image",
      sourceType: "imported",
      status: "generated",
      startMs: 0,
      durationMs: 4000,
      currentAssetId: "asset-png",
      animations: [
        {
          id: "slide",
          role: "in",
          preset: "slide",
          durationMs: 1000,
          easing: "linear",
          params: { direction: "left", distance: 0.5 }
        }
      ]
    });
    mockClips = [clip];
    mockSelected = new Set(["still"]);
    gizmoProps = [];
    const view = render(
      <ThemeProvider theme={mockTheme}>
        <PreviewCompositor />
      </ThemeProvider>
    );
    await act(async () => {
      for (let i = 0; i < 6; i += 1) await Promise.resolve();
    });

    const last = gizmoProps.filter((p) => p.clipId === "still").at(-1);
    expect(last).toBeDefined();
    const expected = resolveAnimatedLayerProps(
      { clip, transform: clip.transform, opacity: clip.opacity ?? 1 },
      PLAYHEAD_MS,
      { width: WIDTH, height: HEIGHT },
      createAnimationCompileCache()
    ).transform;
    expect(expected).not.toEqual(clip.transform);
    expect(last!.displayTransform).toEqual(expected);
    view.unmount();
  });
});
