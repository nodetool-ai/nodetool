/** Review round 9 (SQ2 F23, F57-F62): Step Sequencer panel against a real timeline store. */

import React from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import { DEFAULT_MIDI_INSTRUMENT, STEP_RATES, makeTrack, normalizePattern } from "@nodetool-ai/timeline";
import type { StepPattern, StepRow, TimelineClip, TimelineTrack } from "@nodetool-ai/timeline";

import mockTheme from "../../../../__mocks__/themeMock";
import { TimelineProvider, createTimelineInstance, type TimelineInstance } from "../../../../stores/timeline/TimelineInstance";
import { timelineTemporalOf } from "../../../../stores/timeline/TimelineStore";
import { PianoRollPanel } from "../../pianoRoll/PianoRollPanel";
import en from "../../../../i18n/locales/en.json";

jest.mock("../../preview/audition", () => ({
  playAuditionNote: jest.fn(() => Promise.resolve()),
  AUDITION_NOTE_MS: 600,
  AUDITION_DEFAULT_PITCH: 60
}));
const macPlatform = false;
jest.mock("../../pianoRoll/pianoRollTools", () => ({
  ...jest.requireActual("../../pianoRoll/pianoRollTools"),
  isMacPlatform: () => macPlatform
}));
jest.mock("../../../../hooks/timeline/useTimelineAgentBridge", () => ({
  createBrowserStepPatternLibrary: () => ({ list: async () => [], save: async () => ({ id: "u1" }) })
}));

const CLIP_ID = "clip-pattern";
const x = (step: number): number => step * 40 + Math.floor(step / 4) * 6 + 20;
const y = (fraction: number): number => 3 + (1 - fraction) * 54;
type RowSeed = Partial<StepRow> & Pick<StepRow, "id" | "assignment">;

function setup(
  rows: RowSeed[] = [{ id: "kick", assignment: { type: "note", pitch: 36 } }],
  extra: Partial<StepPattern> = {},
  instrument: TimelineTrack["instrument"] = DEFAULT_MIDI_INSTRUMENT
): TimelineInstance {
  const instance = createTimelineInstance();
  render(
    <ThemeProvider theme={mockTheme}>
      <TimelineProvider instance={instance}>
        <PianoRollPanel />
      </TimelineProvider>
    </ThemeProvider>
  );
  const track = makeTrack({ type: "midi", name: "Drums", instrument });
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
    pattern: normalizePattern({ lengthSteps: 16, rows: rows as StepRow[], ...extra })
  };
  act(() => {
    instance.doc.setState({ tracks: [track], clips: [clip] });
    instance.ui.getState().openPianoRoll(CLIP_ID);
  });
  return instance;
}

const patternOf = (i: TimelineInstance): StepPattern => i.doc.getState().clips.find((c) => c.id === CLIP_ID)!.pattern!;
const rowOf = (i: TimelineInstance, rowId = "kick") => patternOf(i).rows.find((r) => r.id === rowId)!;
const stepsOf = (i: TimelineInstance, rowId = "kick") => rowOf(i, rowId).steps;
const undoDepth = (i: TimelineInstance): number => timelineTemporalOf(i.doc).pastStates.length;

beforeAll(() => {
  HTMLElement.prototype.setPointerCapture = jest.fn();
  HTMLElement.prototype.releasePointerCapture = jest.fn();
});

const press = (target: HTMLElement, cx: number, cy: number) => ({ keys: "[MouseLeft>]", target, coords: { clientX: cx, clientY: cy } }) as const;
const move = (target: HTMLElement, cx: number, cy: number) => ({ target, coords: { clientX: cx, clientY: cy } }) as const;
const release = (target: HTMLElement, cx: number, cy: number) => ({ keys: "[/MouseLeft]", target, coords: { clientX: cx, clientY: cy } }) as const;
const click = (target: HTMLElement, step: number, cy = 20) => [press(target, x(step), cy), release(target, x(step), cy)];

async function pickMode(user: ReturnType<typeof userEvent.setup>, name: RegExp): Promise<void> {
  await user.click(screen.getByTestId("mode-select"));
  await user.click(screen.getByRole("menuitemradio", { name }));
}

const allOn4 = [{ on: true }, { on: true }, { on: true }, { on: true }];
const rect = (el: HTMLElement, top: number, height = 60) => {
  el.getBoundingClientRect = () => ({ top, bottom: top + height, left: 0, right: 800, width: 800, height, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;
};


function fakeMidi(): (data: number[]) => void {
  const input = new EventTarget() as EventTarget & { type: string };
  input.type = "input";
  const access = Object.assign(new EventTarget(), { inputs: new Map([["i", input]]) });
  Object.defineProperty(navigator, "requestMIDIAccess", { configurable: true, value: () => Promise.resolve(access) });
  return (data) => input.dispatchEvent(Object.assign(new Event("midimessage"), { data: Uint8Array.from(data) }));
}
const tick = (ms = 0) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });

