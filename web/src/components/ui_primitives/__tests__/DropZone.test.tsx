import { fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { DropZone, DropZoneOverlay } from "../DropZone";

// Paper.overlay is a nodetool palette extension, absent from the stock theme.
const theme = createTheme({
  cssVariables: true,
  palette: { Paper: { overlay: "rgba(0, 0, 0, 0.2)" } } as never
});
const wrap = (ui: React.ReactElement) =>
  render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);

const fileDrag = (files: File[] = []) => ({
  dataTransfer: {
    files,
    items: files.map(() => ({ kind: "file" }))
  }
});

describe("DropZone", () => {
  it("starts idle", () => {
    wrap(<DropZone data-testid="z">content</DropZone>);
    expect(screen.getByTestId("z")).toHaveAttribute("data-state", "idle");
  });

  it("goes over on drag-over and back on leave", () => {
    wrap(<DropZone data-testid="z">content</DropZone>);
    const zone = screen.getByTestId("z");
    fireEvent.dragOver(zone, fileDrag());
    expect(zone).toHaveAttribute("data-state", "over");
    fireEvent.dragLeave(zone);
    expect(zone).toHaveAttribute("data-state", "idle");
  });

  it("reject wins over over", () => {
    wrap(<DropZone data-testid="z" over reject>content</DropZone>);
    expect(screen.getByTestId("z")).toHaveAttribute("data-state", "reject");
  });

  it("emits dropped files and clears the over state", () => {
    const onFilesDrop = jest.fn();
    wrap(<DropZone data-testid="z" onFilesDrop={onFilesDrop}>x</DropZone>);
    const zone = screen.getByTestId("z");
    const file = new File(["a"], "a.png", { type: "image/png" });
    fireEvent.dragOver(zone, fileDrag([file]));
    expect(zone).toHaveAttribute("data-state", "over");
    fireEvent.drop(zone, fileDrag([file]));
    expect(onFilesDrop).toHaveBeenCalledWith([file]);
    expect(zone).toHaveAttribute("data-state", "idle");
  });

  it("ignores non-file drags when handling files", () => {
    wrap(<DropZone data-testid="z" onFilesDrop={jest.fn()}>x</DropZone>);
    const zone = screen.getByTestId("z");
    fireEvent.dragOver(zone, { dataTransfer: { files: [], items: [{ kind: "string" }] } });
    expect(zone).toHaveAttribute("data-state", "idle");
  });

  it("overlay mode shows the label only while over", () => {
    wrap(
      <DropZone data-testid="z" overlay overlayLabel="Drop here">
        child
      </DropZone>
    );
    expect(screen.queryByText("Drop here")).toBeNull();
    fireEvent.dragOver(screen.getByTestId("z"), fileDrag());
    expect(screen.getByText("Drop here")).toBeInTheDocument();
    expect(screen.getByText("child")).toBeInTheDocument();
  });

  it("DropZoneOverlay renders its label", () => {
    wrap(<DropZoneOverlay label="Upload" />);
    expect(screen.getByText("Upload")).toBeInTheDocument();
  });
});
