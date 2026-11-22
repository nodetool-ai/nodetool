/**
 * Review round 4 (SQ2 F26, F29): row assignment, reorder, multi-row playback,
 * kept sort, row colors, the Add Row menu and the inline row buttons, through
 * the clip-editor panel against a real timeline store.
 */

import React from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import { DEFAULT_MIDI_INSTRUMENT, makeTrack, normalizePattern } from "@nodetool-ai/timeline";
import type { MidiInstrument, StepPattern, StepRow, TimelineClip, TrackEffect } from "@nodetool-ai/timeline";

import mockTheme from "../../../../__mocks__/themeMock";
import { TimelineProvider, createTimelineInstance, type TimelineInstance } from "../../../../stores/timeline/TimelineInstance";
import { timelineTemporalOf } from "../../../../stores/timeline/TimelineStore";
import { PianoRollPanel } from "../../pianoRoll/PianoRollPanel";

jest.mock("../../preview/audition", () => ({
  playAuditionNote: jest.fn(() => Promise.resolve()),
  AUDITION_NOTE_MS: 600,
  AUDITION_DEFAULT_PITCH: 60
}));
jest.mock("../stepStripPaint", () => {
  const actual = jest.requireActual("../stepStripPaint");
  return { ...actual, paintStrip: jest.fn() };
});
jest.mock("../../../../hooks/timeline/useTimelineAgentBridge", () => ({
  createBrowserStepPatternLibrary: () => ({ list: async () => [], save: async () => ({ id: "u1" }) })
}));

const CLIP_ID = "clip-pattern";
type RowSeed = Partial<StepRow> & Pick<StepRow, "id" | "assignment">;
const TWO_ROWS: RowSeed[] = [
  { id: "kick", assignment: { type: "note", pitch: 36 } },
  { id: "snare", assignment: { type: "note", pitch: 38 } }
];

function setup(
  rows: RowSeed[] = TWO_ROWS,
  opts: { instrument?: MidiInstrument; effects?: TrackEffect[]; pattern?: Partial<StepPattern> } = {}
): TimelineInstance {
  const instance = createTimelineInstance();
  render(
    <ThemeProvider theme={mockTheme}>
      <TimelineProvider instance={instance}>
        <PianoRollPanel />
      </TimelineProvider>
    </ThemeProvider>
  );
  const track = { ...makeTrack({ type: "midi", name: "Drums", instrument: opts.instrument ?? DEFAULT_MIDI_INSTRUMENT }), effects: opts.effects };
  const clip: TimelineClip = {
    id: CLIP_ID,
    trackId: track.id,
    name: "Beat",
    startMs: 0,
    durationMs: 2000,
    inPointMs: 0,
    mediaType: "midi",
    sourceType: "imported",
    status: "generated",
    locked: false,
    versions: [],
    pattern: normalizePattern({ lengthSteps: 16, rows: rows as StepRow[], ...opts.pattern })
  };
  act(() => {
    instance.doc.setState({ tracks: [track], clips: [clip] });
    instance.ui.getState().openPianoRoll(CLIP_ID);
  });
  return instance;
}

const patternOf = (i: TimelineInstance): StepPattern => i.doc.getState().clips.find((c) => c.id === CLIP_ID)!.pattern!;
const rowOf = (i: TimelineInstance, id: string) => patternOf(i).rows.find((r) => r.id === id)!;
const undoDepth = (i: TimelineInstance): number => timelineTemporalOf(i.doc).pastStates.length;

const ctxStub = new Proxy({}, { get: (_t, k) => (k === "measureText" ? () => ({ width: 0 }) : () => undefined), set: () => true });
beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = jest.fn(() => ctxStub) as never;
  HTMLElement.prototype.setPointerCapture = jest.fn();
  HTMLElement.prototype.releasePointerCapture = jest.fn();
});
beforeEach(() => localStorage.clear());

async function pickAddRow(user: ReturnType<typeof userEvent.setup>, group: RegExp, item: RegExp | string) {
  await user.click(screen.getByTestId("add-row"));
  await user.click(await screen.findByRole("menuitem", { name: group }));
  await user.click(await screen.findByRole("menuitem", { name: item }));
}

