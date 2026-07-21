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
import React from "react";
import { describe, it, expect, jest } from "@jest/globals";
import { act, fireEvent, render } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { makeClip } from "@nodetool-ai/timeline";

import mockTheme from "../../../../__mocks__/themeMock";
import { TracksRegion } from "../TracksRegion";
import { TimelineProvider } from "../../../../stores/timeline/TimelineInstance";
import { useTimelineStore } from "../../../../stores/timeline/TimelineStore";
import { useTimelineUIStore } from "../../../../stores/timeline/TimelineUIStore";

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
