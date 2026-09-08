/**
 * TracksRegion keyboard QoL shortcuts:
 *   Ctrl/Cmd+A  → select every clip
 *   Escape      → clear selection + return to the select tool
 *   + / -       → zoom in / out
 *
 * The shortcuts are registered at the window level, so the events are fired on
 * `window` rather than a specific element. Store state is seeded AFTER render
 * so `getState()` routes to the mounted provider's instance (not the default).
 */
import { describe, it, expect, jest, afterEach } from "@jest/globals";
import { act, fireEvent, render } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { makeClip } from "@nodetool-ai/timeline";

import mockTheme from "../../../../__mocks__/themeMock";
import { TracksRegion } from "../TracksRegion";
import { TimelineProvider, createTimelineInstance } from "../../../../stores/timeline/TimelineInstance";
import { useTimelineStore } from "../../../../stores/timeline/TimelineStore";
import { useTimelineUIStore } from "../../../../stores/timeline/TimelineUIStore";

import { useSettingsStore } from "../../../../stores/SettingsStore";
import { useTimelinePlaybackStore } from "../../../../stores/timeline/TimelinePlaybackStore";

afterEach(() => {
  useSettingsStore.getState().updateSettings({ timelineKeyboardPreset: "nodetool" });
});

jest.mock("../../../../lib/rest-fetch", () => ({
  restFetch: jest.fn()
}));

/** Render the region, then seed three clips and a clean UI baseline into the
 *  mounted instance's stores. */
const setup = () => {
  const result = render(
    <ThemeProvider theme={mockTheme}>
      <TimelineProvider>
        <TracksRegion heightPx={400} />
      </TimelineProvider>
    </ThemeProvider>
  );
  act(() => {
    useTimelineStore.getState().reset();
    useTimelineStore.getState().addClips([
      makeClip({ trackId: "t1", name: "a", startMs: 0, durationMs: 1000 }),
      makeClip({ trackId: "t1", name: "b", startMs: 2000, durationMs: 1000 }),
      makeClip({ trackId: "t1", name: "c", startMs: 5000, durationMs: 1000 })
    ]);
    useTimelineUIStore.getState().setSelection([]);
    useTimelineUIStore.getState().setActiveTool("select");
    useTimelineUIStore.getState().setZoom(10);
  });
  return result;
};

describe("TracksRegion keyboard shortcuts", () => {
  it("Ctrl+A selects every clip", () => {
    setup();
    act(() => {
      fireEvent.keyDown(window, { key: "a", ctrlKey: true });
    });
    expect(useTimelineUIStore.getState().selectedClipIds.size).toBe(3);
  });

  it("Escape clears the selection", () => {
    setup();
    act(() => {
      fireEvent.keyDown(window, { key: "a", ctrlKey: true });
    });
    expect(useTimelineUIStore.getState().selectedClipIds.size).toBe(3);
    act(() => {
      fireEvent.keyDown(window, { key: "Escape" });
    });
    expect(useTimelineUIStore.getState().selectedClipIds.size).toBe(0);
  });

  it("Escape returns to the select tool", () => {
    setup();
    act(() => {
      useTimelineUIStore.getState().setActiveTool("cut");
      fireEvent.keyDown(window, { key: "Escape" });
    });
    expect(useTimelineUIStore.getState().activeTool).toBe("select");
  });

  it("+ zooms in (msPerPx decreases) and - zooms out", () => {
    setup();
    const start = useTimelineUIStore.getState().msPerPx;
    act(() => {
      fireEvent.keyDown(window, { key: "+" });
    });
    const zoomedIn = useTimelineUIStore.getState().msPerPx;
    expect(zoomedIn).toBeLessThan(start);
    act(() => {
      fireEvent.keyDown(window, { key: "-" });
    });
    expect(useTimelineUIStore.getState().msPerPx).toBeGreaterThan(zoomedIn);
  });

  it("? opens the keyboard-shortcut reference", () => {
    const { queryByText, getByText } = setup();
    expect(queryByText("Keyboard shortcuts")).toBeNull();
    act(() => {
      fireEvent.keyDown(window, { key: "?" });
    });
    expect(getByText("Keyboard shortcuts")).toBeTruthy();
  });

  it("? opens the reference even on AltGr layouts (Ctrl+Alt produce ?)", () => {
    const { getByText } = setup();
    act(() => {
      fireEvent.keyDown(window, { key: "?", ctrlKey: true, altKey: true });
    });
    expect(getByText("Keyboard shortcuts")).toBeTruthy();
  });

  it("? ignores auto-repeat so a held key doesn't flip the dialog", () => {
    const { getByText } = setup();
    act(() => {
      fireEvent.keyDown(window, { key: "?" });
    });
    expect(getByText("Keyboard shortcuts")).toBeTruthy();
    // A held key streams repeat events; none should toggle the dialog closed.
    act(() => {
      fireEvent.keyDown(window, { key: "?", repeat: true });
      fireEvent.keyDown(window, { key: "?", repeat: true });
    });
    expect(getByText("Keyboard shortcuts")).toBeTruthy();
  });

  it("does not open the shortcut reference while typing in an input", () => {
    const { container, queryByText } = setup();
    const input = document.createElement("input");
    container.appendChild(input);
    input.focus();
    act(() => {
      fireEvent.keyDown(input, { key: "?" });
    });
    expect(queryByText("Keyboard shortcuts")).toBeNull();
  });

  it("does not fire shortcuts while typing in an input", () => {
    const { container } = setup();
    const input = document.createElement("input");
    container.appendChild(input);
    input.focus();
    act(() => {
      fireEvent.keyDown(input, { key: "a", ctrlKey: true });
    });
    expect(useTimelineUIStore.getState().selectedClipIds.size).toBe(0);
  });
});