describe("Step Sequencer rows, round 4", () => {
  it("1: the row header's Row Assignment picker reassigns the row", async () => {
    const user = userEvent.setup();
    const instance = setup();
    await user.click(screen.getByTestId("row-assign-kick"));
    await user.click(await screen.findByRole("menuitem", { name: /MIDI Controllers/ }));
    await user.click(await screen.findByRole("menuitem", { name: "Modulation (CC 1)" }));
    await waitFor(() => expect(rowOf(instance, "kick").assignment).toEqual({ type: "automation", target: { kind: "cc", cc: 1 } }));
  });

  it("1: the picker offers kit pieces and pressure on a sampler track", async () => {
    const user = userEvent.setup();
    const sampler: MidiInstrument = {
      type: "sampler",
      zones: [{ id: "z1", name: "Clap", assetId: "a", rootNote: 60, lowNote: 60, highNote: 60, gainDb: 0 }],
      oneShot: true,
      attackMs: 0,
      releaseMs: 10,
      gainDb: 0
    };
    const instance = setup(TWO_ROWS, { instrument: sampler });
    await user.click(screen.getByTestId("row-assign-snare"));
    await user.click(await screen.findByRole("menuitem", { name: /Kit Pieces/ }));
    await user.click(await screen.findByRole("menuitem", { name: "Clap" }));
    await waitFor(() => expect(rowOf(instance, "snare").assignment).toEqual({ type: "kit", pad: 0 }));
  });

  it("2: dragging a row header onto another row reorders in one undo step", async () => {
    const instance = setup([...TWO_ROWS, { id: "hat", assignment: { type: "note", pitch: 42 } }]);
    const before = undoDepth(instance);
    const dataTransfer = { setData: jest.fn(), getData: jest.fn(), effectAllowed: "", dropEffect: "" };
    fireEvent.dragStart(screen.getByTestId("row-header-hat"), { dataTransfer });
    fireEvent.dragOver(screen.getByTestId("row-header-kick"), { dataTransfer });
    fireEvent.drop(screen.getByTestId("row-header-kick"), { dataTransfer });
    await waitFor(() => expect(patternOf(instance).rows.map((r) => r.id)).toEqual(["hat", "kick", "snare"]));
    expect(undoDepth(instance) - before).toBe(1);
  });

  it("3: a playback mode picked on a selected row applies to every selected row", async () => {
    const user = userEvent.setup();
    const instance = setup([...TWO_ROWS, { id: "hat", assignment: { type: "note", pitch: 42 } }]);
    await user.click(screen.getByTestId("row-header-kick"));
    fireEvent.click(screen.getByTestId("row-header-hat"), { shiftKey: true });
    const before = undoDepth(instance);
    await user.click(screen.getByTestId("row-playback-kick"));
    await user.click(await screen.findByRole("menuitemradio", { name: "Backward" }));
    await waitFor(() => expect(rowOf(instance, "hat").playback).toBe("backward"));
    expect(rowOf(instance, "kick").playback).toBe("backward");
    expect(rowOf(instance, "snare").playback).not.toBe("backward");
    expect(undoDepth(instance) - before).toBe(1);
  });

  it("4: a chosen sort holds for rows added later", async () => {
    const user = userEvent.setup();
    const instance = setup([
      { id: "snare", assignment: { type: "note", pitch: 38 } },
      { id: "kick", assignment: { type: "note", pitch: 36 } }
    ]);
    await user.click(screen.getByRole("button", { name: "View" }));
    await user.click(await screen.findByRole("menuitem", { name: "Sort Rows" }));
    await user.click(await screen.findByRole("menuitemcheckbox", { name: /By Type and Note \(Ascending\)/ }));
    await waitFor(() => expect(patternOf(instance).rows.map((r) => r.id)).toEqual(["kick", "snare"]));
    await pickAddRow(user, /^Notes$/, "C#1");
    await waitFor(() => expect(patternOf(instance).rows).toHaveLength(3));
    expect(patternOf(instance).rows.map((r) => (r.assignment as { pitch: number }).pitch)).toEqual([36, 37, 38]);
  });

  it("4: the kept sort lives in the pattern's rowSort field, and a row drag ends it", async () => {
    const user = userEvent.setup();
    const instance = setup([
      { id: "snare", assignment: { type: "note", pitch: 38 } },
      { id: "kick", assignment: { type: "note", pitch: 36 } }
    ]);
    await user.click(screen.getByRole("button", { name: "View" }));
    await user.click(await screen.findByRole("menuitem", { name: "Sort Rows" }));
    await user.click(await screen.findByRole("menuitemcheckbox", { name: /By Type and Note \(Descending\)/ }));
    await waitFor(() => expect(patternOf(instance).rowSort).toBe("typeAndNoteDesc"));
    expect(localStorage.getItem("nodetool.stepSequencer.rowSort")).toBeNull();
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    await user.click(screen.getByRole("button", { name: "View" }));
    await user.click(await screen.findByRole("menuitem", { name: "Sort Rows" }));
    const item = await screen.findByRole("menuitemcheckbox", { name: /By Type and Note \(Descending\)/ });
    expect(item.getAttribute("aria-checked")).toBe("true");
    await user.keyboard("{Escape}{Escape}");
    const dataTransfer = { setData: jest.fn(), getData: jest.fn(), effectAllowed: "", dropEffect: "" };
    fireEvent.dragStart(screen.getByTestId("row-header-kick"), { dataTransfer });
    fireEvent.dragOver(screen.getByTestId("row-header-snare"), { dataTransfer });
    fireEvent.drop(screen.getByTestId("row-header-snare"), { dataTransfer });
    await waitFor(() => expect(patternOf(instance).rowSort).toBeUndefined());
  });

  it("4: a custom row color is written and cleared from the row menu", async () => {
    const user = userEvent.setup();
    const instance = setup();
    fireEvent.contextMenu(screen.getByTestId("row-header-kick"));
    const swatches = await screen.findAllByTestId(/^row-color-swatch-/);
    await user.click(swatches[1]!);
    await waitFor(() => expect(rowOf(instance, "kick").color).toMatch(/^#/));
    fireEvent.contextMenu(screen.getByTestId("row-header-kick"));
    await user.click(await screen.findByRole("menuitem", { name: "Default Color" }));
    await waitFor(() => expect(rowOf(instance, "kick").color).toBeUndefined());
  });

  it("5: Chord Degrees adds a degree row without an error", async () => {
    const user = userEvent.setup();
    const instance = setup(TWO_ROWS, { pattern: { pitchSource: "off" } });
    await pickAddRow(user, /Chord Degrees/, "Root");
    await waitFor(() => expect(patternOf(instance).rows).toHaveLength(3));
    expect(patternOf(instance).rows[2]!.assignment).toEqual({ type: "degree", degree: "root", octave: 3 });
    expect(patternOf(instance).pitchSource).toBe("chords");
    expect(screen.queryByText(/Degree rows require/)).toBeNull();
  });

  it("5: Add Row lists Melodic, the full note range and insert parameters", async () => {
    const user = userEvent.setup();
    const eq: TrackEffect = {
      id: "eq1",
      type: "eq3",
      enabled: true,
      lowFreq: 200,
      lowGainDb: 0,
      midFreq: 1000,
      midQ: 1,
      midGainDb: 0,
      highFreq: 5000,
      highGainDb: 0
    } as TrackEffect;
    const instance = setup(TWO_ROWS, { effects: [eq] });
    await pickAddRow(user, /^Melodic$/, /^Melodic$/);
    await waitFor(() => expect(patternOf(instance).rows[2]?.assignment).toEqual({ type: "melodic", pitch: 60 }));
    await user.click(screen.getByTestId("add-row"));
    await user.click(await screen.findByRole("menuitem", { name: /^Notes$/ }));
    expect(await screen.findByRole("menuitem", { name: "G8" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "C-2" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await pickAddRow(user, /Inserts/, /Low freq/);
    await waitFor(() =>
      expect(patternOf(instance).rows[3]?.assignment).toEqual({ type: "automation", target: { kind: "device", deviceId: "eq1", param: "lowFreq" } })
    );
  });

  it("6: inline row buttons rotate, nudge, randomize and clear the row", async () => {
    // jsdom has no :hover; the buttons take pointer events only while the header is hovered.
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const instance = setup([{ id: "kick", assignment: { type: "note", pitch: 36 }, steps: [{ on: true }] }, TWO_ROWS[1]!]);
    const actions = screen.getByTestId("row-inline-kick");
    for (const name of [/Rotate left/, /Rotate right/, /Decrement/, /Increment/, /Randomize/, /Clear/]) {
      expect(within(actions).getByRole("button", { name })).toBeInTheDocument();
    }
    await user.click(within(actions).getByRole("button", { name: /Rotate right/ }));
    await waitFor(() => expect(rowOf(instance, "kick").steps[1]?.on).toBe(true));
    await user.click(within(actions).getByRole("button", { name: /Clear/ }));
    await waitFor(() => expect(rowOf(instance, "kick").steps.some((s) => s?.on)).toBe(false));
  });
});
