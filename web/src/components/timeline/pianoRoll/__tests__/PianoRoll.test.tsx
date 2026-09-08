/**
 * The piano roll's gestures, driven against a real timeline store instance.
 *
 * The geometry is pinned by the fixture rather than assumed: the grid measures
 * 768 × 240, the clip's window is 7680 ticks, so the opening frame is exactly
 * 0.1 px per tick with A#4 (70) on the top row — which is what makes "click at
 * x = 100" assertable as "beat two".
 */

import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
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

    // x = 100 → tick 1000, snapped to the beat grid at 960; y = 166 → pitch 60.
    await user.pointer({
      target: grid,
      coords: { clientX: 100, clientY: 166 },
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

    // n2 spans x 96..144 on the row for pitch 62 (y 128..144).
    await user.pointer({
      target: grid,
      coords: { clientX: 100, clientY: 134 },
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
      { keys: "[MouseLeft>]", target: grid, coords: { clientX: 100, clientY: 134 } },
      { target: grid, coords: { clientX: 148, clientY: 134 } },
      { target: grid, coords: { clientX: 196, clientY: 134 } },
      { keys: "[/MouseLeft]", target: grid, coords: { clientX: 196, clientY: 134 } }
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
      coords: { clientX: 100, clientY: 134 },
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
      { keys: "[MouseLeft]", target: grid, coords: { clientX: 100, clientY: 134 } },
      { keys: "[MouseLeft]", target: grid, coords: { clientX: 100, clientY: 134 } }
    ]);

    expect(notesOf(instance).map((n) => n.id)).toEqual(["n1", "n3"]);
  });

  it("undoes and redoes note edits while the piano roll has focus", async () => {
    const user = userEvent.setup();
    const instance = setup();
    await user.click(screen.getByTestId("piano-roll"));
    await user.keyboard("{Control>}a{/Control}{Delete}");
    expect(notesOf(instance)).toHaveLength(0);
    await user.keyboard("{Control>}z{/Control}");
    expect(notesOf(instance)).toEqual(seedNotes());
    await user.keyboard("{Control>}{Shift>}z{/Shift}{/Control}");
    expect(notesOf(instance)).toHaveLength(0);
  });

  it("does not write notes with secondary buttons or Shift-click", async () => {
    const user = userEvent.setup();
    const instance = setup();
    const grid = screen.getByTestId("piano-roll-grid");
    await user.pointer({target: grid, coords: {clientX: 400, clientY: 166}, keys: "[MouseRight]"});
    await user.keyboard("{Shift>}");
    await user.pointer({target: grid, coords: {clientX: 400, clientY: 166}, keys: "[MouseLeft]"});
    await user.keyboard("{/Shift}");
    expect(notesOf(instance)).toEqual(seedNotes());
  });

  it("duplicates immediately after the selection without an extra gap", async () => {
    const user = userEvent.setup();
    const instance = setup();
    await user.click(screen.getByTestId("piano-roll"));
    await user.keyboard("{Control>}ad{/Control}");
    expect(notesOf(instance).slice(3).map(n => n.startTick)).toEqual([2400, 3360, 4320]);
  });

  it("keeps a newly created note on a double-click in an empty cell", async () => {
    const user = userEvent.setup();
    const instance = setup();
    const grid = screen.getByTestId("piano-roll-grid");
    await user.pointer([
      {target: grid, coords: {clientX: 440, clientY: 166}, keys: "[MouseLeft]"},
      {target: grid, coords: {clientX: 440, clientY: 166}, keys: "[MouseLeft]"}
    ]);
    expect(notesOf(instance)).toHaveLength(4);
    expect(notesOf(instance)[3].startTick).toBe(3840);
  });

  it("resizes the end without moving the note and undoes the gesture", async () => {
    const user = userEvent.setup();
    const instance = setup();
    const grid = screen.getByTestId("piano-roll-grid");
    await user.pointer([
      {target: grid, coords: {clientX: 142, clientY: 134}, keys: "[MouseLeft>]"},
      {target: grid, coords: {clientX: 190, clientY: 134}},
      {target: grid, coords: {clientX: 190, clientY: 134}, keys: "[/MouseLeft]"}
    ]);
    expect(notesOf(instance)[1]).toMatchObject({startTick: 960, durationTick: 960});
    await user.keyboard("{Control>}z{/Control}");
    expect(notesOf(instance)).toEqual(seedNotes());
  });

  it("edits the selected notes' velocity without moving their pitches", async () => {
    const user = userEvent.setup();
    const instance = setup();
    await user.click(screen.getByTestId("piano-roll"));
    await user.keyboard("{Control>}a{/Control}");
    const slider = screen.getByRole("slider", {name: "Selected note velocity"});
    act(() => slider.focus());
    await user.keyboard("{Home}{ArrowRight}");
    expect(notesOf(instance).map(n => n.velocity)).toEqual([2, 2, 2]);
    expect(notesOf(instance).map(n => n.pitch)).toEqual([60, 62, 64]);
  });

  it("does not report notes removed by undo as still selected", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByTestId("piano-roll"));
    await user.keyboard("{Control>}adz{/Control}");
    expect(screen.getByText("Click to add a note")).toBeInTheDocument();
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


