/**
 * The Premiere keys the web table took over from the native editor: sequence
 * and selection navigation, clip stepping, gaps, the bounded plays, extend
 * edit, slide, markers, track heights, clip volume and Clear In / Out.
 * Store state is seeded after render so `getState()` routes to the mounted
 * provider's instance.
 */
import { describe, it, expect, jest, afterEach } from "@jest/globals";
import { act, fireEvent, render } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { makeClip, makeTrack } from "@nodetool-ai/timeline";

import mockTheme from "../../../../__mocks__/themeMock";
import { TracksRegion } from "../TracksRegion";
import { TimelineProvider } from "../../../../stores/timeline/TimelineInstance";
import { useTimelineStore } from "../../../../stores/timeline/TimelineStore";
import { useTimelineUIStore, MAX_VERTICAL_ZOOM } from "../../../../stores/timeline/TimelineUIStore";
import { useSettingsStore } from "../../../../stores/SettingsStore";
import { useTimelinePlaybackStore } from "../../../../stores/timeline/TimelinePlaybackStore";

jest.mock("../../../../lib/rest-fetch", () => ({
  restFetch: jest.fn()
}));

afterEach(() => {
  act(() => useTimelinePlaybackStore.getState().pause());
});

const setup = (): void => {
  render(
    <ThemeProvider theme={mockTheme}>
      <TimelineProvider>
        <TracksRegion heightPx={400} />
      </TimelineProvider>
    </ThemeProvider>
  );
  act(() => {
    useSettingsStore.getState().updateSettings({ timelineKeyboardPreset: "premiere" });
    useTimelineStore.getState().reset();
    useTimelineStore.setState({
      tracks: [
        makeTrack({ id: "t1", type: "video", name: "V1", index: 0 }),
        makeTrack({ id: "t2", type: "audio", name: "A1", index: 1 })
      ]
    });
    useTimelineStore.getState().addClips([
      makeClip({ id: "a", trackId: "t1", name: "a", startMs: 0, durationMs: 1000 }),
      makeClip({ id: "b", trackId: "t1", name: "b", startMs: 1000, durationMs: 1000 }),
      makeClip({ id: "c", trackId: "t1", name: "c", startMs: 5000, durationMs: 1000 }),
      makeClip({ id: "s", trackId: "t2", name: "s", mediaType: "audio", startMs: 500, durationMs: 1000 })
    ]);
    useTimelineUIStore.getState().setSelection([]);
    useTimelinePlaybackStore.getState().clearRange();
    useTimelinePlaybackStore.getState().seek(0);
  });
};

const press = (init: Partial<KeyboardEventInit> & { key: string }): void => {
  act(() => {
    fireEvent.keyDown(window, init);
  });
};
const seekTo = (ms: number): void => {
  act(() => useTimelinePlaybackStore.getState().seek(ms));
};
const select = (...ids: string[]): void => {
  act(() => useTimelineUIStore.getState().setSelection(ids));
};
const playhead = (): number => useTimelinePlaybackStore.getState().getTimeMs();
const clip = (id: string) => useTimelineStore.getState().clips.find((c) => c.id === id)!;

