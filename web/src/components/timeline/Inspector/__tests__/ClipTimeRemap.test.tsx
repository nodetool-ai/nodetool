import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { makeClip, makeTrack, type TimelineClip } from "@nodetool-ai/timeline";

import mockTheme from "../../../../__mocks__/themeMock";
import { useTimelineStore } from "../../../../stores/timeline/TimelineStore";
import { ClipTimeRemapSection } from "../ClipTimeRemap";

const track = makeTrack({ type: "video", name: "V1" });

function videoClip(id: string, overrides: Partial<TimelineClip> = {}) {
  return makeClip({
    id,
    trackId: track.id,
    mediaType: "video",
    sourceType: "imported",
    startMs: 0,
    durationMs: 2000,
    inPointMs: 1000,
    ...overrides
  });
}

function seed(clips: TimelineClip[]) {
  act(() => {
    useTimelineStore.setState({ tracks: [track], clips });
  });
}

const StoreBoundSection = ({ clipId }: { clipId: string }) => {
  const clip = useTimelineStore((s) =>
    s.clips.find((candidate) => candidate.id === clipId)
  );
  return clip ? <ClipTimeRemapSection clip={clip} /> : null;
};

const renderSection = (clipId: string) => {
  const view = render(
    <ThemeProvider theme={mockTheme}>
      <StoreBoundSection clipId={clipId} />
    </ThemeProvider>
  );
  return {
    ...view,
    select: (nextId: string) =>
      view.rerender(
        <ThemeProvider theme={mockTheme}>
          <StoreBoundSection clipId={nextId} />
        </ThemeProvider>
      )
  };
};

const remapOf = (id: string) =>
  useTimelineStore.getState().clips.find((clip) => clip.id === id)?.timeRemap;

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(
    "nodetool.timeline.inspector.fold",
    JSON.stringify({ timeRemap: true })
  );
});

describe("ClipTimeRemapSection", () => {
  it("starts the remap at the clip's current speed", () => {
    seed([videoClip("clip_fast", { speedMultiplier: 2 })]);
    renderSection("clip_fast");

    fireEvent.click(screen.getByRole("checkbox", { name: "Time remap enabled" }));

    expect(remapOf("clip_fast")?.keyframes).toEqual([
      { t: 0, sourceMs: 1000 },
      { t: 1, sourceMs: 5000 }
    ]);
  });

  it("ends the remap at the clip's out-point when it has one", () => {
    seed([videoClip("clip_out", { outPointMs: 4500, speedMultiplier: 1.75 })]);
    renderSection("clip_out");

    fireEvent.click(screen.getByRole("checkbox", { name: "Time remap enabled" }));

    expect(remapOf("clip_out")?.keyframes[1]).toEqual({
      t: 1,
      sourceMs: 4500
    });
  });

  it("drops the duplicate-time warning when another clip is selected", async () => {
    const user = userEvent.setup();
    const keyframes = [
      { t: 0, sourceMs: 0 },
      { t: 1, sourceMs: 2000 }
    ];
    seed([
      videoClip("clip_a", { timeRemap: { keyframes } }),
      videoClip("clip_b", { startMs: 2000, timeRemap: { keyframes } })
    ]);
    const view = renderSection("clip_a");

    const time = screen.getByRole("textbox", {
      name: "Time remap keyframe 1 time"
    });
    await user.clear(time);
    await user.type(time, "1{Enter}");
    expect(screen.getByText(/another keyframe already sits/i)).toBeInTheDocument();

    view.select("clip_b");

    expect(screen.queryByText(/another keyframe already sits/i)).toBeNull();
  });

  it("disables the remap on a locked clip", () => {
    seed([videoClip("clip_locked", { locked: true })]);
    renderSection("clip_locked");

    const enabled = screen.getByRole("checkbox", { name: "Time remap enabled" });
    expect(enabled).toBeDisabled();
    fireEvent.click(enabled);
    expect(remapOf("clip_locked")).toBeUndefined();
  });
});
