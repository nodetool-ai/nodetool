/** @jsxImportSource @emotion/react */
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "@jest/globals";
import { ShortcutHint } from "../ShortcutHint";

describe("ShortcutHint", () => {
  it("renders shortcut with multiple keys", () => {
    render(<ShortcutHint shortcut={["Ctrl", "S"]} />);
    expect(screen.getByText("Ctrl")).toBeInTheDocument();
    expect(screen.getByText("S")).toBeInTheDocument();
    expect(screen.getByText("+")).toBeInTheDocument();
  });

  it("renders shortcut with single key", () => {
    render(<ShortcutHint shortcut={["F"]} />);
    expect(screen.getByText("F")).toBeInTheDocument();
    // Should not show plus sign for single key
    expect(screen.queryByText("+")).not.toBeInTheDocument();
  });

  it("formats common modifier keys correctly", () => {
    const { rerender } = render(<ShortcutHint shortcut={["Control", "C"]} />);
    expect(screen.getByText("Ctrl")).toBeInTheDocument();

    rerender(<ShortcutHint shortcut={["Meta", "V"]} />);
    expect(screen.getByText("⌘")).toBeInTheDocument();

    rerender(<ShortcutHint shortcut={["Alt", "Tab"]} />);
    expect(screen.getByText("Alt")).toBeInTheDocument();
  });

  it("formats arrow keys to symbols", () => {
    render(<ShortcutHint shortcut={["ArrowUp", "ArrowDown"]} />);
    expect(screen.getByText("↑")).toBeInTheDocument();
    expect(screen.getByText("↓")).toBeInTheDocument();
  });

  it("formats special keys to symbols", () => {
    const { rerender } = render(<ShortcutHint shortcut={["Enter"]} />);
    expect(screen.getByText("↵")).toBeInTheDocument();

    rerender(<ShortcutHint shortcut={["Escape"]} />);
    expect(screen.getByText("⎋")).toBeInTheDocument();

    rerender(<ShortcutHint shortcut={["Backspace"]} />);
    expect(screen.getByText("⌫")).toBeInTheDocument();
  });

  it("renders with small size by default", () => {
    const { container } = render(<ShortcutHint shortcut={["Ctrl", "S"]} />);
    const hint = container.querySelector(".shortcut-hint");
    expect(hint).toHaveStyle({ fontSize: "10px" });
  });

  it("renders with medium size when specified", () => {
    const { container } = render(
      <ShortcutHint shortcut={["Ctrl", "S"]} size="medium" />
    );
    const hint = container.querySelector(".shortcut-hint");
    expect(hint).toHaveStyle({ fontSize: "11px" });
  });

  it("applies default class and layout styles", () => {
    const { container } = render(<ShortcutHint shortcut={["Ctrl", "S"]} />);
    const hint = container.querySelector(".shortcut-hint");
    expect(hint).toHaveClass("shortcut-hint");
    expect(hint).toHaveStyle({ display: "inline-flex" });
  });

  it("passes through className prop", () => {
    const { container } = render(
      <ShortcutHint shortcut={["Ctrl", "S"]} className="custom-class" />
    );
    const hint = container.querySelector(".shortcut-hint");
    expect(hint).toHaveClass("custom-class");
  });

  it("capitalizes single letter keys", () => {
    render(<ShortcutHint shortcut={["a", "b", "c"]} />);
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("B")).toBeInTheDocument();
    expect(screen.getByText("C")).toBeInTheDocument();
  });

  it("preserves multi-character key names", () => {
    render(<ShortcutHint shortcut={["CustomKey"]} />);
    expect(screen.getByText("CustomKey")).toBeInTheDocument();
  });

  it("renders all shortcuts in array", () => {
    render(<ShortcutHint shortcut={["Ctrl", "Shift", "Z"]} />);
    expect(screen.getByText("Ctrl")).toBeInTheDocument();
    expect(screen.getByText("⇧")).toBeInTheDocument();
    expect(screen.getByText("Z")).toBeInTheDocument();
    // Should have 2 plus signs for 3 keys
    const pluses = screen.getAllByText("+");
    expect(pluses).toHaveLength(2);
  });

  it("formats macOS Command key correctly", () => {
    render(<ShortcutHint shortcut={["Cmd", "S"]} />);
    expect(screen.getByText("⌘")).toBeInTheDocument();
  });

  it("formats Option key correctly", () => {
    render(<ShortcutHint shortcut={["Option", "F"]} />);
    expect(screen.getByText("⌥")).toBeInTheDocument();
  });
});
