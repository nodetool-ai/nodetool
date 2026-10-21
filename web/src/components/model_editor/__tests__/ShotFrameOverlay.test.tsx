import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import ShotFrameOverlay from "../ShotFrameOverlay";

describe("ShotFrameOverlay", () => {
  const originalObserver = globalThis.ResizeObserver;
  let disconnect: jest.Mock;

  beforeEach(() => {
    disconnect = jest.fn();
    globalThis.ResizeObserver = jest.fn().mockImplementation(() => ({
      observe: jest.fn(),
      disconnect
    })) as unknown as typeof ResizeObserver;
    jest.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(1600);
    jest.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(900);
  });

  afterEach(() => {
    globalThis.ResizeObserver = originalObserver;
    jest.restoreAllMocks();
  });

  it("draws the frame of a portrait shot centred in a wide viewport", () => {
    const { unmount } = render(
      <ThemeProvider theme={mockTheme}>
        <ShotFrameOverlay shot={{ aspect: "9:16", lens: 50 }} label="9:16 · 50 mm" />
      </ThemeProvider>
    );

    const frame = screen.getByText("9:16 · 50 mm").parentElement;
    expect(frame).toHaveStyle({ left: "547px", top: "0px", width: "506px", height: "900px" });
    unmount();
    expect(disconnect).toHaveBeenCalled();
  });

  it("frames the whole viewport when the shot uses it", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <ShotFrameOverlay shot={{ aspect: "viewport", lens: "free" }} label="Whole viewport · Free" />
      </ThemeProvider>
    );

    const frame = screen.getByText("Whole viewport · Free").parentElement;
    expect(frame).toHaveStyle({ left: "0px", top: "0px", width: "1600px", height: "900px" });
  });
});
