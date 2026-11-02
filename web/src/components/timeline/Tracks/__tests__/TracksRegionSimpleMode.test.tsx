/**
 * TracksRegion in Simple mode: the toolbar keeps Generate, Add track and
 * zoom, and each track header keeps its type, name and one show or mute
 * toggle. Outside an editor in Simple mode every control stays.
 */
import { describe, it, expect, jest } from "@jest/globals";
import { act, render, screen, within } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../../__mocks__/themeMock";
import { TracksRegion } from "../TracksRegion";
import { TimelineProvider } from "../../../../stores/timeline/TimelineInstance";
import { useTimelineStore } from "../../../../stores/timeline/TimelineStore";
import { useTimelineUIStore } from "../../../../stores/timeline/TimelineUIStore";
import { TimelineSimpleModeContext } from "../../../../stores/timeline/TimelineEditorMode";

const renderRegion = (simple: boolean) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <TimelineProvider>
        <TimelineSimpleModeContext.Provider value={simple}>
          <TracksRegion heightPx={400} onGenerate={jest.fn()} />
        </TimelineSimpleModeContext.Provider>
      </TimelineProvider>
    </ThemeProvider>
  );

function seedTracks(): { video: string; audio: string } {
  act(() => {
    const s = useTimelineStore.getState();
    s.reset();
    s.addTrack("video", "Picture");
    s.addTrack("audio", "Music");
  });
  const [video, audio] = useTimelineStore.getState().tracks.map((t) => t.id);
  return { video, audio };
}

describe("TracksRegion in Simple mode", () => {
  it("keeps Generate, Add track and zoom in the toolbar", () => {
    renderRegion(true);
    const toolbar = screen.getByTestId("timeline-toolbar");
    expect(within(toolbar).getByTestId("timeline-generate")).toBeInTheDocument();
    expect(within(toolbar).getByTestId("add-track-button")).toBeInTheDocument();
    expect(
      within(toolbar).queryByRole("button", { name: /Keyboard shortcuts/i })
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("tracks-header-add-track")).not.toBeInTheDocument();
  });

  it("shows one toggle per track header: show for picture, mute for sound", () => {
    renderRegion(true);
    const { video, audio } = seedTracks();

    const picture = screen.getByTestId(`track-header-${video}`);
    expect(within(picture).getByRole("button", { name: "Hide track" })).toBeInTheDocument();
    expect(within(picture).queryByRole("button", { name: /lock track/i })).not.toBeInTheDocument();
    expect(within(picture).queryByRole("button", { name: "Delete track" })).not.toBeInTheDocument();
    expect(screen.queryByTestId(`track-target-${video}`)).not.toBeInTheDocument();
    expect(within(picture).getByText("V1")).toBeInTheDocument();

    const music = screen.getByTestId(`track-header-${audio}`);
    expect(within(music).getByRole("button", { name: "Mute" })).toBeInTheDocument();
    expect(within(music).queryByRole("button", { name: "Solo" })).not.toBeInTheDocument();
    expect(within(music).queryByRole("button", { name: "Hide track" })).not.toBeInTheDocument();
  });

  it("returns to the pointer tool on entering Simple mode", () => {
    const tree = (simple: boolean) => (
      <ThemeProvider theme={mockTheme}>
        <TimelineProvider>
          <TimelineSimpleModeContext.Provider value={simple}>
            <TracksRegion heightPx={400} />
          </TimelineSimpleModeContext.Provider>
        </TimelineProvider>
      </ThemeProvider>
    );
    const { rerender } = render(tree(false));
    act(() => useTimelineUIStore.getState().setActiveTool("cut"));
    rerender(tree(true));
    expect(useTimelineUIStore.getState().activeTool).toBe("select");
  });

  it("keeps every control outside Simple mode", () => {
    renderRegion(false);
    const { video } = seedTracks();
    const picture = screen.getByTestId(`track-header-${video}`);
    expect(within(picture).getByRole("button", { name: "Delete track" })).toBeInTheDocument();
    expect(screen.getByTestId(`track-target-${video}`)).toBeInTheDocument();
    expect(screen.getByTestId("tracks-header-add-track")).toBeInTheDocument();
  });
});
