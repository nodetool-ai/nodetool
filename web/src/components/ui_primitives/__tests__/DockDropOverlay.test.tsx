import React from "react";
import "@testing-library/jest-dom/jest-globals";
import { describe, expect, it } from "@jest/globals";
import { render } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import { DockDropOverlay, dockZoneAt, type DockZone } from "../DockDropOverlay";

const RECT = { left: 100, top: 50, width: 200, height: 100 };
const ALL: readonly DockZone[] = ["center", "top", "bottom", "left", "right"];

describe("dockZoneAt", () => {
  it("picks the nearest allowed edge near the border and the center elsewhere", () => {
    expect(dockZoneAt(RECT, 105, 100, ALL)).toBe("left");
    expect(dockZoneAt(RECT, 295, 100, ALL)).toBe("right");
    expect(dockZoneAt(RECT, 200, 52, ALL)).toBe("top");
    expect(dockZoneAt(RECT, 200, 148, ALL)).toBe("bottom");
    expect(dockZoneAt(RECT, 200, 100, ALL)).toBe("center");
  });

  it("ignores edges that are not allowed", () => {
    expect(dockZoneAt(RECT, 105, 100, ["center", "top", "bottom"])).toBe("center");
    expect(dockZoneAt(RECT, 105, 145, ["center", "top", "bottom"])).toBe("bottom");
    expect(dockZoneAt(RECT, 200, 100, ["left", "right"])).toBeNull();
  });

  it("returns null outside the rectangle or for an empty one", () => {
    expect(dockZoneAt(RECT, 99, 100, ALL)).toBeNull();
    expect(dockZoneAt({ left: 0, top: 0, width: 0, height: 10 }, 0, 5, ALL)).toBeNull();
  });
});

describe("DockDropOverlay", () => {
  it("renders the preview for a zone and nothing without one", () => {
    const { container, rerender } = render(<ThemeProvider theme={mockTheme}><DockDropOverlay zone="left" /></ThemeProvider>);
    expect(container.querySelector("[data-dock-drop-zone='left']")).toBeInTheDocument();
    rerender(<ThemeProvider theme={mockTheme}><DockDropOverlay zone={null} /></ThemeProvider>);
    expect(container.querySelector("[data-dock-drop-zone]")).not.toBeInTheDocument();
  });

  it("forwards its ref", () => {
    const ref = React.createRef<HTMLDivElement>();
    render(<ThemeProvider theme={mockTheme}><DockDropOverlay ref={ref} zone="center" /></ThemeProvider>);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });
});
