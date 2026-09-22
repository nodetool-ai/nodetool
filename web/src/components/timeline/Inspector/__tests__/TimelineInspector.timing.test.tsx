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

describe("TimelineInspector timing", () => {
  it("moves a linked pair through the Start field and restores both on undo", async () => {
    const user = userEvent.setup();
    renderInspector();
    const { video, audio } = seedLinkedPair();

    const start = screen.getByRole("textbox", { name: "Start timecode" });
    await user.clear(start);
    await user.type(start, "00:00:02:00{Enter}");

    expect(
      useTimelineStore.getState().clips.find((clip) => clip.id === video.id)
        ?.startMs
    ).toBe(2000);
    expect(
      useTimelineStore.getState().clips.find((clip) => clip.id === audio.id)
        ?.startMs
    ).toBe(2000);

    act(() => getTimelineTemporal().undo());
    expect(
      useTimelineStore.getState().clips.find((clip) => clip.id === video.id)
        ?.startMs
    ).toBe(1000);
    expect(
      useTimelineStore.getState().clips.find((clip) => clip.id === audio.id)
        ?.startMs
    ).toBe(1000);

    act(() => getTimelineTemporal().redo());
    expect(
      useTimelineStore.getState().clips.find((clip) => clip.id === video.id)
        ?.startMs
    ).toBe(2000);
    expect(
      useTimelineStore.getState().clips.find((clip) => clip.id === audio.id)
        ?.startMs
    ).toBe(2000);
  });

  it("trims a linked pair through the Duration field with matching source windows", async () => {
    const user = userEvent.setup();
    renderInspector();
    const { video, audio } = seedLinkedPair();

    const duration = screen.getByRole("textbox", {
      name: "Duration in seconds"
    });
    await user.clear(duration);
    await user.type(duration, "5{Enter}");

    for (const id of [video.id, audio.id]) {
      const clip = useTimelineStore
        .getState()
        .clips.find((item) => item.id === id);
      expect(clip?.durationMs).toBe(5000);
      expect(clip?.outPointMs).toBe(5000);
    }

    act(() => getTimelineTemporal().undo());
    for (const id of [video.id, audio.id]) {
      const clip = useTimelineStore
        .getState()
        .clips.find((item) => item.id === id);
      expect(clip?.durationMs).toBe(4000);
      expect(clip?.outPointMs).toBe(4000);
    }
  });
});
