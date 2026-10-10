import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { makeClip, makeTrack } from "@nodetool-ai/timeline";

import mockTheme from "../../../../__mocks__/themeMock";
import { useTimelineStore } from "../../../../stores/timeline/TimelineStore";
import { ClipGroupPanel } from "../ClipGroupPanel";

const track = makeTrack({ type: "video", name: "V1" });

function seed(locked = false) {
  const group = makeClip({
    id: "group_1",
    trackId: track.id,
    name: "Group",
    mediaType: "group",
    sourceType: "imported",
    startMs: 0,
    durationMs: 3000,
    locked
  });
  const child = makeClip({
    id: "child_1",
    trackId: track.id,
    mediaType: "image",
    sourceType: "imported",
    startMs: 1000,
    durationMs: 2000,
    parentId: group.id
  });
  act(() => {
    useTimelineStore.setState({
      tracks: [track],
      clips: [group, child],
      fps: 30
    });
  });
  return group;
}

const clipById = (id: string) =>
  useTimelineStore.getState().clips.find((clip) => clip.id === id)!;

const renderPanel = (group: ReturnType<typeof seed>) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <ClipGroupPanel clip={group} onUngroup={() => undefined} />
    </ThemeProvider>
  );

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(
    "nodetool.timeline.inspector.fold",
    JSON.stringify({ timing: true })
  );
});

describe("ClipGroupPanel timing", () => {
  it("carries the children when the Start field moves the group", async () => {
    const user = userEvent.setup();
    renderPanel(seed());

    const start = screen.getByRole("textbox", { name: "Start timecode" });
    await user.clear(start);
    await user.type(start, "00:00:01:00{Enter}");

    expect(clipById("group_1").startMs).toBe(1000);
    expect(clipById("child_1").startMs).toBe(2000);
  });

  it("pulls the children inside the window when the Duration field shortens it", async () => {
    const user = userEvent.setup();
    renderPanel(seed());

    const duration = screen.getByRole("textbox", {
      name: "Duration in seconds"
    });
    await user.clear(duration);
    await user.type(duration, "2{Enter}");

    expect(clipById("group_1").durationMs).toBe(2000);
    const child = clipById("child_1");
    expect(child.startMs + child.durationMs).toBeLessThanOrEqual(2000);
  });

  it("disables the timing fields on a locked group", () => {
    renderPanel(seed(true));

    expect(
      screen.getByRole("textbox", { name: "Start timecode" })
    ).toBeDisabled();
    expect(
      screen.getByRole("textbox", { name: "Duration in seconds" })
    ).toBeDisabled();
  });
});
