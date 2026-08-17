/**
 * @jest-environment jsdom
 */
/**
 * The timeline tutorial surface mounts the editor's own chrome around the
 * preview: the top bar's actions, the inspector for the clip the cast selects,
 * and the status bar reading the cast's zoom.
 *
 * The chrome is mounted here without the preview compositor — it needs a canvas
 * backend jsdom cannot give it — which is why `timelineChrome.tsx` is a module
 * of its own. Everything below is driven by the same engine the player drives.
 */
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

import ThemeNodetool from "../../../components/themes/ThemeNodetool";
import { TimelineProvider } from "../../../stores/timeline/TimelineInstance";
import {
  DemoInspectorPane,
  DemoStatusBar,
  DemoTopBar
} from "../timelineChrome";
import { TimelineDemoEngine } from "../timelineReplay";
import { timelineEditingCast } from "../timelineEditingCast";

/** Seek the cast, then mount the chrome against the stores that seek wrote. */
function renderChrome(timeMs: number) {
  const engine = new TimelineDemoEngine(timelineEditingCast);
  engine.seekToTime(timeMs);
  const view = render(
    <MemoryRouter>
      <QueryClientProvider client={new QueryClient()}>
        <ThemeProvider theme={ThemeNodetool}>
          <TimelineProvider instance={engine.instance}>
            <DemoTopBar />
            <DemoInspectorPane />
            <DemoStatusBar />
          </TimelineProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
  return { engine, view };
}

describe("timeline demo chrome", () => {
  it("shows the editor's actions, inert", () => {
    renderChrome(0);
    for (const name of [/project settings/i, /^save$/i, /^export$/i]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
  });

  it("reports the cast's zoom in the status bar", () => {
    const zoomEvent = timelineEditingCast.events.find(
      (e) => e.payload.kind === "zoom"
    );
    expect(zoomEvent).toBeDefined();

    // Past the cast's zoom-in, the bar reads that zoom — not the 10 ms/px
    // baseline it starts at.
    const { engine } = renderChrome(zoomEvent!.t);
    const msPerPx = engine.instance.ui.getState().msPerPx;
    expect(msPerPx).not.toBe(10);
    expect(screen.getByLabelText("Zoom controls")).toHaveTextContent(
      `${Math.round((10 / msPerPx) * 100)}%`
    );
  });

  it("fills the inspector from the clip the cast selected", () => {
    const selectEvent = timelineEditingCast.events.find(
      (e) => e.payload.kind === "select" && e.payload.clipIds.length === 1
    );
    expect(selectEvent).toBeDefined();

    const { engine } = renderChrome(selectEvent!.t);
    expect(engine.instance.ui.getState().selectedClipIds.size).toBe(1);
    // With one clip selected the inspector shows that clip, not its empty state.
    expect(screen.queryByText(/no clip selected/i)).not.toBeInTheDocument();
    expect(screen.getByText(/timing/i)).toBeInTheDocument();
  });
});
