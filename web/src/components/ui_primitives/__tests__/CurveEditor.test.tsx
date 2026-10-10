import React, { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { gameParticleCurve } from "@nodetool-ai/protocol";

import mockTheme from "../../../__mocks__/themeMock";
import { installGlobal } from "../../../test-utils/doubles";
import { CurveEditor } from "../CurveEditor";
import type { CurveKey } from "../keyframeEditing";

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

function Harness({ initial, onChange, maxKeys }: { initial: CurveKey[]; onChange: (keys: CurveKey[]) => void; maxKeys?: number }) {
  const [keys, setKeys] = useState(initial);
  return <ThemeProvider theme={mockTheme}>
    <CurveEditor label="Size over lifetime" value={keys} maxKeys={maxKeys} onChange={(next) => {
      onChange(next);
      setKeys(next);
    }} />
  </ThemeProvider>;
}

const twoKeys: CurveKey[] = [{ t: 0, value: 1 }, { t: 1, value: 0 }];

function keyHandle(index: number): HTMLElement {
  return screen.getByRole("slider", { name: `Size over lifetime key ${index}` });
}

describe("CurveEditor", () => {
  it("renders one labelled slider per key and forwards its ref", () => {
    const ref = React.createRef<HTMLDivElement>();
    render(<ThemeProvider theme={mockTheme}><CurveEditor ref={ref} label="Size over lifetime" value={twoKeys} onChange={jest.fn()} /></ThemeProvider>);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(screen.getByRole("group", { name: "Size over lifetime" })).toBeInTheDocument();
    expect(keyHandle(1)).toHaveAttribute("aria-valuetext", "Time 0, value 1");
    expect(keyHandle(2)).toHaveAttribute("aria-valuetext", "Time 1, value 0");
  });

  it("moves a key in time and value with the arrow keys, clamped to its neighbours", () => {
    const onChange = jest.fn();
    render(<Harness initial={[{ t: 0, value: 1 }, { t: 0.5, value: 0.5 }, { t: 1, value: 0 }]} onChange={onChange} />);
    const handle = keyHandle(2);
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith([{ t: 0, value: 1 }, { t: 0.51, value: 0.5 }, { t: 1, value: 0 }]);
    fireEvent.keyDown(handle, { key: "ArrowLeft", shiftKey: true });
    expect(onChange.mock.lastCall[0][1].t).toBe(0.41);
    fireEvent.keyDown(handle, { key: "ArrowUp" });
    expect(onChange.mock.lastCall[0][1].value).toBe(0.51);
    fireEvent.keyDown(handle, { key: "ArrowDown", shiftKey: true });
    expect(onChange.mock.lastCall[0][1].value).toBe(0.41);
    fireEvent.keyDown(handle, { key: "End" });
    expect(onChange.mock.lastCall[0][1].t).toBe(1);
    fireEvent.keyDown(keyHandle(1), { key: "ArrowDown", shiftKey: true });
    fireEvent.keyDown(keyHandle(1), { key: "ArrowDown", shiftKey: true });
    fireEvent.keyDown(keyHandle(1), { key: "ArrowDown", shiftKey: true });
    fireEvent.keyDown(keyHandle(1), { key: "PageDown" });
    expect(onChange.mock.lastCall[0][0].value).toBe(0);
  });

  it("adds a key with Insert and removes one with Delete, keeping the curve shape and focus", () => {
    const onChange = jest.fn();
    render(<Harness initial={twoKeys} onChange={onChange} />);
    fireEvent.keyDown(keyHandle(1), { key: "Insert" });
    expect(onChange).toHaveBeenLastCalledWith([{ t: 0, value: 1 }, { t: 0.5, value: 0.5 }, { t: 1, value: 0 }]);
    expect(keyHandle(2)).toHaveFocus();
    fireEvent.keyDown(keyHandle(2), { key: "Delete" });
    expect(onChange).toHaveBeenLastCalledWith(twoKeys);
    expect(keyHandle(1)).toHaveFocus();
  });

  it("never removes the last key or adds past maxKeys", () => {
    const onChange = jest.fn();
    render(<Harness initial={[{ t: 0.5, value: 1 }]} maxKeys={2} onChange={onChange} />);
    fireEvent.keyDown(keyHandle(1), { key: "Delete" });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Remove key" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Add key" }));
    expect(onChange).toHaveBeenLastCalledWith([{ t: 0.5, value: 1 }, { t: 0.75, value: 1 }]);
    expect(screen.getByRole("button", { name: "Add key" })).toBeDisabled();
  });

  it("edits the selected key's time and value through numeric fields", () => {
    const onChange = jest.fn();
    render(<Harness initial={twoKeys} onChange={onChange} />);
    fireEvent.focus(keyHandle(2));
    const value = screen.getByRole("textbox", { name: "Key 2 value" });
    fireEvent.change(value, { target: { value: "2.5" } });
    fireEvent.blur(value);
    expect(onChange).toHaveBeenLastCalledWith([{ t: 0, value: 1 }, { t: 1, value: 2.5 }]);
    const time = screen.getByRole("textbox", { name: "Key 2 time" });
    fireEvent.change(time, { target: { value: "0.8" } });
    fireEvent.blur(time);
    expect(onChange).toHaveBeenLastCalledWith([{ t: 0, value: 1 }, { t: 0.8, value: 2.5 }]);
  });

  it("drags a key with the pointer and commits once on release", () => {
    const onChange = jest.fn();
    render(<Harness initial={twoKeys} onChange={onChange} />);
    const plot = screen.getByTestId("curve-editor-plot");
    plot.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100, x: 0, y: 0, toJSON: () => ({}) });
    const handle = keyHandle(2);
    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 200, clientY: 100, button: 0 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 150, clientY: 75 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 100, clientY: 50 });
    expect(onChange).not.toHaveBeenCalled();
    expect(handle).toHaveAttribute("aria-valuetext", "Time 0.5, value 0.5");
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 100, clientY: 50 });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith([{ t: 0, value: 1 }, { t: 0.5, value: 0.5 }]);
  });

  it("adds a key where the plot is double-clicked", () => {
    const onChange = jest.fn();
    render(<Harness initial={twoKeys} onChange={onChange} />);
    const plot = screen.getByTestId("curve-editor-plot");
    plot.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.doubleClick(plot, { clientX: 50, clientY: 20 });
    expect(onChange).toHaveBeenLastCalledWith([{ t: 0, value: 1 }, { t: 0.25, value: 0.8 }, { t: 1, value: 0 }]);
    expect(keyHandle(2)).toHaveFocus();
  });

  it("emits keys the particle curve schema accepts", () => {
    const onChange = jest.fn();
    render(<Harness initial={twoKeys} onChange={onChange} />);
    fireEvent.keyDown(keyHandle(1), { key: "Insert" });
    fireEvent.keyDown(keyHandle(2), { key: "ArrowUp", shiftKey: true });
    for (const [keys] of onChange.mock.calls) {
      expect(gameParticleCurve.safeParse(keys).success).toBe(true);
    }
  });
});
