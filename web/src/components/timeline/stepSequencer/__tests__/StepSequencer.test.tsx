/**
 * The Step Sequencer through the clip-editor panel against a real timeline
 * store. Every gesture must land in the document through the ops, one undo
 * entry each. Geometry: steps are 40 px wide with 6 px after every fourth
 * step, rows 60 px tall with 3 px cell insets, and jsdom puts every strip at
 * (0, 0).
 */

import React from "react";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import { DEFAULT_MIDI_INSTRUMENT, makeTrack, normalizePattern } from "@nodetool-ai/timeline";
import type { StepPattern, StepRow, TimelineClip } from "@nodetool-ai/timeline";

import mockTheme from "../../../../__mocks__/themeMock";
import { TimelineProvider, createTimelineInstance, type TimelineInstance } from "../../../../stores/timeline/TimelineInstance";
import { timelineTemporalOf } from "../../../../stores/timeline/TimelineStore";
import { PianoRollPanel } from "../../pianoRoll/PianoRollPanel";

jest.mock("../../preview/audition", () => ({
  playAuditionNote: jest.fn(() => Promise.resolve()),
  AUDITION_NOTE_MS: 600,
  AUDITION_DEFAULT_PITCH: 60
}));
jest.mock("../../../../hooks/timeline/useTimelineAgentBridge", () => ({
  createBrowserStepPatternLibrary: () => ({ list: async () => [], save: async () => ({ id: "u1" }) })
}));

const CLIP_ID = "clip-pattern";
const x = (step: number): number => step * 40 + Math.floor(step / 4) * 6 + 20;
/** Client y for a value fraction inside a 60 px row. */
const y = (fraction: number): number => 3 + (1 - fraction) * 54;

function seed(instance: TimelineInstance, rows: Array<Partial<StepRow> & Pick<StepRow, "id" | "assignment">>, extra: Partial<StepPattern> = {}): void {
  const track = makeTrack({ type: "midi", name: "Drums", instrument: DEFAULT_MIDI_INSTRUMENT });
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
}

function setup(rows = [{ id: "kick", assignment: { type: "note" as const, pitch: 36 } }], extra: Partial<StepPattern> = {}): TimelineInstance {
  const instance = createTimelineInstance();
  render(
    <ThemeProvider theme={mockTheme}>
      <TimelineProvider instance={instance}>
        <PianoRollPanel />
      </TimelineProvider>
    </ThemeProvider>
  );
  seed(instance, rows, extra);
  return instance;
}

const patternOf = (i: TimelineInstance): StepPattern => i.doc.getState().clips.find((c) => c.id === CLIP_ID)!.pattern!;
const stepsOf = (i: TimelineInstance, rowId = "kick") => patternOf(i).rows.find((r) => r.id === rowId)!.steps;
const undoDepth = (i: TimelineInstance): number => timelineTemporalOf(i.doc).pastStates.length;

beforeAll(() => {
  HTMLElement.prototype.setPointerCapture = jest.fn();
  HTMLElement.prototype.releasePointerCapture = jest.fn();
});

const press = (target: HTMLElement, cx: number, cy: number) => ({ keys: "[MouseLeft>]", target, coords: { clientX: cx, clientY: cy } }) as const;
const move = (target: HTMLElement, cx: number, cy: number) => ({ target, coords: { clientX: cx, clientY: cy } }) as const;
const release = (target: HTMLElement, cx: number, cy: number) => ({ keys: "[/MouseLeft]", target, coords: { clientX: cx, clientY: cy } }) as const;

