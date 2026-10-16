/**
 * @jest-environment jsdom
 */
import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider, createTheme } from "@mui/material/styles";

import { ResizeHandle, type ResizeHandleProps } from "../ResizeHandle";

type HarnessProps = Partial<
  Omit<ResizeHandleProps, "value" | "onResize" | "ariaLabel">
> & { initial?: number };

function Harness({ initial = 200, ...props }: HarnessProps) {
  const [value, setValue] = useState(initial);
  return (
    <ThemeProvider theme={createTheme({ cssVariables: true })}>
      <ResizeHandle
        orientation="vertical"
        min={100}
        max={400}
        ariaLabel="Resize pane"
        {...props}
        value={value}
        onResize={(delta) => setValue((v) => v + delta)}
      />
    </ThemeProvider>
  );
}

// jsdom has no PointerEvent, so build one with the fields the handle reads.
function firePointer(
  target: HTMLElement,
  type: "pointerdown" | "pointermove" | "pointerup",
  clientX: number
) {
  const event = new MouseEvent(type, { bubbles: true, button: 0, clientX });
  Object.defineProperty(event, "pointerId", { value: 1 });
  fireEvent(target, event);
}

describe("ResizeHandle", () => {
  it("exposes separator role and aria range", () => {
    render(<Harness />);
    const handle = screen.getByRole("separator", { name: "Resize pane" });
    expect(handle).toHaveAttribute("aria-orientation", "vertical");
    expect(handle).toHaveAttribute("aria-valuenow", "200");
    expect(handle).toHaveAttribute("aria-valuemin", "100");
    expect(handle).toHaveAttribute("aria-valuemax", "400");
    expect(handle).toHaveAttribute("tabindex", "0");
  });

  it("moves by the default keyboard step of 16", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const handle = screen.getByRole("separator");
    handle.focus();
    await user.keyboard("{ArrowRight}");
    expect(handle).toHaveAttribute("aria-valuenow", "216");
    await user.keyboard("{ArrowLeft}{ArrowLeft}");
    expect(handle).toHaveAttribute("aria-valuenow", "184");
  });

  it("honours a custom keyboardStep", async () => {
    const user = userEvent.setup();
    render(<Harness keyboardStep={40} />);
    const handle = screen.getByRole("separator");
    handle.focus();
    await user.keyboard("{ArrowRight}");
    expect(handle).toHaveAttribute("aria-valuenow", "240");
  });

  it("uses up/down arrows for a horizontal handle", async () => {
    const user = userEvent.setup();
    render(<Harness orientation="horizontal" />);
    const handle = screen.getByRole("separator");
    expect(handle).toHaveAttribute("aria-orientation", "horizontal");
    handle.focus();
    await user.keyboard("{ArrowDown}");
    expect(handle).toHaveAttribute("aria-valuenow", "216");
    await user.keyboard("{ArrowUp}");
    expect(handle).toHaveAttribute("aria-valuenow", "200");
  });

  it("clamps to min and max, including Home and End", async () => {
    const user = userEvent.setup();
    render(<Harness initial={110} />);
    const handle = screen.getByRole("separator");
    handle.focus();
    await user.keyboard("{ArrowLeft}");
    expect(handle).toHaveAttribute("aria-valuenow", "100");
    await user.keyboard("{End}");
    expect(handle).toHaveAttribute("aria-valuenow", "400");
    await user.keyboard("{Home}");
    expect(handle).toHaveAttribute("aria-valuenow", "100");
  });

  it("inverts the arrow direction and the extremes when invert is set", async () => {
    const user = userEvent.setup();
    render(<Harness invert />);
    const handle = screen.getByRole("separator");
    handle.focus();
    await user.keyboard("{ArrowLeft}");
    expect(handle).toHaveAttribute("aria-valuenow", "216");
    await user.keyboard("{Home}");
    expect(handle).toHaveAttribute("aria-valuenow", "400");
  });

  it("ignores keys when disabled", async () => {
    const user = userEvent.setup();
    render(<Harness disabled />);
    const handle = screen.getByRole("separator");
    handle.focus();
    await user.keyboard("{ArrowRight}");
    expect(handle).toHaveAttribute("aria-valuenow", "200");
    expect(handle).toHaveAttribute("tabindex", "-1");
  });

  it("pins to an edge of the parent when edge is set", () => {
    render(<Harness edge="end" />);
    const style = getComputedStyle(screen.getByRole("separator"));
    expect(style.position).toBe("absolute");
    expect(style.right).toBe("0px");
  });

  it("stays in flow without an edge", () => {
    render(<Harness />);
    expect(getComputedStyle(screen.getByRole("separator")).position).toBe(
      "relative"
    );
  });

  it("measures the size with getValue and omits aria-valuenow", async () => {
    const user = userEvent.setup();
    const onResize = jest.fn();
    render(
      <ThemeProvider theme={createTheme({ cssVariables: true })}>
        <ResizeHandle
          orientation="vertical"
          min={100}
          max={400}
          getValue={() => 250}
          onResize={onResize}
          ariaLabel="Resize pane"
        />
      </ThemeProvider>
    );
    const handle = screen.getByRole("separator");
    expect(handle).not.toHaveAttribute("aria-valuenow");
    handle.focus();
    await user.keyboard("{ArrowRight}");
    expect(onResize).toHaveBeenCalledWith(16);
  });

  it("reports start, deltas and end for a pointer drag", () => {
    const onResize = jest.fn();
    const onResizeStart = jest.fn();
    const onResizeEnd = jest.fn();
    render(
      <ThemeProvider theme={createTheme({ cssVariables: true })}>
        <ResizeHandle
          orientation="vertical"
          value={200}
          min={100}
          max={400}
          invert
          onResize={onResize}
          onResizeStart={onResizeStart}
          onResizeEnd={onResizeEnd}
          ariaLabel="Resize pane"
        />
      </ThemeProvider>
    );
    const handle = screen.getByRole("separator");
    handle.setPointerCapture = jest.fn();
    handle.hasPointerCapture = jest.fn(() => true);
    handle.releasePointerCapture = jest.fn();
    firePointer(handle, "pointerdown", 100);
    expect(onResizeStart).toHaveBeenCalledTimes(1);
    // Dragging left grows an inverted handle.
    firePointer(handle, "pointermove", 70);
    expect(onResize).toHaveBeenLastCalledWith(30);
    // Past the max: clamped, no slack.
    firePointer(handle, "pointermove", -500);
    expect(onResize).toHaveBeenLastCalledWith(170);
    firePointer(handle, "pointerup", -500);
    expect(onResizeEnd).toHaveBeenCalledTimes(1);
  });

  it("calls onDoubleClick unless disabled", () => {
    const onDoubleClick = jest.fn();
    const { rerender } = render(<Harness onDoubleClick={onDoubleClick} />);
    fireEvent.doubleClick(screen.getByRole("separator"));
    expect(onDoubleClick).toHaveBeenCalledTimes(1);
    rerender(<Harness onDoubleClick={onDoubleClick} disabled />);
    fireEvent.doubleClick(screen.getByRole("separator"));
    expect(onDoubleClick).toHaveBeenCalledTimes(1);
  });
});
