import { useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../__mocks__/themeMock";
import { installGlobal } from "../../../test-utils/doubles";
import { InspectorValueInput } from "../InspectorValueInput";

// jsdom has no PointerEvent: fireEvent would drop pointerId.
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
});

describe("InspectorValueInput", () => {
  it("commits typed values on blur and restores the external value after rejection", () => {
    const onCommit = jest.fn();
    render(<ThemeProvider theme={mockTheme}>
      <InspectorValueInput ariaLabel="Rotation" value="12" onCommit={onCommit} />
    </ThemeProvider>);

    const input = screen.getByRole("textbox", { name: "Rotation" });
    fireEvent.change(input, { target: { value: "25" } });
    fireEvent.blur(input);

    expect(onCommit).toHaveBeenCalledWith("25");
    expect(input).toHaveValue("12");
  });

  it("does not commit an escaped draft", () => {
    const onCommit = jest.fn();
    render(<ThemeProvider theme={mockTheme}>
      <InspectorValueInput ariaLabel="Scale" value="1" onCommit={onCommit} />
    </ThemeProvider>);

    const input = screen.getByRole("textbox", { name: "Scale" });
    act(() => input.focus());
    fireEvent.change(input, { target: { value: "5" } });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(input).toHaveValue("1");
    expect(input).not.toHaveFocus();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("treats a blank commit as cancel and restores the previous value", () => {
    const onCommit = jest.fn();
    render(<ThemeProvider theme={mockTheme}>
      <InspectorValueInput ariaLabel="Speed" value="1.00" onCommit={onCommit} />
    </ThemeProvider>);

    const input = screen.getByRole("textbox", { name: "Speed" });
    act(() => input.focus());
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.blur(input);

    expect(onCommit).not.toHaveBeenCalled();
    expect(input).toHaveValue("1.00");
  });

  it("commits a blank draft when the field allows empty", () => {
    const onCommit = jest.fn();
    render(<ThemeProvider theme={mockTheme}>
      <InspectorValueInput ariaLabel="Easing" value="ease-in" allowEmpty onCommit={onCommit} />
    </ThemeProvider>);

    const input = screen.getByRole("textbox", { name: "Easing" });
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);

    expect(onCommit).toHaveBeenCalledWith("");
  });

  it("steps with arrow keys by the scrub step, with Shift and Alt multipliers, clamped to the range", () => {
    const onCommit = jest.fn();
    const Stateful = () => {
      const [value, setValue] = useState("1.0");
      return <InspectorValueInput ariaLabel="Gain" value={value} scrub={{ step: 0.1, min: 0, max: 2 }}
        onCommit={(raw) => { onCommit(raw); setValue(raw); }} />;
    };
    render(<ThemeProvider theme={mockTheme}><Stateful /></ThemeProvider>);

    const input = screen.getByRole("textbox", { name: "Gain" });
    act(() => input.focus());
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(onCommit).toHaveBeenLastCalledWith("1.1");
    expect(input).toHaveValue("1.1");

    // Alt steps by a tenth of the step, with one more decimal so it shows.
    fireEvent.keyDown(input, { key: "ArrowDown", altKey: true });
    expect(onCommit).toHaveBeenLastCalledWith("1.09");
    expect(input).toHaveValue("1.09");

    fireEvent.keyDown(input, { key: "ArrowDown", shiftKey: true });
    expect(onCommit).toHaveBeenLastCalledWith("0.1");

    fireEvent.keyDown(input, { key: "ArrowDown", shiftKey: true });
    expect(onCommit).toHaveBeenLastCalledWith("0.0");

    // Leaving the field must not write the stepped value a second time.
    const calls = onCommit.mock.calls.length;
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledTimes(calls);
  });

  it("shows the kept value when the owner rejects an arrow step", () => {
    const onCommit = jest.fn();
    render(<ThemeProvider theme={mockTheme}>
      <InspectorValueInput ariaLabel="Gamma" value="1.0" scrub={{ step: 0.1 }} onCommit={onCommit} />
    </ThemeProvider>);

    const input = screen.getByRole("textbox", { name: "Gamma" });
    act(() => input.focus());
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(onCommit).toHaveBeenLastCalledWith("1.1");
    expect(input).toHaveValue("1.0");
  });

  it("shows the kept value when the owner rejects a pointer scrub", () => {
    const onCommit = jest.fn();
    render(<ThemeProvider theme={mockTheme}>
      <InspectorValueInput ariaLabel="Gamma" value="1.0" scrub={{ step: 0.1 }} onCommit={onCommit} />
    </ThemeProvider>);

    const input = screen.getByRole("textbox", { name: "Gamma" });
    const wrap = input.parentElement as HTMLElement;
    fireEvent.pointerDown(wrap, { pointerId: 1, button: 0, clientX: 100 });
    fireEvent.pointerMove(wrap, { pointerId: 1, clientX: 80 });
    expect(input).toHaveValue("-1.0");
    fireEvent.pointerUp(wrap, { pointerId: 1, clientX: 80 });

    expect(onCommit).toHaveBeenLastCalledWith("-1.0");
    expect(input).toHaveValue("1.0");
  });

  it("commits the scrub and closes the gesture when the pointer is cancelled", () => {
    const onCommit = jest.fn();
    const gesture = { begin: jest.fn(), schedule: jest.fn(), commit: jest.fn() };
    render(<ThemeProvider theme={mockTheme}>
      <InspectorValueInput ariaLabel="Scale" value="1.00" scrub={{ step: 0.01 }} scrubGesture={gesture} onCommit={onCommit} />
    </ThemeProvider>);

    const input = screen.getByRole("textbox", { name: "Scale" });
    const wrap = input.parentElement as HTMLElement;
    fireEvent.pointerDown(wrap, { pointerId: 7, button: 0, clientX: 0 });
    fireEvent.pointerMove(wrap, { pointerId: 7, clientX: 10 });
    fireEvent.pointerCancel(wrap, { pointerId: 7 });

    expect(gesture.begin).toHaveBeenCalledTimes(1);
    expect(gesture.commit).toHaveBeenCalledTimes(1);
    expect(input).not.toHaveFocus();

    // The gesture is closed: a later move does nothing.
    fireEvent.pointerMove(wrap, { pointerId: 7, clientX: 40 });
    expect(gesture.schedule).toHaveBeenCalledTimes(1);
  });

  it("routes held arrow keys through the scrub gesture as one batch", () => {
    const onCommit = jest.fn();
    const gesture = { begin: jest.fn(), schedule: jest.fn(), commit: jest.fn() };
    render(<ThemeProvider theme={mockTheme}>
      <InspectorValueInput ariaLabel="Scale" value="1.00" scrub={{ step: 0.01 }} scrubGesture={gesture} onCommit={onCommit} />
    </ThemeProvider>);

    const input = screen.getByRole("textbox", { name: "Scale" });
    act(() => input.focus());
    fireEvent.keyDown(input, { key: "ArrowUp" });
    fireEvent.keyDown(input, { key: "ArrowUp" });
    fireEvent.keyUp(input, { key: "ArrowUp" });

    expect(gesture.begin).toHaveBeenCalledTimes(1);
    expect(gesture.schedule).toHaveBeenNthCalledWith(1, "1.01");
    expect(gesture.schedule).toHaveBeenNthCalledWith(2, "1.02");
    expect(gesture.commit).toHaveBeenCalledTimes(1);
    expect(onCommit).not.toHaveBeenCalled();
  });
});
