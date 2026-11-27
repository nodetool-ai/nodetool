/**
 * ClipModel3DSection — the inspector surface of a `model3d` clip (T8): it is
 * offered for a 3D clip and nothing else, its orbit fields patch one camera
 * term without disturbing the others, and its pickers show what the render
 * session read out of the glTF once the model resolves.
 *
 * The session is faked: what matters here is that the section asks the layer
 * source for names and renders the loading state until it answers. The pool
 * itself is covered by `preview/__tests__/Model3DLayerSource.test.ts`.
 */

import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  DEFAULT_MODEL3D_STYLE,
  MODEL3D_FREE_CAMERA_PROPERTIES,
  focalLengthMmToFovDeg,
  hasKeyframeAt,
  makeClip,
  makeTrack,
  model3dKeyframedFreeCameraPose,
  model3dStyleWithPatch,
  orbitCameraToFree
} from "@nodetool-ai/timeline";

import mockTheme from "../../../../__mocks__/themeMock";
import { TimelineInspector } from "../TimelineInspector";
import { TimelineProvider } from "../../../../stores/timeline/TimelineInstance";
import { useTimelineStore } from "../../../../stores/timeline/TimelineStore";
import { useTimelineUIStore } from "../../../../stores/timeline/TimelineUIStore";
import { useAssetRevisionStore } from "../../../../stores/AssetRevisionStore";

const mockSession = {
  animations: ["Idle", "Walk"],
  cameras: ["HeroCam"],
  bounds: { center: [0, 1, 0] as const, radius: 2 }
};

/** Held open until a test lets the session resolve. */
let mockRelease: () => void = () => undefined;
let mockLoaded = false;
let mockPending: Promise<void>;
const mockInvalidated: string[] = [];

jest.mock("../../preview/Model3DLayerSource", () => ({
  Model3DLayerSource: class {
    async load() {
      await mockPending;
      mockLoaded = true;
      return mockSession;
    }
    state() {
      return mockLoaded
        ? { status: "ready", session: mockSession }
        : { status: "loading" };
    }
    invalidateAsset(assetId: string) {
      mockInvalidated.push(assetId);
    }
    revive() {
      // Nothing to revive: this stand-in is never disposed for good.
    }
    dispose() {
      // Nothing to dispose: this stand-in owns no WebGL context.
    }
  }
}));

jest.mock("../../Tracks/useAssetUrl", () => ({
  useAssetUrl: (assetId: string | undefined) =>
    assetId ? `https://assets.test/${assetId}.glb` : undefined
}));

function seedModel3DClip() {
  const track = makeTrack({ type: "overlay", name: "Overlay" });
  const clip = makeClip({
    trackId: track.id,
    name: "Robot",
    sourceType: "imported",
    mediaType: "model3d",
    status: "generated",
    currentAssetId: "asset-robot",
    startMs: 0,
    durationMs: 4000,
    model3dStyle: DEFAULT_MODEL3D_STYLE
  });
  act(() => {
    useTimelineStore.setState({ tracks: [track], clips: [clip] });
    useTimelineUIStore.getState().setSelection([clip.id]);
  });
  return clip;
}

function seedVideoClip() {
  const track = makeTrack({ type: "video", name: "V1" });
  const clip = makeClip({
    trackId: track.id,
    name: "Shot",
    sourceType: "imported",
    mediaType: "video",
    status: "generated",
    currentAssetId: "asset-shot",
    startMs: 0,
    durationMs: 4000
  });
  act(() => {
    useTimelineStore.setState({ tracks: [track], clips: [clip] });
    useTimelineUIStore.getState().setSelection([clip.id]);
  });
  return clip;
}

const renderInspector = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <MemoryRouter>
          <TimelineProvider>
            <TimelineInspector />
          </TimelineProvider>
        </MemoryRouter>
      </QueryClientProvider>
    </ThemeProvider>
  );

/** Let the faked session resolve, and flush the state it settles. */
async function resolveSession() {
  await act(async () => {
    mockRelease();
    await mockPending;
  });
}

beforeEach(() => {
  localStorage.clear();
  mockLoaded = false;
  mockPending = new Promise<void>((resolve) => {
    mockRelease = resolve;
  });
});

const clipById = (id: string) =>
  useTimelineStore.getState().clips.find((candidate) => candidate.id === id);

