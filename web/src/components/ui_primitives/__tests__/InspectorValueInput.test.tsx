import { act, fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../__mocks__/themeMock";
import { InspectorValueInput } from "../InspectorValueInput";

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
    render(<ThemeProvider theme={mockTheme}>
      <InspectorValueInput ariaLabel="Gain" value="1.0" scrub={{ step: 0.1, min: 0, max: 2 }} onCommit={onCommit} />
    </ThemeProvider>);

    const input = screen.getByRole("textbox", { name: "Gain" });
    act(() => input.focus());
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(onCommit).toHaveBeenLastCalledWith("1.1");
    expect(input).toHaveValue("1.1");

    fireEvent.keyDown(input, { key: "ArrowDown", altKey: true });
    expect(onCommit).toHaveBeenLastCalledWith("1.1");
    expect(input).toHaveValue("1.1");

    fireEvent.keyDown(input, { key: "ArrowDown", shiftKey: true });
    expect(onCommit).toHaveBeenLastCalledWith("0.1");

    fireEvent.keyDown(input, { key: "ArrowDown", shiftKey: true });
    expect(onCommit).toHaveBeenLastCalledWith("0.0");

    // Leaving the field must not write the stepped value a second time.
    const calls = onCommit.mock.calls.length;
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledTimes(calls);
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
