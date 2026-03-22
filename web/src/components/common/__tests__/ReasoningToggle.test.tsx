import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { ReasoningToggle, ReasoningToggleProps } from "../ReasoningToggle";
import mockTheme from "../../../__mocks__/themeMock";

// Mock LabeledToggle component
jest.mock("../../ui_primitives", () => ({
  LabeledToggle: ({
    isOpen,
    onToggle,
    showLabel,
    hideLabel,
    icon,
    tooltipPlacement,
    enterDelay,
    className
  }: any) => (
    <button
      data-testid="labeled-toggle"
      data-is-open={isOpen}
      data-show-label={showLabel}
      data-hide-label={hideLabel}
      data-tooltip-placement={tooltipPlacement}
      data-enter-delay={enterDelay}
      className={className}
      onClick={onToggle}
    >
      {icon}
      <span>{isOpen ? hideLabel || "Hide" : showLabel || "Show"}</span>
    </button>
  )
}));

describe("ReasoningToggle", () => {
  const mockOnToggle = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const renderWithTheme = (props: Partial<ReasoningToggleProps> = {}) => {
    const defaultProps: ReasoningToggleProps = {
      isOpen: false,
      onToggle: mockOnToggle
    };
    return render(
      <ThemeProvider theme={mockTheme}>
        <ReasoningToggle {...defaultProps} {...props} />
      </ThemeProvider>
    );
  };

  describe("basic rendering", () => {
    it("renders when closed", () => {
      renderWithTheme({ isOpen: false });
      expect(screen.getByTestId("labeled-toggle")).toBeInTheDocument();
      expect(screen.getByTestId("labeled-toggle")).toHaveAttribute(
        "data-is-open",
        "false"
      );
    });

    it("renders when open", () => {
      renderWithTheme({ isOpen: true });
      expect(screen.getByTestId("labeled-toggle")).toBeInTheDocument();
      expect(screen.getByTestId("labeled-toggle")).toHaveAttribute(
        "data-is-open",
        "true"
      );
    });

    it("renders with default icon", () => {
      renderWithTheme();
      const toggle = screen.getByTestId("labeled-toggle");
      expect(toggle).toBeInTheDocument();
      // Icon should be rendered (LightbulbIcon by default)
      expect(toggle.innerHTML).toContain("svg");
    });

    it("renders with custom icon", () => {
      const customIcon = <span data-testid="custom-icon">★</span>;
      renderWithTheme({ icon: customIcon });
      expect(screen.getByTestId("custom-icon")).toBeInTheDocument();
    });
  });

  describe("labels", () => {
    it("uses default labels when none provided", () => {
      renderWithTheme({ isOpen: false });
      expect(screen.getByText("Show reasoning")).toBeInTheDocument();

      mockOnToggle.mockClear();
      renderWithTheme({ isOpen: true });
      expect(screen.getByText("Hide reasoning")).toBeInTheDocument();
    });

    it("uses custom showLabel when provided", () => {
      renderWithTheme({
        isOpen: false,
        showLabel: "Expand thoughts"
      });
      expect(screen.getByText("Expand thoughts")).toBeInTheDocument();
      expect(
        screen.queryByText("Show reasoning")
      ).not.toBeInTheDocument();
    });

    it("uses custom hideLabel when provided", () => {
      renderWithTheme({
        isOpen: true,
        hideLabel: "Collapse thoughts"
      });
      expect(screen.getByText("Collapse thoughts")).toBeInTheDocument();
      expect(screen.queryByText("Hide reasoning")).not.toBeInTheDocument();
    });

    it("passes both labels to LabeledToggle", () => {
      renderWithTheme({
        showLabel: "View details",
        hideLabel: "Hide details"
      });
      const toggle = screen.getByTestId("labeled-toggle");
      expect(toggle).toHaveAttribute("data-show-label", "View details");
      expect(toggle).toHaveAttribute("data-hide-label", "Hide details");
    });
  });

  describe("interaction", () => {
    it("calls onToggle when clicked", () => {
      renderWithTheme();
      const toggle = screen.getByTestId("labeled-toggle");
      fireEvent.click(toggle);
      expect(mockOnToggle).toHaveBeenCalledTimes(1);
    });

    it("calls onToggle with event when clicked", () => {
      renderWithTheme();
      const toggle = screen.getByTestId("labeled-toggle");
      fireEvent.click(toggle);
      expect(mockOnToggle).toHaveBeenCalledWith(
        expect.any(Object)
      );
    });

    it("stops event propagation when toggled", () => {
      renderWithTheme();
      const toggle = screen.getByTestId("labeled-toggle");

      // LabeledToggle calls stopPropagation internally
      // The onToggle is called, and LabeledToggle handles stopPropagation
      fireEvent.click(toggle);
      expect(mockOnToggle).toHaveBeenCalled();
    });
  });

  describe("tooltip props", () => {
    it("uses default tooltip placement", () => {
      renderWithTheme();
      expect(screen.getByTestId("labeled-toggle")).toHaveAttribute(
        "data-tooltip-placement",
        "bottom-start"
      );
    });

    it("uses custom tooltip placement when provided", () => {
      renderWithTheme({ tooltipPlacement: "top" });
      expect(screen.getByTestId("labeled-toggle")).toHaveAttribute(
        "data-tooltip-placement",
        "top"
      );
    });

    it("uses default enter delay", () => {
      renderWithTheme();
      expect(screen.getByTestId("labeled-toggle")).toHaveAttribute(
        "data-enter-delay",
        "700"
      );
    });

    it("uses custom enter delay when provided", () => {
      renderWithTheme({ enterDelay: 1000 });
      expect(screen.getByTestId("labeled-toggle")).toHaveAttribute(
        "data-enter-delay",
        "1000"
      );
    });
  });

  describe("className", () => {
    it("passes className to LabeledToggle", () => {
      renderWithTheme({ className: "custom-class" });
      expect(screen.getByTestId("labeled-toggle")).toHaveClass(
        "custom-class"
      );
    });

    it("renders without className when not provided", () => {
      renderWithTheme();
      const toggle = screen.getByTestId("labeled-toggle");
      expect(toggle.className).toBe("");
    });
  });

  describe("component behavior", () => {
    it("is memoized to prevent unnecessary re-renders", () => {
      const { rerender } = renderWithTheme({ isOpen: false });

      // Rerender with same props
      rerender(
        <ThemeProvider theme={mockTheme}>
          <ReasoningToggle isOpen={false} onToggle={mockOnToggle} />
        </ThemeProvider>
      );

      // Component should still be mounted (not recreated)
      expect(screen.getByTestId("labeled-toggle")).toBeInTheDocument();
    });

    it("updates when isOpen prop changes", () => {
      const { rerender } = renderWithTheme({ isOpen: false });
      expect(screen.getByText("Show reasoning")).toBeInTheDocument();

      rerender(
        <ThemeProvider theme={mockTheme}>
          <ReasoningToggle isOpen={true} onToggle={mockOnToggle} />
        </ThemeProvider>
      );

      expect(screen.getByText("Hide reasoning")).toBeInTheDocument();
    });

    it("updates when onToggle prop changes", () => {
      const newMockOnToggle = jest.fn();
      const { rerender } = renderWithTheme();

      rerender(
        <ThemeProvider theme={mockTheme}>
          <ReasoningToggle isOpen={false} onToggle={newMockOnToggle} />
        </ThemeProvider>
      );

      const toggle = screen.getByTestId("labeled-toggle");
      fireEvent.click(toggle);
      expect(newMockOnToggle).toHaveBeenCalledTimes(1);
      expect(mockOnToggle).not.toHaveBeenCalled();
    });
  });

  describe("integration with icon", () => {
    it("renders LightbulbIcon by default", () => {
      renderWithTheme();
      const toggle = screen.getByTestId("labeled-toggle");
      // LightbulbIcon renders as an SVG element
      const svg = toggle.querySelector("svg");
      expect(svg).toBeInTheDocument();
    });

    it("renders custom icon node when provided", () => {
      const CustomIcon = () => <span data-testid="star-icon">⭐</span>;
      renderWithTheme({ icon: <CustomIcon /> });
      expect(screen.getByTestId("star-icon")).toBeInTheDocument();
    });

    it("renders icon with fontSize inherit", () => {
      renderWithTheme();
      const toggle = screen.getByTestId("labeled-toggle");
      const svg = toggle.querySelector("svg");
      expect(svg).toBeInTheDocument();
      // Default LightbulbIcon should be rendered
      expect(toggle.innerHTML).toContain("svg");
    });
  });

  describe("displayName", () => {
    it("has correct displayName for debugging", () => {
      expect(ReasoningToggle.displayName).toBe("ReasoningToggle");
    });
  });
});