describe("ClipModel3DSection", () => {
  it("renders the 3D section for a model3d clip only", async () => {
    renderInspector();
    seedModel3DClip();
    expect(screen.getByRole("button", { name: /^3d model$/i })).toBeTruthy();
    await resolveSession();

    seedVideoClip();
    expect(screen.queryByRole("button", { name: /^3d model$/i })).toBeNull();
  });

  it("patches one camera term through patchClip", async () => {
    const user = userEvent.setup();
    renderInspector();
    const clip = seedModel3DClip();
    await resolveSession();

    await user.click(screen.getByRole("button", { name: /^3d model$/i }));
    const azimuth = screen.getByLabelText("Camera azimuth");
    await user.clear(azimuth);
    await user.type(azimuth, "90");
    await user.tab();

    const camera = clipById(clip.id)?.model3dStyle?.camera;
    expect(camera?.azimuthDeg).toBe(90);
    // The other three orbit terms survive the patch.
    expect(camera?.elevationDeg).toBe(DEFAULT_MODEL3D_STYLE.camera.elevationDeg);
    expect(camera?.fovDeg).toBe(DEFAULT_MODEL3D_STYLE.camera.fovDeg);
    expect(camera?.zoom).toBe(DEFAULT_MODEL3D_STYLE.camera.zoom);
  });

  it("shows the loading state, then the animations the session reports", async () => {
    const user = userEvent.setup();
    renderInspector();
    const clip = seedModel3DClip();

    await user.click(screen.getByRole("button", { name: /^3d model$/i }));
    expect(screen.getByText("Loading model…")).toBeTruthy();
    expect(
      screen.queryByRole("combobox", { name: /gltf animation/i })
    ).toBeNull();

    await resolveSession();

    await user.click(screen.getByRole("combobox", { name: /gltf animation/i }));
    expect(screen.getByRole("option", { name: "All animations" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Idle" })).toBeTruthy();
    await user.click(screen.getByRole("option", { name: "Walk" }));

    expect(clipById(clip.id)?.model3dStyle?.animation.clipName).toBe("Walk");
  });

  // The four camera channels are keyframed from their own rows, each with a
  // stopwatch, and a non-3D clip is not offered them.
  it("offers a stopwatch on each camera row for a model3d clip only", async () => {
    const user = userEvent.setup();
    renderInspector();
    seedModel3DClip();
    await resolveSession();

    await user.click(screen.getByRole("button", { name: /^3d model$/i }));
    expect(screen.getByRole("button", { name: "Animate Orbit" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Animate Field of view" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Animate Zoom" })).toBeTruthy();
    expect(screen.getByLabelText("Camera field of view")).toBeTruthy();

    seedVideoClip();
    expect(screen.queryByRole("button", { name: "Animate Orbit" })).toBeNull();
  });

  it("switches orbit to free on the pose the orbit camera draws", async () => {
    const user = userEvent.setup();
    renderInspector();
    const clip = seedModel3DClip();
    await resolveSession();

    await user.click(screen.getByRole("button", { name: /^3d model$/i }));
    await user.click(screen.getByRole("combobox", { name: /camera mode/i }));
    await user.click(screen.getByRole("option", { name: "Free" }));

    const camera = clipById(clip.id)?.model3dStyle?.camera;
    const expected = orbitCameraToFree(DEFAULT_MODEL3D_STYLE.camera, {
      center: mockSession.bounds.center,
      radius: mockSession.bounds.radius,
      aspect: 1920 / 1080
    });
    expect(camera?.mode).toBe("free");
    expect(camera?.target).toEqual(expected.target);
    camera?.position?.forEach((value, axis) =>
      expect(value).toBeCloseTo(expected.position![axis], 6)
    );

    // Free mode shows its own rows and hides the orbit ones.
    expect(screen.getByLabelText("Camera position X")).toBeTruthy();
    expect(screen.getByLabelText("Camera target Z")).toBeTruthy();
    expect(screen.getByLabelText("Camera roll in degrees")).toBeTruthy();
    expect(screen.queryByLabelText("Camera azimuth")).toBeNull();
    expect(screen.queryByLabelText("Camera zoom")).toBeNull();
  });

  it("reads the model again when its asset is saved under the same id", async () => {
    renderInspector();
    seedModel3DClip();
    await resolveSession();
    mockInvalidated.length = 0;

    act(() => {
      useAssetRevisionStore.getState().bump("asset-robot");
    });
    await resolveSession();

    expect(mockInvalidated).toEqual(["asset-robot"]);
  });

  it("edits the lens in millimetres", async () => {
    const user = userEvent.setup();
    renderInspector();
    const clip = seedModel3DClip();
    act(() => {
      useTimelineStore.getState().patchClip(clip.id, {
        model3dStyle: model3dStyleWithPatch(DEFAULT_MODEL3D_STYLE, {
          camera: { mode: "free" }
        })
      });
    });
    await resolveSession();

    await user.click(screen.getByRole("button", { name: /^3d model$/i }));
    const lens = screen.getByLabelText("Camera lens in millimeters");
    await user.clear(lens);
    await user.type(lens, "50");
    await user.tab();

    expect(clipById(clip.id)?.model3dStyle?.camera.fovDeg).toBeCloseTo(
      focalLengthMmToFovDeg(50),
      6
    );
  });

  it("keys every free channel with Key camera", async () => {
    const user = userEvent.setup();
    renderInspector();
    const clip = seedModel3DClip();
    act(() => {
      useTimelineStore.getState().patchClip(clip.id, {
        model3dStyle: model3dStyleWithPatch(DEFAULT_MODEL3D_STYLE, {
          camera: { mode: "free" }
        })
      });
    });
    await resolveSession();

    await user.click(screen.getByRole("button", { name: /^3d model$/i }));
    await user.click(screen.getByRole("button", { name: "Key camera" }));

    const keyed = clipById(clip.id)!;
    for (const property of MODEL3D_FREE_CAMERA_PROPERTIES) {
      expect(hasKeyframeAt(keyed, property, 0)).toBe(true);
    }
  });

  it("adds a push in from the camera move menu", async () => {
    const user = userEvent.setup();
    renderInspector();
    const clip = seedModel3DClip();
    act(() => {
      useTimelineStore.getState().patchClip(clip.id, {
        model3dStyle: model3dStyleWithPatch(DEFAULT_MODEL3D_STYLE, {
          camera: { mode: "free", position: [0, 1, 5], target: [0, 1, 0] }
        })
      });
    });
    await resolveSession();

    await user.click(screen.getByRole("button", { name: /^3d model$/i }));
    await user.click(screen.getByRole("button", { name: "Camera move" }));
    // Prefilled: push in by 30 % of the distance, over the whole clip.
    expect(screen.getByLabelText("Amount")).toHaveValue("30");
    expect(screen.getByLabelText("Duration")).toHaveValue("4.00");
    await user.click(screen.getByRole("button", { name: "Add move" }));

    const moved = clipById(clip.id)!;
    expect(model3dKeyframedFreeCameraPose(moved, 0).position[2]).toBeCloseTo(5, 6);
    expect(model3dKeyframedFreeCameraPose(moved, 4000).position[2]).toBeCloseTo(3.5, 6);
  });
});
