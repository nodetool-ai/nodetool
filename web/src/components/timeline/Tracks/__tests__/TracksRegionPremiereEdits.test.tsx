/**
 * The Premiere Pro keyboard edits under the Premiere layout: the tool keys,
 * D, Shift+E, X, Shift+I/O, Q and W, Lift and Extract, Ctrl+L and Shift+arrow.
 * Store state is seeded after render so `getState()` routes to the mounted
 * provider's instance.
 */
import { describe, it, expect, jest, afterEach } from "@jest/globals";
import { act, fireEvent, render } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { makeClip } from "@nodetool-ai/timeline";

import mockTheme from "../../../../__mocks__/themeMock";
import { TracksRegion } from "../TracksRegion";
import { TimelineProvider } from "../../../../stores/timeline/TimelineInstance";
import { useTimelineStore } from "../../../../stores/timeline/TimelineStore";
import { useTimelineUIStore } from "../../../../stores/timeline/TimelineUIStore";
import { useSettingsStore } from "../../../../stores/SettingsStore";
import { useTimelinePlaybackStore } from "../../../../stores/timeline/TimelinePlaybackStore";

jest.mock("../../../../lib/rest-fetch", () => ({
  restFetch: jest.fn()
}));

afterEach(() => {
  useSettingsStore.getState().updateSettings({ timelineKeyboardPreset: "nodetool" });
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
    useTimelineStore.getState().addClips([
      makeClip({ id: "a", trackId: "t1", name: "a", startMs: 0, durationMs: 1000 }),
      makeClip({ id: "b", trackId: "t1", name: "b", startMs: 2000, durationMs: 1000 }),
      makeClip({ id: "c", trackId: "t1", name: "c", startMs: 5000, durationMs: 1000 })
    ]);
    useTimelineUIStore.getState().setSelection([]);
    useTimelineUIStore.getState().setActiveTool("select");
    useTimelinePlaybackStore.getState().clearRange();
    useTimelinePlaybackStore.getState().seek(0);
  });
};

const press = (init: Partial<KeyboardEventInit> & { key: string }): void => {
  act(() => {
    fireEvent.keyDown(window, init);
  });
};

const spans = (): Array<[string, number, number]> =>
  useTimelineStore
    .getState()
    .clips.map((c) => [c.name, c.startMs, c.durationMs] as [string, number, number])
    .sort((x, y) => x[1] - y[1]);

const seekTo = (ms: number): void => {
  act(() => useTimelinePlaybackStore.getState().seek(ms));
};

describe("Premiere layout edits", () => {
  it.each([
    ["v", "select"],
    ["a", "trackSelect"],
    ["b", "ripple"],
    ["n", "roll"],
    ["r", "rateStretch"],
    ["c", "cut"],
    ["y", "slip"]
  ])("%s picks the %s tool", (key, tool) => {
    setup();
    press({ key });
    expect(useTimelineUIStore.getState().activeTool).toBe(tool);
  });

  it("D selects the clip under the playhead", () => {
    setup();
    seekTo(2500);
    press({ key: "d" });
    expect([...useTimelineUIStore.getState().selectedClipIds]).toEqual(["b"]);
  });

  it("Shift+E disables the selection and enables it again", () => {
    setup();
    act(() => useTimelineUIStore.getState().setSelection(["b"]));
    press({ key: "E", shiftKey: true });
    const b = () => useTimelineStore.getState().clips.find((c) => c.id === "b");
    expect(b()?.hidden).toBe(true);
    expect(b()?.muted).toBe(true);
    press({ key: "E", shiftKey: true });
    expect(b()?.hidden).toBe(false);
  });

  it("X marks the clip under the playhead and Shift+I / Shift+O go there", () => {
    setup();
    seekTo(2500);
    press({ key: "x" });
    const playback = useTimelinePlaybackStore.getState();
    expect([playback.rangeInMs, playback.rangeOutMs]).toEqual([2000, 3000]);
    press({ key: "I", shiftKey: true });
    expect(useTimelinePlaybackStore.getState().currentTimeMs).toBe(2000);
    press({ key: "O", shiftKey: true });
    expect(useTimelinePlaybackStore.getState().currentTimeMs).toBe(3000);
  });

  it("W ripple-trims to the next edit and pulls the rest left", () => {
    setup();
    seekTo(2500);
    press({ key: "w" });
    expect(spans()).toEqual([
      ["a", 0, 1000],
      ["b", 2000, 500],
      ["c", 4500, 1000]
    ]);
  });

  it("Q ripple-trims to the previous edit and parks the playhead there", () => {
    setup();
    seekTo(2500);
    press({ key: "q" });
    expect(spans()).toEqual([
      ["a", 0, 1000],
      ["b", 2000, 500],
      ["c", 4500, 1000]
    ]);
    expect(useTimelinePlaybackStore.getState().currentTimeMs).toBe(2000);
  });

  it("; lifts the in to out range and leaves the gap", () => {
    setup();
    act(() => {
      useTimelinePlaybackStore.getState().setRangeIn(500);
      useTimelinePlaybackStore.getState().setRangeOut(2500);
    });
    press({ key: ";" });
    expect(spans()).toEqual([
      ["a", 0, 500],
      ["b", 2500, 500],
      ["c", 5000, 1000]
    ]);
    expect(useTimelinePlaybackStore.getState().rangeInMs).toBeNull();
  });

  it("' extracts the in to out range and closes the gap", () => {
    setup();
    act(() => {
      useTimelinePlaybackStore.getState().setRangeIn(500);
      useTimelinePlaybackStore.getState().setRangeOut(2500);
    });
    press({ key: "'" });
    expect(spans()).toEqual([
      ["a", 0, 500],
      ["b", 500, 500],
      ["c", 3000, 1000]
    ]);
    expect(useTimelinePlaybackStore.getState().currentTimeMs).toBe(500);
  });

  it("Ctrl+L links the selection and unlinks it again", () => {
    setup();
    act(() => useTimelineUIStore.getState().setSelection(["a", "b"]));
    press({ key: "l", ctrlKey: true });
    const links = () =>
      useTimelineStore.getState().clips.map((c) => c.linkId);
    const [la, lb, lc] = links();
    expect(la).toBeDefined();
    expect(la).toBe(lb);
    expect(lc).toBeUndefined();
    press({ key: "l", ctrlKey: true });
    expect(links().every((id) => id === undefined)).toBe(true);
  });

  it("Shift+→ steps five frames", () => {
    setup();
    seekTo(1000);
    press({ key: "ArrowRight", shiftKey: true });
    const frameMs = 1000 / useTimelineStore.getState().fps;
    expect(useTimelinePlaybackStore.getState().currentTimeMs).toBeCloseTo(
      Math.round(1000 / frameMs + 5) * frameMs
    );
  });
});
