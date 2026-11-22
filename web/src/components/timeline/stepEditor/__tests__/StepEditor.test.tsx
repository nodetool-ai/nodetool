/**
 * The Step Editor, driven through the clip-editor panel against a real timeline
 * store. The events area measures 768 x 240 and the clip window is 7680 ticks,
 * so the opening frame is 0.1 px per tick. Rows are 64 px tall: lane 0 spans
 * y 0..64, lane 1 y 64..128 and lane 2 y 128..192. The default grid is 1/16
 * (240 ticks, 24 px).
 */

import React from "react";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import { DEFAULT_MIDI_INSTRUMENT, lineSteps, makeTrack } from "@nodetool-ai/timeline";
import type { MidiControllerLane, MidiNote, TimelineClip } from "@nodetool-ai/timeline";

import mockTheme from "../../../../__mocks__/themeMock";
import {
  TimelineProvider,
  createTimelineInstance,
  type TimelineInstance
} from "../../../../stores/timeline/TimelineInstance";
import { timelineTemporalOf } from "../../../../stores/timeline/TimelineStore";
import { PianoRollPanel } from "../../pianoRoll/PianoRollPanel";

jest.mock("../../preview/audition", () => ({
  playAuditionNote: jest.fn(() => Promise.resolve()),
  AUDITION_NOTE_MS: 600,
  AUDITION_DEFAULT_PITCH: 60
}));

import { playAuditionNote } from "../../preview/audition";

const EVENTS_WIDTH_PX = 768;
const EVENTS_HEIGHT_PX = 240;

beforeAll(() => {
  HTMLElement.prototype.setPointerCapture = jest.fn();
  HTMLElement.prototype.releasePointerCapture = jest.fn();
  HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
    const isEvents = this.dataset?.testid === "step-editor-events";
    const width = isEvents ? EVENTS_WIDTH_PX : 0;
    const height = isEvents ? EVENTS_HEIGHT_PX : 0;
    return {
      x: 0, y: 0, top: 0, left: 0, right: width, bottom: height, width, height,
      toJSON: () => ({})
    } as DOMRect;
  };
});

const CLIP_ID = "clip-midi";
const VOLUME_LANE_KEY = "cc:cc|7||0";

const note = (id: string, pitch: number, startTick: number, velocity = 100): MidiNote => ({
  id, pitch, velocity, startTick, durationTick: 480
});

const volumeLane = (): MidiControllerLane => ({
  id: "lane-volume",
  kind: "cc",
  cc: 7,
  points: [
    { id: "cp1", tick: 1920, value: 20 },
    { id: "cp2", tick: 2400, value: 100 }
  ]
});

function seed(instance: TimelineInstance, tab: "pianoRoll" | "stepEditor" = "stepEditor"): void {
  const track = makeTrack({ type: "midi", name: "Drums", instrument: DEFAULT_MIDI_INSTRUMENT });
  const clip: TimelineClip = {
    id: CLIP_ID,
    trackId: track.id,
    name: "Beat",
    startMs: 0,
    durationMs: 4000,
    inPointMs: 0,
    mediaType: "midi",
    sourceType: "imported",
    status: "generated",
    locked: false,
    versions: [],
    notes: [note("k1", 36, 0), note("s1", 38, 480), note("k2", 36, 960)],
    controllers: [volumeLane()]
  };
  act(() => {
    instance.doc.setState({ tracks: [track], clips: [clip] });
    instance.ui.getState().openPianoRoll(CLIP_ID);
    instance.ui.getState().setClipEditorTab(tab);
  });
}

function setup(tab: "pianoRoll" | "stepEditor" = "stepEditor"): TimelineInstance {
  const instance = createTimelineInstance();
  render(
    <ThemeProvider theme={mockTheme}>
      <TimelineProvider instance={instance}>
        <PianoRollPanel />
      </TimelineProvider>
    </ThemeProvider>
  );
  seed(instance, tab);
  return instance;
}

const clipOf = (instance: TimelineInstance): TimelineClip =>
  instance.doc.getState().clips.find((c) => c.id === CLIP_ID)!;
const notesOf = (instance: TimelineInstance): MidiNote[] => clipOf(instance).notes ?? [];
const pointsOf = (instance: TimelineInstance) =>
  (clipOf(instance).controllers ?? []).find((l) => l.cc === 7)?.points ?? [];
