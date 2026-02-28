import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { SettingsButton } from "../SettingsButton";
import mockTheme from "../../../__mocks__/themeMock";

// Mock icons
jest.mock("@mui/icons-material/Settings", () => ({
  __esModule: true,
  default: () => <span data-testid="settings-icon" />
}));

jest.mock("@mui/icons-material/Tune", () => ({
  __esModule: true,
  default: () => <span data-testid="tune-icon" />
}));

jest.mock("@mui/icons-material/MoreVert", () => ({
  __esModule: true,
  default: () => <span data-testid="more-vert-icon" />
}));

jest.mock("@mui/icons-material/MoreHoriz", () => ({
  __esModule: true,
  default: () => <span data-testid="more-horiz-icon" />
}));

// Mock MUI IconButton
jest.mock("@mui/material/IconButton", () => ({
  __esModule: true,
  default: ({ children, disabled, onClick, className, "aria-label": ariaLabel, ...rest }: any) => (
    <button
      disabled={disabled}
      onClick={onClick}
      className={className}
      aria-label={ariaLabel}
      data-testid="icon-button"
      {...rest}
    >
      {children}
    </button>
  )
}));

// Mock Tooltip
jest.mock("@mui/material/Tooltip", () => ({
  __esModule: true,
  default: ({ children, title }: { children: React.ReactNode; title?: React.ReactNode }) => (
    <div data-tooltip={typeof title === "string" ? title : "tooltip"}>
      {children}
    </div>
  )
}));

describe("SettingsButton", () => {
  const mockOnClick = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders with default tooltip", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <SettingsButton onClick={mockOnClick} />
      </ThemeProvider>
    );
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("renders with custom tooltip", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <SettingsButton onClick={mockOnClick} tooltip="Custom Settings" />
      </ThemeProvider>
    );
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("has aria-label for accessibility", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <SettingsButton onClick={mockOnClick} tooltip="Open Settings" />
      </ThemeProvider>
    );
    expect(screen.getByRole("button")).toHaveAttribute("aria-label", "Open Settings");
  });

  it("has aria-label matching tooltip prop", () => {
    const tooltipText = "Configure Application";
    render(
      <ThemeProvider theme={mockTheme}>
        <SettingsButton onClick={mockOnClick} tooltip={tooltipText} />
      </ThemeProvider>
    );
    expect(screen.getByRole("button")).toHaveAttribute("aria-label", tooltipText);
  });

  it("uses default aria-label when tooltip is not provided", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <SettingsButton onClick={mockOnClick} />
      </ThemeProvider>
    );
    expect(screen.getByRole("button")).toHaveAttribute("aria-label", "Settings");
  });

  it("calls onClick handler when clicked", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <SettingsButton onClick={mockOnClick} tooltip="Settings" />
      </ThemeProvider>
    );

    const button = screen.getByRole("button");
    fireEvent.click(button);

    expect(mockOnClick).toHaveBeenCalledTimes(1);
  });

  it("is disabled when disabled prop is true", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <SettingsButton onClick={mockOnClick} tooltip="Settings" disabled={true} />
      </ThemeProvider>
    );
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("does not call onClick when disabled", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <SettingsButton onClick={mockOnClick} tooltip="Settings" disabled={true} />
      </ThemeProvider>
    );

    const button = screen.getByRole("button");
    fireEvent.click(button);

    expect(mockOnClick).not.toHaveBeenCalled();
  });

  it("renders with different icon variants", () => {
    const { rerender } = render(
      <ThemeProvider theme={mockTheme}>
        <SettingsButton onClick={mockOnClick} iconVariant="settings" />
      </ThemeProvider>
    );
    expect(screen.getByRole("button")).toBeInTheDocument();

    rerender(
      <ThemeProvider theme={mockTheme}>
        <SettingsButton onClick={mockOnClick} iconVariant="tune" />
      </ThemeProvider>
    );
    expect(screen.getByRole("button")).toBeInTheDocument();

    rerender(
      <ThemeProvider theme={mockTheme}>
        <SettingsButton onClick={mockOnClick} iconVariant="moreVert" />
      </ThemeProvider>
    );
    expect(screen.getByRole("button")).toBeInTheDocument();

    rerender(
      <ThemeProvider theme={mockTheme}>
        <SettingsButton onClick={mockOnClick} iconVariant="moreHoriz" />
      </ThemeProvider>
    );
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("applies custom className", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <SettingsButton onClick={mockOnClick} className="custom-class" />
      </ThemeProvider>
    );
    expect(screen.getByRole("button")).toHaveClass("custom-class");
  });

  it("applies nodrag class by default", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <SettingsButton onClick={mockOnClick} />
      </ThemeProvider>
    );
    expect(screen.getByRole("button")).toHaveClass("nodrag");
  });

  it("does not apply nodrag class when nodrag is false", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <SettingsButton onClick={mockOnClick} nodrag={false} />
      </ThemeProvider>
    );
    expect(screen.getByRole("button")).not.toHaveClass("nodrag");
  });
});
