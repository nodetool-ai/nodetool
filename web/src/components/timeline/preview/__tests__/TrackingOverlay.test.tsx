import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { makeClip, type MediaTrack } from "@nodetool-ai/timeline";
import mockTheme from "../../../../__mocks__/themeMock";
import {
  createTimelineInstance,
  TimelineProvider,
  useTimelineStore
} from "../../../../stores/timeline/TimelineInstance";
import { timelineTemporalOf } from "../../../../stores/timeline/TimelineStore";
import { ClipTracking } from "../../Inspector/ClipTracking";
import { ClipTrackingOverlay } from "../ClipTrackingOverlay";

jest.mock("../../../../hooks/useProviders", () => ({
  useProvidersByCapability: () => ({ providers: [], isLoading: false })
}));
jest.mock("../../Inspector/usePersistedFold", () => ({
  usePersistedFold: () => [true, jest.fn()]
}));

class FakePointerEvent extends MouseEvent {
  pointerId: number;
  constructor(type: string, props: PointerEventInit = {}) {
    super(type, props);
    this.pointerId = props.pointerId ?? 1;
  }
}
Object.defineProperty(window, "PointerEvent", {
  configurable: true,
  value: FakePointerEvent
});

const source = makeClip({
  id: "subject",
  trackId: "video",
  mediaType: "video",
  sourceType: "imported",
  currentAssetId: "original",
  status: "generated",
  name: "Subject",
  startMs: 10_000,
  durationMs: 2000,
  inPointMs: 40_000,
  speedMultiplier: 2
});
const track: MediaTrack = {
  id: "tracking",
  clipId: source.id,
  sourceAssetId: "original",
  name: "Subject",
  kind: "box",
  sourceStartMs: 40_000,
  sourceEndMs: 44_000,
  status: "ready",
  samples: [
    { sourceMs: 40_000, x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
    { sourceMs: 44_000, x: 0.5, y: 0.5, width: 0.2, height: 0.2 }
  ]
};

function Harness(): React.ReactElement | null {
  const clip = useTimelineStore((state) => state.clips[0]);
  if (!clip) {
    return null;
  }
  return (
    <>
      <ClipTracking clip={clip} />
      <ClipTrackingOverlay
        clip={clip}
        sourceWidth={200}
        sourceHeight={100}
        sequenceWidth={200}
        sequenceHeight={200}
        frameWidth={200}
        frameHeight={200}
      />
    </>
  );
}

function setup(mediaTracks: MediaTrack[] = []) {
  const instance = createTimelineInstance();
  instance.doc.setState({ clips: [source], mediaTracks });
  instance.ui.getState().setSelection([source.id]);
  instance.playback.getState().seek(10_000);
  timelineTemporalOf(instance.doc).clear();
  render(
    <ThemeProvider theme={mockTheme}>
      <TimelineProvider instance={instance}>
        <Harness />
      </TimelineProvider>
    </ThemeProvider>
  );
  return instance;
}

function selectSubject(): HTMLElement {
  fireEvent.click(
    screen.getByRole("button", { name: "Select subject in preview" })
  );
  const overlay = screen.getByRole("group", {
    name: "Select tracking subject"
  });
  jest.spyOn(overlay, "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
    right: 200,
    bottom: 200,
    width: 200,
    height: 200,
    x: 0,
    y: 0,
    toJSON: () => ({})
  });
  return overlay;
}

