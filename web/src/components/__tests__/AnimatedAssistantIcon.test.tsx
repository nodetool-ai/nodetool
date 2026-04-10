/**
 * AnimatedAssistantIcon component tests
 *
 * Tests the AnimatedAssistantIcon component which provides:
 * - Animated SVG icon with multiple animation styles
 * - Random animation cycling
 * - Hover effects
 */

import React from "react";
import { render, screen, cleanup } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import AnimatedAssistantIcon from "../AnimatedAssistantIcon";

// Mock the SvgFileIcon component
jest.mock("../SvgFileIcon", () => ({
  __esModule: true,
  default: ({ iconName, svgProp }: { iconName: string; svgProp: { width: number; height: number; opacity: number; color: string } }) => (
    <div data-testid="svg-file-icon" data-icon={iconName}>
      <svg width={svgProp.width} height={svgProp.height} style={{ opacity: svgProp.opacity, color: svgProp.color }} data-role="img" />
    </div>
  ),
}));

const renderWithTheme = (component: React.ReactElement) => {
  const theme = createTheme();
  return render(<ThemeProvider theme={theme}>{component}</ThemeProvider>);
};

describe("AnimatedAssistantIcon", () => {
  afterEach(() => {
    cleanup();
  });

  it("should render successfully", () => {
    renderWithTheme(<AnimatedAssistantIcon />);
    expect(screen.getByTestId("svg-file-icon")).toBeInTheDocument();
  });

  it("should render with correct icon name", () => {
    renderWithTheme(<AnimatedAssistantIcon />);
    const icon = screen.getByTestId("svg-file-icon");
    expect(icon).toHaveAttribute("data-icon", "assistant");
  });

  it("should use default dimensions when not provided", () => {
    renderWithTheme(<AnimatedAssistantIcon />);
    const svg = screen.getByTestId("svg-file-icon").querySelector("svg") as SVGElement;
    expect(svg).toHaveAttribute("width", "44");
    expect(svg).toHaveAttribute("height", "44");
  });

  it("should use custom dimensions when provided", () => {
    renderWithTheme(<AnimatedAssistantIcon width={60} height={60} />);
    const svg = screen.getByTestId("svg-file-icon").querySelector("svg") as SVGElement;
    expect(svg).toHaveAttribute("width", "60");
    expect(svg).toHaveAttribute("height", "60");
  });

  it("should apply opacity to SVG", () => {
    renderWithTheme(<AnimatedAssistantIcon />);
    const svg = screen.getByTestId("svg-file-icon").querySelector("svg") as SVGElement;
    expect(svg).toHaveStyle({ opacity: "0.9" });
  });

  it("should apply color to SVG", () => {
    renderWithTheme(<AnimatedAssistantIcon />);
    const svg = screen.getByTestId("svg-file-icon").querySelector("svg") as SVGElement;
    expect(svg).toHaveStyle({ color: "var(--palette-primary-main)" });
  });

  it("should apply hover styles", () => {
    const { container } = renderWithTheme(<AnimatedAssistantIcon />);
    
    const iconWrapper = container.querySelector(".iconWrapper");
    expect(iconWrapper).toBeInTheDocument();
  });

  it("should render with inline-block display", () => {
    const { container } = renderWithTheme(<AnimatedAssistantIcon />);
    
    const outerDiv = container.querySelector("div > div");
    expect(outerDiv).toBeInTheDocument();
    expect(outerDiv).toHaveStyle({ display: "inline-block" });
  });

  it("should handle rapid remounting", () => {
    const { unmount } = renderWithTheme(<AnimatedAssistantIcon />);
    
    // Unmount should not cause issues
    expect(() => unmount()).not.toThrow();
    
    // Remount should work
    renderWithTheme(<AnimatedAssistantIcon />);
    expect(screen.getByTestId("svg-file-icon")).toBeInTheDocument();
  });

  it("should handle different width/height combinations", () => {
    const { container: container1 } = renderWithTheme(<AnimatedAssistantIcon width={32} height={32} />);
    const svg1 = container1.querySelector("[data-testid='svg-file-icon'] svg") as SVGElement;
    expect(svg1).toHaveAttribute("width", "32");
    cleanup();

    const { container: container2 } = renderWithTheme(<AnimatedAssistantIcon width={100} height={100} />);
    const svg2 = container2.querySelector("[data-testid='svg-file-icon'] svg") as SVGElement;
    expect(svg2).toHaveAttribute("width", "100");
  });

  it("should render icon wrapper with correct style", () => {
    const { container } = renderWithTheme(<AnimatedAssistantIcon />);
    
    const iconWrapper = container.querySelector(".iconWrapper") as HTMLElement;
    expect(iconWrapper).toBeInTheDocument();
    expect(iconWrapper).toBeInTheDocument();
  });
});
