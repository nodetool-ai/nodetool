/**
 * SQ43 round 7: dragging a Pattern Browser entry onto a MIDI lane creates a
 * pattern region at the drop time snapped to the grid, in one undo step. A
 * drop below the last track creates a MIDI track that holds the region.
 */

import React from "react";
import { act, createEvent, fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import { DEFAULT_MIDI_INSTRUMENT, DEFAULT_TEMPO, makeTrack } from "@nodetool-ai/timeline";

import mockTheme from "../../../../__mocks__/themeMock";
import { TracksRegion } from "../TracksRegion";
import { STEP_PATTERN_DRAG_TYPE } from "../../stepSequencer/StepPatternBrowser";
import { createTimelineInstance, TimelineProvider, type TimelineInstance } from "../../../../stores/timeline/TimelineInstance";
import { timelineTemporalOf } from "../../../../stores/timeline/TimelineStore";

jest.mock("../../../../hooks/timeline/useTimelineAgentBridge", () => ({
  ...jest.requireActual("../../../../hooks/timeline/useTimelineAgentBridge"),
  createBrowserStepPatternLibrary: () => ({ list: async () => [], save: async () => ({ id: "u1" }) })
}));

const PATTERN = "four-on-the-floor";

function patternDrag(): DataTransfer {
  const data: Record<string, string> = { [STEP_PATTERN_DRAG_TYPE]: PATTERN };
  return {
    types: [STEP_PATTERN_DRAG_TYPE],
    dropEffect: "none",
    effectAllowed: "all",
    getData: (k: string) => data[k] ?? "",
    setData: () => undefined
  } as unknown as DataTransfer;
}

function setup(): { instance: TimelineInstance; trackId: string } {
  const instance = createTimelineInstance();
  const track = makeTrack({ type: "midi", name: "Drums", instrument: DEFAULT_MIDI_INSTRUMENT });
  act(() => {
    instance.doc.setState({ tracks: [track], clips: [], tempo: { ...DEFAULT_TEMPO, bpm: 120 } });
    instance.ui.setState({ msPerPx: 10, snapEnabled: true, gridDivision: "bar" });
  });
  render(
    <ThemeProvider theme={mockTheme}>
      <TimelineProvider instance={instance}>
        <TracksRegion heightPx={400} />
      </TimelineProvider>
    </ThemeProvider>
  );
  return { instance, trackId: track.id };
}

/** jsdom drops `clientX` from drag event init, so set it on the event. */
function dropAt(el: HTMLElement, clientX: number): void {
  const event = createEvent.drop(el, { dataTransfer: patternDrag() });
  Object.defineProperty(event, "clientX", { value: clientX });
  fireEvent(el, event);
}

const undoDepth = (i: TimelineInstance): number => timelineTemporalOf(i.doc).pastStates.length;

describe("Pattern Browser drop on the tracks area (SQ43)", () => {
  it("creates a pattern region on the lane at the snapped drop time in one undo step", async () => {
    const { instance, trackId } = setup();
    const before = undoDepth(instance);
    const lane = screen.getByTestId(`track-lane-${trackId}`);
    fireEvent.dragOver(lane, { dataTransfer: patternDrag() });
    await act(async () => {
      dropAt(lane, 250);
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    const clips = instance.doc.getState().clips;
    expect(clips).toHaveLength(1);
    expect(clips[0]!.trackId).toBe(trackId);
    expect(clips[0]!.pattern?.rows.length).toBeGreaterThan(0);
    expect(clips[0]!.startMs).toBe(2000);
    expect(undoDepth(instance) - before).toBe(1);
  });

  it("creates a MIDI track with the region when dropped below the last track", async () => {
    const { instance } = setup();
    const before = undoDepth(instance);
    await act(async () => {
      dropAt(screen.getByTestId("tracks-drop-area"), 50);
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    const { tracks, clips } = instance.doc.getState();
    expect(tracks).toHaveLength(2);
    expect(tracks[1]!.type).toBe("midi");
    expect(clips).toHaveLength(1);
    expect(clips[0]!.trackId).toBe(tracks[1]!.id);
    expect(clips[0]!.pattern).toBeDefined();
    expect(Number.isFinite(clips[0]!.startMs)).toBe(true);
    expect(undoDepth(instance) - before).toBe(1);
  });

  describe("over existing regions, the Drag mode resolves the overlap", () => {
    const existing = (trackId: string) => ({
      id: "old",
      trackId,
      name: "Old",
      startMs: 1000,
      durationMs: 4000,
      inPointMs: 0,
      mediaType: "midi" as const,
      sourceType: "imported" as const,
      status: "generated" as const,
      locked: false,
      versions: [],
      midi: { notes: [] }
    });
    const dropOver = async (mode: "overwrite" | "insert" | "overlap") => {
      const { instance, trackId } = setup();
      act(() => {
        instance.doc.setState({ clips: [existing(trackId) as never] });
        instance.ui.setState({ dropMode: mode });
      });
      const before = undoDepth(instance);
      await act(async () => {
        dropAt(screen.getByTestId(`track-lane-${trackId}`), 250);
      });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });
      const clips = instance.doc.getState().clips;
      const added = clips.find((c) => c.pattern)!;
      return { clips, added, undo: undoDepth(instance) - before };
    };

    it("Overwrite trims the region under the dropped pattern, in one undo step", async () => {
      const { clips, added, undo } = await dropOver("overwrite");
      expect(added.startMs).toBe(2000);
      const left = clips.filter((c) => !c.pattern);
      expect(left.length).toBeGreaterThan(0);
      for (const c of left) {
        const overlaps = c.startMs < added.startMs + added.durationMs && c.startMs + c.durationMs > added.startMs;
        expect(overlaps).toBe(false);
      }
      expect(undo).toBe(1);
    });

    it("Insert moves the later part of the region after the dropped pattern", async () => {
      const { clips, added, undo } = await dropOver("insert");
      const after = clips.filter((c) => !c.pattern && c.startMs >= added.startMs);
      expect(after.length).toBeGreaterThan(0);
      expect(Math.min(...after.map((c) => c.startMs))).toBe(added.startMs + added.durationMs);
      expect(undo).toBe(1);
    });

    it("Overlap keeps both regions as they are", async () => {
      const { clips } = await dropOver("overlap");
      expect(clips.find((c) => c.id === "old")).toMatchObject({ startMs: 1000, durationMs: 4000 });
    });
  });
});
