import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { SettingsButton } from "../SettingsButton";
import mockTheme from "../../../__mocks__/themeMock";

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
