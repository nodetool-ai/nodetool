/**
 * Recording passes through the mixer strip (AU7): a fake transport and real
 * fader and pan gestures. The lane holds the pass afterwards, the track keeps
 * its own value, and every pass is one undo entry.
 */
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { makeTrack, type AutomationMode } from "@nodetool-ai/timeline";

import mockTheme from "../../../../../__mocks__/themeMock";
import {
  TimelineProvider,
  createTimelineInstance,
  type TimelineInstance
} from "../../../../../stores/timeline/TimelineInstance";
import { timelineTemporalOf } from "../../../../../stores/timeline/TimelineStore";
import { MixerView } from "../MixerView";

class FakePointerEvent extends MouseEvent {
  pointerId: number;
  constructor(type: string, props: PointerEventInit = {}) {
    super(type, props);
    this.pointerId = props.pointerId ?? 1;
  }
}
Object.defineProperty(window, "PointerEvent", { configurable: true, value: FakePointerEvent });

jest.mock("../EffectDevicePopover", () => ({
  EffectDevicePopover: () => null
}));

const flush = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
  });

function setup(mode: AutomationMode): TimelineInstance {
  const instance = createTimelineInstance();
  instance.doc.setState({
    tracks: [{ ...makeTrack({ type: "audio", name: "Vox", index: 0 }), automationMode: mode }],
    clips: []
  });
  timelineTemporalOf(instance.doc).clear();
  render(
    <ThemeProvider theme={mockTheme}>
      <TimelineProvider instance={instance}>
        <MixerView />
      </TimelineProvider>
    </ThemeProvider>
  );
  return instance;
}

const at = (instance: TimelineInstance, ms: number) => instance.playback.getState().setTimeMs(ms);
const lane = (instance: TimelineInstance) =>
  instance.doc.getState().tracks[0].automation?.find(
    (l) => l.target.kind === "mixer" && l.target.param === "volumeDb"
  )?.points;

function fader(): HTMLElement {
  const el = screen.getByRole("slider", { name: "Vox volume" });
  jest.spyOn(el, "getBoundingClientRect").mockReturnValue({
    top: 0, bottom: 200, height: 200, left: 0, right: 28, width: 28, x: 0, y: 0, toJSON: () => ({})
  });
  el.setPointerCapture = jest.fn();
  return el;
}

describe("mixer fader and automation modes", () => {
  beforeAll(() => {
    jest.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      return setTimeout(() => cb(performance.now()), 0) as unknown as number;
    });
    jest.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => clearTimeout(id));
  });
  afterAll(() => jest.restoreAllMocks());

  it("Touch records the drag into the lane, keeps the track value and is one undo step", async () => {
    const instance = setup("touch");
    const el = fader();
    instance.playback.getState().play();
    at(instance, 1000);
    act(() => {
      fireEvent.pointerDown(el, { button: 0, clientY: 100, pointerId: 1 });
    });
    at(instance, 1200);
    act(() => {
      fireEvent.pointerMove(el, { clientY: 60, pointerId: 1 });
    });
    await flush();
    at(instance, 1400);
    act(() => {
      fireEvent.pointerMove(el, { clientY: 20, pointerId: 1 });
    });
    await flush();
    at(instance, 1500);
    act(() => {
      fireEvent.pointerUp(el, { clientY: 20, pointerId: 1 });
    });
    const points = lane(instance);
    expect(points && points.length).toBeGreaterThanOrEqual(3);
    expect(points![0].timeMs).toBe(1000);
    expect(points![points!.length - 2].timeMs).toBe(1500);
    expect(points![points!.length - 1].timeMs).toBe(1700);
    expect(instance.doc.getState().tracks[0].volumeDb).toBeUndefined();
    expect(timelineTemporalOf(instance.doc).pastStates).toHaveLength(1);
  });

  it("Latch keeps recording after release until the transport stops", async () => {
    const instance = setup("latch");
    const el = fader();
    instance.playback.getState().play();
    at(instance, 500);
    act(() => {
      fireEvent.pointerDown(el, { button: 0, clientY: 100, pointerId: 1 });
    });
    at(instance, 600);
    act(() => {
      fireEvent.pointerMove(el, { clientY: 50, pointerId: 1 });
    });
    await flush();
    act(() => {
      fireEvent.pointerUp(el, { clientY: 50, pointerId: 1 });
    });
    expect(lane(instance)).toBeUndefined();
    at(instance, 2500);
    act(() => instance.playback.getState().pause());
    const points = lane(instance)!;
    expect(points[0].timeMs).toBe(500);
    expect(points[points.length - 2].timeMs).toBe(2500);
    expect(instance.doc.getState().tracks[0].volumeDb).toBeUndefined();
    expect(timelineTemporalOf(instance.doc).pastStates).toHaveLength(1);
  });

  it("Write records from play to stop without any press and then switches to Latch", () => {
    const instance = setup("write");
    instance.playback.getState().play();
    at(instance, 1000);
    act(() => instance.playback.getState().pause());
    expect(lane(instance)).toBeDefined();
    expect(instance.doc.getState().tracks[0].automationMode).toBe("latch");
    expect(timelineTemporalOf(instance.doc).pastStates).toHaveLength(1);
  });

  it("Read writes the track value as before", async () => {
    const instance = setup("read");
    const el = fader();
    instance.playback.getState().play();
    at(instance, 1000);
    act(() => {
      fireEvent.pointerDown(el, { button: 0, clientY: 100, pointerId: 1 });
      fireEvent.pointerMove(el, { clientY: 60, pointerId: 1 });
    });
    await flush();
    act(() => {
      fireEvent.pointerUp(el, { clientY: 60, pointerId: 1 });
    });
    expect(instance.doc.getState().tracks[0].volumeDb).toBeDefined();
    expect(lane(instance)).toBeUndefined();
  });

  it("never writes the track value after a pass ended under the pointer", async () => {
    const instance = setup("touch");
    const el = fader();
    instance.playback.getState().play();
    at(instance, 1000);
    act(() => {
      fireEvent.pointerDown(el, { button: 0, clientY: 100, pointerId: 1 });
    });
    act(() => instance.playback.getState().pause());
    act(() => {
      fireEvent.pointerMove(el, { clientY: 40, pointerId: 1 });
    });
    await flush();
    act(() => {
      fireEvent.pointerUp(el, { clientY: 40, pointerId: 1 });
    });
    expect(instance.doc.getState().tracks[0].volumeDb).toBeUndefined();
  });

  it("records a Write pass with no mixer mounted", () => {
    const instance = createTimelineInstance();
    instance.doc.setState({
      tracks: [{ ...makeTrack({ type: "audio", name: "Vox", index: 0 }), automationMode: "write" }],
      clips: []
    });
    render(
      <ThemeProvider theme={mockTheme}>
        <TimelineProvider instance={instance}>
          <div />
        </TimelineProvider>
      </ThemeProvider>
    );
    instance.playback.getState().play();
    at(instance, 1000);
    act(() => instance.playback.getState().pause());
    expect(lane(instance)).toBeDefined();
    expect(instance.doc.getState().tracks[0].automationMode).toBe("latch");
  });
});
