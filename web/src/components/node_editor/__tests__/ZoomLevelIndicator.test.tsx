import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import ZoomLevelIndicator from "../ZoomLevelIndicator";
import mockTheme from "../../../__mocks__/themeMock";

const mockZoomTo = jest.fn();
const mockFitView = jest.fn();
const mockZoomIn = jest.fn();
const mockZoomOut = jest.fn();

jest.mock("@xyflow/react", () => ({
  useViewport: () => ({ zoom: 1 }),
  useReactFlow: () => ({
    zoomTo: mockZoomTo,
    fitView: mockFitView,
    zoomIn: mockZoomIn,
    zoomOut: mockZoomOut
  })
}));

describe("ZoomLevelIndicator", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders zoom percentage display", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <ZoomLevelIndicator />
      </ThemeProvider>
    );
    const zoomDisplay = screen.getByText("100%", { selector: ".zoom-display" });
    expect(zoomDisplay).toBeInTheDocument();
  });

  it("renders zoom in and zoom out buttons", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <ZoomLevelIndicator />
      </ThemeProvider>
    );
    expect(screen.getByLabelText("Zoom in")).toBeInTheDocument();
    expect(screen.getByLabelText("Zoom out")).toBeInTheDocument();
  });

  it("renders zoom preset buttons", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <ZoomLevelIndicator />
      </ThemeProvider>
    );
    expect(screen.getByLabelText("Zoom to 50%")).toBeInTheDocument();
    expect(screen.getByLabelText("Zoom to 100%")).toBeInTheDocument();
    expect(screen.getByLabelText("Zoom to 150%")).toBeInTheDocument();
    expect(screen.getByLabelText("Zoom to 200%")).toBeInTheDocument();
  });

  it("renders fit view button", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <ZoomLevelIndicator />
      </ThemeProvider>
    );
    expect(screen.getByLabelText("Fit view")).toBeInTheDocument();
  });

  it("calls zoomIn when zoom in button is clicked", async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider theme={mockTheme}>
        <ZoomLevelIndicator />
      </ThemeProvider>
    );
    await user.click(screen.getByLabelText("Zoom in"));
    expect(mockZoomIn).toHaveBeenCalledWith({ duration: 100 });
  });

  it("calls zoomOut when zoom out button is clicked", async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider theme={mockTheme}>
        <ZoomLevelIndicator />
      </ThemeProvider>
    );
    await user.click(screen.getByLabelText("Zoom out"));
    expect(mockZoomOut).toHaveBeenCalledWith({ duration: 100 });
  });

  it("calls zoomTo when preset button is clicked", async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider theme={mockTheme}>
        <ZoomLevelIndicator />
      </ThemeProvider>
    );
    await user.click(screen.getByLabelText("Zoom to 50%"));
    expect(mockZoomTo).toHaveBeenCalledWith(0.5, { duration: 200 });
  });

  it("calls fitView when fit view button is clicked", async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider theme={mockTheme}>
        <ZoomLevelIndicator />
      </ThemeProvider>
    );
    await user.click(screen.getByLabelText("Fit view"));
    expect(mockFitView).toHaveBeenCalledWith({ padding: 0.2, duration: 200 });
  });

  it("highlights active preset when zoom matches", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <ZoomLevelIndicator />
      </ThemeProvider>
    );
    const button100 = screen.getByLabelText("Zoom to 100%");
    expect(button100).toHaveClass("active");
  });
});