describe("Step Sequencer", () => {
  it("step-records a MIDI chord as one undo entry at the chord boundary (F2)", async () => {
    const input = new EventTarget() as EventTarget & { type: string };
    input.type = "input";
    const access = Object.assign(new EventTarget(), { inputs: new Map([["i", input]]) });
    Object.defineProperty(navigator, "requestMIDIAccess", { configurable: true, value: () => Promise.resolve(access) });
    const send = (data: number[]) => input.dispatchEvent(Object.assign(new Event("midimessage"), { data: Uint8Array.from(data) }));
    const user = userEvent.setup();
    const instance = setup([60, 64, 67].map((p) => ({ id: `n${p}`, assignment: { type: "note" as const, pitch: p } })));
    await user.click(screen.getByTestId("row-header-n60"));
    await user.click(screen.getByRole("button", { name: "MIDI In (step recording)" }));
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    const before = undoDepth(instance);
    await act(async () => {
      send([0x90, 64, 100]);
      await new Promise((r) => setTimeout(r, 5));
      send([0x90, 67, 100]);
      await new Promise((r) => setTimeout(r, 5));
      send([0x80, 64, 0]);
      send([0x80, 67, 0]);
      await new Promise((r) => setTimeout(r, 5));
    });
    await waitFor(() => expect(stepsOf(instance, "n67")[0]?.on).toBe(true));
    expect(stepsOf(instance, "n64")[0]?.on).toBe(true);
    expect(undoDepth(instance)).toBe(before + 1);
    delete (navigator as { requestMIDIAccess?: unknown }).requestMIDIAccess;
  });

  it("opens on the Step Sequencer tab for a pattern region (SQ27)", () => {
    const instance = setup();
    expect(instance.ui.getState().clipEditorTab).toBe("stepSequencer");
    expect(screen.getByTestId("step-sequencer")).toBeInTheDocument();
    expect(screen.getByTestId("step-sequencer-bar1")).toBeInTheDocument();
  });

  it("toggles a step with a click and paints a drag as one undo entry (SQ32, SQ46)", async () => {
    const user = userEvent.setup();
    const instance = setup();
    const strip = screen.getByTestId("strip-kick-onOff");
    await user.pointer([press(strip, x(0), 20), release(strip, x(0), 20)]);
    await waitFor(() => expect(stepsOf(instance)[0]?.on).toBe(true));

    const before = undoDepth(instance);
    await user.pointer([
      press(strip, x(2), 20),
      ...[3, 4, 5, 6, 7, 8, 9].map((s) => move(strip, x(s), 20)),
      release(strip, x(9), 20)
    ]);
    await waitFor(() => expect(stepsOf(instance).filter((s) => s?.on)).toHaveLength(9));
    expect(undoDepth(instance)).toBe(before + 1);
    act(() => timelineTemporalOf(instance.doc).undo());
    expect(stepsOf(instance).filter((s) => s?.on)).toHaveLength(1);
  });

  it("ties steps with a Command-drag (D74)", async () => {
    const user = userEvent.setup();
    const instance = setup([{ id: "kick", assignment: { type: "note", pitch: 36 }, steps: [{ on: true }] } as never]);
    const strip = screen.getByTestId("strip-kick-onOff");
    await user.keyboard("{Control>}");
    await user.pointer([press(strip, x(0), 20), move(strip, x(2), 20), move(strip, x(3), 20), release(strip, x(3), 20)]);
    await user.keyboard("{/Control}");
    await waitFor(() => expect(stepsOf(instance).slice(1, 4).map((s) => s?.tie)).toEqual([true, true, true]));
  });

  it("writes a ramp from 20 to 80 with Command-Option-drag (SQ33)", async () => {
    const user = userEvent.setup();
    const instance = setup();
    await user.click(screen.getByTestId("mode-select"));
    await user.click(screen.getByRole("menuitemradio", { name: /Velocity/ }));
    const strip = screen.getByTestId("strip-kick-velocity");
    const f = (v: number) => (v - 1) / 126;
    await user.keyboard("{Control>}{Alt>}");
    await user.pointer([press(strip, x(0), y(f(20))), move(strip, x(3), y(f(80))), release(strip, x(3), y(f(80)))]);
    await user.keyboard("{/Alt}{/Control}");
    await waitFor(() => expect(stepsOf(instance).slice(0, 4).map((s) => s?.velocity)).toEqual([20, 40, 60, 80]));
  });

  it("mutes a row from the M button (SQ29)", async () => {
    const user = userEvent.setup();
    const instance = setup();
    await user.click(screen.getByTestId("mute-kick"));
    await waitFor(() => expect(patternOf(instance).rows[0]!.mute).toBe(true));
  });

  it("turns off the other note row at the step with Mono on (SQ37)", async () => {
    const user = userEvent.setup();
    const instance = setup(
      [
        { id: "kick", assignment: { type: "note", pitch: 36 } },
        { id: "snare", assignment: { type: "note", pitch: 38 }, steps: [{ on: true }] } as never
      ],
      { mono: true }
    );
    const strip = screen.getByTestId("strip-kick-onOff");
    await user.pointer([press(strip, x(0), 20), release(strip, x(0), 20)]);
    await waitFor(() => expect(stepsOf(instance)[0]?.on).toBe(true));
    expect(stepsOf(instance, "snare")[0]?.on).not.toBe(true);
  });

  it("shows * for mixed velocities and applies a relative change (SQ31)", async () => {
    const user = userEvent.setup();
    const instance = setup([
      { id: "kick", assignment: { type: "note", pitch: 36 }, steps: [{ on: true, velocity: 80 }, { on: true, velocity: 100 }] } as never
    ]);
    const strip = screen.getByTestId("strip-kick-onOff");
    await user.keyboard("{Shift>}");
    await user.pointer([press(strip, x(0), 20), release(strip, x(0), 20)]);
    await user.pointer([press(strip, x(1), 20), release(strip, x(1), 20)]);
    await user.keyboard("{/Shift}");
    await user.click(screen.getByTestId("toggle-inspector"));
    const inspector = screen.getByTestId("step-sequencer-inspector");
    await user.click(within(inspector).getByRole("tab", { name: "Step" }));
    const field = within(inspector).getByLabelText("Velocity") as HTMLInputElement;
    expect(field.value).toBe("*");
    await user.clear(field);
    await user.type(field, "10{Enter}");
    await waitFor(() => expect(stepsOf(instance).slice(0, 2).map((s) => s?.velocity)).toEqual([90, 110]));
  });

  it("runs a shortcut through the ops: Command-R repeats the selected step", async () => {
    const user = userEvent.setup();
    const instance = setup([{ id: "kick", assignment: { type: "note", pitch: 36 }, steps: [{ on: true, velocity: 64 }] } as never]);
    const strip = screen.getByTestId("strip-kick-onOff");
    await user.keyboard("{Shift>}");
    await user.pointer([press(strip, x(0), 20), release(strip, x(0), 20)]);
    await user.keyboard("{/Shift}");
    screen.getByTestId("step-sequencer").focus();
    await user.keyboard("{Control>}r{/Control}");
    await waitFor(() => expect(stepsOf(instance)[1]).toEqual({ on: true, velocity: 64 }));
  });
  it("keeps the inspector tab when the selected row changes (SQ31)", async () => {
    const user = userEvent.setup();
    setup([
      { id: "kick", assignment: { type: "note", pitch: 36 } },
      { id: "hat", assignment: { type: "note", pitch: 42 } }
    ] as never);
    await user.click(screen.getByTestId("toggle-inspector"));
    const inspector = screen.getByTestId("step-sequencer-inspector");
    await user.click(screen.getByTestId("row-header-kick"));
    await user.click(within(inspector).getByRole("tab", { name: "Row" }));
    await user.click(screen.getByTestId("row-header-hat"));
    expect(screen.getByTestId("step-sequencer-inspector")).toBe(inspector);
    expect(within(inspector).getByRole("tab", { name: "Row" })).toHaveAttribute("aria-selected", "true");
  });
});