describe("Premiere keys taken over from the native editor", () => {
  it("Home and End go to the sequence ends, Shift+Home and Shift+End to the selection's", () => {
    setup();
    press({ key: "End" });
    expect(playhead()).toBe(6000);
    press({ key: "Home" });
    expect(playhead()).toBe(0);
    select("b");
    press({ key: "End", shiftKey: true });
    // The last frame of the selection, not the frame after it.
    expect(playhead()).toBeLessThan(2000);
    expect(playhead()).toBeGreaterThan(1900);
    press({ key: "Home", shiftKey: true });
    expect(playhead()).toBe(1000);
  });

  it("Shift+Down stops at cuts on every track, not only the targeted ones", () => {
    setup();
    act(() => useTimelineStore.setState({ untargetedTrackIds: new Set(["t2"]) }));
    press({ key: "ArrowDown", shiftKey: true });
    expect(playhead()).toBe(500);
  });

  it("Ctrl+Down selects the next clip, and the clips at the playhead when nothing is selected", () => {
    setup();
    seekTo(5500);
    press({ key: "ArrowDown", ctrlKey: true });
    expect([...useTimelineUIStore.getState().selectedClipIds]).toEqual(["c"]);
    select("a");
    press({ key: "ArrowDown", ctrlKey: true });
    expect([...useTimelineUIStore.getState().selectedClipIds]).toEqual(["b"]);
    press({ key: "ArrowUp", ctrlKey: true });
    expect([...useTimelineUIStore.getState().selectedClipIds]).toEqual(["a"]);
  });

  it("Shift+; and Alt+; go to the gaps no track covers", () => {
    setup();
    press({ key: ":", shiftKey: true, code: "Semicolon" });
    expect(playhead()).toBe(2000);
    seekTo(5500);
    press({ key: ";", altKey: true, code: "Semicolon" });
    expect(playhead()).toBe(2000);
  });

  it("Shift+K plays around the playhead and comes back to it", () => {
    setup();
    seekTo(4000);
    press({ key: "K", shiftKey: true });
    const playback = useTimelinePlaybackStore.getState();
    expect(playback.isPlaying).toBe(true);
    expect(playback.getTimeMs()).toBe(1000);
    expect(playback.playingSpan).toEqual({ endMs: 6000, returnToMs: 4000 });
  });

  it("Ctrl+Space plays from the playhead to the out point", () => {
    setup();
    act(() => useTimelinePlaybackStore.getState().setRangeOut(3000));
    seekTo(1000);
    press({ key: " ", ctrlKey: true });
    expect(useTimelinePlaybackStore.getState().playingSpan).toEqual({ endMs: 3000, returnToMs: null });
  });

  it("Shift+W and Shift+Q move the nearest edit on each targeted track to the playhead", () => {
    setup();
    act(() => useTimelineStore.setState({
      clips: useTimelineStore.getState().clips.map((c) => (c.id === "b" ? { ...c, inPointMs: 500 } : c))
    }));
    seekTo(700);
    press({ key: "W", shiftKey: true });
    // V1 rolls the cut between a and b. A1 trims the end of s, which has a gap after it.
    expect([clip("a").durationMs, clip("b").startMs, clip("b").durationMs]).toEqual([700, 700, 1300]);
    expect(clip("s").durationMs).toBe(200);
    seekTo(1700);
    act(() => useTimelineStore.setState({ untargetedTrackIds: new Set(["t2"]) }));
    press({ key: "Q", shiftKey: true });
    expect([clip("a").durationMs, clip("b").startMs]).toEqual([1700, 1700]);
    expect(clip("s").durationMs).toBe(200);
  });

  it("/ marks the selection, Alt+I and Alt+O clear each end", () => {
    setup();
    select("a", "b");
    press({ key: "/" });
    let playback = useTimelinePlaybackStore.getState();
    expect([playback.rangeInMs, playback.rangeOutMs]).toEqual([0, 2000]);
    press({ key: "i", altKey: true, code: "KeyI" });
    playback = useTimelinePlaybackStore.getState();
    expect([playback.rangeInMs, playback.rangeOutMs]).toEqual([null, 2000]);
    press({ key: "o", altKey: true, code: "KeyO" });
    expect(useTimelinePlaybackStore.getState().rangeOutMs).toBeNull();
  });

  it("Ctrl+M marks in to out, Alt+Shift+M adds a range marker and Ctrl+Alt+M clears them", () => {
    setup();
    act(() => {
      useTimelinePlaybackStore.getState().setRangeIn(1000);
      useTimelinePlaybackStore.getState().setRangeOut(3000);
    });
    press({ key: "m", ctrlKey: true, code: "KeyM" });
    seekTo(4000);
    press({ key: "M", altKey: true, shiftKey: true, code: "KeyM" });
    const markers = useTimelineStore.getState().markers;
    expect(markers.map((m) => [m.timeMs, m.durationMs])).toEqual([[1000, 2000], [4000, 1000]]);
    press({ key: "m", ctrlKey: true, altKey: true, code: "KeyM" });
    expect(useTimelineStore.getState().markers).toEqual([]);
  });

  it("Shift+= expands every track and pressing it again restores the height", () => {
    setup();
    const before = useTimelineUIStore.getState().verticalZoom;
    press({ key: "+", shiftKey: true, code: "Equal" });
    expect(useTimelineUIStore.getState().verticalZoom).toBe(MAX_VERTICAL_ZOOM);
    press({ key: "+", shiftKey: true, code: "Equal" });
    expect(useTimelineUIStore.getState().verticalZoom).toBe(before);
  });

  it("Alt+= makes only the audio tracks taller", () => {
    setup();
    press({ key: "=", altKey: true, code: "Equal" });
    const tracks = useTimelineStore.getState().tracks;
    expect(tracks.find((t) => t.id === "t2")?.heightPx).toBe(76);
    expect(tracks.find((t) => t.id === "t1")?.heightPx).toBeUndefined();
  });

  it("] and Shift+] raise the clip volume by 1 and 6 dB", () => {
    setup();
    select("s");
    const before = clip("s").volumeDb ?? 0;
    press({ key: "]", code: "BracketRight" });
    expect(clip("s").volumeDb).toBe(before + 1);
    press({ key: "}", shiftKey: true, code: "BracketRight" });
    expect(clip("s").volumeDb).toBe(before + 7);
  });

  it("Alt+. slides the selected clip one frame on, trimming its neighbours", () => {
    setup();
    select("b");
    press({ key: ".", altKey: true, code: "Period" });
    expect(clip("b").startMs).toBeGreaterThan(1000);
    expect(clip("a").durationMs).toBe(clip("b").startMs);
  });
});
