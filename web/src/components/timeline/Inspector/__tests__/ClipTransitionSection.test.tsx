import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { makeClip, makeTrack, type TimelineClip } from "@nodetool-ai/timeline";

import mockTheme from "../../../../__mocks__/themeMock";
import { useTimelineStore } from "../../../../stores/timeline/TimelineStore";
import { ClipTransitionSection } from "../ClipTransitionSection";

const track = makeTrack({ type: "video", name: "V1" });

function seed(incoming: Partial<TimelineClip> = {}, trackLocked = false) {
  const outgoing = makeClip({
    id: "clip_out",
    trackId: track.id,
    mediaType: "image",
    sourceType: "imported",
    startMs: 0,
    durationMs: 2000
  });
  const clip = makeClip({
    id: "clip_in",
    trackId: track.id,
    mediaType: "image",
    sourceType: "imported",
    startMs: 2000,
    durationMs: 1000,
    ...incoming
  });
  act(() => {
    useTimelineStore.setState({
      tracks: [{ ...track, locked: trackLocked }],
      clips: [outgoing, clip]
    });
  });
}

const clipById = (id: string) =>
  useTimelineStore.getState().clips.find((clip) => clip.id === id)!;

const StoreBoundSection = () => {
  const clip = useTimelineStore((s) =>
    s.clips.find((candidate) => candidate.id === "clip_in")
  );
  return clip ? <ClipTransitionSection clip={clip} /> : null;
};

const renderSection = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <StoreBoundSection />
    </ThemeProvider>
  );

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(
    "nodetool.timeline.inspector.fold",
    JSON.stringify({ transition: true })
  );
});

describe("ClipTransitionSection", () => {
  it("extends the previous clip under a newly chosen transition", async () => {
    const user = userEvent.setup();
    seed();
    renderSection();

    await user.click(screen.getByRole("combobox", { name: "Transition type" }));
    await user.click(screen.getByRole("option", { name: "Wipe" }));

    expect(clipById("clip_in").transitionIn).toMatchObject({
      type: "wipe",
      durationMs: 500
    });
    expect(clipById("clip_out").durationMs).toBe(2500);
  });

  it("caps the duration at the shorter clip", async () => {
    const user = userEvent.setup();
    seed({ transitionIn: { type: "crossfade", durationMs: 200 } });
    renderSection();

    const duration = screen.getByRole("textbox", {
      name: "Transition duration"
    });
    await user.clear(duration);
    await user.type(duration, "10{Enter}");

    expect(clipById("clip_in").transitionIn?.durationMs).toBe(1000);
  });

  it("disables the type on a locked track and leaves the clip alone", () => {
    seed({ transitionIn: { type: "crossfade", durationMs: 200 } }, true);
    renderSection();

    expect(
      screen.getByRole("combobox", { name: "Transition type" })
    ).toHaveAttribute("aria-disabled", "true");
  });
});
