import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { makeClip, makeTrack } from "@nodetool-ai/timeline";

import mockTheme from "../../../../__mocks__/themeMock";
import {
  getTimelineTemporal,
  TimelineProvider
} from "../../../../stores/timeline/TimelineInstance";
import { useTimelineStore } from "../../../../stores/timeline/TimelineStore";
import { useTimelineUIStore } from "../../../../stores/timeline/TimelineUIStore";
import { TimelineInspector } from "../TimelineInspector";

const renderInspector = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <MemoryRouter>
          <TimelineProvider>
            <TimelineInspector />
          </TimelineProvider>
        </MemoryRouter>
      </QueryClientProvider>
    </ThemeProvider>
  );

function seedLinkedPair() {
  const videoTrack = makeTrack({ type: "video", name: "V1" });
  const audioTrack = makeTrack({ type: "audio", name: "A1" });
  const video = makeClip({
    trackId: videoTrack.id,
    mediaType: "video",
    sourceType: "imported",
    startMs: 1000,
    durationMs: 4000,
    inPointMs: 0,
    outPointMs: 4000,
    linkId: "linked-av"
  });
  const audio = makeClip({
    trackId: audioTrack.id,
    mediaType: "audio",
    sourceType: "imported",
    startMs: 1000,
    durationMs: 4000,
    inPointMs: 0,
    outPointMs: 4000,
    linkId: "linked-av"
  });
  act(() => {
    useTimelineStore.setState({
      tracks: [videoTrack, audioTrack],
      clips: [video, audio],
      fps: 30,
      linkedSelection: true
    });
    useTimelineUIStore.getState().setSelection([video.id]);
    getTimelineTemporal().clear();
  });
  return { video, audio };
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(
    "nodetool.timeline.inspector.fold",
    JSON.stringify({ timing: true })
  );
});

describe("TimelineInspector speed", () => {
  it("retimes a linked pair, keeping both source windows", async () => {
    const user = userEvent.setup();
    renderInspector();
    const { video, audio } = seedLinkedPair();

    const speed = screen.getByRole("textbox", { name: "Playback speed" });
    await user.clear(speed);
    await user.type(speed, "2{Enter}");

    for (const id of [video.id, audio.id]) {
      const clip = useTimelineStore
        .getState()
        .clips.find((item) => item.id === id);
      expect(clip?.speedMultiplier).toBe(2);
      expect(clip?.durationMs).toBe(2000);
      expect(clip?.outPointMs).toBe(4000);
    }
  });

  it("disables the speed field on a locked clip", () => {
    renderInspector();
    const { video } = seedLinkedPair();
    act(() => useTimelineStore.getState().setClipLocked(video.id, true));

    expect(
      screen.getByRole("textbox", { name: "Playback speed" })
    ).toBeDisabled();
  });
});
