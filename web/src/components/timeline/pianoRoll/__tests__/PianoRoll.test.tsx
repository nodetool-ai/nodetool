/**
 * The piano roll's gestures, driven against a real timeline store instance.
 *
 * The geometry is pinned by the fixture rather than assumed: the grid measures
 * 768 × 240, the clip's window is 7680 ticks, so the opening frame is exactly
 * 0.1 px per tick with C5 (72) on the top row — which is what makes "click at
 * x = 100" assertable as "beat two".
 */

import React from "react";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import { DEFAULT_MIDI_INSTRUMENT, makeTrack } from "@nodetool-ai/timeline";
import type { MidiNote, TimelineClip } from "@nodetool-ai/timeline";

import mockTheme from "../../../../__mocks__/themeMock";
import {
  TimelineProvider,
  createTimelineInstance,
  type TimelineInstance
} from "../../../../stores/timeline/TimelineInstance";
import { timelineTemporalOf } from "../../../../stores/timeline/TimelineStore";
import { PianoRollPanel } from "../PianoRollPanel";

jest.mock("../../preview/audition", () => ({
  playAuditionNote: jest.fn(() => Promise.resolve()),
  AUDITION_NOTE_MS: 600,
  AUDITION_DEFAULT_PITCH: 60
}));

import { playAuditionNote } from "../../preview/audition";

const GRID_WIDTH_PX = 768;
const GRID_HEIGHT_PX = 240;

// jsdom lays nothing out, so the grid is given the size the assertions assume.
beforeAll(() => {
  HTMLElement.prototype.setPointerCapture = jest.fn();
  HTMLElement.prototype.releasePointerCapture = jest.fn();
  HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
    const isGrid = this.dataset?.testid === "piano-roll-grid";
    const width = isGrid ? GRID_WIDTH_PX : 0;
    const height = isGrid ? GRID_HEIGHT_PX : 0;
    return {
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: width,
      bottom: height,
      width,
      height,
      toJSON: () => ({})
    } as DOMRect;
  };
});

const CLIP_ID = "clip-midi";

const note = (
  id: string,
  pitch: number,
  startTick: number,
  durationTick = 480
): MidiNote => ({ id, pitch, velocity: 100, startTick, durationTick });

/** Three notes an octave apart in time, inside a 4-second window. */
const seedNotes = (): MidiNote[] => [
  note("n1", 60, 0),
  note("n2", 62, 960),
  note("n3", 64, 1920)
];

function seed(instance: TimelineInstance): void {
  const track = makeTrack({
    type: "midi",
    name: "Bass",
    instrument: DEFAULT_MIDI_INSTRUMENT
  });
  const clip: TimelineClip = {
    id: CLIP_ID,
    trackId: track.id,
    name: "Riff",
    startMs: 0,
    durationMs: 4000,
    inPointMs: 0,
    mediaType: "midi",
    sourceType: "imported",
    status: "generated",
    locked: false,
    versions: [],
    notes: seedNotes()
  };
  act(() => {
    instance.doc.setState({ tracks: [track], clips: [clip] });
    instance.ui.getState().openPianoRoll(CLIP_ID);
  });
}

const notesOf = (instance: TimelineInstance): MidiNote[] =>
  instance.doc.getState().clips.find((c) => c.id === CLIP_ID)?.notes ?? [];

const undoDepth = (instance: TimelineInstance): number =>
  timelineTemporalOf(instance.doc).pastStates.length;

function setup(): TimelineInstance {
  const instance = createTimelineInstance();
  render(
    <ThemeProvider theme={mockTheme}>
      <TimelineProvider instance={instance}>
        <PianoRollPanel />
      </TimelineProvider>
    </ThemeProvider>
  );
  seed(instance);
  return instance;
}

beforeEach(() => {
  (playAuditionNote as jest.Mock).mockClear();
});

