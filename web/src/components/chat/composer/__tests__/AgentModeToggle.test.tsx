import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { AgentModeToggle } from "../AgentModeToggle";
import mockTheme from "../../../../__mocks__/themeMock";

// Mock PsychologyIcon
jest.mock("@mui/icons-material/Psychology", () => ({
  __esModule: true,
  default: () => <span data-testid="psychology-icon" />
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

describe("AgentModeToggle", () => {
  const mockOnToggle = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders with PsychologyIcon", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <AgentModeToggle agentMode={false} onToggle={mockOnToggle} />
      </ThemeProvider>
    );

    expect(screen.getByTestId("psychology-icon")).toBeInTheDocument();
  });

  it("calls onToggle with true when clicked while agentMode is false", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <AgentModeToggle agentMode={false} onToggle={mockOnToggle} />
      </ThemeProvider>
    );

    fireEvent.click(screen.getByTestId("state-icon-button"));
    expect(mockOnToggle).toHaveBeenCalledTimes(1);
    expect(mockOnToggle).toHaveBeenCalledWith(true);
  });

  it("calls onToggle with false when clicked while agentMode is true", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <AgentModeToggle agentMode={true} onToggle={mockOnToggle} />
      </ThemeProvider>
    );

    fireEvent.click(screen.getByTestId("state-icon-button"));
    expect(mockOnToggle).toHaveBeenCalledTimes(1);
    expect(mockOnToggle).toHaveBeenCalledWith(false);
  });

  it("passes disabled prop to StateIconButton", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <AgentModeToggle agentMode={false} onToggle={mockOnToggle} disabled={true} />
      </ThemeProvider>
    );

    expect(screen.getByTestId("state-icon-button")).toBeDisabled();
  });

  it("passes active state when agentMode is true", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <AgentModeToggle agentMode={true} onToggle={mockOnToggle} />
      </ThemeProvider>
    );

    expect(screen.getByTestId("state-icon-button")).toHaveAttribute("data-active", "true");
  });

  it("passes inactive state when agentMode is false", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <AgentModeToggle agentMode={false} onToggle={mockOnToggle} />
      </ThemeProvider>
    );

    expect(screen.getByTestId("state-icon-button")).toHaveAttribute("data-active", "false");
  });

  it("applies primary color when agentMode is true", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <AgentModeToggle agentMode={true} onToggle={mockOnToggle} />
      </ThemeProvider>
    );

    expect(screen.getByTestId("state-icon-button")).toHaveAttribute("data-color", "primary");
  });

  it("applies default color when agentMode is false", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <AgentModeToggle agentMode={false} onToggle={mockOnToggle} />
      </ThemeProvider>
    );

    expect(screen.getByTestId("state-icon-button")).toHaveAttribute("data-color", "default");
  });

  it("applies agent-toggle class with active suffix when agentMode is true", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <AgentModeToggle agentMode={true} onToggle={mockOnToggle} />
      </ThemeProvider>
    );

    expect(screen.getByTestId("state-icon-button")).toHaveClass("agent-toggle");
    expect(screen.getByTestId("state-icon-button")).toHaveClass("active");
  });

  it("applies agent-toggle class without active suffix when agentMode is false", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <AgentModeToggle agentMode={false} onToggle={mockOnToggle} />
      </ThemeProvider>
    );

    expect(screen.getByTestId("state-icon-button")).toHaveClass("agent-toggle");
    expect(screen.getByTestId("state-icon-button")).not.toHaveClass("active");
  });

  it("has stable onClick callback when agentMode doesn't change", () => {
    let callCount = 0;
    const stableOnToggle = jest.fn(() => callCount++);

    const { rerender } = render(
      <ThemeProvider theme={mockTheme}>
        <AgentModeToggle agentMode={false} onToggle={stableOnToggle} />
      </ThemeProvider>
    );

    // Click before rerender
    fireEvent.click(screen.getByTestId("state-icon-button"));
    expect(callCount).toBe(1);

    // Rerender with same props
    rerender(
      <ThemeProvider theme={mockTheme}>
        <AgentModeToggle agentMode={false} onToggle={stableOnToggle} />
      </ThemeProvider>
    );

    // Click after rerender - should still work
    fireEvent.click(screen.getByTestId("state-icon-button"));
    expect(callCount).toBe(2);
  });
});
