/** @jsxImportSource @emotion/react */
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "@jest/globals";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import SearchResultActions from "../SearchResultActions";

const renderWithTheme = (component: React.ReactElement) => {
  return render(
    <ThemeProvider theme={mockTheme}>
      {component}
    </ThemeProvider>
  );
};

describe("SearchResultActions", () => {
  const mockOnSelect = jest.fn();
  const mockOnToggleBypass = jest.fn();
  const mockOnFocus = jest.fn();

  const mockProps = {
    isSelected: false,
    isBypassed: false,
    onSelect: mockOnSelect,
    onToggleBypass: mockOnToggleBypass,
    onFocus: mockOnFocus
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders all action buttons", () => {
    renderWithTheme(<SearchResultActions {...mockProps} />);

    // Check for aria-labels on buttons
    expect(screen.getByLabelText("Select node")).toBeInTheDocument();
    expect(screen.getByLabelText("Bypass node")).toBeInTheDocument();
    expect(screen.getByLabelText("Focus on node")).toBeInTheDocument();
  });

  it("shows selected state for select button", () => {
    renderWithTheme(<SearchResultActions {...mockProps} isSelected={true} />);

    const selectButton = screen.getByLabelText("Select node");
    expect(selectButton).toBeInTheDocument();
    // Check that the icon changes when selected
    const checkIcon = selectButton.querySelector("svg");
    expect(checkIcon).toBeInTheDocument();
  });

  it("shows bypassed state for bypass button", () => {
    renderWithTheme(<SearchResultActions {...mockProps} isBypassed={true} />);

    const bypassButton = screen.getByLabelText("Enable node");
    expect(bypassButton).toBeInTheDocument();
  });

  it("calls onSelect when select button is clicked", () => {
    renderWithTheme(<SearchResultActions {...mockProps} />);

    const selectButton = screen.getByLabelText("Select node");
    fireEvent.click(selectButton);

    expect(mockOnSelect).toHaveBeenCalledTimes(1);
  });

  it("calls onToggleBypass when bypass button is clicked", () => {
    renderWithTheme(<SearchResultActions {...mockProps} />);

    const bypassButton = screen.getByLabelText("Bypass node");
    fireEvent.click(bypassButton);

    expect(mockOnToggleBypass).toHaveBeenCalledTimes(1);
  });

  it("calls onFocus when focus button is clicked", () => {
    renderWithTheme(<SearchResultActions {...mockProps} />);

    const focusButton = screen.getByLabelText("Focus on node");
    fireEvent.click(focusButton);

    expect(mockOnFocus).toHaveBeenCalledTimes(1);
  });

  it("prevents event propagation on button clicks", () => {
    const mockParentClick = jest.fn();

    renderWithTheme(
      <div onClick={mockParentClick}>
        <SearchResultActions {...mockProps} />
      </div>
    );

    const selectButton = screen.getByLabelText("Select node");
    fireEvent.click(selectButton);

    // Parent click should not have been called because stopPropagation was used
    expect(mockParentClick).not.toHaveBeenCalled();
    expect(mockOnSelect).toHaveBeenCalledTimes(1);
  });

  it("shows correct tooltip for bypass button when not bypassed", () => {
    renderWithTheme(<SearchResultActions {...mockProps} isBypassed={false} />);

    const bypassButton = screen.getByLabelText("Bypass node");
    expect(bypassButton).toBeInTheDocument();
  });

  it("shows correct tooltip for bypass button when bypassed", () => {
    renderWithTheme(<SearchResultActions {...mockProps} isBypassed={true} />);

    const bypassButton = screen.getByLabelText("Enable node");
    expect(bypassButton).toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = renderWithTheme(
      <SearchResultActions {...mockProps} className="custom-class" />
    );

    const actionsContainer = container.querySelector(".search-result-actions");
    expect(actionsContainer).toBeInTheDocument();
    expect(actionsContainer).toHaveClass("custom-class");
  });

  it("handles rapid clicks without errors", () => {
    renderWithTheme(<SearchResultActions {...mockProps} />);

    const selectButton = screen.getByLabelText("Select node");
    const bypassButton = screen.getByLabelText("Bypass node");
    const focusButton = screen.getByLabelText("Focus on node");

    // Rapid clicks
    fireEvent.click(selectButton);
    fireEvent.click(selectButton);
    fireEvent.click(bypassButton);
    fireEvent.click(focusButton);
    fireEvent.click(selectButton);

    expect(mockOnSelect).toHaveBeenCalledTimes(3);
    expect(mockOnToggleBypass).toHaveBeenCalledTimes(1);
    expect(mockOnFocus).toHaveBeenCalledTimes(1);
  });
});