afterEach(() => {
  delete (navigator as { requestMIDIAccess?: unknown }).requestMIDIAccess;
});

describe("Step Sequencer review round 9", () => {
  it("F57: turning MIDI input off drops an unfinished recorded chord", async () => {
    const send = fakeMidi();
    const user = userEvent.setup();
    const instance = setup([60, 64].map((p) => ({ id: `n${p}`, assignment: { type: "note" as const, pitch: p } })));
    await user.click(screen.getByTestId("row-header-n60"));
    const record = screen.getByRole("button", { name: "MIDI In (step recording)" });
    await user.click(record);
    await tick();
    await act(async () => { send([0x90, 64, 100]); });
    await user.click(record);
    await tick();
    await act(async () => { send([0x80, 64, 0]); });
    await user.click(screen.getByRole("button", { name: /Add Row/ }));
    await user.click(screen.getByRole("menuitem", { name: /Learn \(Add\)/ }));
    await tick();
    await act(async () => { send([0x90, 72, 100]); send([0x80, 72, 0]); });
    await waitFor(() => expect(patternOf(instance).rows).toHaveLength(3));
    await tick(5);
    expect(stepsOf(instance, "n64")[0]?.on).not.toBe(true);
  });

  it("F58: two controller messages before a render add the row once", async () => {
    const send = fakeMidi();
    const user = userEvent.setup();
    const instance = setup();
    await user.click(screen.getByRole("button", { name: /Add Row/ }));
    await user.click(screen.getByRole("menuitem", { name: /Learn \(Add\)/ }));
    await tick();
    await act(async () => { send([0xb0, 74, 10]); send([0xb0, 74, 20]); });
    await waitFor(() => expect(patternOf(instance).rows.length).toBeGreaterThan(1));
    await tick(5);
    expect(patternOf(instance).rows).toHaveLength(2);
  });

  it("F59: a rename keeps the persisted name sort", async () => {
    const user = userEvent.setup();
    const instance = setup(
      [
        { id: "a", name: "Alpha", assignment: { type: "note", pitch: 36 } } as RowSeed,
        { id: "b", name: "Beta", assignment: { type: "note", pitch: 38 } } as RowSeed
      ],
      { rowSort: "typeAndNameAsc" }
    );
    fireEvent.contextMenu(screen.getByTestId("row-header-a"));
    await user.click(screen.getByRole("menuitem", { name: "Rename Row" }));
    const field = screen.getByLabelText("Row name");
    await user.clear(field);
    await user.type(field, "Zulu{Enter}");
    await waitFor(() => expect(rowOf(instance, "a").name).toBe("Zulu"));
    expect(patternOf(instance).rows.map((r) => r.id)).toEqual(["b", "a"]);
  });

  it("F59: Learn (Assign) keeps the persisted note sort", async () => {
    const send = fakeMidi();
    const user = userEvent.setup();
    const instance = setup(
      [
        { id: "a", assignment: { type: "note", pitch: 36 } },
        { id: "b", assignment: { type: "note", pitch: 38 } }
      ],
      { rowSort: "typeAndNoteAsc" }
    );
    await user.click(screen.getByTestId("row-header-a"));
    await user.click(screen.getByRole("button", { name: /Add Row/ }));
    await user.click(screen.getByRole("menuitem", { name: /Learn \(Assign\)/ }));
    await tick();
    await act(async () => { send([0x90, 50, 100]); send([0x80, 50, 0]); });
    await waitFor(() => expect(rowOf(instance, "a").assignment).toEqual({ type: "note", pitch: 50 }));
    expect(patternOf(instance).rows.map((r) => r.id)).toEqual(["b", "a"]);
  });

  it("F23: Learn (Add) takes notes from the on-screen keyboard and adds a row once", async () => {
    const user = userEvent.setup();
    const instance = setup();
    expect(screen.queryByTestId("learn-keyboard")).toBeNull();
    await user.click(screen.getByRole("button", { name: /Add Row/ }));
    await user.click(screen.getByRole("menuitem", { name: /Learn \(Add\)/ }));
    const keyboard = await screen.findByTestId("learn-keyboard");
    await user.click(within(keyboard).getByRole("button", { name: "D2" }));
    await waitFor(() => expect(patternOf(instance).rows).toHaveLength(2));
    expect(patternOf(instance).rows[1]!.assignment).toEqual({ type: "note", pitch: 38 });
    await user.click(within(keyboard).getByRole("button", { name: "D2" }));
    await tick(5);
    expect(patternOf(instance).rows).toHaveLength(2);
  });
});