describe("preview subject selection", () => {
  it("normalizes a backwards drag inside a letterboxed source and creates no undo entry", () => {
    const instance = setup();
    const overlay = selectSubject();
    fireEvent.pointerDown(overlay, {
      clientX: 140,
      clientY: 120,
      pointerId: 1
    });
    fireEvent.pointerMove(overlay, { clientX: 40, clientY: 80, pointerId: 1 });
    fireEvent.pointerUp(overlay, { clientX: 40, clientY: 80, pointerId: 1 });
    expect(
      screen.getByText(
        /Selected at 40000 source ms: 20%, 30%, 50% wide, 40% high/
      )
    ).toBeInTheDocument();
    expect(overlay.querySelector("polygon")).toHaveAttribute(
      "points",
      "40,80 140,80 140,120 40,120"
    );
    expect(timelineTemporalOf(instance.doc).pastStates).toHaveLength(0);
    expect(instance.doc.getState().clips).toEqual([source]);
  });

  it("creates, moves, resizes and clears a box with the keyboard", () => {
    setup();
    const overlay = selectSubject();
    fireEvent.keyDown(overlay, { key: "Enter" });
    fireEvent.keyDown(overlay, { key: "ArrowRight" });
    fireEvent.keyDown(overlay, {
      key: "ArrowDown",
      altKey: true,
      shiftKey: true
    });
    expect(
      screen.getByText(/41%, 40%, 20% wide, 25% high/)
    ).toBeInTheDocument();
    fireEvent.keyDown(overlay, { key: "Delete" });
    expect(screen.getByText("No subject selected.")).toBeInTheDocument();
    fireEvent.keyDown(overlay, { key: "Escape" });
    expect(
      screen.queryByRole("group", { name: "Select tracking subject" })
    ).not.toBeInTheDocument();
  });

  it("cancels an unfinished pointer gesture without replacing a valid box", () => {
    setup();
    const overlay = selectSubject();
    fireEvent.keyDown(overlay, { key: "Enter" });
    fireEvent.pointerDown(overlay, { clientX: 0, clientY: 0, pointerId: 1 });
    fireEvent.pointerMove(overlay, {
      clientX: 180,
      clientY: 180,
      pointerId: 1
    });
    fireEvent.pointerCancel(overlay, { pointerId: 1 });
    expect(
      screen.getByText(/40%, 40%, 20% wide, 20% high/)
    ).toBeInTheDocument();
  });

  it("invalidates both selection and rendered samples when the source changes", () => {
    const instance = setup([track]);
    expect(
      screen.getByRole("img", { name: "Tracked subject" })
    ).toBeInTheDocument();
    const overlay = selectSubject();
    fireEvent.keyDown(overlay, { key: "Enter" });
    act(() =>
      instance.doc
        .getState()
        .patchClip(source.id, { currentAssetId: "replacement" })
    );
    expect(
      screen.queryByRole("group", { name: "Select tracking subject" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("img", { name: "Tracked subject" })
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/Previous tracking samples are unavailable/)
    ).toBeInTheDocument();
    act(() =>
      instance.doc
        .getState()
        .patchClip(source.id, { currentAssetId: "original" })
    );
    expect(screen.getByText("No subject selected.")).toBeInTheDocument();
  });

  it("clears selection when the selected clip changes", () => {
    const instance = setup();
    selectSubject();
    act(() => instance.ui.getState().setSelection([]));
    expect(
      screen.queryByRole("group", { name: "Select tracking subject" })
    ).not.toBeInTheDocument();
  });

  it("disables provider execution when no tracking provider is available", () => {
    setup();
    expect(
      screen.getByRole("button", { name: "Track subject" })
    ).toBeDisabled();
    expect(
      screen.getByText("No subject-tracking provider is available.")
    ).toBeInTheDocument();
  });

  it("samples the live playback clock with source trim and speed", () => {
    const instance = setup([track]);
    act(() => instance.playback.getState().setTimeMs(11_000));
    const points = screen
      .getByRole("img", { name: "Tracked subject" })
      .querySelector("polygon")
      ?.getAttribute("points")
      ?.split(/[ ,]/)
      .map(Number);
    expect(points).toHaveLength(8);
    [60, 80, 100, 80, 100, 100, 60, 100].forEach((value, index) => {
      expect(points?.[index]).toBeCloseTo(value);
    });
    act(() => instance.playback.getState().setTimeMs(12_000));
    expect(
      screen.queryByRole("img", { name: "Tracked subject" })
    ).not.toBeInTheDocument();
  });
});
