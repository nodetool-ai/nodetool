/**
 * Model3DOrbitOverlay (T10) — the preview's orbit gesture.
 *
 * What is pinned here: the rate a drag turns the camera at (three's
 * OrbitControls convention, 360° per frame height — the frame is 360 px tall
 * below, so one pixel is one degree), that a whole drag costs exactly one
 * store patch, that Alt-wheel dollies the zoom, and that the gesture stays out
 * of the way of everything that is not an Alt-drag on a `model3d` clip.
 *
 * The wheel arrives through `fireEvent`: `userEvent` has no wheel action, and
 * the commit that follows a burst is on a timer, so that test drives the clock
 * itself.
 */

import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import {
  DEFAULT_MODEL3D_STYLE,
  makeClip,
  makeTrack,
  type ClipModel3DCamera,
  type TimelineClip
} from "@nodetool-ai/timeline";

import mockTheme from "../../../../__mocks__/themeMock";
import { useTimelineStore } from "../../../../stores/timeline/TimelineStore";
import {
  Model3DOrbitOverlay,
  WHEEL_COMMIT_IDLE_MS
} from "../Model3DOrbitOverlay";
import {
  MAX_ELEVATION_DEG,
  ZOOM_WHEEL_BASE
} from "../model3dOrbitGesture";

/** One CSS pixel of travel is one degree at this height. */
const FRAME_HEIGHT = 360;

const track = makeTrack({ type: "overlay", name: "Overlay" });

