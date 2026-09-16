/**
 * P0 native media editing preview seam.
 *
 * The inspector owns the audition selection, while PreviewCompositor owns the
 * source substitution and source-clock mapping. This test keeps the same
 * playhead position while switching between Original and Candidate and
 * observes the video source that the compositor asks the GPU to draw.
 *
 * @jest-environment jsdom
 */
import React from "react";
import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { ThemeProvider } from "@mui/material/styles";
import {
  clipSourceMsAt,
  createMediaEditRequest,
  ensureBaselineTake,
  makeClip,
  makeTrack,
  mediaEditTakeMetadata
} from "@nodetool-ai/timeline";
import type { TimelineClip } from "@nodetool-ai/timeline";

import mockTheme from "../../../../__mocks__/themeMock";
import {
  createTimelineInstance,
  TimelineProvider
} from "../../../../stores/timeline/TimelineInstance";
import { PreviewCompositor } from "../PreviewCompositor";

const mockBuildCompositeLayers = jest.fn();

jest.mock("../gpu/createCompositor", () => ({
  createCompositor: jest.fn(async () => ({
    backend: "canvas2d",
    init: { ok: true },
    compositor: {
      resize: jest.fn(),
      setReferenceSize: jest.fn(),
      setAlpha: jest.fn(),
      setLayers: jest.fn(),
      render: jest.fn(),
      flush: jest.fn(async () => {}),
      dispose: jest.fn()
    }
  }))
}));

jest.mock("../TransformGizmoOverlay", () => ({
  TransformGizmoOverlay: () => null
}));

jest.mock("../ReframeFocusOverlay", () => ({
  ReframeFocusOverlay: () => null
}));

jest.mock("../Model3DOrbitOverlay", () => ({
  Model3DOrbitOverlay: () => null
}));

jest.mock("../Model3DLayerSource", () => ({
  Model3DLayerSource: jest.fn().mockImplementation(() => ({
    frame: jest.fn(() => null),
    retain: jest.fn(),
    state: jest.fn(() => undefined),
    prune: jest.fn(),
    dispose: jest.fn()
  }))
}));

function mockRasterizer() {
  return {
    rasterize: jest.fn(() => null),
    dispose: jest.fn()
  };
}

jest.mock("../captionRender", () => ({
  CaptionRasterizer: jest.fn().mockImplementation(mockRasterizer)
}));
jest.mock("../textRender", () => ({
  TextRasterizer: jest.fn().mockImplementation(mockRasterizer)
}));
jest.mock("../shapeRender", () => ({
  ShapeRasterizer: jest.fn().mockImplementation(mockRasterizer)
}));

jest.mock("../compositeLayers", () => ({
  buildCompositeLayers: (layers: unknown[]) => {
    mockBuildCompositeLayers(layers);
    return [];
  },
  buildCompositePrecomposites: () => []
}));

jest.mock("../../../../stores/AssetStore", () => ({
  useAssetStore: (
    selector: (state: { get: (id: string) => Promise<unknown> }) => unknown
  ) =>
    selector({
      get: async (id: string) => ({
        id,
        get_url: `blob:${id}`,
        content_type: "video/mp4"
      })
    })
}));

const capturedClip = (assetId: string) =>
  mockBuildCompositeLayers.mock.calls
    .map((call) => call[0])
    .filter((layers): layers is Array<{ clip: TimelineClip }> => Array.isArray(layers))
    .flat()
    .find((layer) => layer.clip.id === "clip-preview" && layer.clip.currentAssetId === assetId)
    ?.clip;

