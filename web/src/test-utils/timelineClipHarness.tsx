/**
 * Shared fixtures for clip-gesture suites that drive the real TrackLane/Clip
 * tree against the default timeline store instance.
 *
 * Each suite still declares its own `jest.mock` calls (they are hoisted per
 * test file); this module only holds the pure builders and pointer drivers.
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import type { TimelineClip, TimelineTrack } from "@nodetool-ai/timeline";
import mockTheme from "../__mocks__/themeMock";
import { installGlobal } from "./doubles";
import { TrackLane } from "../components/timeline/Tracks/TrackLane";
import { useTimelineStore } from "../stores/timeline/TimelineStore";
import { useTimelineUIStore } from "../stores/timeline/TimelineUIStore";
import { useTimelinePlaybackStore } from "../stores/timeline/TimelinePlaybackStore";

/** Polyfill PointerEvent for jsdom, which does not implement it. */
export function installPointerEvent(): void {
  if (typeof window !== "undefined" && !window.PointerEvent) {
    installGlobal(
      "PointerEvent",
      class PointerEvent extends MouseEvent {
        readonly pointerId: number;
        readonly pointerType: string;
        readonly isPrimary: boolean;

        constructor(
          type: string,
          params: PointerEventInit & MouseEventInit = {}
        ) {
          super(type, params);
          this.pointerId = params.pointerId ?? 0;
          this.pointerType = params.pointerType ?? "";
          this.isPrimary = params.isPrimary ?? false;
        }
      }
    );
  }
  // jsdom does not implement pointer capture.
  HTMLElement.prototype.setPointerCapture = jest.fn();
  HTMLElement.prototype.releasePointerCapture = jest.fn();
}

export const makeTrack = (
  id: string,
  index: number,
  locked = false
): TimelineTrack => ({
  id,
  name: `Video ${index + 1}`,
  type: "video",
  index,
  visible: true,
  locked
});

export const makeClip = (
  id: string,
  trackId: string,
  startMs: number,
  durationMs: number,
  overrides: Partial<TimelineClip> = {}
): TimelineClip => ({
  id,
  trackId,
  name: id,
  startMs,
  durationMs,
  mediaType: "video",
  sourceType: "imported",
  status: "draft",
  locked: false,
  versions: [],
  ...overrides
});

/** 10 ms per px: the 8 px snap threshold is 80 ms. */
export const MS_PER_PX = 10;

export const clipState = (id: string) => {
  const clip = useTimelineStore.getState().clips.find((c) => c.id === id);
  if (!clip) {
    throw new Error(`clip ${id} missing`);
  }
  return {
    trackId: clip.trackId,
    startMs: clip.startMs,
    durationMs: clip.durationMs
  };
};

export const seedTimeline = (
  tracks: TimelineTrack[],
  clips: TimelineClip[],
  durationMs = 12_000
): void => {
  useTimelineStore.setState({ tracks, clips, durationMs });
  useTimelineUIStore.setState({
    msPerPx: MS_PER_PX,
    scrollLeftPx: 0,
    activeTool: "select",
    selectedClipIds: new Set<string>(),
    rubberBand: null,
    snapGuideMs: null,
    gestureReadout: null
  });
  useTimelinePlaybackStore.setState({ currentTimeMs: 0 });
};

/**
 * Render every seeded track's lane. `wrap` lets a suite put the lanes inside
 * its own scroll container.
 */
export const renderLanes = (
  wrap: (lanes: React.ReactNode) => React.ReactNode = (lanes) => lanes
) => {
  const { tracks } = useTimelineStore.getState();
  return render(
    <ThemeProvider theme={mockTheme}>
      {wrap(
        <div data-timeline-lanes="true">
          {tracks.map((t) => (
            <TrackLane key={t.id} track={t} />
          ))}
        </div>
      )}
    </ThemeProvider>
  );
};

interface PointerOptions {
  altKey?: boolean;
}

/** Drag moves arrive through window listeners (the clip may re-parent). */
export const pressClip = (clipId: string, x: number) => {
  fireEvent.pointerDown(screen.getByTestId(`clip-${clipId}`), {
    button: 0,
    buttons: 1,
    clientX: x,
    clientY: 20,
    pointerId: 1
  });
};

export const moveClipPointer = (x: number, { altKey = false }: PointerOptions = {}) => {
  fireEvent.pointerMove(window, {
    buttons: 1,
    clientX: x,
    clientY: 20,
    pointerId: 1,
    altKey
  });
};

export const releaseClipPointer = () => {
  fireEvent.pointerUp(window, { pointerId: 1 });
};

export const dragClip = (
  clipId: string,
  fromX: number,
  toX: number,
  options: PointerOptions = {}
) => {
  pressClip(clipId, fromX);
  moveClipPointer(toX, options);
  releaseClipPointer();
};

/** Trim moves are React handlers on the handle itself. */
export const pressHandle = (
  clipId: string,
  edge: "start" | "end",
  x: number
) => {
  const el = screen.getByTestId(`clip-trim-${edge}-${clipId}`);
  fireEvent.pointerDown(el, { button: 0, buttons: 1, clientX: x, pointerId: 1 });
  return el;
};

export const moveHandle = (
  el: HTMLElement,
  x: number,
  { altKey = false }: PointerOptions = {}
) => {
  fireEvent.pointerMove(el, { buttons: 1, clientX: x, pointerId: 1, altKey });
};

export const releaseHandle = (el: HTMLElement) => {
  fireEvent.pointerUp(el, { pointerId: 1 });
};

export const dragHandle = (
  clipId: string,
  edge: "start" | "end",
  fromX: number,
  toX: number,
  options: PointerOptions = {}
) => {
  const el = pressHandle(clipId, edge, fromX);
  moveHandle(el, toX, options);
  releaseHandle(el);
};