it("copies and pastes a phrase at the playhead with fresh ids and one undo", async () => {
  const user = userEvent.setup();
  const instance = setup();
  await user.click(screen.getByTestId("piano-roll"));
  await user.keyboard("{Meta>}a{/Meta}");
  const data = new Map<string, string>();
  const clipboardData = { getData: (type: string) => data.get(type) ?? "", setData: (type: string, value: string) => data.set(type, value) };
  fireEvent.copy(screen.getByTestId("piano-roll"), { clipboardData });
  expect(clipboardData.getData("text/plain")).toContain("nodetool-midi-notes");
  await user.pointer({ target: screen.getByTestId("piano-roll-ruler"), keys: "[MouseLeft]", coords: { clientX: 384, clientY: 10 } });
  expect(instance.playback.getState().getTimeMs()).toBe(2000);
  const before = undoDepth(instance);
  await user.paste(clipboardData.getData("text/plain"));
  const pasted = notesOf(instance).slice(3);
  expect(pasted.map(({ id, ...note }) => note)).toEqual(seedNotes().map(({ id, ...note }) => ({ ...note, startTick: note.startTick + 3840 })));
  expect(new Set(notesOf(instance).map(n => n.id)).size).toBe(6);
  expect(undoDepth(instance) - before).toBe(1);
  await user.keyboard("{Meta>}z{/Meta}");
  expect(notesOf(instance)).toEqual(seedNotes());
});

it("cuts notes, pastes into a different trimmed clip, and leaves source edits isolated", async () => {
  const user = userEvent.setup();
  const instance = setup();
  await user.click(screen.getByTestId("piano-roll"));
  await user.keyboard("{Control>}a{/Control}");
  const data = new Map<string, string>();
  const clipboardData = { getData: (type: string) => data.get(type) ?? "", setData: (type: string, value: string) => data.set(type, value) };
  fireEvent.cut(screen.getByTestId("piano-roll"), { clipboardData });
  expect(notesOf(instance)).toHaveLength(0);
  act(() => {
    const source = instance.doc.getState().clips[0];
    instance.doc.getState().addClips([{ ...source, id: "destination", startMs: 5000, inPointMs: 500, notes: [] }]);
    instance.ui.getState().openPianoRoll("destination");
    instance.playback.getState().seek(6000);
  });
  await user.click(screen.getByTestId("piano-roll"));
  await user.paste(clipboardData.getData("text/plain"));
  const destination = instance.doc.getState().clips.find(c => c.id === "destination")!;
  expect(destination.notes?.map(n => n.startTick)).toEqual([2880, 3840, 4800]);
  expect(notesOf(instance)).toHaveLength(0);
});

it("repeats with Command-R and quantizes starts with Q without changing lengths", async () => {
  const user = userEvent.setup();
  const instance = setup();
  await user.click(screen.getByTestId("piano-roll"));
  await user.keyboard("{Meta>}ar{/Meta}");
  expect(notesOf(instance)).toHaveLength(6);
  await user.keyboard("{Alt>}{ArrowRight}{/Alt}q");
  expect(notesOf(instance).slice(3).map(n => n.startTick)).toEqual([2880, 3840, 4800]);
  expect(notesOf(instance).every(n => n.durationTick === 480)).toBe(true);
});

it("splits selected notes at the playhead with Command-T and undoes once", async () => {
  const user = userEvent.setup();
  const instance = setup();
  await user.click(screen.getByTestId("piano-roll"));
  await user.keyboard("{Meta>}a{/Meta}");
  act(() => instance.playback.getState().seek(125));
  await user.keyboard("{Meta>}t{/Meta}");
  expect(notesOf(instance).filter(n => n.pitch === 60).map(n => [n.startTick, n.durationTick])).toEqual([[0, 240], [240, 240]]);
  await user.keyboard("{Meta>}z{/Meta}");
  expect(notesOf(instance)).toEqual(seedNotes());
});

it("supports Logic transpose and nudge modifiers without changing durations", async () => {
  const user = userEvent.setup();
  const instance = setup();
  await user.click(screen.getByTestId("piano-roll"));
  await user.keyboard("{Meta>}a{/Meta}{Alt>}{Shift>}{ArrowUp}{/Shift}{/Alt}{Control>}{Alt>}{ArrowRight}{/Alt}{/Control}");
  expect(notesOf(instance).map(n => [n.pitch, n.startTick, n.durationTick])).toEqual([[72, 960, 480], [74, 1920, 480], [76, 2880, 480]]);
});

it("ignores unrelated clipboard text", async () => {
  const user = userEvent.setup();
  const instance = setup();
  await user.click(screen.getByTestId("piano-roll"));
  const before = notesOf(instance);
  await user.paste("ordinary text");
  expect(notesOf(instance)).toEqual(before);
});

