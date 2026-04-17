import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { PositionedDialog } from "../PositionedDialog";
import mockTheme from "../../../__mocks__/themeMock";

const renderDialog = (props: Partial<React.ComponentProps<typeof PositionedDialog>> = {}) => {
  const resolvedProps = {
    open: true,
    onClose: jest.fn(),
    anchor: { x: 500, y: 400 },
    ...props
  };
  const result = render(
    <ThemeProvider theme={mockTheme}>
      <PositionedDialog {...resolvedProps}>
        <div data-testid="dialog-content">Hello</div>
      </PositionedDialog>
    </ThemeProvider>
  );
  return { ...result, props: resolvedProps };
};

describe("PositionedDialog", () => {
  beforeEach(() => {
    Object.defineProperty(window, "innerWidth", {
      value: 1024,
      configurable: true
    });
  });

  it("renders children when open", () => {
    renderDialog();
    expect(screen.getByTestId("dialog-content")).toBeInTheDocument();
  });

  it("returns null when not open", () => {
    renderDialog({ open: false });
    expect(screen.queryByTestId("dialog-content")).not.toBeInTheDocument();
  });

  it("invokes onClose on backdrop click", () => {
    const onClose = jest.fn();
    const { container } = renderDialog({ onClose });
    fireEvent.click(container.firstChild as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not invoke onClose when clicking inside the dialog", () => {
    const onClose = jest.fn();
    renderDialog({ onClose });
    fireEvent.click(screen.getByTestId("dialog-content"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("clamps left position against the viewport edge", () => {
    const { container } = renderDialog({
      anchor: { x: 0, y: 300 },
      width: 400,
      edgeMargin: 50
    });
    const surface = container.querySelector(".MuiPaper-root") as HTMLElement;
    expect(surface).toHaveStyle({ left: "50px" });
  });

  it("clamps left position against the right edge", () => {
    const { container } = renderDialog({
      anchor: { x: 10_000, y: 300 },
      width: 400,
      edgeMargin: 50
    });
    const surface = container.querySelector(".MuiPaper-root") as HTMLElement;
    // 1024 - 400 - 50 = 574
    expect(surface).toHaveStyle({ left: "574px" });
  });

  it("respects custom offsetY", () => {
    const { container } = renderDialog({
      anchor: { x: 500, y: 400 },
      offsetY: 100,
      width: 200
    });
    const surface = container.querySelector(".MuiPaper-root") as HTMLElement;
    expect(surface).toHaveStyle({ top: "300px" });
  });

  it("passes through backdrop and surface class names", () => {
    const { container } = renderDialog({
      backdropClassName: "my-backdrop",
      className: "my-surface"
    });
    expect(container.firstChild).toHaveClass("my-backdrop");
    expect(container.querySelector(".my-surface")).toBeInTheDocument();
  });
});
