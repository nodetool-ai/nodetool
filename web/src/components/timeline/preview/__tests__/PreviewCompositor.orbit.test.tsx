/**
 * T10 wiring: the preview mounts the orbit overlay for a selected `model3d`
 * clip, and an in-flight pose reaches the layer the 3D source draws.
 *
 * The overlay itself is covered by `Model3DOrbitOverlay.test.tsx`; this pins
 * the seam between the two, which is the part that can silently go missing —
 * the overlay shipped unmounted, and nothing failed.
 */

import React from "react";
import { act, render } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../../__mocks__/themeMock";
import { DEFAULT_MODEL3D_STYLE, makeClip, makeTrack } from "@nodetool-ai/timeline";
import type {
  ClipModel3DCamera,
  TimelineClip,
  TimelineTrack
} from "@nodetool-ai/timeline";

const FPS = 30;
const WIDTH = 640;
const HEIGHT = 360;

const track: TimelineTrack = makeTrack({
  id: "picture",
  type: "video",
  index: 0
});

function modelClip(id: string, mediaType: "model3d" | "video"): TimelineClip {
  const clip = makeClip({
    id,
    trackId: track.id,
    name: id,
    mediaType,
    sourceType: "imported",
    status: "generated",
    startMs: 0,
    durationMs: 4000,
    currentAssetId: "asset-glb"
  });
  if (mediaType === "model3d") {
    clip.model3dStyle = { ...DEFAULT_MODEL3D_STYLE };
  }
  return clip;
}

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
    currentTimeMs: 0,
    isPlaying: false,
    getTimeMs: () => 0,
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

jest.mock("../TransformGizmoOverlay", () => ({
  TransformGizmoOverlay: () => null
}));

/**
 * Stands in for the real overlay: records that it was mounted, with which
 * clip, and hands the host a pose so the resolver's drag branch runs.
 */
let overlayMounts: Array<{ clipId: string; frameHeight: number }> = [];
let publishPose: ((camera: ClipModel3DCamera | null) => void) | null = null;

jest.mock("../Model3DOrbitOverlay", () => ({
  Model3DOrbitOverlay: (props: {
    clip: TimelineClip;
    frameHeight: number;
    onPreviewCamera?: (camera: ClipModel3DCamera | null) => void;
  }) => {
    overlayMounts.push({
      clipId: props.clip.id,
      frameHeight: props.frameHeight
    });
    publishPose = props.onPreviewCamera ?? null;
    return null;
  }
}));

/** Records the style each frame() call is asked to draw. */
const framedCameras: ClipModel3DCamera[] = [];

jest.mock("../Model3DLayerSource", () => ({
  Model3DLayerSource: jest.fn().mockImplementation(() => ({
    frame: (layer: { model3dStyle?: { camera: ClipModel3DCamera } }) => {
      if (layer.model3dStyle) framedCameras.push(layer.model3dStyle.camera);
      return null;
    },
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

async function mountPreview() {
  const view = render(
    <ThemeProvider theme={mockTheme}>
      <PreviewCompositor />
    </ThemeProvider>
  );
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  return view;
}

describe("PreviewCompositor — the orbit overlay", () => {
  beforeEach(() => {
    overlayMounts = [];
    framedCameras.length = 0;
    publishPose = null;
  });

  it("mounts the overlay for a selected 3D clip", async () => {
    mockClips = [modelClip("cube", "model3d")];
    mockSelected = new Set(["cube"]);
    const view = await mountPreview();
    expect(overlayMounts.map((m) => m.clipId)).toContain("cube");
    view.unmount();
  });

  it("does not mount it for a selected clip that is not 3D", async () => {
    mockClips = [modelClip("shot", "video")];
    mockSelected = new Set(["shot"]);
    const view = await mountPreview();
    expect(overlayMounts).toHaveLength(0);
    view.unmount();
  });

  it("does not mount it when nothing is selected", async () => {
    mockClips = [modelClip("cube", "model3d")];
    mockSelected = new Set<string>();
    const view = await mountPreview();
    expect(overlayMounts).toHaveLength(0);
    view.unmount();
  });

  it("draws the pose a gesture publishes, before it is committed", async () => {
    mockClips = [modelClip("cube", "model3d")];
    mockSelected = new Set(["cube"]);
    const view = await mountPreview();
    expect(publishPose).not.toBeNull();

    const dragged: ClipModel3DCamera = {
      ...DEFAULT_MODEL3D_STYLE.camera,
      azimuthDeg: 217,
      elevationDeg: -12
    };
    framedCameras.length = 0;
    await act(async () => {
      publishPose!(dragged);
      await Promise.resolve();
    });

    expect(framedCameras.at(-1)).toMatchObject({
      azimuthDeg: 217,
      elevationDeg: -12
    });
    expect(mockClips[0].model3dStyle?.camera.azimuthDeg).toBe(
      DEFAULT_MODEL3D_STYLE.camera.azimuthDeg
    );
    view.unmount();
  });
});
