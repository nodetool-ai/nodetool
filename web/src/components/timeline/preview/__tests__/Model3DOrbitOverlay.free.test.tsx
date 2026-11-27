/**
 * Model3DOrbitOverlay on a free camera.
 *
 * What is pinned here: Alt-drag turns the eye around the target and
 * Alt+Shift-drag trucks, a whole gesture is one `editClipKeyframes` call, the
 * wheel dollies and Ctrl turns it into a lens change, and a camera with keys
 * takes the gesture as a keyframe at the playhead instead of a new authored
 * pose.
 */

import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import {
  DEFAULT_MODEL3D_STYLE,
  fovDegToFocalLengthMm,
  hasKeyframeAt,
  makeClip,
  makeTrack,
  model3dKeyframedFreeCameraPose,
  model3dStyleWithPatch,
  resolveModel3DCamera,
  IDENTITY_MODEL3D_CAMERA_CHANNELS,
  keyframeValueAt,
  type ClipModel3DCamera,
  type TimelineClip
} from "@nodetool-ai/timeline";

import mockTheme from "../../../../__mocks__/themeMock";
import { useTimelineStore } from "../../../../stores/timeline/TimelineStore";
import { useTimelinePlaybackStore } from "../../../../stores/timeline/TimelinePlaybackStore";
import { keyFreeCameraPatch } from "../../Inspector/model3dFreeCamera";
import {
  Model3DOrbitOverlay,
  WHEEL_COMMIT_IDLE_MS
} from "../Model3DOrbitOverlay";
import { ZOOM_WHEEL_BASE } from "../model3dOrbitGesture";

/** One CSS pixel of travel is one degree at this height. */
const FRAME_HEIGHT = 360;

const track = makeTrack({ type: "overlay", name: "Overlay" });

const freeClip = (): TimelineClip =>
  makeClip({
    trackId: track.id,
    name: "Set",
    sourceType: "imported",
    mediaType: "model3d",
    status: "generated",
    currentAssetId: "asset-set",
    startMs: 0,
    durationMs: 4000,
    model3dStyle: model3dStyleWithPatch(DEFAULT_MODEL3D_STYLE, {
      camera: {
        mode: "free",
        position: [0, 1, 5],
        target: [0, 1, 0],
        fovDeg: 90
      }
    })
  });

let editClipKeyframes: jest.Mock;
let previewed: (ClipModel3DCamera | null)[];

const renderOverlay = (clip: TimelineClip) => {
  render(
    <ThemeProvider theme={mockTheme}>
      <div data-testid="frame">
        <Model3DOrbitOverlay
          clip={clip}
          frameHeight={FRAME_HEIGHT}
          onPreviewCamera={(camera) => previewed.push(camera)}
        />
      </div>
    </ThemeProvider>
  );
  return screen.getByTestId("frame");
};

/** The clip after the one edit the gesture made. */
const edited = (clip: TimelineClip): TimelineClip => {
  expect(editClipKeyframes).toHaveBeenCalledTimes(1);
  const [, edit] = editClipKeyframes.mock.calls[0] as [
    string,
    (c: TimelineClip) => Partial<TimelineClip> | null
  ];
  return { ...clip, ...edit(clip) };
};

beforeEach(() => {
  editClipKeyframes = jest.fn();
  previewed = [];
  act(() => {
    useTimelineStore.setState({ editClipKeyframes });
    useTimelinePlaybackStore.setState({ currentTimeMs: 1000 });
  });
});

