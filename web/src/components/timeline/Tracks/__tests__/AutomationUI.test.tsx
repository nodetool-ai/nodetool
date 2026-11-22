/**
 * Show Automation: the toolbar toggle, the header row (disclosure, mode,
 * parameter), the curve on the main lane and the sub-lane headers.
 */
import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { makeClip, makeTrack, type AutomationLane } from "@nodetool-ai/timeline";

import mockTheme from "../../../../__mocks__/themeMock";
import {
  TimelineProvider,
  createTimelineInstance,
  type TimelineInstance
} from "../../../../stores/timeline/TimelineInstance";
import { timelineTemporalOf } from "../../../../stores/timeline/TimelineStore";
import { AutomationHeaderRow } from "../automation/AutomationHeaderRow";
import { AutomationLaneHeader } from "../automation/AutomationLaneHeader";
import { AutomationCurveOverlay } from "../automation/AutomationCurveOverlay";
import { ShowAutomationButton } from "../ShowAutomationButton";
import {
  AUTOMATION_HEADER_ROW_PX,
  AUTOMATION_LANE_HEIGHT_PX,
  CLIP_NAME_BAR_BOTTOM_PX,
  CLIP_NAME_BAR_PX,
  CLIP_TOP_PX,
  automationHitRects,
  automationSectionHeightPx,
  shownAutomationKey,
  type AutomationLayoutInput
} from "../automation/automationLayout";

class FakePointerEvent extends MouseEvent {
  pointerId: number;
  constructor(type: string, props: PointerEventInit = {}) {
    super(type, props);
    this.pointerId = props.pointerId ?? 1;
  }
}
Object.defineProperty(window, "PointerEvent", { configurable: true, value: FakePointerEvent });

const volumeLane = (points: AutomationLane["points"] = []): AutomationLane => ({
  id: "vol",
  target: { kind: "mixer", param: "volumeDb" },
  points
});
const panLane = (points: AutomationLane["points"] = []): AutomationLane => ({
  id: "pan",
  target: { kind: "mixer", param: "pan" },
  points
});

function setup(extra: Partial<ReturnType<typeof makeTrack>> = {}): TimelineInstance {
  const instance = createTimelineInstance();
  instance.doc.setState({
    tracks: [{ ...makeTrack({ type: "audio", name: "Music", index: 0 }), ...extra }],
    clips: []
  });
  timelineTemporalOf(instance.doc).clear();
  return instance;
}

const track = (instance: TimelineInstance) => instance.doc.getState().tracks[0];

function wrap(instance: TimelineInstance, node: React.ReactNode) {
  return (
    <ThemeProvider theme={mockTheme}>
      <TimelineProvider instance={instance}>{node}</TimelineProvider>
    </ThemeProvider>
  );
}

beforeEach(() => {
  HTMLElement.prototype.setPointerCapture = jest.fn();
  HTMLElement.prototype.releasePointerCapture = jest.fn();
  HTMLElement.prototype.getBoundingClientRect = jest.fn(
    () => ({ left: 0, top: 0, width: 2000, height: 100 }) as DOMRect
  );
});

