import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { SelectableListItem } from "../SelectableListItem";
import mockTheme from "../../../__mocks__/themeMock";

const renderItem = (
  props: Partial<React.ComponentProps<typeof SelectableListItem>> = {}
) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <SelectableListItem {...props}>
        <span data-testid="row-content">Row</span>
      </SelectableListItem>
    </ThemeProvider>
  );

describe("SelectableListItem", () => {
  it("renders children", () => {
    renderItem();
    expect(screen.getByTestId("row-content")).toBeInTheDocument();
  });

  it("invokes onClick when enabled", () => {
    const onClick = jest.fn();
    renderItem({ onClick });
    fireEvent.click(screen.getByTestId("row-content"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not invoke onClick when disabled", () => {
    const onClick = jest.fn();
    renderItem({ onClick, disabled: true });
    fireEvent.click(screen.getByTestId("row-content"));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("reflects selected state via aria-pressed", () => {
    const onClick = jest.fn();
    const { container } = renderItem({ onClick, selected: true });
    expect(container.firstChild).toHaveAttribute("aria-pressed", "true");
  });

  it("applies reduced opacity when disabled", () => {
    const { container } = renderItem({ disabled: true });
    const box = container.firstChild as HTMLElement;
    expect(box).toHaveStyle({ opacity: "0.6" });
  });

  it("sets role=button when clickable", () => {
    const onClick = jest.fn();
    const { container } = renderItem({ onClick });
    expect(container.firstChild).toHaveAttribute("role", "button");
  });

  it("does not set role when not clickable", () => {
    const { container } = renderItem();
    expect(container.firstChild).not.toHaveAttribute("role");
  });

  it("sets aria-disabled when disabled", () => {
    const onClick = jest.fn();
    const { container } = renderItem({ onClick, disabled: true });
    expect(container.firstChild).toHaveAttribute("aria-disabled", "true");
  });

  it("activates on Enter key", () => {
    const onClick = jest.fn();
    const { container } = renderItem({ onClick });
    fireEvent.keyDown(container.firstChild as HTMLElement, { key: "Enter" });
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("activates on Space key", () => {
    const onClick = jest.fn();
    const { container } = renderItem({ onClick });
    fireEvent.keyDown(container.firstChild as HTMLElement, { key: " " });
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("ignores other keys", () => {
    const onClick = jest.fn();
    const { container } = renderItem({ onClick });
    fireEvent.keyDown(container.firstChild as HTMLElement, { key: "a" });
    expect(onClick).not.toHaveBeenCalled();
  });

  it("does not activate on keyboard when disabled", () => {
    const onClick = jest.fn();
    const { container } = renderItem({ onClick, disabled: true });
    fireEvent.keyDown(container.firstChild as HTMLElement, { key: "Enter" });
    fireEvent.keyDown(container.firstChild as HTMLElement, { key: " " });
    expect(onClick).not.toHaveBeenCalled();
  });
});
