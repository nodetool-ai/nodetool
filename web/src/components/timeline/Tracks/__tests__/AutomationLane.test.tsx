/**
 * Automation lanes under a track: clicking a lane adds a point and dragging
 * places it in one undo entry, a double-click removes it, the header turns a
 * lane off or removes it, and the target list covers each track type.
 */
import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import type { TFunction } from "i18next";
import { findInstrumentPreset, INSTRUMENT_DEVICE_ID, type AutomationLane } from "@nodetool-ai/timeline";

import mockTheme from "../../../../__mocks__/themeMock";
import { getTimelineTemporal, useTimelineStore } from "../../../../stores/timeline/TimelineStore";
import { useTimelineUIStore } from "../../../../stores/timeline/TimelineUIStore";
import { AutomationLaneView } from "../automation/AutomationLaneView";
import { AutomationLaneHeader } from "../automation/AutomationLaneHeader";
import { automationTargetSpecs } from "../automation/automationTargets";
import { AUTOMATION_LANE_HEIGHT_PX } from "../automation/automationLayout";

// jsdom has no PointerEvent, so fireEvent would drop the coordinates.
class FakePointerEvent extends MouseEvent {
  pointerId: number;
  constructor(type: string, props: PointerEventInit = {}) {
    super(type, props);
    this.pointerId = props.pointerId ?? 1;
  }
}
Object.defineProperty(window, "PointerEvent", { configurable: true, value: FakePointerEvent });

const VOLUME: AutomationLane = {
  id: "lane-1",
  target: { kind: "mixer", param: "volumeDb" },
  points: []
};

function setup(lane: AutomationLane = VOLUME): string {
  let trackId = "";
  act(() => {
    const s = useTimelineStore.getState();
    s.reset();
    s.addTrack("audio", "Music");
    trackId = useTimelineStore.getState().tracks[0].id;
    s.setTrackAutomation(trackId, [lane]);
    useTimelineUIStore.setState({ msPerPx: 10 });
    getTimelineTemporal().clear();
  });
  return trackId;
}

const lanePoints = () => useTimelineStore.getState().tracks[0].automation?.[0]?.points ?? [];

function renderLane() {
  const track = () => useTimelineStore.getState().tracks[0];
  const view = render(
    <ThemeProvider theme={mockTheme}>
      <AutomationLaneView track={track()} lane={track().automation![0]} widthPx={2000} />
    </ThemeProvider>
  );
  const rerender = () =>
    view.rerender(
      <ThemeProvider theme={mockTheme}>
        <AutomationLaneView track={track()} lane={track().automation![0]} widthPx={2000} />
      </ThemeProvider>
    );
  return { rerender, root: screen.getByTestId("automation-lane-lane-1") };
}

beforeEach(() => {
  HTMLElement.prototype.setPointerCapture = jest.fn();
  HTMLElement.prototype.releasePointerCapture = jest.fn();
  HTMLElement.prototype.getBoundingClientRect = jest.fn(
    () => ({ left: 0, top: 0, width: 2000, height: AUTOMATION_LANE_HEIGHT_PX }) as DOMRect
  );
});