const undoDepth = (instance: TimelineInstance): number =>
  timelineTemporalOf(instance.doc).pastStates.length;
const setTool = (instance: TimelineInstance, tool: "pointer" | "pencil" | "line" | "eraser") =>
  act(() => instance.ui.getState().setStepEditorSettings({ tool }));

const press = (target: HTMLElement, x: number, y: number) =>
  ({ keys: "[MouseLeft>]", target, coords: { clientX: x, clientY: y } }) as const;
const move = (target: HTMLElement, x: number, y: number) =>
  ({ target, coords: { clientX: x, clientY: y } }) as const;
const release = (target: HTMLElement, x: number, y: number) =>
  ({ keys: "[/MouseLeft]", target, coords: { clientX: x, clientY: y } }) as const;

beforeEach(() => {
  (playAuditionNote as jest.Mock).mockClear();
});

describe("clip editor tab row", () => {
  it("switches between Piano Roll and Step Editor on the same clip", async () => {
    const user = userEvent.setup();
    const instance = setup("pianoRoll");
    expect(screen.getByTestId("piano-roll")).toBeInTheDocument();
    expect(screen.queryByTestId("step-editor")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Step Editor" }));
    expect(screen.getByTestId("step-editor")).toBeInTheDocument();
    expect(screen.queryByTestId("piano-roll")).not.toBeInTheDocument();
    expect(within(screen.getByTestId("step-editor-inspector")).getByText("Beat")).toBeInTheDocument();
    expect(instance.ui.getState().pianoRollClipId).toBe(CLIP_ID);

    await user.click(screen.getByRole("tab", { name: "Piano Roll" }));
    expect(screen.getByTestId("piano-roll")).toBeInTheDocument();
    expect(instance.ui.getState().pianoRollClipId).toBe(CLIP_ID);
    expect(notesOf(instance)).toHaveLength(3);
  });
});

describe("lane sets", () => {
  it("lists the Automatic set: note lanes highest first, then controller lanes", () => {
    setup();
    const keys = screen
      .getAllByTestId(/^step-editor-lane-/)
      .map((el) => el.getAttribute("data-testid")?.replace("step-editor-lane-", ""));
    expect(keys).toEqual(["note:38", "note:36", VOLUME_LANE_KEY]);
    expect(screen.getByTestId("step-editor-lane-note:38")).toHaveTextContent("D2");
    expect(screen.getByTestId(`step-editor-lane-${VOLUME_LANE_KEY}`)).toHaveTextContent("Volume");
  });

  it("lists the GM Drums set in contract order", () => {
    const instance = setup();
    act(() => instance.ui.getState().setStepEditorSettings({ laneSet: "gmDrums" }));
    const rows = screen.getAllByTestId(/^step-editor-lane-/);
    expect(rows).toHaveLength(16);
    expect(rows[0]).toHaveTextContent("Kick");
    expect(rows[1]).toHaveTextContent("Snare");
    expect(rows[15]).toHaveTextContent("Cowbell");
  });
});

describe("Pencil", () => {
  it("sets a value on each grid step the drag passes, in one undo step", async () => {
    const user = userEvent.setup();
    const instance = setup();
    setTool(instance, "pencil");
    const events = screen.getByTestId("step-editor-events");
    const depth = undoDepth(instance);

    // Lane 2 (Volume). Press at tick 100 (step 0), y 16 in the row = 95.
    // The pointer is at tick 340 (step 240), y 24 in the row = 79, and then at
    // tick 580 (step 480), y 32 in the row = 64.
    await user.pointer([
      press(events, 10, 128 + 16),
      move(events, 34, 128 + 24),
      move(events, 58, 128 + 32),
      release(events, 58, 128 + 32)
    ]);

    const drawn = pointsOf(instance).filter((p) => p.tick < 1000);
    expect(drawn.map((p) => [p.tick, p.value])).toEqual([
      [0, 95],
      [240, 79],
      [480, 64]
    ]);
    expect(pointsOf(instance).map((p) => p.tick)).toEqual([0, 240, 480, 1920, 2400]);
    expect(undoDepth(instance)).toBe(depth + 1);

    act(() => timelineTemporalOf(instance.doc).undo());
    expect(pointsOf(instance).map((p) => p.tick)).toEqual([1920, 2400]);
  });

  it("creates a note in a note lane, then sets its velocity on a second pass", async () => {
    const user = userEvent.setup();
    const instance = setup();
    setTool(instance, "pencil");
    const events = screen.getByTestId("step-editor-events");

    // Lane 0 is pitch 38. Tick 100 is the step [0, 240). y 16 = velocity 96.
    await user.pointer([press(events, 10, 16), release(events, 10, 16)]);
    let created = notesOf(instance).filter((n) => n.pitch === 38 && n.startTick === 0);
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ durationTick: 240, velocity: 96, channel: 0 });
    expect(notesOf(instance)).toHaveLength(4);
    expect(playAuditionNote).toHaveBeenCalledWith(expect.anything(), 38, 96);

    // The same step at y 48 = velocity 33 changes the note and adds no second one.
    await user.pointer([press(events, 12, 48), release(events, 12, 48)]);
    created = notesOf(instance).filter((n) => n.pitch === 38 && n.startTick === 0);
    expect(created).toHaveLength(1);
    expect(created[0]!.velocity).toBe(33);
    expect(notesOf(instance)).toHaveLength(4);
  });
});