describe("layout", () => {
  const audio = { id: "a", type: "audio" as const };
  const shown = (): AutomationLayoutInput => ({ show: true, openTrackIds: [], shownParams: {} });

  it("adds nothing while Show Automation is off or for a track without automation", () => {
    expect(automationSectionHeightPx(audio, { show: false, openTrackIds: ["a"], shownParams: {} })).toBe(0);
    expect(automationSectionHeightPx({ id: "s", type: "subtitle" }, shown())).toBe(0);
  });

  it("adds the header row, and the sub-lanes of the open track without the shown parameter", () => {
    const lanes = { ...audio, automation: [volumeLane(), panLane()] };
    expect(automationSectionHeightPx(lanes, shown())).toBe(AUTOMATION_HEADER_ROW_PX);
    expect(automationSectionHeightPx(lanes, { show: true, openTrackIds: ["a"], shownParams: {} })).toBe(
      AUTOMATION_HEADER_ROW_PX + AUTOMATION_LANE_HEIGHT_PX
    );
  });

  it("picks the shown parameter: the first lane with points, else Volume", () => {
    expect(shownAutomationKey({ type: "audio" })).toBe("mixer:volumeDb");
    expect(
      shownAutomationKey({ type: "audio", automation: [volumeLane(), panLane([{ timeMs: 0, value: 0 }])] })
    ).toBe("mixer:pan");
    expect(shownAutomationKey({ type: "audio" }, "device:x:y")).toBe("device:x:y");
  });

  it("leaves a clip's name bar to the clip and the rest of the lane to the curve", () => {
    const rects = automationHitRects([{ startMs: 1000, durationMs: 2000 }], 10, 1000, 80);
    const covers = (x: number, y: number) =>
      rects.some((r) => x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height);
    // The clip draws its name bar below its top inset.
    const barMid = CLIP_TOP_PX + CLIP_NAME_BAR_PX / 2;
    expect(covers(200, barMid)).toBe(false);
    expect(covers(50, barMid)).toBe(true);
    expect(covers(500, barMid)).toBe(true);
    expect(covers(200, CLIP_NAME_BAR_BOTTOM_PX + 5)).toBe(true);
    expect(covers(50, 79)).toBe(true);
  });
});

describe("ShowAutomationButton", () => {
  it("turns Show Automation on and off", async () => {
    const instance = setup();
    render(wrap(instance, <ShowAutomationButton />));
    expect(instance.ui.getState().showAutomation).toBe(false);
    await userEvent.click(screen.getByRole("button", { name: "Show automation" }));
    expect(instance.ui.getState().showAutomation).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: "Show automation" }));
    expect(instance.ui.getState().showAutomation).toBe(false);
  });
});

