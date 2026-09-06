/**
 * @jest-environment jsdom
 */
import { useState } from "react";
import { render, screen } from "@testing-library/react";
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
});
