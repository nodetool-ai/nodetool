import { act, fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../../__mocks__/themeMock";
import { PreviewRecovery } from "../PreviewRecovery";
import { useBugReportStore } from "../../../../stores/BugReportStore";

describe("preview recovery", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    useBugReportStore.getState().close();
    jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  function setup(): { pause: jest.Mock; unmount: () => void } {
    const pause = jest.fn();
    const view = render(
      <ThemeProvider theme={mockTheme}>
        <PreviewRecovery onPause={pause} timelineId="timeline-one">
          {(fail, ready) => (
            <>
              <button
                onClick={() =>
                  fail({
                    stage: "video-decode",
                    resourceId: "clip-one",
                    error: new Error("decoder failed")
                  })
                }
              >
                Fail video
              </button>
              <button onClick={ready}>Frame presented</button>
            </>
          )}
        </PreviewRecovery>
      </ThemeProvider>
    );
    return { pause, unmount: view.unmount };
  }

  it("pauses, recreates the preview, and clears the message only after a frame is ready", () => {
    const { pause } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Fail video" }));
    expect(pause).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alert")).toHaveTextContent("Restarting preview");
    expect(screen.queryByRole("button", { name: "Fail video" })).toBeNull();
    act(() => jest.advanceTimersByTime(500));
    expect(
      screen.getByRole("button", { name: "Fail video" })
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Frame presented" }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(useBugReportStore.getState().context).toBeNull();
  });

  it("stops after two retries, opens the bug dialog with diagnostics, and allows an explicit retry", () => {
    setup();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      fireEvent.click(screen.getByRole("button", { name: "Fail video" }));
      act(() => jest.advanceTimersByTime(500));
    }
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Automatic recovery failed"
    );
    expect(useBugReportStore.getState().context).toEqual(
      expect.objectContaining({
        summary: "Timeline preview failed",
        errorText: expect.stringContaining("clip-one"),
        nodeDetail: expect.stringContaining("timeline-one")
      })
    );
    expect(console.error).toHaveBeenCalledTimes(3);
    useBugReportStore.getState().close();
    act(() => jest.advanceTimersByTime(60_000));
    expect(useBugReportStore.getState().context).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry preview" }));
    expect(
      screen.getByRole("button", { name: "Fail video" })
    ).toBeInTheDocument();
  });

  it("cancels a pending restart on unmount", () => {
    const { unmount } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Fail video" }));
    unmount();
    act(() => jest.advanceTimersByTime(60_000));
    expect(useBugReportStore.getState().context).toBeNull();
  });

  it("recovers render exceptions through the same bounded retries and bug dialog", () => {
    function BrokenPreview(): never {
      throw new Error("Invalid preview scene");
    }
    render(
      <ThemeProvider theme={mockTheme}>
        <PreviewRecovery onPause={jest.fn()}>
          {() => <BrokenPreview />}
        </PreviewRecovery>
      </ThemeProvider>
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Restarting preview");
    act(() => jest.advanceTimersByTime(500));
    act(() => jest.advanceTimersByTime(500));
    expect(useBugReportStore.getState().context?.errorText).toContain(
      "renderer-react"
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Automatic recovery failed"
    );
  });
});
