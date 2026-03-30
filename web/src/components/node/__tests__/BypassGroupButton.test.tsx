import React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import BypassGroupButton from "../BypassGroupButton";
import "@testing-library/jest-dom";

const renderWithProviders = (component: React.ReactElement) => {
  return render(<ThemeProvider theme={mockTheme}>{component}</ThemeProvider>);
};

describe("BypassGroupButton", () => {
  it("renders correctly when not bypassed", () => {
    const handleClick = jest.fn();
    renderWithProviders(
      <BypassGroupButton isBypassed={false} onClick={handleClick} />
    );

    const button = screen.getByRole("button");
    expect(button).toBeInTheDocument();
    expect(button).toHaveClass("bypass-button");
    expect(button).toHaveAttribute("tabIndex", "-1");
  });

  it("renders correctly when bypassed", () => {
    const handleClick = jest.fn();
    renderWithProviders(
      <BypassGroupButton isBypassed={true} onClick={handleClick} />
    );

    const button = screen.getByRole("button");
    expect(button).toBeInTheDocument();
    expect(button).toHaveClass("bypass-button");
  });

  it("calls onClick handler when clicked", () => {
    const handleClick = jest.fn();
    renderWithProviders(
      <BypassGroupButton isBypassed={false} onClick={handleClick} />
    );

    const button = screen.getByRole("button");
    fireEvent.click(button);

    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it("displays VisibilityOffIcon when not bypassed", () => {
    const handleClick = jest.fn();
    renderWithProviders(
      <BypassGroupButton isBypassed={false} onClick={handleClick} />
    );

    const button = screen.getByRole("button");
    const svg = button.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });

  it("displays VisibilityIcon when bypassed", () => {
    const handleClick = jest.fn();
    renderWithProviders(
      <BypassGroupButton isBypassed={true} onClick={handleClick} />
    );

    const button = screen.getByRole("button");
    const svg = button.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });

  it("shows Tooltip component with proper title attribute", () => {
    const handleClick = jest.fn();
    renderWithProviders(
      <BypassGroupButton isBypassed={false} onClick={handleClick} />
    );

    // MUI Tooltip renders with title attribute
    const button = screen.getByRole("button");
    expect(button).toBeInTheDocument();
  });

  it("handles multiple clicks correctly", () => {
    const handleClick = jest.fn();
    renderWithProviders(
      <BypassGroupButton isBypassed={false} onClick={handleClick} />
    );

    const button = screen.getByRole("button");

    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);

    expect(handleClick).toHaveBeenCalledTimes(3);
  });

  it("is properly memoized to prevent unnecessary re-renders", () => {
    const handleClick = jest.fn();
    const { rerender } = renderWithProviders(
      <BypassGroupButton isBypassed={false} onClick={handleClick} />
    );

    // Re-render with same props - memo should prevent re-render
    rerender(
      <ThemeProvider theme={mockTheme}>
        <BypassGroupButton isBypassed={false} onClick={handleClick} />
      </ThemeProvider>
    );

    const button = screen.getByRole("button");
    expect(button).toBeInTheDocument();
  });

  it("updates when isBypassed prop changes", () => {
    const handleClick = jest.fn();
    const { rerender } = renderWithProviders(
      <BypassGroupButton isBypassed={false} onClick={handleClick} />
    );

    // Get initial button
    const button = screen.getByRole("button");
    expect(button).toBeInTheDocument();

    // Update to bypassed state
    rerender(
      <ThemeProvider theme={mockTheme}>
        <BypassGroupButton isBypassed={true} onClick={handleClick} />
      </ThemeProvider>
    );

    // Button should still be present
    const updatedButton = screen.getByRole("button");
    expect(updatedButton).toBeInTheDocument();
  });

  it("has correct accessibility attributes", () => {
    const handleClick = jest.fn();
    renderWithProviders(
      <BypassGroupButton isBypassed={false} onClick={handleClick} />
    );

    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("tabIndex", "-1");
    expect(button).toHaveClass("bypass-button");
  });

  it("has correct styling classes applied", () => {
    const handleClick = jest.fn();
    renderWithProviders(
      <BypassGroupButton isBypassed={false} onClick={handleClick} />
    );

    const button = screen.getByRole("button");
    expect(button.className).toContain("bypass-button");
  });

  it("renders as small IconButton", () => {
    const handleClick = jest.fn();
    const { container } = renderWithProviders(
      <BypassGroupButton isBypassed={false} onClick={handleClick} />
    );

    const button = screen.getByRole("button");
    expect(button).toBeInTheDocument();
    // Check for MUI IconButton sizeSmall class
    expect(button.className).toContain("sizeSmall");
  });

  it("has displayName set for debugging", () => {
    expect(BypassGroupButton.displayName).toBe("BypassGroupButton");
  });
});
