import { act, fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { makeClip } from "@nodetool-ai/timeline";

import mockTheme from "../../../../__mocks__/themeMock";
import {
  TimelineProvider,
  createTimelineInstance
} from "../../../../stores/timeline/TimelineInstance";
import { ClipReframe } from "../ClipReframe";

const clipA = makeClip({
  id: "clip_a",
  name: "A",
  sourceType: "imported",
  mediaType: "video",
  startMs: 1000,
  durationMs: 1000
});
const clipB = makeClip({
  id: "clip_b",
  name: "B",
  sourceType: "imported",
  mediaType: "video",
  startMs: 2000,
  durationMs: 1000
});

function setup(playheadMs: number) {
  const instance = createTimelineInstance();
  act(() => {
    instance.doc.setState({ clips: [clipA, clipB] });
    instance.playback.getState().seek(playheadMs);
  });
  const tree = (clip: typeof clipA) => (
    <ThemeProvider theme={mockTheme}>
      <TimelineProvider instance={instance}>
        <ClipReframe clip={clip} />
      </TimelineProvider>
    </ThemeProvider>
  );
  const view = render(tree(clipA));
  fireEvent.click(screen.getByRole("button", { name: /smart reframe/i }));
  return { instance, select: (clip: typeof clipA) => view.rerender(tree(clip)) };
}

describe("ClipReframe", () => {
  it("starts each clip from neutral framing", () => {
    const { select } = setup(1500);
    const zoom = () => screen.getByRole("slider", { name: "Zoom" });

    fireEvent.keyDown(zoom(), { key: "ArrowRight" });
    expect(zoom()).not.toHaveAttribute("aria-valuenow", "1");

    select(clipB);
    expect(zoom()).toHaveAttribute("aria-valuenow", "1");
  });

  it("disables Add framing keyframe while the playhead is off the clip", () => {
    const { instance } = setup(5000);

    const add = screen.getByRole("button", { name: "Add framing keyframe" });
    expect(add).toBeDisabled();
    fireEvent.click(add);
    expect(
      instance.doc.getState().clips.find((clip) => clip.id === "clip_a")
        ?.reframe
    ).toBeUndefined();
  });
});