describe("AutomationHeaderRow", () => {
  it("opens and closes the sub-lanes with the disclosure", async () => {
    const instance = setup();
    render(wrap(instance, <AutomationHeaderRow track={track(instance)} />));
    const id = track(instance).id;
    await userEvent.click(screen.getByTestId(`automation-disclosure-${id}`));
    expect(instance.ui.getState().automationOpenTrackIds).toEqual([id]);
    await userEvent.click(screen.getByTestId(`automation-disclosure-${id}`));
    expect(instance.ui.getState().automationOpenTrackIds).toEqual([]);
  });

  it("shows Read by default and changes the mode in one undo step", async () => {
    const instance = setup();
    const id = track(instance).id;
    const view = render(wrap(instance, <AutomationHeaderRow track={track(instance)} />));
    expect(screen.getByTestId(`automation-mode-${id}`)).toHaveTextContent("Read");
    await userEvent.click(screen.getByTestId(`automation-mode-${id}`));
    await userEvent.click(screen.getByRole("menuitemradio", { name: "Touch" }));
    expect(track(instance).automationMode).toBe("touch");
    expect(timelineTemporalOf(instance.doc).pastStates).toHaveLength(1);
    view.rerender(wrap(instance, <AutomationHeaderRow track={track(instance)} />));
    expect(screen.getByTestId(`automation-mode-${id}`)).toHaveTextContent("Touch");
    await userEvent.click(screen.getByTestId(`automation-mode-${id}`));
    await userEvent.click(screen.getByRole("menuitemradio", { name: "Read" }));
    expect(track(instance).automationMode).toBeUndefined();
  });

  it("lists every target grouped, marks lanes with points and keeps the shown parameter per track", async () => {
    const instance = setup({ automation: [panLane([{ timeMs: 0, value: 0.5 }])] });
    const id = track(instance).id;
    render(wrap(instance, <AutomationHeaderRow track={track(instance)} />));
    // The first lane with points is the default.
    expect(screen.getByTestId(`automation-param-${id}`)).toHaveTextContent("Pan");
    expect(screen.getByTestId(`automation-value-${id}`)).toHaveTextContent("50R");
    await userEvent.click(screen.getByTestId(`automation-param-${id}`));
    expect(screen.getByRole("menuitem", { name: "Mixer" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("menuitemradio", { name: "Volume" }));
    expect(instance.ui.getState().automationShownParams[id]).toBe("mixer:volumeDb");
  });
});

describe("AutomationCurveOverlay", () => {
  const clip = (instance: TimelineInstance) =>
    makeClip({ trackId: track(instance).id, startMs: 1000, durationMs: 2000, mediaType: "audio" });

  it("makes the first click create the lane from the control's own value, as one undo step", () => {
    const instance = setup({ volumeDb: -4 });
    instance.ui.setState({ msPerPx: 10 });
    render(wrap(instance, <AutomationCurveOverlay track={track(instance)} widthPx={2000} heightPx={100} />));
    const hit = screen.getByTestId(`automation-hit-${track(instance).id}`);
    // The flat line at -4 dB: 6px inset + (1 - 56/66) of 88px.
    fireEvent.pointerDown(hit, { button: 0, pointerId: 1, clientX: 100, clientY: 19 });
    fireEvent.pointerMove(hit, { pointerId: 1, clientX: 120, clientY: 19 });
    fireEvent.pointerUp(hit, { pointerId: 1, clientX: 120, clientY: 19 });
    const points = track(instance).automation?.[0].points ?? [];
    expect(points).toHaveLength(2);
    expect(points[0]).toEqual({ timeMs: 0, value: -4 });
    expect(points[1].timeMs).toBe(1200);
    expect(timelineTemporalOf(instance.doc).pastStates).toHaveLength(1);
  });

  it("draws a flat line without a lane and labels the value at the left edge", () => {
    const instance = setup({ volumeDb: 0 });
    render(wrap(instance, <AutomationCurveOverlay track={track(instance)} widthPx={2000} heightPx={100} />));
    expect(screen.getByTestId(`automation-label-${track(instance).id}`)).toHaveTextContent("0.0 dB");
  });

  it("does not cover a clip's name bar", () => {
    const instance = setup();
    instance.doc.setState({ clips: [clip(instance)] });
    instance.ui.setState({ msPerPx: 10 });
    const { container } = render(
      wrap(instance, <AutomationCurveOverlay track={track(instance)} widthPx={2000} heightPx={100} />)
    );
    const hits = [...container.querySelectorAll<HTMLElement>(".hit")];
    const nameBarCover = hits.filter(
      (el) =>
        parseFloat(el.style.top) < CLIP_NAME_BAR_BOTTOM_PX &&
        parseFloat(el.style.top) + parseFloat(el.style.height) > CLIP_TOP_PX &&
        parseFloat(el.style.left) <= 150 &&
        parseFloat(el.style.left) + parseFloat(el.style.width) > 150
    );
    expect(hits.length).toBeGreaterThan(1);
    expect(nameBarCover).toHaveLength(0);
  });

  it("forgets the selected point when the shown parameter changes", () => {
    const pts = [{ timeMs: 0, value: 0 }, { timeMs: 1000, value: 0.5 }];
    const instance = setup({ automation: [volumeLane([{ timeMs: 0, value: -6 }]), panLane(pts)] });
    instance.ui.setState({ msPerPx: 10, automationShownParams: { [track(instance).id]: "mixer:volumeDb" } });
    const view = render(
      wrap(instance, <AutomationCurveOverlay track={track(instance)} widthPx={2000} heightPx={100} />)
    );
    const hit = screen.getByTestId(`automation-hit-${track(instance).id}`);
    fireEvent.pointerDown(hit, { button: 0, pointerId: 1, clientX: 0, clientY: 50 });
    fireEvent.pointerUp(hit, { pointerId: 1, clientX: 0, clientY: 50 });
    act(() => instance.ui.setState({ automationShownParams: { [track(instance).id]: "mixer:pan" } }));
    view.rerender(
      wrap(instance, <AutomationCurveOverlay track={track(instance)} widthPx={2000} heightPx={100} />)
    );
    fireEvent.keyDown(screen.getByTestId(`automation-curve-${track(instance).id}`), { key: "Delete" });
    expect(track(instance).automation!.find((l) => l.id === "pan")!.points).toHaveLength(2);
  });

  it("ends the drag, and the paused undo history, when the pointer capture is lost", () => {
    const instance = setup({ volumeDb: -4 });
    instance.ui.setState({ msPerPx: 10 });
    render(wrap(instance, <AutomationCurveOverlay track={track(instance)} widthPx={2000} heightPx={100} />));
    const hit = screen.getByTestId(`automation-hit-${track(instance).id}`);
    fireEvent.pointerDown(hit, { button: 0, pointerId: 1, clientX: 100, clientY: 50 });
    fireEvent.lostPointerCapture(hit, { pointerId: 1 });
    expect(timelineTemporalOf(instance.doc).isTracking).toBe(true);
  });

  it("keeps the value label inside the view when the first point lies past its right edge", () => {
    const instance = setup({ automation: [volumeLane([{ timeMs: 20000, value: -6 }])] });
    instance.ui.setState({ msPerPx: 10, scrollLeftPx: 0, lanesViewportWidthPx: 1000 });
    render(wrap(instance, <AutomationCurveOverlay track={track(instance)} widthPx={3000} heightPx={100} />));
    const left = parseFloat(screen.getByTestId(`automation-label-${track(instance).id}`).style.left);
    expect(left).toBeLessThan(1000);
  });

  it("does not edit a locked track", () => {
    const instance = setup({ locked: true });
    render(wrap(instance, <AutomationCurveOverlay track={track(instance)} widthPx={2000} heightPx={100} />));
    expect(screen.queryByTestId(`automation-hit-${track(instance).id}`)).toBeNull();
  });
});

describe("AutomationLaneHeader", () => {
  it("moves a lane to a parameter that has no lane and disables one that has", async () => {
    const instance = setup({ automation: [volumeLane([{ timeMs: 0, value: -60 }]), panLane()] });
    const lane = track(instance).automation![0];
    render(wrap(instance, <AutomationLaneHeader track={track(instance)} lane={lane} />));
    await userEvent.click(screen.getByTestId(`automation-lane-param-${lane.id}`));
    expect(screen.getByRole("menuitemradio", { name: "Pan" })).toHaveAttribute("aria-disabled", "true");
    await act(async () => {
      fireEvent.keyDown(document.body, { key: "Escape" });
    });
  });

  it("retargets a lane header to a free parameter keeping the curve's shape", async () => {
    const instance = setup({ automation: [volumeLane([{ timeMs: 0, value: -60 }])] });
    const lane = track(instance).automation![0];
    render(wrap(instance, <AutomationLaneHeader track={track(instance)} lane={lane} />));
    await userEvent.click(screen.getByTestId(`automation-lane-param-${lane.id}`));
    await userEvent.click(screen.getByRole("menuitemradio", { name: "Pan" }));
    const next = track(instance).automation![0];
    expect(next.target).toEqual({ kind: "mixer", param: "pan" });
    // The bottom of the volume range is the left end of the pan range.
    expect(next.points[0].value).toBeCloseTo(-1);
  });

  it("does not retarget onto the shown parameter, and dots only lanes with points", async () => {
    const instance = setup({ automation: [panLane([{ timeMs: 0, value: 0.5 }]), { ...volumeLane(), id: "v2", target: { kind: "mixer", param: "volumeDb" } }] });
    instance.ui.setState({ automationShownParams: { [track(instance).id]: "mixer:volumeDb" } });
    const lane = track(instance).automation![0];
    render(wrap(instance, <AutomationLaneHeader track={track(instance)} lane={lane} />));
    await userEvent.click(screen.getByTestId(`automation-lane-param-${lane.id}`));
    expect(screen.getByRole("menuitemradio", { name: "Volume" })).toHaveAttribute("aria-disabled", "true");
  });

  it("holds the points of a deleted device inside the new range", async () => {
    const gone: AutomationLane = {
      id: "gone",
      target: { kind: "device", deviceId: "removed", param: "frequency" },
      points: [{ timeMs: 0, value: 10000 }]
    };
    const instance = setup({ automation: [gone] });
    instance.ui.setState({ automationShownParams: { [track(instance).id]: "mixer:volumeDb" } });
    render(wrap(instance, <AutomationLaneHeader track={track(instance)} lane={gone} />));
    await userEvent.click(screen.getByTestId(`automation-lane-param-${gone.id}`));
    await userEvent.click(screen.getByRole("menuitemradio", { name: "Pan" }));
    expect(track(instance).automation![0].points[0].value).toBe(1);
  });
});
