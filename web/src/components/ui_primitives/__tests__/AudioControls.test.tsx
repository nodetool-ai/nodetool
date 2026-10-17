import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../__mocks__/themeMock";
import { Fader } from "../Fader";
import { Knob } from "../Knob";
import { LevelMeter, linearToDb } from "../LevelMeter";

class FakePointerEvent extends MouseEvent {
  pointerId: number;
  constructor(type: string, props: PointerEventInit = {}) {
    super(type, props);
    this.pointerId = props.pointerId ?? 1;
  }
}
Object.defineProperty(window, "PointerEvent", { configurable: true, value: FakePointerEvent });

const wrap = (node: React.ReactElement) =>
  render(<ThemeProvider theme={mockTheme}>{node}</ThemeProvider>);

describe("Knob", () => {
  const setup = (value = 0) => {
    const onChange = jest.fn();
    const onChangeStart = jest.fn();
    const onChangeEnd = jest.fn();
    wrap(
      <Knob
        value={value}
        min={-1}
        max={1}
        bipolar
        label="Pan"
        valueText={(v) => `${Math.round(v * 100)}%`}
        onChange={onChange}
        onChangeStart={onChangeStart}
        onChangeEnd={onChangeEnd}
      />
    );
    return { onChange, onChangeStart, onChangeEnd, dial: screen.getByRole("slider", { name: "Pan" }) };
  };

  it("exposes its value as text", () => {
    const { dial } = setup(0.5);
    expect(dial).toHaveAttribute("aria-valuetext", "50%");
    expect(dial).toHaveAttribute("aria-valuemin", "-1");
    expect(dial).toHaveAttribute("aria-valuemax", "1");
  });

  it("steps from the keyboard inside one gesture per key", () => {
    const { dial, onChange, onChangeStart, onChangeEnd } = setup(0);
    fireEvent.keyDown(dial, { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith(0.02);
    fireEvent.keyDown(dial, { key: "PageDown" });
    expect(onChange).toHaveBeenLastCalledWith(-0.2);
    fireEvent.keyDown(dial, { key: "End" });
    expect(onChange).toHaveBeenLastCalledWith(1);
    expect(onChangeStart).toHaveBeenCalledTimes(3);
    expect(onChangeEnd).toHaveBeenCalledTimes(3);
  });

  it("resets a bipolar knob to the centre", () => {
    const { dial, onChange } = setup(0.7);
    fireEvent.keyDown(dial, { key: "Delete" });
    expect(onChange).toHaveBeenLastCalledWith(0);
    onChange.mockClear();
    fireEvent.doubleClick(dial);
    expect(onChange).toHaveBeenLastCalledWith(0);
  });
});

describe("Fader", () => {
  const toPosition = (v: number) => (v + 60) / 66;
  const fromPosition = (p: number) => Math.round((p * 66 - 60) * 10) / 10;
  const setup = (value: number) => {
    const onChange = jest.fn();
    wrap(
      <Fader
        value={value}
        min={-60}
        max={6}
        defaultValue={0}
        toPosition={toPosition}
        fromPosition={fromPosition}
        label="Volume"
        valueText={(v) => `${v} dB`}
        marks={[{ value: 6, label: "6" }, { value: -6, label: "6" }]}
        onChange={onChange}
      />
    );
    return { onChange, slot: screen.getByRole("slider", { name: "Volume" }) };
  };

  it("is a vertical slider with a dB value text", () => {
    const { slot } = setup(-12);
    expect(slot).toHaveAttribute("aria-orientation", "vertical");
    expect(slot).toHaveAttribute("aria-valuetext", "-12 dB");
  });

  it("moves along its taper from the keyboard", () => {
    const { slot, onChange } = setup(-12);
    fireEvent.keyDown(slot, { key: "ArrowUp" });
    expect(onChange).toHaveBeenLastCalledWith(fromPosition(toPosition(-12) + 0.01));
    fireEvent.keyDown(slot, { key: "PageDown" });
    expect(onChange).toHaveBeenLastCalledWith(fromPosition(toPosition(-12) - 0.1));
    fireEvent.keyDown(slot, { key: "Home" });
    expect(onChange).toHaveBeenLastCalledWith(-60);
    fireEvent.keyDown(slot, { key: "Delete" });
    expect(onChange).toHaveBeenLastCalledWith(0);
  });

  it("jumps to a click on the slot, then follows the drag", () => {
    const { slot, onChange } = setup(0);
    jest.spyOn(slot, "getBoundingClientRect").mockReturnValue({
      top: 0, bottom: 220, height: 220, left: 0, right: 28, width: 28, x: 0, y: 0, toJSON: () => ({})
    });
    slot.setPointerCapture = jest.fn();
    fireEvent.pointerDown(slot, { button: 0, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(slot, { clientY: 80, pointerId: 1 });
    fireEvent.pointerUp(slot, { pointerId: 1 });
    // A click on the slot jumps there; dragging up from it raises the level.
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange.mock.calls[1][0]).toBeGreaterThan(onChange.mock.calls[0][0]);
  });
});

describe("LevelMeter", () => {
  let frames: FrameRequestCallback[] = [];
  beforeEach(() => {
    frames = [];
    jest.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      frames.push(cb);
      return frames.length;
    });
    jest.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  const step = (now: number) => {
    const pending = frames;
    frames = [];
    act(() => pending.forEach((cb) => cb(now)));
  };

  it("converts amplitude to dB", () => {
    expect(linearToDb(1)).toBeCloseTo(0);
    expect(linearToDb(0.5)).toBeCloseTo(-6.02, 1);
    expect(linearToDb(0)).toBeLessThan(-100);
  });

  it("draws each channel from read() without re-rendering, and latches clips", () => {
    let levels = [0.5, 0];
    const read = jest.fn(() => levels);
    const { container } = wrap(<LevelMeter read={read} label="Vox meter" minDb={-60} maxDb={6} />);
    step(performance.now() + 16);
    const fills = container.querySelectorAll<HTMLElement>(".level-meter__fill");
    expect(fills).toHaveLength(2);
    // -6 dB on a -60..+6 scale sits at 53.98/66 of the height.
    expect(fills[0].style.clipPath).toBe(`inset(${((1 - 53.9794 / 66) * 100).toFixed(2)}% 0 0 0)`);
    expect(fills[1].style.clipPath).toBe("inset(100.00% 0 0 0)");
    const clip = screen.getByRole("button", { name: "Clear Vox meter clip indicator" });
    expect(clip).toHaveAttribute("data-clipped", "false");
    levels = [1, 1];
    step(performance.now() + 32);
    expect(clip).toHaveAttribute("data-clipped", "true");
    levels = [0, 0];
    step(performance.now() + 48);
    expect(clip).toHaveAttribute("data-clipped", "true");
    fireEvent.click(clip);
    expect(clip).toHaveAttribute("data-clipped", "false");
  });

  it("holds the peak, then lets it fall", () => {
    let levels = [1, 1];
    const { container } = wrap(<LevelMeter read={() => levels} label="Master meter" holdMs={1000} />);
    const t0 = performance.now();
    step(t0 + 16);
    const peak = container.querySelector<HTMLElement>(".level-meter__peak")!;
    const top = peak.style.bottom;
    levels = [0, 0];
    step(t0 + 500);
    expect(peak.style.bottom).toBe(top);
    step(t0 + 1600);
    step(t0 + 1700);
    expect(parseFloat(peak.style.bottom)).toBeLessThan(parseFloat(top));
  });

  it("does not run while inactive", () => {
    wrap(<LevelMeter read={() => [1, 1]} label="Idle meter" active={false} />);
    expect(frames).toHaveLength(0);
  });

  it("stops when the page is hidden and resumes when shown", () => {
    const read = jest.fn(() => [0.1, 0.1]);
    wrap(<LevelMeter read={read} label="Tab meter" />);
    expect(frames).toHaveLength(1);
    const visibility = jest.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(window.cancelAnimationFrame).toHaveBeenCalled();
    visibility.mockReturnValue("visible");
    frames = [];
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(frames).toHaveLength(1);
  });
});
