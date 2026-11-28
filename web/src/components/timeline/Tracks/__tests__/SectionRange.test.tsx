import { act, createEvent, fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { makeClip } from "@nodetool-ai/timeline";

import mockTheme from "../../../../__mocks__/themeMock";
import { TimeRuler } from "../TimeRuler";
import { TimelineProvider } from "../../../../stores/timeline/TimelineInstance";
import { useTimelineStore } from "../../../../stores/timeline/TimelineStore";
import { useTimelineUIStore } from "../../../../stores/timeline/TimelineUIStore";
import { useTimelinePlaybackStore } from "../../../../stores/timeline/TimelinePlaybackStore";
import { getTimelineTemporal } from "../../../../stores/timeline/TimelineInstance";
import {
  copyRange,
  hasSectionClipboard,
  pasteAtPlayhead,
  splitAtRangeEdges
} from "../sectionRange";

/** jsdom's pointer events drop clientX/buttons, so set them on the event. */
const pointer = (
  type: "pointerDown" | "pointerMove" | "pointerUp",
  el: Element,
  props: { clientX?: number; buttons?: number; button?: number; shiftKey?: boolean }
) => {
  const event = createEvent[type](el, { pointerId: 1 });
  for (const [k, v] of Object.entries(props)) {
    Object.defineProperty(event, k, { value: v });
  }
  fireEvent(el, event);
};

const applyOp = jest.fn().mockResolvedValue({});
jest.mock("../../timelineAgentBridge", () => ({
  ...jest.requireActual("../../timelineAgentBridge"),
  getTimelineAgentHandler: () => ({ applyOp })
}));

describe("range selection (CE4, D48)", () => {
  it("Shift+drag in the ruler picks a range and a plain drag does not", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <TimelineProvider>
          <TimeRuler totalWidthPx={1000} />
        </TimelineProvider>
      </ThemeProvider>
    );
    const canvas = document.querySelector("canvas")!;
    canvas.setPointerCapture = jest.fn();
    const msPerPx = useTimelineUIStore.getState().msPerPx;
    act(() => {
      pointer("pointerDown", canvas, { button: 0, clientX: 100, shiftKey: true });
      pointer("pointerMove", canvas, { buttons: 1, clientX: 300 });
      pointer("pointerUp", canvas, {});
    });
    const range = useTimelineUIStore.getState().sectionRange;
    expect(range).not.toBeNull();
    expect(range!.fromMs).toBeCloseTo(100 * msPerPx);
    expect(range!.toMs).toBeCloseTo(300 * msPerPx);
    act(() => {
      useTimelineUIStore.getState().setSectionRange(null);
      pointer("pointerDown", canvas, { button: 0, clientX: 100 });
      pointer("pointerMove", canvas, { buttons: 1, clientX: 300 });
      pointer("pointerUp", canvas, {});
    });
    expect(useTimelineUIStore.getState().sectionRange).toBeNull();
    expect(screen.queryByTestId("section-range-error")).not.toBeInTheDocument();
  });

  it("copies the clips of the range and pastes them with one paste_range op", async () => {
    applyOp.mockClear();
    useTimelineStore.setState({ sequenceId: "seq" });
    const store = useTimelineStore.getState();
    store.addTrack("audio", "Audio 1");
    const trackId = useTimelineStore.getState().tracks[0]!.id;
    useTimelineStore.getState().addClips([
      makeClip({
        id: "a",
        trackId,
        name: "a",
        mediaType: "audio",
        startMs: 1000,
        durationMs: 2000
      })
    ]);
    await copyRange({ fromMs: 0, toMs: 4000 });
    expect(applyOp).not.toHaveBeenCalled();
    act(() => useTimelinePlaybackStore.getState().seek(10000));
    await pasteAtPlayhead();
    expect(applyOp).toHaveBeenCalledTimes(1);
    const op = applyOp.mock.calls[0]![0];
    expect(op).toEqual(
      expect.objectContaining({ op: "paste_range", atMs: 10000, mode: "insert" })
    );
    expect(op.content.lengthMs).toBe(4000);
    expect(op.content.clips).toHaveLength(1);
    expect(op.content.clips[0].startMs).toBe(1000);
  });

  it("copies from a locked track, because Copy changes nothing", async () => {
    applyOp.mockClear();
    useTimelineStore.setState({ sequenceId: "seq" });
    const trackId = useTimelineStore.getState().tracks[0]!.id;
    useTimelineStore.getState().setTrackLocked(trackId, true);
    await expect(copyRange({ fromMs: 0, toMs: 4000 })).resolves.toBeUndefined();
    expect(hasSectionClipboard()).toBe(true);
  });

  it("splits at both range edges in one undo step", async () => {
    useTimelineStore.setState({ sequenceId: "seq", clips: [], tracks: [] });
    const store = useTimelineStore.getState();
    store.addTrack("audio", "Audio 1");
    store.addTrack("audio", "Audio 2");
    const [t1, t2] = useTimelineStore.getState().tracks.map((t) => t.id);
    useTimelineStore.getState().addClips([
      makeClip({ id: "x", trackId: t1!, name: "x", mediaType: "audio", startMs: 0, durationMs: 5000 }),
      makeClip({ id: "y", trackId: t2!, name: "y", mediaType: "audio", startMs: 0, durationMs: 5000 })
    ]);
    getTimelineTemporal().clear();
    await splitAtRangeEdges({ fromMs: 1000, toMs: 3000 });
    expect(useTimelineStore.getState().clips).toHaveLength(6);
    act(() => getTimelineTemporal().undo());
    expect(useTimelineStore.getState().clips).toHaveLength(2);
  });

  it("keeps Paste in the ruler menu after the range is cleared (F25)", async () => {
    act(() => useTimelineUIStore.getState().setSectionRange(null));
    expect(hasSectionClipboard()).toBe(true);
    render(
      <ThemeProvider theme={mockTheme}>
        <TimelineProvider>
          <TimeRuler totalWidthPx={1000} />
        </TimelineProvider>
      </ThemeProvider>
    );
    const canvas = document.querySelector("canvas")!;
    fireEvent.contextMenu(canvas);
    expect(await screen.findByText(/rangeMenu\.paste|Paste/)).toBeTruthy();
  });
});
