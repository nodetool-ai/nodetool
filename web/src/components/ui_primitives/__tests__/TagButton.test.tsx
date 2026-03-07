import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import userEvent from "@testing-library/user-event";
import { TagButton } from "../TagButton";
import mockTheme from "../../../__mocks__/themeMock";

// Mock MUI components that use emotion/css
jest.mock("@mui/material/Tooltip", () => ({
  __esModule: true,
  default: ({ children, title }: { children: React.ReactNode; title?: string }) => (
    <div data-testid="tooltip-wrapper" data-tooltip={title}>
      {children}
    </div>
  )
}));

jest.mock("@mui/material/Button", () => ({
  __esModule: true,
  default: ({ children, onClick, disabled, className, "aria-pressed": ariaPressed }: any) => (
    <button
      onClick={onClick}
      disabled={disabled}
      className={className}
      aria-pressed={ariaPressed}
      data-testid="tag-button"
    >
      {children}
    </button>
  )
}));

jest.mock("@mui/material/Chip", () => ({
  __esModule: true,
  default: ({ label, onClick, disabled, className, "aria-pressed": ariaPressed }: any) => (
    <button
      onClick={onClick}
      disabled={disabled}
      className={className}
      aria-pressed={ariaPressed}
      data-testid="tag-chip"
    >
      {label}
    </button>
  )
}));

