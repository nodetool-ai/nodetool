import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { HelpModeToggle } from "../HelpModeToggle";
import mockTheme from "../../../../__mocks__/themeMock";

// Mock HelpIcon
jest.mock("@mui/icons-material/Help", () => ({
  __esModule: true,
  default: () => <span data-testid="help-icon" />
}));

// Mock StateIconButton
jest.mock("../../../ui_primitives/StateIconButton", () => ({
  StateIconButton: ({
    icon,
    tooltip,
    onClick,
    disabled,
    isActive,
    color,
    className
  }: any) => (
    <button
      disabled={disabled}
      onClick={onClick}
      data-active={isActive}
      data-color={color}
      className={className}
      data-testid="state-icon-button"
    >
      {icon}
      {tooltip}
    </button>
  )
}));

describe("HelpModeToggle", () => {
  const mockOnToggle = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders with HelpIcon", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <HelpModeToggle helpMode={false} onToggle={mockOnToggle} />
      </ThemeProvider>
    );

    expect(screen.getByTestId("help-icon")).toBeInTheDocument();
  });

  it("calls onToggle with true when clicked while helpMode is false", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <HelpModeToggle helpMode={false} onToggle={mockOnToggle} />
      </ThemeProvider>
    );

    fireEvent.click(screen.getByTestId("state-icon-button"));
    expect(mockOnToggle).toHaveBeenCalledTimes(1);
    expect(mockOnToggle).toHaveBeenCalledWith(true);
  });

  it("calls onToggle with false when clicked while helpMode is true", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <HelpModeToggle helpMode={true} onToggle={mockOnToggle} />
      </ThemeProvider>
    );

    fireEvent.click(screen.getByTestId("state-icon-button"));
    expect(mockOnToggle).toHaveBeenCalledTimes(1);
    expect(mockOnToggle).toHaveBeenCalledWith(false);
  });

  it("passes disabled prop to StateIconButton", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <HelpModeToggle helpMode={false} onToggle={mockOnToggle} disabled={true} />
      </ThemeProvider>
    );

    expect(screen.getByTestId("state-icon-button")).toBeDisabled();
  });

  it("passes active state when helpMode is true", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <HelpModeToggle helpMode={true} onToggle={mockOnToggle} />
      </ThemeProvider>
    );

    expect(screen.getByTestId("state-icon-button")).toHaveAttribute("data-active", "true");
  });

  it("passes inactive state when helpMode is false", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <HelpModeToggle helpMode={false} onToggle={mockOnToggle} />
      </ThemeProvider>
    );

    expect(screen.getByTestId("state-icon-button")).toHaveAttribute("data-active", "false");
  });

  it("applies primary color when helpMode is true", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <HelpModeToggle helpMode={true} onToggle={mockOnToggle} />
      </ThemeProvider>
    );

    expect(screen.getByTestId("state-icon-button")).toHaveAttribute("data-color", "primary");
  });

  it("applies default color when helpMode is false", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <HelpModeToggle helpMode={false} onToggle={mockOnToggle} />
      </ThemeProvider>
    );

    expect(screen.getByTestId("state-icon-button")).toHaveAttribute("data-color", "default");
  });

  it("applies help-toggle class with active suffix when helpMode is true", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <HelpModeToggle helpMode={true} onToggle={mockOnToggle} />
      </ThemeProvider>
    );

    expect(screen.getByTestId("state-icon-button")).toHaveClass("help-toggle");
    expect(screen.getByTestId("state-icon-button")).toHaveClass("active");
  });

  it("applies help-toggle class without active suffix when helpMode is false", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <HelpModeToggle helpMode={false} onToggle={mockOnToggle} />
      </ThemeProvider>
    );

    expect(screen.getByTestId("state-icon-button")).toHaveClass("help-toggle");
    expect(screen.getByTestId("state-icon-button")).not.toHaveClass("active");
  });

  it("has stable onClick callback when helpMode doesn't change", () => {
    let callCount = 0;
    const stableOnToggle = jest.fn(() => callCount++);

    const { rerender } = render(
      <ThemeProvider theme={mockTheme}>
        <HelpModeToggle helpMode={false} onToggle={stableOnToggle} />
      </ThemeProvider>
    );

    // Click before rerender
    fireEvent.click(screen.getByTestId("state-icon-button"));
    expect(callCount).toBe(1);

    // Rerender with same props
    rerender(
      <ThemeProvider theme={mockTheme}>
        <HelpModeToggle helpMode={false} onToggle={stableOnToggle} />
      </ThemeProvider>
    );

    // Click after rerender - should still work
    fireEvent.click(screen.getByTestId("state-icon-button"));
    expect(callCount).toBe(2);
  });
});