describe("PianoRoll", () => {
  it("opens on the clip the UI store names", () => {
    setup();
    const panel = screen.getByTestId("piano-roll");
    expect(panel).toBeInTheDocument();
    expect(screen.getByText("Riff")).toBeInTheDocument();
    // The marker TracksRegion's window keymap looks for before it claims a key.
    expect(panel.closest("[data-timeline-piano-roll]")).toBe(panel);
  });

  it("adds a note where an empty cell is clicked, and auditions it", async () => {
    const user = userEvent.setup();
    const instance = setup();
    const grid = screen.getByTestId("piano-roll-grid");

    // x = 100 → tick 1000, snapped to the beat grid at 960; y = 150 → pitch 60.
    await user.pointer({
      target: grid,
      coords: { clientX: 100, clientY: 150 },
      keys: "[MouseLeft]"
    });

    const notes = notesOf(instance);
    expect(notes).toHaveLength(4);
    const added = notes.find((n) => !["n1", "n2", "n3"].includes(n.id));
    expect(added).toMatchObject({
      pitch: 60,
      startTick: 960,
      durationTick: 960,
      velocity: 100
    });
    expect(playAuditionNote).toHaveBeenCalledWith(
      expect.anything(),
      60,
      100
    );
  });

  it("deletes the selected note from the keyboard", async () => {
    const user = userEvent.setup();
    const instance = setup();
    const grid = screen.getByTestId("piano-roll-grid");

    // n2 spans x 96..144 on the row for pitch 62 (y 120..132).
    await user.pointer({
      target: grid,
      coords: { clientX: 100, clientY: 125 },
      keys: "[MouseLeft]"
    });
    await user.keyboard("{Delete}");

    expect(notesOf(instance).map((n) => n.id)).toEqual(["n1", "n3"]);
  });

  it("drags a note one grid step right as a single undo entry", async () => {
    const user = userEvent.setup();
    const instance = setup();
    const grid = screen.getByTestId("piano-roll-grid");
    const before = undoDepth(instance);

    // One beat is 960 ticks — 96 px at this zoom.
    await user.pointer([
      { keys: "[MouseLeft>]", target: grid, coords: { clientX: 100, clientY: 125 } },
      { target: grid, coords: { clientX: 148, clientY: 125 } },
      { target: grid, coords: { clientX: 196, clientY: 125 } },
      { keys: "[/MouseLeft]", target: grid, coords: { clientX: 196, clientY: 125 } }
    ]);

    expect(notesOf(instance).find((n) => n.id === "n2")).toMatchObject({
      startTick: 1920,
      pitch: 62
    });
    expect(undoDepth(instance) - before).toBe(1);
  });

  it("nudges the selection a semitone with the arrow keys", async () => {
    const user = userEvent.setup();
    const instance = setup();
    const grid = screen.getByTestId("piano-roll-grid");

    await user.pointer({
      target: grid,
      coords: { clientX: 100, clientY: 125 },
      keys: "[MouseLeft]"
    });
    await user.keyboard("{ArrowUp}");

    expect(notesOf(instance).find((n) => n.id === "n2")?.pitch).toBe(63);
  });

  it("deletes a note on double-click", async () => {
    const user = userEvent.setup();
    const instance = setup();
    const grid = screen.getByTestId("piano-roll-grid");

    await user.pointer([
      { keys: "[MouseLeft]", target: grid, coords: { clientX: 100, clientY: 125 } },
      { keys: "[MouseLeft]", target: grid, coords: { clientX: 100, clientY: 125 } }
    ]);

    expect(notesOf(instance).map((n) => n.id)).toEqual(["n1", "n3"]);
  });

  it("closes itself when the clip it edits is deleted", () => {
    const instance = setup();
    expect(screen.getByTestId("piano-roll")).toBeInTheDocument();
    act(() => {
      instance.doc.getState().deleteSelected(new Set([CLIP_ID]));
    });
    expect(screen.queryByTestId("piano-roll")).not.toBeInTheDocument();
    expect(instance.ui.getState().pianoRollClipId).toBeNull();
  });
});
