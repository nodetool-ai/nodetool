/**
 * TrackHeader context menu — right-click (or a touch hold) on the header opens
 * a menu whose items rename, duplicate, insert a same-type track above/below,
 * or remove the track.
 *
 * Setup runs AFTER render: TimelineProvider creates a fresh store instance on
 * mount and pushes it active, so static getState() only reaches that instance
 * once the provider is rendered.
 */
import { describe, it, expect, jest, afterEach } from "@jest/globals";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { makeClip } from "@nodetool-ai/timeline";

import mockTheme from "../../../../__mocks__/themeMock";
import { TracksRegion } from "../TracksRegion";
import { TimelineProvider } from "../../../../stores/timeline/TimelineInstance";
import { useTimelineStore } from "../../../../stores/timeline/TimelineStore";

const renderRegion = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <TimelineProvider>
        <TracksRegion heightPx={400} />
      </TimelineProvider>
    </ThemeProvider>
  );

/** Two video tracks and one audio track; returns their ids in order. */
function seedTracks(): string[] {
  act(() => {
    const s = useTimelineStore.getState();
    s.reset();
    s.addTrack("video", "Video 1");
    s.addTrack("video", "Video 2");
    s.addTrack("audio", "Audio 1");
  });
  return trackIds();
}

function trackIds(): string[] {
  return useTimelineStore.getState().tracks.map((t) => t.id);
}

function openMenu(trackId: string): HTMLElement {
  fireEvent.contextMenu(screen.getByTestId(`track-header-${trackId}`), {
    clientX: 40,
    clientY: 20
  });
  return screen.getByTestId(`track-context-menu-${trackId}`);
}

const MENU_LABELS = [
  "Rename",
  "Duplicate track",
  "Insert Video track above",
  "Insert Video track below",
  "Remove track"
];

describe("TrackHeader context menu", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("right-click opens the menu with the five track items", () => {
    renderRegion();
    const [, v2] = seedTracks();

    const menu = openMenu(v2);

    expect(menu).toBeInTheDocument();
    const items = screen.getAllByRole("menuitem").map((el) => el.textContent);
    expect(items).toEqual(MENU_LABELS);
  });

  it("labels the insert items with the header's own track type", () => {
    renderRegion();
    const [, , audio] = seedTracks();

    openMenu(audio);

    expect(screen.getByText("Insert Audio track above")).toBeInTheDocument();
    expect(screen.getByText("Insert Audio track below")).toBeInTheDocument();
  });

  it("Insert Video track above inserts a track before this one", async () => {
    renderRegion();
    const [v1, v2, audio] = seedTracks();

    openMenu(v2);
    await userEvent.click(screen.getByText("Insert Video track above"));

    const ids = trackIds();
    expect(ids).toHaveLength(4);
    expect(ids[0]).toBe(v1);
    expect(ids[2]).toBe(v2);
    expect(ids[3]).toBe(audio);
    const inserted = useTimelineStore.getState().tracks[1];
    expect(inserted.type).toBe("video");
    expect(useTimelineStore.getState().tracks.map((t) => t.index)).toEqual([
      0, 1, 2, 3
    ]);
  });

  it("Insert Video track below inserts a track after this one", async () => {
    renderRegion();
    const [v1, v2] = seedTracks();

    openMenu(v1);
    await userEvent.click(screen.getByText("Insert Video track below"));

    const ids = trackIds();
    expect(ids[0]).toBe(v1);
    expect(ids[2]).toBe(v2);
    expect(useTimelineStore.getState().tracks[1].type).toBe("video");
  });

  it("Duplicate track adds a copy right after with the clips copied", async () => {
    renderRegion();
    const [v1, v2, audio] = seedTracks();
    act(() => {
      useTimelineStore.setState({
        clips: [
          makeClip({ id: "c1", trackId: v1, startMs: 0, durationMs: 1000 }),
          makeClip({ id: "c2", trackId: v1, startMs: 2000, durationMs: 500 })
        ]
      });
    });

    openMenu(v1);
    await userEvent.click(screen.getByText("Duplicate track"));

    const ids = trackIds();
    expect(ids).toHaveLength(4);
    const copyId = ids[1];
    expect([v1, v2, audio]).not.toContain(copyId);
    expect(ids[2]).toBe(v2);
    expect(useTimelineStore.getState().tracks[1].name).toBe("Video 1 copy");

    const clips = useTimelineStore.getState().clips;
    const copies = clips.filter((c) => c.trackId === copyId);
    expect(copies).toHaveLength(2);
    expect(copies.map((c) => c.id)).not.toContain("c1");
    expect(copies.map((c) => c.id)).not.toContain("c2");
    expect(copies.map((c) => c.startMs).sort()).toEqual([0, 2000]);
    expect(clips.filter((c) => c.trackId === v1)).toHaveLength(2);
  });

  it("Rename puts the name input in edit mode", async () => {
    renderRegion();
    const [v1] = seedTracks();
    const input = screen.getByLabelText("Track name: Video 1");
    expect(input).toHaveAttribute("readonly");
    expect(input).toHaveAttribute("title", "Double-click to rename");

    openMenu(v1);
    await userEvent.click(screen.getByText("Rename"));

    expect(input).not.toHaveAttribute("readonly");
    expect(input).not.toHaveAttribute("title");
  });

  it("Remove track opens the confirm dialog", async () => {
    renderRegion();
    const [, v2] = seedTracks();

    openMenu(v2);
    await userEvent.click(screen.getByText("Remove track"));

    expect(
      screen.getByText('Remove track "Video 2" and all its clips?')
    ).toBeInTheDocument();
    expect(trackIds()).toHaveLength(3);
  });

  it("does not open while a name edit is active", () => {
    renderRegion();
    const [v1] = seedTracks();
    fireEvent.doubleClick(screen.getByLabelText("Track name: Video 1"));

    fireEvent.contextMenu(screen.getByTestId(`track-header-${v1}`));

    expect(
      screen.queryByTestId(`track-context-menu-${v1}`)
    ).not.toBeInTheDocument();
  });

  it("a touch hold on the header opens the same menu", () => {
    jest.useFakeTimers();
    renderRegion();
    const [v1] = seedTracks();
    const header = screen.getByTestId(`track-header-${v1}`);

    const down = new MouseEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      clientX: 30,
      clientY: 10
    });
    Object.defineProperty(down, "pointerType", { value: "touch" });
    Object.defineProperty(down, "pointerId", { value: 1 });
    fireEvent(header, down);
    act(() => {
      jest.advanceTimersByTime(600);
    });

    expect(screen.getByTestId(`track-context-menu-${v1}`)).toBeInTheDocument();
  });

  it("a touch hold on the resize handle does not open the menu", () => {
    jest.useFakeTimers();
    renderRegion();
    const [v1] = seedTracks();
    const handle = screen
      .getByTestId(`track-header-${v1}`)
      .querySelector('[aria-label="Resize track height"]') as HTMLElement;
    handle.setPointerCapture = () => {};

    const down = new MouseEvent("pointerdown", {
      bubbles: true,
      cancelable: true
    });
    Object.defineProperty(down, "pointerType", { value: "touch" });
    Object.defineProperty(down, "pointerId", { value: 1 });
    fireEvent(handle, down);
    act(() => {
      jest.advanceTimersByTime(600);
    });

    expect(
      screen.queryByTestId(`track-context-menu-${v1}`)
    ).not.toBeInTheDocument();
  });
});