describe.each(["premiere", "fcp"] as const)("%s frame stepping", (preset) => {
  it("steps the playhead without moving the selected clip", () => {
    setup();
    const clip = useTimelineStore.getState().clips[0];
    act(() => {
      useSettingsStore.getState().updateSettings({ timelineKeyboardPreset: preset });
      useTimelineUIStore.getState().setSelection([clip.id]);
      useTimelinePlaybackStore.getState().seek(2000);
      fireEvent.keyDown(window, { key: "ArrowRight" });
    });
    const frameMs = 1000 / useTimelineStore.getState().fps;
    expect(useTimelinePlaybackStore.getState().currentTimeMs).toBeCloseTo(2000 + frameMs);
    expect(useTimelineStore.getState().clips[0].startMs).toBe(0);
    act(() => fireEvent.keyDown(window, { key: "ArrowLeft" }));
    expect(useTimelinePlaybackStore.getState().currentTimeMs).toBeCloseTo(2000);
  });

  it("clamps frame stepping to the sequence content", () => {
    setup();
    act(() => {
      useSettingsStore.getState().updateSettings({ timelineKeyboardPreset: preset });
      useTimelinePlaybackStore.getState().seek(0);
      fireEvent.keyDown(window, { key: "ArrowLeft" });
    });
    expect(useTimelinePlaybackStore.getState().currentTimeMs).toBe(0);
    act(() => {
      useTimelinePlaybackStore.getState().seek(6000);
      fireEvent.keyDown(window, { key: "ArrowRight" });
    });
    expect(useTimelinePlaybackStore.getState().currentTimeMs).toBe(6000);
  });
});


it("routes editing shortcuts only to the active timeline", () => {
  const hidden = createTimelineInstance();
  const visible = createTimelineInstance();
  for (const instance of [hidden, visible]) {
    const clip = makeClip({ trackId: "t1", name: "clip", startMs: 0, durationMs: 1000 });
    instance.doc.getState().addClips([clip]);
    instance.ui.getState().setSelection([clip.id]);
  }
  const tree = (firstActive: boolean) => (
    <ThemeProvider theme={mockTheme}>
      <TimelineProvider instance={hidden} active={firstActive}>
        <TracksRegion heightPx={400} />
      </TimelineProvider>
      <TimelineProvider instance={visible} active={!firstActive}>
        <TracksRegion heightPx={400} />
      </TimelineProvider>
    </ThemeProvider>
  );
  const { rerender } = render(tree(false));
  act(() => fireEvent.keyDown(window, { key: "Delete" }));
  expect(hidden.doc.getState().clips).toHaveLength(1);
  expect(visible.doc.getState().clips).toHaveLength(0);
  rerender(tree(true));
  act(() => fireEvent.keyDown(window, { key: "Delete" }));
  expect(hidden.doc.getState().clips).toHaveLength(0);
});