const makePreviewInstance = () => {
  const instance = createTimelineInstance();
  const track = makeTrack({ id: "track-video", type: "video", name: "Video" });
  const original = makeClip({
    id: "clip-preview",
    trackId: track.id,
    name: "Imported station",
    mediaType: "video",
    sourceType: "imported",
    currentAssetId: "asset-original",
    startMs: 1_200,
    durationMs: 4_000,
    inPointMs: 40_000,
    outPointMs: 44_000,
    versions: []
  });
  const withBaseline = ensureBaselineTake(
    original,
    "2026-01-01T00:00:00.000Z"
  );
  const request = createMediaEditRequest({
    sourceContext: {
      sequenceId: "sequence-preview",
      clipId: "clip-preview",
      sourceAssetId: "asset-original",
      sourceStartMs: 40_000,
      sourceEndMs: 44_000,
      timelineStartMs: 1_200,
      timelineDurationMs: 4_000,
      speedMultiplier: 1
    },
    instruction: "Make the station deserted at night",
    provider: "fake",
    model: "fake-video-edit"
  });
  const candidate = {
    id: "take-candidate",
    createdAt: "2026-01-01T00:01:00.000Z",
    jobId: "request-preview",
    assetId: "asset-candidate",
    workflowUpdatedAt: "2026-01-01T00:01:00.000Z",
    dependencyHash: "",
    paramOverridesSnapshot: {},
    durationMs: 4_000,
    status: "success" as const,
    mediaEdit: mediaEditTakeMetadata(request, "request-preview")
  };
  instance.doc.setState({
    sequenceId: "sequence-preview",
    tracks: [track],
    clips: [{ ...withBaseline, versions: [...(withBaseline.versions ?? []), candidate] }],
    durationMs: 8_000
  });
  instance.playback.getState().seek(2_200);
  return instance;
};

describe("native media editing preview comparison", () => {
  beforeEach(() => {
    mockBuildCompositeLayers.mockClear();
    Object.defineProperty(globalThis, "ResizeObserver", {
      configurable: true,
      value: class {
        observe(): void {}
        disconnect(): void {}
      }
    });
    HTMLMediaElement.prototype.load = jest.fn();
    HTMLMediaElement.prototype.pause = jest.fn();
    HTMLMediaElement.prototype.play = jest.fn(async () => {});
    Object.defineProperty(HTMLMediaElement.prototype, "readyState", {
      configurable: true,
      get: () => 1
    });
    Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", {
      configurable: true,
      get: () => 640
    });
    Object.defineProperty(HTMLVideoElement.prototype, "videoHeight", {
      configurable: true,
      get: () => 360
    });
  });

  it("switches the compositor between Original and Candidate at one clip-relative time", async () => {
    const instance = makePreviewInstance();
    const view = render(
      <ThemeProvider theme={mockTheme}>
        <TimelineProvider instance={instance}>
          <PreviewCompositor />
        </TimelineProvider>
      </ThemeProvider>
    );

    await waitFor(() => {
      expect(capturedClip("asset-original")).toBeDefined();
    });
    const originalClip = capturedClip("asset-original");
    if (!originalClip) {
      throw new Error("Preview did not project the original clip");
    }
    expect(clipSourceMsAt(originalClip, 2_200)).toBe(41_000);

    act(() => {
      instance.ui.getState().setAudition({
        clipId: "clip-preview",
        takeId: "take-candidate"
      });
    });

    await waitFor(() => {
      expect(capturedClip("asset-candidate")).toBeDefined();
    });
    const candidateClip = capturedClip("asset-candidate");
    if (!candidateClip) {
      throw new Error("Preview did not project the candidate clip");
    }
    expect(clipSourceMsAt(candidateClip, 2_200)).toBe(1_000);
    expect(instance.doc.getState().clips[0].currentAssetId).toBe("asset-original");

    mockBuildCompositeLayers.mockClear();
    act(() => instance.ui.getState().setAudition(null));
    await waitFor(() => {
      const originalAfterClear = capturedClip("asset-original");
      expect(originalAfterClear).toBeDefined();
    });
    const originalAfterClear = capturedClip("asset-original");
    if (!originalAfterClear) {
      throw new Error("Preview did not restore the original clip");
    }
    expect(clipSourceMsAt(originalAfterClear, 2_200)).toBe(41_000);
    expect(instance.doc.getState().clips[0].currentAssetId).toBe("asset-original");
    view.unmount();
  });
});
