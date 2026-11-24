import { act, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../__mocks__/themeMock";
import DocumentDisplayControls, {
  DOCUMENT_DISPLAY_PREFS_STORAGE_KEY,
  DOCUMENT_ZOOM_MAX,
  DOCUMENT_ZOOM_MIN,
  documentPaperThemeClass,
  useDocumentDisplayPreferences
} from "../DocumentDisplayControls";

describe("DocumentDisplayControls and useDocumentDisplayPreferences", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("persists zoom and paper theme in localStorage and clamps zoom bounds", () => {
    const { result } = renderHook(() => useDocumentDisplayPreferences());
    expect(result.current.zoom).toBe(1);
    expect(result.current.paperTheme).toBe("theme");

    act(() => {
      result.current.zoomIn();
    });
    expect(result.current.zoom).toBe(1.1);

    act(() => {
      result.current.setZoom(5);
    });
    expect(result.current.zoom).toBe(DOCUMENT_ZOOM_MAX);

    act(() => {
      result.current.setZoom(0.1);
    });
    expect(result.current.zoom).toBe(DOCUMENT_ZOOM_MIN);

    act(() => {
      result.current.resetZoom();
      result.current.setPaperTheme("gray");
    });
    expect(result.current.zoom).toBe(1);
    expect(result.current.paperTheme).toBe("gray");

    const stored = JSON.parse(
      window.localStorage.getItem(DOCUMENT_DISPLAY_PREFS_STORAGE_KEY) ?? "{}"
    );
    expect(stored).toEqual({ zoom: 1, paperTheme: "gray" });

    // A fresh mount restores the saved preferences.
    const { result: reloaded } = renderHook(() =>
      useDocumentDisplayPreferences()
    );
    expect(reloaded.current.zoom).toBe(1);
    expect(reloaded.current.paperTheme).toBe("gray");
  });

  it("maps paper themes to their CSS classes", () => {
    expect(documentPaperThemeClass("theme")).toBe("");
    expect(documentPaperThemeClass("white")).toBe("doc-paper-white");
    expect(documentPaperThemeClass("gray")).toBe("doc-paper-gray");
  });

  it("triggers zoom and paper theme callbacks from the control bar", async () => {
    const user = userEvent.setup();
    const onZoomIn = jest.fn();
    const onZoomOut = jest.fn();
    const onResetZoom = jest.fn();
    const onPaperThemeChange = jest.fn();

    render(
      <ThemeProvider theme={mockTheme}>
        <DocumentDisplayControls
          zoom={1.2}
          onZoomIn={onZoomIn}
          onZoomOut={onZoomOut}
          onResetZoom={onResetZoom}
          paperTheme="theme"
          onPaperThemeChange={onPaperThemeChange}
        />
      </ThemeProvider>
    );

    expect(screen.getByText("120%")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Zoom out" }));
    await user.click(screen.getByRole("button", { name: "Zoom in" }));
    await user.click(screen.getByRole("button", { name: /120%/i }));

    expect(onZoomOut).toHaveBeenCalledTimes(1);
    expect(onZoomIn).toHaveBeenCalledTimes(1);
    expect(onResetZoom).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Paper theme" }));
    await user.click(screen.getByRole("menuitemradio", { name: "White paper" }));
    expect(onPaperThemeChange).toHaveBeenCalledWith("white");
  });
});