const model3dClip = (): TimelineClip =>
  makeClip({
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

const videoClip = (): TimelineClip =>
  makeClip({
    trackId: track.id,
    name: "Shot",
    sourceType: "imported",
    mediaType: "video",
    status: "generated",
    currentAssetId: "asset-shot",
    startMs: 0,
    durationMs: 4000
  });

let patchClip: jest.Mock;

const renderOverlay = (clip: TimelineClip) => {
  render(
    <ThemeProvider theme={mockTheme}>
      <div data-testid="frame">
        <Model3DOrbitOverlay clip={clip} frameHeight={FRAME_HEIGHT} />
      </div>
    </ThemeProvider>
  );
  return screen.getByTestId("frame");
};

/** The camera the last `patchClip` call wrote. */
const committedCamera = (): ClipModel3DCamera => {
  const [, patch] = patchClip.mock.calls.at(-1) as [
    string,
    Partial<TimelineClip>
  ];
  const style = patch.model3dStyle;
  if (!style) {
    throw new Error("patchClip was called without a model3dStyle");
  }
  return style.camera;
};

beforeEach(() => {
  patchClip = jest.fn();
  act(() => {
    useTimelineStore.setState({ patchClip });
  });
});

describe("Model3DOrbitOverlay", () => {
  it("turns azimuth a degree per pixel and writes once, on pointer up", async () => {
    const user = userEvent.setup();
    const frame = renderOverlay(model3dClip());

    await user.keyboard("{Alt>}");
    await user.pointer([
      { keys: "[MouseLeft>]", target: frame, coords: { x: 200, y: 100 } },
      { target: frame, coords: { x: 100, y: 100 } }
    ]);

    // Live while the gesture runs: the pose is on screen, the document is not
    // touched yet.
    expect(screen.getByRole("status")).toHaveTextContent(
      `Azimuth ${DEFAULT_MODEL3D_STYLE.camera.azimuthDeg + 100}°`
    );
    expect(patchClip).not.toHaveBeenCalled();

    await user.pointer({ keys: "[/MouseLeft]", target: frame });

    expect(patchClip).toHaveBeenCalledTimes(1);
    expect(committedCamera().azimuthDeg).toBeCloseTo(
      DEFAULT_MODEL3D_STYLE.camera.azimuthDeg + 100,
      6
    );
    // The terms the drag did not move survive the patch.
    expect(committedCamera().fovDeg).toBe(DEFAULT_MODEL3D_STYLE.camera.fovDeg);
    expect(committedCamera().zoom).toBe(DEFAULT_MODEL3D_STYLE.camera.zoom);
    // The gesture is over: the readout goes away with it.
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("clamps elevation short of the pole", async () => {
    const user = userEvent.setup();
    const frame = renderOverlay(model3dClip());

    await user.keyboard("{Alt>}");
    await user.pointer([
      { keys: "[MouseLeft>]", target: frame, coords: { x: 100, y: 0 } },
      { target: frame, coords: { x: 100, y: 5000 } },
      { keys: "[/MouseLeft]", target: frame }
    ]);

    expect(committedCamera().elevationDeg).toBe(MAX_ELEVATION_DEG);
  });

  it("dollies the zoom on Alt-wheel, one patch per burst", () => {
    jest.useFakeTimers();
    try {
      const frame = renderOverlay(model3dClip());

      fireEvent.wheel(frame, { deltaY: -100, altKey: true });
      expect(screen.getByRole("status")).toHaveTextContent("Zoom 1.05×");
      expect(patchClip).not.toHaveBeenCalled();

      act(() => {
        jest.advanceTimersByTime(WHEEL_COMMIT_IDLE_MS);
      });

      expect(patchClip).toHaveBeenCalledTimes(1);
      // Scrolling away from the user moves the camera closer: three's
      // `_getZoomScale` is 0.95^(deltaY/100), and zoom is its reciprocal.
      expect(committedCamera().zoom).toBeCloseTo(1 / ZOOM_WHEEL_BASE, 6);
    } finally {
      jest.useRealTimers();
    }
  });

  it("lands a pending zoom when a drag takes the gesture over", async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    try {
      const frame = renderOverlay(model3dClip());

      fireEvent.wheel(frame, { deltaY: -100, altKey: true });
      // Straight into a drag, well inside the wheel's idle window.
      await user.keyboard("{Alt>}");
      await user.pointer([
        { keys: "[MouseLeft>]", target: frame, coords: { x: 200, y: 100 } },
        { target: frame, coords: { x: 100, y: 100 } },
        { keys: "[/MouseLeft]", target: frame }
      ]);

      // Two gestures, two entries, and the zoom is in the first rather than
      // dropped on the floor.
      expect(patchClip).toHaveBeenCalledTimes(2);
      const [, zoomed] = patchClip.mock.calls[0] as [
        string,
        Partial<TimelineClip>
      ];
      expect(zoomed.model3dStyle?.camera.zoom).toBeCloseTo(
        1 / ZOOM_WHEEL_BASE,
        6
      );
      expect(committedCamera().azimuthDeg).toBeCloseTo(
        DEFAULT_MODEL3D_STYLE.camera.azimuthDeg + 100,
        6
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it("leaves a drag without Alt to the transform gizmo", async () => {
    const user = userEvent.setup();
    const frame = renderOverlay(model3dClip());

    await user.pointer([
      { keys: "[MouseLeft>]", target: frame, coords: { x: 200, y: 100 } },
      { target: frame, coords: { x: 100, y: 100 } },
      { keys: "[/MouseLeft]", target: frame }
    ]);

    expect(patchClip).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("does not orbit a clip that is not model3d", async () => {
    const user = userEvent.setup();
    const frame = renderOverlay(videoClip());

    expect(screen.queryByTestId("timeline-model3d-orbit-overlay")).toBeNull();

    await user.keyboard("{Alt>}");
    await user.pointer([
      { keys: "[MouseLeft>]", target: frame, coords: { x: 200, y: 100 } },
      { target: frame, coords: { x: 100, y: 100 } },
      { keys: "[/MouseLeft]", target: frame }
    ]);
    fireEvent.wheel(frame, { deltaY: -100, altKey: true });

    expect(patchClip).not.toHaveBeenCalled();
  });
});
