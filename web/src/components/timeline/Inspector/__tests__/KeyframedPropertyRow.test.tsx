/** The Premiere-style stopwatch row: animate, key at the playhead, navigate. */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import {
  isPropertyKeyframed,
  keyframeTimesMs,
  keyframeValueAt,
  makeClip,
  type TimelineClip
} from "@nodetool-ai/timeline";

import mockTheme from "../../../../__mocks__/themeMock";
import {
  TimelineProvider,
  createTimelineInstance
} from "../../../../stores/timeline/TimelineInstance";
import { KeyframedPropertyRow } from "../KeyframedPropertyRow";
import { OPACITY_ROW, POSITION_ROW } from "../keyframeRows";

function setup(playheadMs: number, extra: Partial<TimelineClip> = {}) {
  const instance = createTimelineInstance();
  const clip = makeClip({
    name: "c",
    sourceType: "imported",
    mediaType: "video",
    startMs: 1000,
    durationMs: 1000,
    ...extra
  });
  act(() => {
    instance.doc.setState({ clips: [clip] });
    instance.playback.getState().seek(playheadMs);
  });
  const current = () => instance.doc.getState().clips[0];
  const view = (row = POSITION_ROW) =>
    render(
      <ThemeProvider theme={mockTheme}>
        <TimelineProvider instance={instance}>
          <KeyframedPropertyRow clip={current()} row={row} />
        </TimelineProvider>
      </ThemeProvider>
    );
  return { instance, current, view };
}

function commit(label: RegExp, value: string) {
  const input = screen.getByRole("textbox", { name: label });
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value } });
  fireEvent.blur(input);
}

it("disables the stopwatch while the playhead is off the clip", () => {
  const { view } = setup(5000);
  view();
  expect(screen.getByRole("button", { name: /animate position/i, hidden: true })).toBeDisabled();
});

it("edits the authored value while the stopwatch is off", () => {
  const { current, view } = setup(1500);
  view();
  commit(/position x/i, "40");
  expect(current().transform?.position.x).toBe(40);
  expect(isPropertyKeyframed(current(), "offsetX")).toBe(false);
});

it("keys X and Y together at the playhead once the stopwatch is on", () => {
  const { current, view, instance } = setup(1500, {
    transform: { position: { x: 10, y: 20 }, scale: { x: 1, y: 1 }, rotation: 0, anchor: { x: 0.5, y: 0.5 } }
  });
  const { unmount } = view();
  fireEvent.click(screen.getByRole("button", { name: /animate position/i }));
  expect(keyframeTimesMs(current(), ["offsetX"])).toEqual([500]);
  expect(keyframeTimesMs(current(), ["offsetY"])).toEqual([500]);
  unmount();

  act(() => instance.playback.getState().seek(1900));
  view();
  // The field shows the composed value; typing one writes a keyframe here.
  commit(/position x/i, "110");
  expect(keyframeTimesMs(current(), ["offsetX", "offsetY"])).toEqual([500, 900]);
  expect(keyframeValueAt(current(), "offsetX", 900)).toBe(100);
  expect(keyframeValueAt(current(), "offsetY", 900)).toBe(0);
  expect(current().transform?.position.x).toBe(10);
  expect(screen.getByTestId("keyframe-row-position")).toBeInTheDocument();
});

it("navigates between keyframes and turns the stopwatch off keeping the value", () => {
  const { current, view, instance } = setup(1000);
  const first = view(OPACITY_ROW);
  fireEvent.click(screen.getByRole("button", { name: /animate opacity/i }));
  first.unmount();
  act(() => instance.playback.getState().seek(2000));
  const second = view(OPACITY_ROW);
  commit(/opacity/i, "40");
  second.unmount();

  view(OPACITY_ROW);
  fireEvent.click(screen.getByRole("button", { name: /previous keyframe/i }));
  expect(instance.playback.getState().currentTimeMs).toBe(1000);

  act(() => instance.playback.getState().seek(2000));
  fireEvent.click(screen.getByRole("button", { name: /stop animating opacity/i }));
  expect(isPropertyKeyframed(current(), "opacity")).toBe(false);
  expect(current().opacity).toBeCloseTo(0.4);
});
