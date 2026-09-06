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
import { DEFAULT_MODEL3D_STYLE, makeClip, makeTrack } from "@nodetool-ai/timeline";

import mockTheme from "../../../../__mocks__/themeMock";
import { TimelineInspector } from "../TimelineInspector";
import { TimelineProvider } from "../../../../stores/timeline/TimelineInstance";
import { useTimelineStore } from "../../../../stores/timeline/TimelineStore";
import { useTimelineUIStore } from "../../../../stores/timeline/TimelineUIStore";

const mockSession = {
  animations: ["Idle", "Walk"],
  cameras: ["HeroCam"]
};

/** Held open until a test lets the session resolve. */
let mockRelease: () => void = () => undefined;
let mockLoaded = false;
let mockPending: Promise<void>;

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

  // The four camera channels reach the Keyframes section through
  // `keyframePropertiesFor`, wired in T2. This pins that they stay there, and
  // that a non-3D clip is not offered them.
  it("offers the camera keyframe channels for a model3d clip only", async () => {
    const user = userEvent.setup();
    renderInspector();
    seedModel3DClip();
    await resolveSession();

    await user.click(screen.getByRole("button", { name: /^keyframes$/i }));
    expect(screen.getByLabelText("Camera Azimuth at playhead")).toBeTruthy();
    expect(screen.getByLabelText("Camera Elevation at playhead")).toBeTruthy();
    expect(screen.getByLabelText("Camera Zoom at playhead")).toBeTruthy();
    expect(screen.getByLabelText("Camera FOV at playhead")).toBeTruthy();

    seedVideoClip();
    expect(screen.queryByLabelText("Camera Azimuth at playhead")).toBeNull();
    expect(screen.getByLabelText("Opacity at playhead")).toBeTruthy();
  });
});
