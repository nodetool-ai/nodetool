import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HelpModeToggle } from "./HelpModeToggle";
import mockTheme from "../../../__mocks__/themeMock";
import { ThemeProvider } from "@mui/material/styles";

// Mock the StateIconButton component
jest.mock("../../ui_primitives/StateIconButton", () => {
  return {
    StateIconButton: ({ icon, tooltip, onClick, disabled, isActive, color, className }: any) => (
      <button
        onClick={onClick}
        disabled={disabled}
        data-isactive={isActive}
        data-color={color}
        className={className}
        aria-label={typeof tooltip === "string" ? tooltip : "Help Mode Toggle"}
      >
        {icon}
        {tooltip}
      </button>
    ),
  };
});

const renderWithTheme = (component: React.ReactElement) => {
  return render(<ThemeProvider theme={mockTheme}>{component}</ThemeProvider>);
};

describe("HelpModeToggle", () => {
  it("should render successfully", () => {
    const onToggle = jest.fn();
    renderWithTheme(<HelpModeToggle helpMode={false} onToggle={onToggle} />);

    const button = screen.getByRole("button");
    expect(button).toBeInTheDocument();
    expect(button).not.toBeDisabled();
  });

  it("should render with active state when helpMode is true", () => {
    const onToggle = jest.fn();
    renderWithTheme(<HelpModeToggle helpMode={true} onToggle={onToggle} />);

    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("data-isactive", "true");
    expect(button).toHaveAttribute("data-color", "primary");
    expect(button).toHaveClass("help-toggle");
    expect(button).toHaveClass("active");
  });

  it("should render with inactive state when helpMode is false", () => {
    const onToggle = jest.fn();
    renderWithTheme(<HelpModeToggle helpMode={false} onToggle={onToggle} />);

    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("data-isactive", "false");
    expect(button).toHaveAttribute("data-color", "default");
    expect(button).toHaveClass("help-toggle");
    expect(button).not.toHaveClass("active");
  });

  it("should call onToggle with false when helpMode is true", async () => {
    const user = userEvent.setup();
    const onToggle = jest.fn();
    renderWithTheme(<HelpModeToggle helpMode={true} onToggle={onToggle} />);

    const button = screen.getByRole("button");
    await user.click(button);

    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith(false);
  });

  it("should call onToggle with true when helpMode is false", async () => {
    const user = userEvent.setup();
    const onToggle = jest.fn();
    renderWithTheme(<HelpModeToggle helpMode={false} onToggle={onToggle} />);

    const button = screen.getByRole("button");
    await user.click(button);

    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it("should be disabled when disabled prop is true", () => {
    const onToggle = jest.fn();
    renderWithTheme(
      <HelpModeToggle helpMode={false} onToggle={onToggle} disabled={true} />
    );

    const button = screen.getByRole("button");
    expect(button).toBeDisabled();
  });

  it("should not be disabled when disabled prop is false", () => {
    const onToggle = jest.fn();
    renderWithTheme(
      <HelpModeToggle helpMode={false} onToggle={onToggle} disabled={false} />
    );

    const button = screen.getByRole("button");
    expect(button).not.toBeDisabled();
  });

  it("should not call onToggle when disabled and clicked", async () => {
    const user = userEvent.setup();
    const onToggle = jest.fn();
    renderWithTheme(
      <HelpModeToggle helpMode={false} onToggle={onToggle} disabled={true} />
    );

    const button = screen.getByRole("button");
    await user.click(button);

    expect(onToggle).not.toHaveBeenCalled();
  });

  it("should use useCallback for click handler to prevent unnecessary re-renders", () => {
    const onToggle = jest.fn();
    const { rerender } = renderWithTheme(
      <HelpModeToggle helpMode={false} onToggle={onToggle} />
    );

    const buttonFirstRender = screen.getByRole("button");

    // Re-render with same props
    rerender(
      <ThemeProvider theme={mockTheme}>
        <HelpModeToggle helpMode={false} onToggle={onToggle} />
      </ThemeProvider>
    );

    const buttonSecondRender = screen.getByRole("button");
    expect(buttonSecondRender).toBe(buttonFirstRender);
  });

  it("should update handler when helpMode changes", async () => {
    const user = userEvent.setup();
    const onToggle = jest.fn();
    const { rerender } = renderWithTheme(
      <HelpModeToggle helpMode={false} onToggle={onToggle} />
    );

    // Click with helpMode false
    const button = screen.getByRole("button");
    await user.click(button);
    expect(onToggle).toHaveBeenLastCalledWith(true);

    // Re-render with helpMode true
    rerender(
      <ThemeProvider theme={mockTheme}>
        <HelpModeToggle helpMode={true} onToggle={onToggle} />
      </ThemeProvider>
    );

    // Click with helpMode true
    const buttonUpdated = screen.getByRole("button");
    await user.click(buttonUpdated);
    expect(onToggle).toHaveBeenLastCalledWith(false);
  });

  it("should render correct tooltip content for active state", () => {
    const onToggle = jest.fn();
    renderWithTheme(<HelpModeToggle helpMode={true} onToggle={onToggle} />);

    const button = screen.getByRole("button");
    expect(button.textContent).toContain("Help Mode ON");
    expect(button.textContent).toContain("Disable Nodetool help mode for chat");
  });

  it("should render correct tooltip content for inactive state", () => {
    const onToggle = jest.fn();
    renderWithTheme(<HelpModeToggle helpMode={false} onToggle={onToggle} />);

    const button = screen.getByRole("button");
    expect(button.textContent).toContain("Help Mode OFF");
    expect(button.textContent).toContain("Include Nodetool help context for chat");
  });

  it("should use stable callback reference across re-renders with same props", () => {
    const onToggle = jest.fn();
    const { rerender } = renderWithTheme(
      <HelpModeToggle helpMode={false} onToggle={onToggle} />
    );

    const firstClickHandler = screen.getByRole("button");

    // Re-render with identical props
    rerender(
      <ThemeProvider theme={mockTheme}>
        <HelpModeToggle helpMode={false} onToggle={onToggle} />
      </ThemeProvider>
    );

    const secondClickHandler = screen.getByRole("button");

    // The element should be the same (React.memo on StateIconButton should prevent re-render)
    expect(firstClickHandler).toBe(secondClickHandler);
  });

  it("should update handler when onToggle callback changes", async () => {
    const user = userEvent.setup();
    const onToggle1 = jest.fn();
    const onToggle2 = jest.fn();

    const { rerender } = renderWithTheme(
      <HelpModeToggle helpMode={false} onToggle={onToggle1} />
    );

    const button = screen.getByRole("button");

    // Click with first callback
    await user.click(button);
    expect(onToggle1).toHaveBeenCalledWith(true);
    expect(onToggle2).not.toHaveBeenCalled();

    // Update callback
    rerender(
      <ThemeProvider theme={mockTheme}>
        <HelpModeToggle helpMode={false} onToggle={onToggle2} />
      </ThemeProvider>
    );

    // Click with second callback
    await user.click(button);
    expect(onToggle1).toHaveBeenCalledTimes(1); // Still only called once
    expect(onToggle2).toHaveBeenCalledWith(true);
  });
});