describe("Line tool", () => {
  it("writes the lineSteps values for the dragged line, in one undo step", async () => {
    const user = userEvent.setup();
    const instance = setup();
    setTool(instance, "line");
    const events = screen.getByTestId("step-editor-events");
    const depth = undoDepth(instance);

    // From (tick 0, value 127) to (tick 960, value 0). y 200 is below the row and clamps to 0.
    await user.pointer([
      press(events, 0, 128),
      move(events, 48, 160),
      release(events, 96, 200)
    ]);

    const expected = lineSteps(0, 127, 960, 0, 240, 0);
    expect(expected.map((p) => p.value)).toEqual([127, 95, 64, 32, 0]);
    const written = pointsOf(instance).filter((p) => p.tick <= 960);
    expect(written.map((p) => ({ tick: p.tick, value: p.value }))).toEqual(expected);
    expect(undoDepth(instance)).toBe(depth + 1);
  });
});

describe("Eraser", () => {
  it("removes the beams the pointer touches in the lane where it started", async () => {
    const user = userEvent.setup();
    const instance = setup();
    setTool(instance, "eraser");
    const events = screen.getByTestId("step-editor-events");
    const depth = undoDepth(instance);

    // Lane 1 is pitch 36 with beams at ticks 0 and 960 (x 0 and 96). y 104 is inside both.
    await user.pointer([
      press(events, 2, 104),
      move(events, 50, 104),
      move(events, 98, 104),
      release(events, 98, 104)
    ]);

    expect(notesOf(instance).filter((n) => n.pitch === 36)).toHaveLength(0);
    // The emptied lane stays on screen.
    expect(screen.getByTestId("step-editor-lane-note:36")).toBeInTheDocument();
    expect(notesOf(instance).filter((n) => n.pitch === 38)).toHaveLength(1);
    expect(pointsOf(instance)).toHaveLength(2);
    expect(undoDepth(instance)).toBe(depth + 1);
  });
});

describe("Pointer", () => {
  it("drags a beam vertically to change its value", async () => {
    const user = userEvent.setup();
    const instance = setup();
    const events = screen.getByTestId("step-editor-events");

    // The Volume beam at tick 1920 (x 192) has value 20. A 32 px drag up adds 64.
    await user.pointer([
      press(events, 194, 128 + 60),
      move(events, 194, 128 + 44),
      move(events, 194, 128 + 28),
      release(events, 194, 128 + 28)
    ]);

    expect(pointsOf(instance).find((p) => p.id === "cp1")?.value).toBe(84);
    expect(pointsOf(instance).find((p) => p.id === "cp2")?.value).toBe(100);
  });
});

describe("Functions", () => {
  it("scales the selected events around the range minimum", async () => {
    const user = userEvent.setup();
    const instance = setup();
    await user.click(screen.getByTestId(`step-editor-lane-${VOLUME_LANE_KEY}`));
    screen.getByTestId("step-editor").focus();
    await user.keyboard("{Control>}a{/Control}");

    await user.click(screen.getByRole("button", { name: "Functions" }));
    await user.click(await screen.findByRole("menuitem", { name: /Scale Values/ }));
    const field = await screen.findByLabelText(/Percent/);
    await user.clear(field);
    await user.type(field, "50");
    await user.click(screen.getByRole("button", { name: "Apply" }));

    expect(pointsOf(instance).map((p) => p.value)).toEqual([10, 50]);
  });
});
