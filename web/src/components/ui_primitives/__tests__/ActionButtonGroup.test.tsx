import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { ActionButtonGroup } from "../ActionButtonGroup";
import mockTheme from "../../../__mocks__/themeMock";

describe("ActionButtonGroup", () => {
  it("renders children", () => {
    const { container } = render(
      <ThemeProvider theme={mockTheme}>
        <ActionButtonGroup>
          <button>Button 1</button>
          <button>Button 2</button>
        </ActionButtonGroup>
      </ThemeProvider>
    );

    expect(screen.getByText("Button 1")).toBeInTheDocument();
    expect(screen.getByText("Button 2")).toBeInTheDocument();
    // Verify it's wrapped in a div with action-button-group class
    const group = container.querySelector('.action-button-group');
    expect(group).toBeInTheDocument();
  });

  it("filters out falsy children", () => {
    const showButton2 = false;
    const { container } = render(
      <ThemeProvider theme={mockTheme}>
        <ActionButtonGroup>
          <button>Button 1</button>
          {showButton2 && <button>Button 2</button>}
          {null}
          {undefined}
          <button>Button 3</button>
        </ActionButtonGroup>
      </ThemeProvider>
    );

    expect(screen.getByText("Button 1")).toBeInTheDocument();
    expect(screen.queryByText("Button 2")).not.toBeInTheDocument();
    expect(screen.getByText("Button 3")).toBeInTheDocument();
    
    const group = container.querySelector('.action-button-group');
    expect(group?.children).toHaveLength(2); // Only 2 actual buttons
  });

  it("applies nodrag class by default", () => {
    const { container } = render(
      <ThemeProvider theme={mockTheme}>
        <ActionButtonGroup>
          <button>Button</button>
        </ActionButtonGroup>
      </ThemeProvider>
    );

    const group = container.querySelector('.action-button-group');
    expect(group).toHaveClass("nodrag");
  });

  it("does not apply nodrag class when nodrag is false", () => {
    const { container } = render(
      <ThemeProvider theme={mockTheme}>
        <ActionButtonGroup nodrag={false}>
          <button>Button</button>
        </ActionButtonGroup>
      </ThemeProvider>
    );

    const group = container.querySelector('.action-button-group');
    expect(group).not.toHaveClass("nodrag");
  });

  it("applies custom className", () => {
    const { container } = render(
      <ThemeProvider theme={mockTheme}>
        <ActionButtonGroup className="custom-class">
          <button>Button</button>
        </ActionButtonGroup>
      </ThemeProvider>
    );

    const group = container.querySelector('.action-button-group');
    expect(group).toHaveClass("custom-class");
  });

  it("renders without dividers by default", () => {
    const { container } = render(
      <ThemeProvider theme={mockTheme}>
        <ActionButtonGroup>
          <button>Button 1</button>
          <button>Button 2</button>
        </ActionButtonGroup>
      </ThemeProvider>
    );

    const group = container.querySelector('.action-button-group');
    // Should only have 2 children (the buttons)
    expect(group?.children).toHaveLength(2);
  });

  it("renders with dividers when divider is true", () => {
    const { container } = render(
      <ThemeProvider theme={mockTheme}>
        <ActionButtonGroup divider={true}>
          <button>Button 1</button>
          <button>Button 2</button>
          <button>Button 3</button>
        </ActionButtonGroup>
      </ThemeProvider>
    );

    const group = container.querySelector('.action-button-group');
    // Should have 5 children (3 buttons + 2 dividers)
    expect(group?.children).toHaveLength(5);
  });

  it("does not add dividers when there is only one child", () => {
    const { container } = render(
      <ThemeProvider theme={mockTheme}>
        <ActionButtonGroup divider={true}>
          <button>Button 1</button>
        </ActionButtonGroup>
      </ThemeProvider>
    );

    const group = container.querySelector('.action-button-group');
    // Should only have 1 child (the button)
    expect(group?.children).toHaveLength(1);
  });
});
