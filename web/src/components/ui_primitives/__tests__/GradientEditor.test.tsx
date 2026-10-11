import React, { useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { gameParticleGradient } from "@nodetool-ai/protocol";

import mockTheme from "../../../__mocks__/themeMock";
import { installGlobal } from "../../../test-utils/doubles";
import { GradientEditor } from "../GradientEditor";
import type { GradientStop } from "../keyframeEditing";

// jsdom has no PointerEvent: fireEvent would drop pointerId and the coordinates.
if (!window.PointerEvent) {
  installGlobal(
    "PointerEvent",
    class PointerEvent extends MouseEvent {
      readonly pointerId: number;
      constructor(type: string, params: PointerEventInit = {}) {
        super(type, params);
        this.pointerId = params.pointerId ?? 0;
      }
    });
}

beforeAll(() => {
  HTMLElement.prototype.setPointerCapture = jest.fn();
  HTMLElement.prototype.releasePointerCapture = jest.fn();
});

function Harness({ initial, onChange, maxStops }: { initial: GradientStop[]; onChange: (stops: GradientStop[]) => void; maxStops?: number }) {
  const [stops, setStops] = useState(initial);
  return <ThemeProvider theme={mockTheme}>
    <GradientEditor label="Colour over lifetime" value={stops} maxStops={maxStops} onChange={(next) => {
      onChange(next);
      setStops(next);
    }} />
  </ThemeProvider>;
}

const blackToWhite: GradientStop[] = [{ t: 0, color: "#000000" }, { t: 1, color: "#ffffff" }];

function stopHandle(index: number): HTMLElement {
  return screen.getByRole("slider", { name: `Colour over lifetime stop ${index}` });
}

describe("GradientEditor", () => {
  it("renders one labelled slider per stop and forwards its ref", () => {
    const ref = React.createRef<HTMLDivElement>();
    render(<ThemeProvider theme={mockTheme}><GradientEditor ref={ref} label="Colour over lifetime" value={blackToWhite} onChange={jest.fn()} /></ThemeProvider>);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(screen.getByRole("group", { name: "Colour over lifetime" })).toBeInTheDocument();
    expect(stopHandle(1)).toHaveAttribute("aria-valuetext", "Position 0, colour #000000");
    expect(stopHandle(2)).toHaveAttribute("aria-valuenow", "1");
  });

  it("moves a stop with the arrow keys, clamped to its neighbours", () => {
    const onChange = jest.fn();
    render(<Harness initial={[{ t: 0, color: "#000000" }, { t: 0.5, color: "#ff0000" }, { t: 1, color: "#ffffff" }]} onChange={onChange} />);
    fireEvent.keyDown(stopHandle(2), { key: "ArrowRight" });
    expect(onChange.mock.lastCall[0][1]).toEqual({ t: 0.51, color: "#ff0000" });
    fireEvent.keyDown(stopHandle(2), { key: "ArrowLeft", shiftKey: true });
    expect(onChange.mock.lastCall[0][1].t).toBe(0.41);
    fireEvent.keyDown(stopHandle(2), { key: "Home" });
    expect(onChange.mock.lastCall[0][1].t).toBe(0);
    fireEvent.keyDown(stopHandle(3), { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledTimes(3);
  });

  it("adds a stop with Insert in the interpolated colour and removes it with Delete", () => {
    const onChange = jest.fn();
    render(<Harness initial={blackToWhite} onChange={onChange} />);
    fireEvent.keyDown(stopHandle(1), { key: "Insert" });
    expect(onChange).toHaveBeenLastCalledWith([{ t: 0, color: "#000000" }, { t: 0.5, color: "#808080" }, { t: 1, color: "#ffffff" }]);
    expect(stopHandle(2)).toHaveFocus();
    fireEvent.keyDown(stopHandle(2), { key: "Delete" });
    expect(onChange).toHaveBeenLastCalledWith(blackToWhite);
    expect(stopHandle(1)).toHaveFocus();
  });

  it("never removes the last stop or adds past maxStops", () => {
    const onChange = jest.fn();
    render(<Harness initial={[{ t: 0, color: "#ff0000" }]} maxStops={2} onChange={onChange} />);
    fireEvent.keyDown(stopHandle(1), { key: "Backspace" });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Remove stop" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Add stop" }));
    expect(onChange).toHaveBeenLastCalledWith([{ t: 0, color: "#ff0000" }, { t: 0.5, color: "#ff0000" }]);
    expect(screen.getByRole("button", { name: "Add stop" })).toBeDisabled();
  });

  it("previews colour picker ticks and commits once on the native change event", () => {
    const onChange = jest.fn();
    render(<Harness initial={blackToWhite} onChange={onChange} />);
    fireEvent.focus(stopHandle(2));
    const colour = screen.getByLabelText("Stop 2 colour");
    for (const value of ["#111111", "#222222", "#00ff00"]) {
      fireEvent.input(colour, { target: { value } });
    }
    expect(onChange).not.toHaveBeenCalled();
    expect(stopHandle(2)).toHaveAttribute("aria-valuetext", "Position 1, colour #00ff00");
    act(() => {
      colour.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith([{ t: 0, color: "#000000" }, { t: 1, color: "#00ff00" }]);
    fireEvent.blur(colour);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("commits a colour draft on blur", () => {
    const onChange = jest.fn();
    render(<Harness initial={blackToWhite} onChange={onChange} />);
    const colour = screen.getByLabelText("Stop 1 colour");
    fireEvent.input(colour, { target: { value: "#ff0000" } });
    fireEvent.blur(colour);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith([{ t: 0, color: "#ff0000" }, { t: 1, color: "#ffffff" }]);
  });

  it("edits the selected stop's position", () => {
    const onChange = jest.fn();
    render(<Harness initial={blackToWhite} onChange={onChange} />);
    fireEvent.focus(stopHandle(2));
    const position = screen.getByRole("textbox", { name: "Stop 2 position" });
    fireEvent.change(position, { target: { value: "0.25" } });
    fireEvent.blur(position);
    expect(onChange).toHaveBeenLastCalledWith([{ t: 0, color: "#000000" }, { t: 0.25, color: "#ffffff" }]);
  });

  it("drags a stop with the pointer and commits once on release", () => {
    const onChange = jest.fn();
    render(<Harness initial={blackToWhite} onChange={onChange} />);
    const bar = screen.getByTestId("gradient-editor-bar");
    bar.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 24, right: 200, bottom: 24, x: 0, y: 0, toJSON: () => ({}) });
    const handle = stopHandle(2);
    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 200, clientY: 30, button: 0 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 150, clientY: 30 });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 150, clientY: 30 });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith([{ t: 0, color: "#000000" }, { t: 0.75, color: "#ffffff" }]);
  });

  it("adds a stop where the bar is double-clicked", () => {
    const onChange = jest.fn();
    render(<Harness initial={blackToWhite} onChange={onChange} />);
    const bar = screen.getByTestId("gradient-editor-bar");
    bar.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 24, right: 200, bottom: 24, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.doubleClick(bar, { clientX: 50, clientY: 12 });
    expect(onChange).toHaveBeenLastCalledWith([{ t: 0, color: "#000000" }, { t: 0.25, color: "#404040" }, { t: 1, color: "#ffffff" }]);
    expect(stopHandle(2)).toHaveFocus();
  });

  it("does not commit a drag that leaves the stop where it was", () => {
    const onChange = jest.fn();
    render(<Harness initial={[{ t: 0, color: "#000000" }, { t: 0.333, color: "#ff0000" }, { t: 1, color: "#ffffff" }]} onChange={onChange} />);
    const bar = screen.getByTestId("gradient-editor-bar");
    bar.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 24, right: 200, bottom: 24, x: 0, y: 0, toJSON: () => ({}) });
    const handle = stopHandle(2);
    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 66.6, clientY: 30, button: 0 });
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 66.6, clientY: 30 });
    fireEvent.pointerDown(handle, { pointerId: 2, clientX: 66.6, clientY: 30, button: 0 });
    fireEvent.pointerMove(handle, { pointerId: 2, clientX: 66.2, clientY: 30 });
    expect(handle).toHaveAttribute("aria-valuenow", "0.333");
    fireEvent.pointerUp(handle, { pointerId: 2, clientX: 66.2, clientY: 30 });
    expect(onChange).not.toHaveBeenCalled();
  });

  it.each([["pointer cancel", "pointerCancel"], ["lost pointer capture", "lostPointerCapture"]] as const)("discards the drag on %s", (_name, ending) => {
    const onChange = jest.fn();
    render(<Harness initial={blackToWhite} onChange={onChange} />);
    const bar = screen.getByTestId("gradient-editor-bar");
    bar.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 24, right: 200, bottom: 24, x: 0, y: 0, toJSON: () => ({}) });
    const handle = stopHandle(2);
    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 200, clientY: 30, button: 0 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 150, clientY: 30 });
    fireEvent[ending](handle, { pointerId: 1 });
    expect(handle).toHaveAttribute("aria-valuenow", "1");
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 150, clientY: 30 });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("ignores keys, pointer and buttons when disabled", () => {
    const onChange = jest.fn();
    render(<ThemeProvider theme={mockTheme}><GradientEditor label="Colour over lifetime" value={blackToWhite} onChange={onChange} disabled /></ThemeProvider>);
    const bar = screen.getByTestId("gradient-editor-bar");
    bar.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 24, right: 200, bottom: 24, x: 0, y: 0, toJSON: () => ({}) });
    const handle = stopHandle(2);
    expect(handle).toHaveAttribute("tabindex", "-1");
    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    fireEvent.keyDown(handle, { key: "Insert" });
    fireEvent.keyDown(handle, { key: "Delete" });
    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 200, clientY: 30, button: 0 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 150, clientY: 30 });
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 150, clientY: 30 });
    fireEvent.doubleClick(bar, { clientX: 50, clientY: 12 });
    expect(screen.getByLabelText("Stop 1 colour")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add stop" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Remove stop" })).toBeDisabled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("emits stops the particle gradient schema accepts", () => {
    const onChange = jest.fn();
    render(<Harness initial={blackToWhite} onChange={onChange} />);
    fireEvent.keyDown(stopHandle(1), { key: "Insert" });
    fireEvent.keyDown(stopHandle(2), { key: "ArrowRight", shiftKey: true });
    for (const [stops] of onChange.mock.calls) {
      expect(gameParticleGradient.safeParse(stops).success).toBe(true);
    }
  });
});