it("Option-drags a selection as copies, preserves originals, and undoes once", async () => {
  const user = userEvent.setup();
  const instance = setup();
  const grid = screen.getByTestId("piano-roll-grid");
  await user.click(screen.getByTestId("piano-roll"));
  await user.keyboard("{Meta>}a{/Meta}{Alt>}");
  const depth = undoDepth(instance);
  await user.pointer([
    {target: grid, coords: {clientX: 110, clientY: 134}, keys: "[MouseLeft>]"},
    {target: grid, coords: {clientX: 206, clientY: 118}},
    {target: grid, coords: {clientX: 302, clientY: 118}, keys: "[/MouseLeft]"}
  ]);
  await user.keyboard("{/Alt}");
  const next = notesOf(instance);
  expect(next.filter(n => ["n1", "n2", "n3"].includes(n.id))).toEqual(seedNotes());
  expect(next.filter(n => !["n1", "n2", "n3"].includes(n.id)).map(n => [n.pitch, n.startTick, n.durationTick])).toEqual([[61, 1920, 480], [63, 2880, 480], [65, 3840, 480]]);
  expect(undoDepth(instance)).toBe(depth + 1);
  await user.keyboard("{Meta>}z{/Meta}");
  expect(notesOf(instance)).toEqual(seedNotes());
});

it("changes selected velocities relatively from the lane and restores one gesture", async () => {
  const user = userEvent.setup();
  const instance = setup();
  act(() => instance.doc.getState().setClipNotes(CLIP_ID, seedNotes().map((n, i) => ({...n, velocity: [40, 70, 100][i]}))));
  await user.click(screen.getByTestId("piano-roll"));
  await user.keyboard("{Meta>}a{/Meta}");
  const lane = screen.getByRole("img", {name: "Note velocities"});
  const depth = undoDepth(instance);
  await user.pointer([
    {target: lane, coords: {clientX: 96, clientY: 25}, keys: "[MouseLeft>]"},
    {target: lane, coords: {clientX: 96, clientY: 20}},
    {target: lane, coords: {clientX: 96, clientY: 20}, keys: "[/MouseLeft]"}
  ]);
  expect(notesOf(instance).map(n => n.velocity)).toEqual([52, 82, 112]);
  expect(undoDepth(instance)).toBe(depth + 1);
  await user.keyboard("{Meta>}z{/Meta}");
  expect(notesOf(instance).map(n => n.velocity)).toEqual([40, 70, 100]);
  const slider = screen.getByRole("slider", {name: "Selected note velocity"});
  act(() => slider.focus());
  await user.keyboard("{End}");
  expect(notesOf(instance).map(n => n.velocity)).toEqual([67, 97, 127]);
});

it("edits selection fields, preserves group spacing, and handles mixed values and cancellation", async () => {
  const user = userEvent.setup();
  const instance = setup();
  act(() => instance.doc.getState().setClipNotes(CLIP_ID, seedNotes().map((n, i) => ({...n, durationTick: 480 + i * 240, velocity: 40 + i * 20}))));
  await user.click(screen.getByTestId("piano-roll"));
  await user.keyboard("{Meta>}a{/Meta}");
  expect(screen.getByRole("spinbutton", {name: "Length (beats)"})).toHaveAttribute("placeholder", "Mixed");
  expect(screen.getByRole("spinbutton", {name: "Velocity"})).toHaveValue(null);
  const edit = async (name: string, value: string) => {
    const field = screen.getByRole("spinbutton", {name});
    await user.clear(field);
    await user.type(field, value);
    await user.keyboard("{Enter}");
  };
  await edit("Lowest pitch (MIDI)", "72");
  await edit("Start beat", "3");
  expect(notesOf(instance).map(n => [n.pitch, n.startTick])).toEqual([[72, 1920], [74, 2880], [76, 3840]]);
  await edit("Length (beats)", "0.25");
  await edit("Velocity", "88");
  expect(notesOf(instance).every(n => n.durationTick === 240 && n.velocity === 88)).toBe(true);
  const depth = undoDepth(instance);
  await edit("Velocity", "88.4");
  expect(screen.getByRole("spinbutton", {name: "Velocity"})).toHaveValue(88);
  expect(undoDepth(instance)).toBe(depth);
  const before = notesOf(instance);
  const field = screen.getByRole("spinbutton", {name: "Velocity"});
  await user.clear(field);
  await user.type(field, "20");
  await user.keyboard("{Escape}");
  expect(notesOf(instance)).toEqual(before);
  expect(screen.getByRole("spinbutton", {name: "Velocity"})).toHaveValue(88);
});

it("uses the time signature's beat unit in the selection inspector", async () => {
  const user = userEvent.setup();
  const instance = setup();
  act(() => instance.doc.setState({tempo: {bpm: 120, offsetMs: 0, timeSignature: {beatsPerBar: 6, beatUnit: 8}}}));
  await user.click(screen.getByTestId("piano-roll"));
  await user.keyboard("{Meta>}a{/Meta}");
  expect(screen.getByRole("spinbutton", {name: "Length (beats)"})).toHaveValue(1);
  const start = screen.getByRole("spinbutton", {name: "Start beat"});
  await user.clear(start);
  await user.type(start, "3");
  await user.keyboard("{Enter}");
  expect(notesOf(instance).map(note => note.startTick)).toEqual([960, 1920, 2880]);
});