describe("TagButton", () => {
  const mockOnClick = jest.fn();
  const user = userEvent.setup();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Rendering", () => {
    it("renders button variant by default", () => {
      render(
        <ThemeProvider theme={mockTheme}>
          <TagButton label="Test Tag" onClick={mockOnClick} />
        </ThemeProvider>
      );

      expect(screen.getByTestId("tag-button")).toBeInTheDocument();
      expect(screen.getByText("Test Tag")).toBeInTheDocument();
    });

    it("renders chip variant when specified", () => {
      render(
        <ThemeProvider theme={mockTheme}>
          <TagButton label="Test Tag" onClick={mockOnClick} variant="chip" />
        </ThemeProvider>
      );

      expect(screen.getByTestId("tag-chip")).toBeInTheDocument();
      expect(screen.getByText("Test Tag")).toBeInTheDocument();
    });

    it("renders with count in label", () => {
      render(
        <ThemeProvider theme={mockTheme}>
          <TagButton label="Test Tag" onClick={mockOnClick} count={5} />
        </ThemeProvider>
      );

      expect(screen.getByText("Test Tag (5)")).toBeInTheDocument();
    });

    it("renders without tooltip when not provided", () => {
      render(
        <ThemeProvider theme={mockTheme}>
          <TagButton label="Test Tag" onClick={mockOnClick} />
        </ThemeProvider>
      );

      expect(screen.queryByTestId("tooltip-wrapper")).not.toBeInTheDocument();
    });

    it("renders with tooltip when provided", () => {
      render(
        <ThemeProvider theme={mockTheme}>
          <TagButton label="Test Tag" onClick={mockOnClick} tooltip="Test tooltip" />
        </ThemeProvider>
      );

      const tooltip = screen.getByTestId("tooltip-wrapper");
      expect(tooltip).toBeInTheDocument();
      expect(tooltip).toHaveAttribute("data-tooltip", "Test tooltip");
    });

    it("renders in medium size", () => {
      render(
        <ThemeProvider theme={mockTheme}>
          <TagButton label="Test Tag" onClick={mockOnClick} size="medium" />
        </ThemeProvider>
      );

      expect(screen.getByTestId("tag-button")).toBeInTheDocument();
    });
  });

  describe("Interaction", () => {
    it("calls onClick when button is clicked", async () => {
      render(
        <ThemeProvider theme={mockTheme}>
          <TagButton label="Test Tag" onClick={mockOnClick} />
        </ThemeProvider>
      );

      await user.click(screen.getByTestId("tag-button"));
      expect(mockOnClick).toHaveBeenCalledTimes(1);
    });

    it("calls onClick when chip is clicked", async () => {
      render(
        <ThemeProvider theme={mockTheme}>
          <TagButton label="Test Tag" onClick={mockOnClick} variant="chip" />
        </ThemeProvider>
      );

      await user.click(screen.getByTestId("tag-chip"));
      expect(mockOnClick).toHaveBeenCalledTimes(1);
    });

    it("does not call onClick when disabled", async () => {
      render(
        <ThemeProvider theme={mockTheme}>
          <TagButton label="Test Tag" onClick={mockOnClick} disabled />
        </ThemeProvider>
      );

      const button = screen.getByTestId("tag-button");
      expect(button).toBeDisabled();

      await user.click(button);
      expect(mockOnClick).not.toHaveBeenCalled();
    });

    it("does not call onClick when chip is disabled", async () => {
      render(
        <ThemeProvider theme={mockTheme}>
          <TagButton label="Test Tag" onClick={mockOnClick} variant="chip" disabled />
        </ThemeProvider>
      );

      const chip = screen.getByTestId("tag-chip");
      expect(chip).toBeDisabled();

      await user.click(chip);
      expect(mockOnClick).not.toHaveBeenCalled();
    });
  });

  describe("Selected State", () => {
    it("renders without selected class by default", () => {
      render(
        <ThemeProvider theme={mockTheme}>
          <TagButton label="Test Tag" onClick={mockOnClick} />
        </ThemeProvider>
      );

      const button = screen.getByTestId("tag-button");
      expect(button).not.toHaveClass("selected");
    });

    it("renders with selected class when selected is true", () => {
      render(
        <ThemeProvider theme={mockTheme}>
          <TagButton label="Test Tag" onClick={mockOnClick} selected />
        </ThemeProvider>
      );

      const button = screen.getByTestId("tag-button");
      expect(button).toHaveClass("selected");
    });

    it("applies aria-pressed=false when not selected (button variant)", () => {
      render(
        <ThemeProvider theme={mockTheme}>
          <TagButton label="Test Tag" onClick={mockOnClick} selected={false} />
        </ThemeProvider>
      );

      expect(screen.getByTestId("tag-button")).toHaveAttribute("aria-pressed", "false");
    });

    it("applies aria-pressed=true when selected (button variant)", () => {
      render(
        <ThemeProvider theme={mockTheme}>
          <TagButton label="Test Tag" onClick={mockOnClick} selected={true} />
        </ThemeProvider>
      );

      expect(screen.getByTestId("tag-button")).toHaveAttribute("aria-pressed", "true");
    });

    it("applies aria-pressed=false when not selected (chip variant)", () => {
      render(
        <ThemeProvider theme={mockTheme}>
          <TagButton label="Test Tag" onClick={mockOnClick} variant="chip" selected={false} />
        </ThemeProvider>
      );

      expect(screen.getByTestId("tag-chip")).toHaveAttribute("aria-pressed", "false");
    });

    it("applies aria-pressed=true when selected (chip variant)", () => {
      render(
        <ThemeProvider theme={mockTheme}>
          <TagButton label="Test Tag" onClick={mockOnClick} variant="chip" selected={true} />
        </ThemeProvider>
      );

      expect(screen.getByTestId("tag-chip")).toHaveAttribute("aria-pressed", "true");
    });
  });

  describe("CSS Classes", () => {
    it("applies nodrag class by default", () => {
      render(
        <ThemeProvider theme={mockTheme}>
          <TagButton label="Test Tag" onClick={mockOnClick} />
        </ThemeProvider>
      );

      expect(screen.getByTestId("tag-button")).toHaveClass("nodrag");
    });

    it("applies tag-button class", () => {
      render(
        <ThemeProvider theme={mockTheme}>
          <TagButton label="Test Tag" onClick={mockOnClick} />
        </ThemeProvider>
      );

      expect(screen.getByTestId("tag-button")).toHaveClass("tag-button");
    });

    it("applies custom className", () => {
      render(
        <ThemeProvider theme={mockTheme}>
          <TagButton label="Test Tag" onClick={mockOnClick} className="custom-class" />
        </ThemeProvider>
      );

      expect(screen.getByTestId("tag-button")).toHaveClass("custom-class");
    });

    it("applies custom className with chip variant", () => {
      render(
        <ThemeProvider theme={mockTheme}>
          <TagButton label="Test Tag" onClick={mockOnClick} variant="chip" className="custom-chip-class" />
        </ThemeProvider>
      );

      expect(screen.getByTestId("tag-chip")).toHaveClass("custom-chip-class");
    });
  });

  describe("Accessibility", () => {
    it("has aria-pressed attribute for button variant", () => {
      render(
        <ThemeProvider theme={mockTheme}>
          <TagButton label="Test Tag" onClick={mockOnClick} />
        </ThemeProvider>
      );

      const button = screen.getByTestId("tag-button");
      expect(button).toHaveAttribute("aria-pressed");
    });

    it("has aria-pressed attribute for chip variant", () => {
      render(
        <ThemeProvider theme={mockTheme}>
          <TagButton label="Test Tag" onClick={mockOnClick} variant="chip" />
        </ThemeProvider>
      );

      const chip = screen.getByTestId("tag-chip");
      expect(chip).toHaveAttribute("aria-pressed");
    });

    it("correctly announces toggle state to screen readers", () => {
      const { rerender } = render(
        <ThemeProvider theme={mockTheme}>
          <TagButton label="Filter" onClick={mockOnClick} selected={false} />
        </ThemeProvider>
      );

      expect(screen.getByTestId("tag-button")).toHaveAttribute("aria-pressed", "false");

      rerender(
        <ThemeProvider theme={mockTheme}>
          <TagButton label="Filter" onClick={mockOnClick} selected={true} />
        </ThemeProvider>
      );

      expect(screen.getByTestId("tag-button")).toHaveAttribute("aria-pressed", "true");
    });
  });

  describe("Variants", () => {
    it("renders as button with outline variant by default", () => {
      render(
        <ThemeProvider theme={mockTheme}>
          <TagButton label="Test Tag" onClick={mockOnClick} />
        </ThemeProvider>
      );

      expect(screen.getByTestId("tag-button")).toBeInTheDocument();
    });

    it("renders as chip when variant is chip", () => {
      render(
        <ThemeProvider theme={mockTheme}>
          <TagButton label="Test Tag" onClick={mockOnClick} variant="chip" />
        </ThemeProvider>
      );

      expect(screen.getByTestId("tag-chip")).toBeInTheDocument();
    });

    it("displays count correctly in button variant", () => {
      render(
        <ThemeProvider theme={mockTheme}>
          <TagButton label="Items" onClick={mockOnClick} count={42} />
        </ThemeProvider>
      );

      expect(screen.getByText("Items (42)")).toBeInTheDocument();
    });

    it("displays count correctly in chip variant", () => {
      render(
        <ThemeProvider theme={mockTheme}>
          <TagButton label="Items" onClick={mockOnClick} count={42} variant="chip" />
        </ThemeProvider>
      );

      expect(screen.getByText("Items (42)")).toBeInTheDocument();
    });
  });

  describe("Edge Cases", () => {
    it("handles empty label", () => {
      render(
        <ThemeProvider theme={mockTheme}>
          <TagButton label="" onClick={mockOnClick} />
        </ThemeProvider>
      );

      expect(screen.getByTestId("tag-button")).toBeInTheDocument();
    });

    it("handles count of zero", () => {
      render(
        <ThemeProvider theme={mockTheme}>
          <TagButton label="Test Tag" onClick={mockOnClick} count={0} />
        </ThemeProvider>
      );

      expect(screen.getByText("Test Tag (0)")).toBeInTheDocument();
    });

    it("handles large count values", () => {
      render(
        <ThemeProvider theme={mockTheme}>
          <TagButton label="Test Tag" onClick={mockOnClick} count={9999} />
        </ThemeProvider>
      );

      expect(screen.getByText("Test Tag (9999)")).toBeInTheDocument();
    });

    it("handles very long label text", () => {
      const longLabel = "This is a very long tag label that should still render properly";
      render(
        <ThemeProvider theme={mockTheme}>
          <TagButton label={longLabel} onClick={mockOnClick} />
        </ThemeProvider>
      );

      expect(screen.getByText(longLabel)).toBeInTheDocument();
    });
  });

  describe("Integration", () => {
    it("works with tooltip in button variant", () => {
      render(
        <ThemeProvider theme={mockTheme}>
          <TagButton label="Test Tag" onClick={mockOnClick} tooltip="Test tooltip" />
        </ThemeProvider>
      );

      const tooltip = screen.getByTestId("tooltip-wrapper");
      const button = screen.getByTestId("tag-button");

      expect(tooltip).toContainElement(button);
    });

    it("works with tooltip in chip variant", () => {
      render(
        <ThemeProvider theme={mockTheme}>
          <TagButton label="Test Tag" onClick={mockOnClick} variant="chip" tooltip="Test tooltip" />
        </ThemeProvider>
      );

      const tooltip = screen.getByTestId("tooltip-wrapper");
      const chip = screen.getByTestId("tag-chip");

      expect(tooltip).toContainElement(chip);
    });

    it("maintains all props when selected", () => {
      render(
        <ThemeProvider theme={mockTheme}>
          <TagButton
            label="Test Tag"
            onClick={mockOnClick}
            selected
            count={5}
            tooltip="Test tooltip"
            disabled={false}
            className="test-class"
          />
        </ThemeProvider>
      );

      const button = screen.getByTestId("tag-button");
      expect(button).toHaveClass("selected");
      expect(button).toHaveClass("test-class");
      expect(button).toHaveAttribute("aria-pressed", "true");
    });
  });
});