describe("AutomationLaneView", () => {
  it("adds a point where the lane is pressed and drags it as one undo entry", () => {
    setup();
    const { root } = renderLane();
    const middle = AUTOMATION_LANE_HEIGHT_PX / 2;
    fireEvent.pointerDown(root, { button: 0, pointerId: 1, clientX: 50, clientY: middle });
    expect(lanePoints()).toHaveLength(1);
    // 10 ms per px; the lane's middle is halfway up its -60..6 dB range.
    expect(lanePoints()[0].timeMs).toBe(500);
    expect(lanePoints()[0].value).toBeCloseTo(-27);
    fireEvent.pointerMove(root, { pointerId: 1, clientX: 80, clientY: 0 });
    fireEvent.pointerMove(root, { pointerId: 1, clientX: 90, clientY: 0 });
    fireEvent.pointerUp(root, { pointerId: 1, clientX: 90, clientY: 0 });
    expect(lanePoints()).toEqual([{ timeMs: 900, value: 6 }]);
    expect(getTimelineTemporal().pastStates).toHaveLength(1);
  });

  it("keeps a point's time while Shift is held", () => {
    setup({ ...VOLUME, points: [{ timeMs: 500, value: 0 }] });
    const { root } = renderLane();
    const y = AUTOMATION_LANE_HEIGHT_PX / 2;
    fireEvent.pointerDown(root, { button: 0, pointerId: 1, clientX: 50, clientY: 6 });
    fireEvent.pointerMove(root, { pointerId: 1, clientX: 120, clientY: y, shiftKey: true });
    fireEvent.pointerUp(root, { pointerId: 1 });
    expect(lanePoints()[0].timeMs).toBe(500);
    expect(lanePoints()[0].value).toBeCloseTo(-27);
  });

  it("removes a point on double-click", () => {
    setup({ ...VOLUME, points: [{ timeMs: 500, value: 6 }, { timeMs: 1500, value: -60 }] });
    const { root } = renderLane();
    fireEvent.doubleClick(root, { clientX: 50, clientY: 6 });
    expect(lanePoints()).toEqual([{ timeMs: 1500, value: -60 }]);
  });

  it("does not edit a locked track", () => {
    const trackId = setup();
    act(() => useTimelineStore.getState().setTrackLocked(trackId, true));
    const { root } = renderLane();
    fireEvent.pointerDown(root, { button: 0, pointerId: 1, clientX: 50, clientY: 10 });
    expect(lanePoints()).toEqual([]);
  });
});

describe("AutomationLaneHeader", () => {
  it("turns a lane off and removes it", () => {
    setup({ ...VOLUME, points: [{ timeMs: 0, value: 0 }] });
    const track = () => useTimelineStore.getState().tracks[0];
    const view = render(
      <ThemeProvider theme={mockTheme}>
        <AutomationLaneHeader track={track()} lane={track().automation![0]} />
      </ThemeProvider>
    );
    expect(screen.getByText("Volume")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Turn lane off" }));
    expect(track().automation?.[0].enabled).toBe(false);
    view.rerender(
      <ThemeProvider theme={mockTheme}>
        <AutomationLaneHeader track={track()} lane={track().automation![0]} />
      </ThemeProvider>
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove lane" }));
    expect(track().automation).toBeUndefined();
  });
});

describe("automationTargetSpecs", () => {
  const t = ((key: string) => key) as unknown as TFunction;

  it("lists the mixer, the WT-1 parameters and the effect fields of a midi track", () => {
    const keys = automationTargetSpecs(
      {
        id: "m",
        name: "Lead",
        type: "midi",
        index: 0,
        visible: true,
        locked: false,
        instrument: findInstrumentPreset("wt1-prime-lead")!.instrument,
        effects: [{ id: "fx", type: "filter", enabled: true, mode: "lowpass", frequency: 800, q: 1 }]
      },
      t
    );
    const byKey = new Map(keys.map((spec) => [spec.key, spec]));
    expect(byKey.has("mixer:volumeDb")).toBe(true);
    expect(byKey.get(`device:${INSTRUMENT_DEVICE_ID}:filter.cutoff`)?.curve).toBe("log");
    expect(byKey.get("device:fx:frequency")?.value).toBe(800);
    // Switches, menus and whole-number knobs do not sweep.
    expect(byKey.has(`device:${INSTRUMENT_DEVICE_ID}:filter.on`)).toBe(false);
    expect(byKey.has(`device:${INSTRUMENT_DEVICE_ID}:oscA.oct`)).toBe(false);
  });

  it("lists clip properties on a picture track, at the value that changes nothing", () => {
    const specs = automationTargetSpecs(
      { id: "v", name: "V1", type: "video", index: 0, visible: true, locked: false },
      t
    );
    expect(specs.find((spec) => spec.key === "clip:opacity")?.value).toBe(1);
    expect(specs.find((spec) => spec.key === "clip:offsetX")?.value).toBe(0);
    expect(specs.some((spec) => spec.target.kind === "mixer")).toBe(false);
  });
});