describe("Model3DOrbitOverlay on a free camera", () => {
  it("turns the eye around the target and writes the authored pose once", async () => {
    const user = userEvent.setup();
    const clip = freeClip();
    const frame = renderOverlay(clip);

    await user.keyboard("{Alt>}");
    await user.pointer([
      { keys: "[MouseLeft>]", target: frame, coords: { x: 200, y: 100 } },
      { target: frame, coords: { x: 290, y: 100 } }
    ]);
    expect(screen.getByRole("status")).toHaveTextContent("Eye -5.00, 1.00, 0.00");
    expect(editClipKeyframes).not.toHaveBeenCalled();

    await user.pointer({ keys: "[/MouseLeft]", target: frame });
    const next = edited(clip);
    const position = next.model3dStyle!.camera.position!;
    expect(position[0]).toBeCloseTo(-5, 6);
    expect(position[2]).toBeCloseTo(0, 6);
    expect(next.model3dStyle!.camera.target).toEqual([0, 1, 0]);
    expect(next.animations ?? []).toHaveLength(0);
    expect(screen.queryByRole("status")).toBeNull();
    expect(previewed.at(-1)).toBeNull();
  });

  it("trucks eye and target together with Shift", async () => {
    const user = userEvent.setup();
    const clip = freeClip();
    const frame = renderOverlay(clip);

    // fov 90 at distance 5 is 10 units over 360 px, so 36 px is one unit.
    await user.keyboard("{Alt>}{Shift>}");
    await user.pointer([
      { keys: "[MouseLeft>]", target: frame, coords: { x: 200, y: 100 } },
      { target: frame, coords: { x: 236, y: 100 } },
      { keys: "[/MouseLeft]", target: frame }
    ]);
    const camera = edited(clip).model3dStyle!.camera;
    expect(camera.position![0]).toBeCloseTo(-1, 6);
    expect(camera.target![0]).toBeCloseTo(-1, 6);
  });

  it("writes nothing for an Alt-click that never moved", async () => {
    const user = userEvent.setup();
    const clip = freeClip();
    const frame = renderOverlay(clip);
    await user.keyboard("{Alt>}");
    await user.pointer([
      { keys: "[MouseLeft>]", target: frame, coords: { x: 200, y: 100 } },
      { keys: "[/MouseLeft]", target: frame }
    ]);
    const [, edit] = editClipKeyframes.mock.calls[0];
    expect(edit(clip)).toBeNull();
  });

  describe("wheel", () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it("dollies toward the target and commits one burst once", () => {
      const clip = freeClip();
      const frame = renderOverlay(clip);
      fireEvent.wheel(frame, { altKey: true, deltaY: -100 });
      fireEvent.wheel(frame, { altKey: true, deltaY: -100 });
      expect(editClipKeyframes).not.toHaveBeenCalled();
      act(() => {
        jest.advanceTimersByTime(WHEEL_COMMIT_IDLE_MS);
      });
      const camera = edited(clip).model3dStyle!.camera;
      expect(camera.position![2]).toBeCloseTo(5 * ZOOM_WHEEL_BASE ** 2, 6);
      expect(camera.fovDeg).toBe(90);
    });

    it("changes the lens with Ctrl", () => {
      const clip = freeClip();
      const frame = renderOverlay(clip);
      const before = fovDegToFocalLengthMm(90);
      fireEvent.wheel(frame, { altKey: true, ctrlKey: true, deltaY: -100 });
      act(() => {
        jest.advanceTimersByTime(WHEEL_COMMIT_IDLE_MS);
      });
      const camera = edited(clip).model3dStyle!.camera;
      expect(fovDegToFocalLengthMm(camera.fovDeg)).toBeCloseTo(
        before / ZOOM_WHEEL_BASE,
        6
      );
      expect(camera.position).toEqual([0, 1, 5]);
    });
  });

  it("keys the playhead on a camera that already has keys", async () => {
    const user = userEvent.setup();
    const base = freeClip();
    const clip = { ...base, ...keyFreeCameraPatch(base, 0) };
    const frame = renderOverlay(clip);

    await user.keyboard("{Alt>}");
    await user.pointer([
      { keys: "[MouseLeft>]", target: frame, coords: { x: 200, y: 100 } },
      { target: frame, coords: { x: 290, y: 100 } }
    ]);
    // The pose in flight reaches the host as an authored camera that composes
    // to it under the keys at the playhead.
    const live = previewed.at(-1)!;
    const drawn = resolveModel3DCamera(
      { ...clip.model3dStyle!, camera: live },
      {
        ...IDENTITY_MODEL3D_CAMERA_CHANNELS,
        cameraPosX: keyframeValueAt(clip, "cameraPosX", 1000),
        cameraPosZ: keyframeValueAt(clip, "cameraPosZ", 1000)
      }
    );
    expect(drawn.position![0]).toBeCloseTo(-5, 6);

    await user.pointer({ keys: "[/MouseLeft]", target: frame });
    const next = edited(clip);
    // The authored pose stays, and the playhead gets the key.
    expect(next.model3dStyle!.camera.position).toEqual([0, 1, 5]);
    expect(hasKeyframeAt(next, "cameraPosX", 1000)).toBe(true);
    expect(model3dKeyframedFreeCameraPose(next, 1000).position[0]).toBeCloseTo(-5, 6);
    expect(model3dKeyframedFreeCameraPose(next, 0).position).toEqual([0, 1, 5]);
  });
});
