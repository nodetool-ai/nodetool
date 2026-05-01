import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { DropZoneOverlay } from "../DropZoneOverlay";
import mockTheme from "../../../__mocks__/themeMock";

const renderOverlay = (
  props: Partial<React.ComponentProps<typeof DropZoneOverlay>> = {}
) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <DropZoneOverlay visible {...props} />
    </ThemeProvider>
  );

describe("DropZoneOverlay", () => {
  it("renders default message when visible", () => {
    renderOverlay();
    expect(screen.getByText("Drop files to upload")).toBeInTheDocument();
  });

  it("renders custom message", () => {
    renderOverlay({ message: "Drop your file here" });
    expect(screen.getByText("Drop your file here")).toBeInTheDocument();
  });

  it("renders icon alongside message", () => {
    renderOverlay({
      icon: <span data-testid="drop-icon">icon</span>,
      message: "Drop"
    });
    expect(screen.getByTestId("drop-icon")).toBeInTheDocument();
    expect(screen.getByText("Drop")).toBeInTheDocument();
  });

  it("renders nothing when not visible", () => {
    renderOverlay({ visible: false });
    expect(screen.queryByText("Drop files to upload")).not.toBeInTheDocument();
  });

  it("uses pointer-events: none by default", () => {
    const { container } = renderOverlay();
    const box = container.firstChild as HTMLElement;
    expect(box).toHaveStyle({ pointerEvents: "none" });
  });

  it("uses pointer-events: auto when interactive", () => {
    const { container } = renderOverlay({ interactive: true });
    const box = container.firstChild as HTMLElement;
    expect(box).toHaveStyle({ pointerEvents: "auto" });
  });

  it("renders custom children instead of default prompt", () => {
    renderOverlay({
      children: <div data-testid="custom-prompt">custom</div>
    });
    expect(screen.getByTestId("custom-prompt")).toBeInTheDocument();
    expect(screen.queryByText("Drop files to upload")).not.toBeInTheDocument();
  });

  it("is marked aria-hidden when non-interactive", () => {
    const { container } = renderOverlay();
    expect(container.firstChild).toHaveAttribute("aria-hidden", "true");
  });
});
