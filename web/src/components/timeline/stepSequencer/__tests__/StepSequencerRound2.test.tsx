/**
 * Review round 2 (SQ2 F47 to F54): gestures on the canvas grid through the
 * clip-editor panel against a real timeline store. Geometry as in
 * StepSequencer.test.tsx: 40 px steps, 6 px after every fourth step, 60 px
 * rows, every strip at (0, 0) in jsdom. Off macOS, Command is Control.
 */

import React from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import { DEFAULT_MIDI_INSTRUMENT, STEP_RATES, makeTrack, normalizePattern } from "@nodetool-ai/timeline";
import type { StepPattern, StepRow, TimelineClip } from "@nodetool-ai/timeline";

import mockTheme from "../../../../__mocks__/themeMock";
import { TimelineProvider, createTimelineInstance, type TimelineInstance } from "../../../../stores/timeline/TimelineInstance";
import { timelineTemporalOf } from "../../../../stores/timeline/TimelineStore";
import { PianoRollPanel } from "../../pianoRoll/PianoRollPanel";
import { paintStrip } from "../stepStripPaint";

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
const x = (step: number): number => step * 40 + Math.floor(step / 4) * 6 + 20;
const y = (fraction: number): number => 3 + (1 - fraction) * 54;
type RowSeed = Partial<StepRow> & Pick<StepRow, "id" | "assignment">;

function setup(rows: RowSeed[] = [{ id: "kick", assignment: { type: "note", pitch: 36 } }], extra: Partial<StepPattern> = {}): TimelineInstance {
  const instance = createTimelineInstance();
  render(
    <ThemeProvider theme={mockTheme}>
      <TimelineProvider instance={instance}>
        <PianoRollPanel />
      </TimelineProvider>
    </ThemeProvider>
  );
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
  return instance;
}

const patternOf = (i: TimelineInstance): StepPattern => i.doc.getState().clips.find((c) => c.id === CLIP_ID)!.pattern!;
const rowOf = (i: TimelineInstance, rowId = "kick") => patternOf(i).rows.find((r) => r.id === rowId)!;
const stepsOf = (i: TimelineInstance, rowId = "kick") => rowOf(i, rowId).steps;
const undoDepth = (i: TimelineInstance): number => timelineTemporalOf(i.doc).pastStates.length;

const ctxStub = new Proxy({}, { get: (_t, k) => (k === "measureText" ? () => ({ width: 0 }) : () => undefined), set: () => true });
class TestPointerEvent extends MouseEvent {
  pointerId: number;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
  }
}
beforeAll(() => {
  (window as { PointerEvent?: unknown }).PointerEvent = TestPointerEvent;
  HTMLCanvasElement.prototype.getContext = jest.fn(() => ctxStub) as never;
  HTMLElement.prototype.setPointerCapture = jest.fn();
  HTMLElement.prototype.releasePointerCapture = jest.fn();
});

const press = (target: HTMLElement, cx: number, cy: number) => ({ keys: "[MouseLeft>]", target, coords: { clientX: cx, clientY: cy } }) as const;
const move = (target: HTMLElement, cx: number, cy: number) => ({ target, coords: { clientX: cx, clientY: cy } }) as const;
const release = (target: HTMLElement, cx: number, cy: number) => ({ keys: "[/MouseLeft]", target, coords: { clientX: cx, clientY: cy } }) as const;

const paintMock = paintStrip as jest.Mock;
const lastPaint = (rowId = "kick") =>
  [...paintMock.mock.calls].reverse().find((c) => (c[1] as { row: StepRow }).row.id === rowId)?.[1] as
    | { playStep?: number; preview: unknown }
    | undefined;
const pdown = (el: HTMLElement, id: number, step: number) =>
  fireEvent.pointerDown(el, { pointerId: id, button: 0, clientX: x(step), clientY: 20 });
const pup = (el: HTMLElement, id: number, step: number) =>
  fireEvent.pointerUp(el, { pointerId: id, button: 0, clientX: x(step), clientY: 20 });

describe("Step Sequencer review round 2", () => {
  beforeEach(() => paintMock.mockClear());

  it("F53: a second pointer does not start or drive a second gesture", async () => {
    const instance = setup();
    const strip = screen.getByTestId("strip-kick-onOff");
    pdown(strip, 1, 0);
    pdown(strip, 2, 6);
    pup(strip, 2, 6);
    fireEvent.pointerMove(strip, { pointerId: 2, clientX: x(9), clientY: 20 });
    pup(strip, 1, 0);
    await waitFor(() => expect(stepsOf(instance)[0]?.on).toBe(true));
    expect(stepsOf(instance).filter((s) => s?.on)).toHaveLength(1);
  });

  it("F51: pausing clears the playing-step frame", async () => {
    const instance = setup([{ id: "kick", assignment: { type: "note", pitch: 36 }, steps: [{ on: true }] }]);
    const playback = instance.playback;
    act(() => {
      playback.getState().play();
      playback.getState().setTimeMs(300);
    });
    await waitFor(() => expect(lastPaint()?.playStep).toBeDefined());
    act(() => playback.getState().pause());
    await waitFor(() => expect(lastPaint()?.playStep).toBeUndefined());
  });

  it("F52: a device-pixel-ratio change repaints at the new resolution", async () => {
    const listeners: Array<() => void> = [];
    const original = window.matchMedia;
    window.matchMedia = ((q: string) => ({
      matches: false,
      media: q,
      addEventListener: (_: string, l: () => void) => listeners.push(l),
      removeEventListener: () => undefined
    })) as never;
    setup();
    const canvas = screen.getByTestId("strip-kick-onOff") as HTMLCanvasElement;
    const w1 = canvas.width;
    Object.defineProperty(window, "devicePixelRatio", { configurable: true, value: 2 });
    act(() => listeners.forEach((l) => l()));
    expect(canvas.width).toBe(w1 * 2);
    Object.defineProperty(window, "devicePixelRatio", { configurable: true, value: 1 });
    window.matchMedia = original;
  });

  it("F50: an earlier gesture settling does not erase a held gesture's preview", async () => {
    const instance = setup([
      { id: "kick", assignment: { type: "note", pitch: 36 } },
      { id: "snare", assignment: { type: "note", pitch: 38 } }
    ]);
    const kick = screen.getByTestId("strip-kick-onOff");
    pdown(kick, 1, 0);
    pup(kick, 1, 0);
    fireEvent.pointerDown(kick, { pointerId: 3, button: 0, clientX: x(4), clientY: 20 });
    fireEvent.pointerMove(kick, { pointerId: 3, clientX: x(6), clientY: 20 });
    await waitFor(() => expect(stepsOf(instance)[0]?.on).toBe(true));
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(lastPaint()?.preview).not.toBeNull();
    pup(kick, 3, 6);
    await waitFor(() => expect(stepsOf(instance)[6]?.on).toBe(true));
  });

  it("F15: Paste writes every setting and Paste Steps writes only the current mode", async () => {
    const user = userEvent.setup();
    const instance = setup([
      { id: "kick", assignment: { type: "note", pitch: 36 }, steps: [{ on: true, velocity: 40 }, {}, { velocity: 90 }, {}, { velocity: 90 }] }
    ]);
    const strip = screen.getByTestId("strip-kick-onOff");
    const clickAt = (s: number) => [press(strip, x(s), 20), release(strip, x(s), 20)];
    await user.keyboard("{Shift>}");
    await user.pointer(clickAt(0));
    await user.keyboard("{/Shift}{Control>}c{/Control}{Shift>}");
    await user.pointer([...clickAt(0), ...clickAt(2)]);
    await user.keyboard("{/Shift}{Alt>}{Shift>}V{/Shift}{/Alt}");
    await waitFor(() => expect(stepsOf(instance)[2]?.on).toBe(true));
    expect(stepsOf(instance)[2]?.velocity).toBe(90);
    await user.keyboard("{Shift>}");
    await user.pointer([...clickAt(2), ...clickAt(4)]);
    await user.keyboard("{/Shift}{Control>}v{/Control}");
    await waitFor(() => expect(stepsOf(instance)[4]?.on).toBe(true));
    expect(stepsOf(instance)[4]?.velocity).toBe(40);
  });

  it("F17: Option over a strip shows the eraser cursor", () => {
    setup();
    const strip = screen.getByTestId("strip-kick-onOff");
    fireEvent.pointerMove(strip, { altKey: true, clientX: x(1), clientY: 20 });
    expect(strip.style.cursor).toBe("not-allowed");
    fireEvent.pointerMove(strip, { altKey: false, clientX: x(1), clientY: 20 });
    expect(strip.style.cursor).toBe("pointer");
  });

  it("F38: Step Sequencer files import outlined icons only", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("fs") as typeof import("fs");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require("path") as typeof import("path");
    const dir = path.join(__dirname, "..");
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".tsx"));
    expect(files.length).toBeGreaterThan(3);
    const filled = files.flatMap((f) =>
      [...fs.readFileSync(path.join(dir, f), "utf8").matchAll(/@mui\/icons-material\/(\w+)"/g)].map((m) => m[1]!).filter((n) => !n.endsWith("Outlined"))
    );
    expect(filled).toEqual([]);
  });

  it("F30: Vertical Auto Zoom leaves room for the 18 px ruler", async () => {
    const user = userEvent.setup();
    const spy = jest.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(function (this: HTMLElement) {
      return this.dataset.testid === "step-sequencer-viewport" ? 218 : 0;
    });
    setup([
      { id: "kick", assignment: { type: "note", pitch: 36 }, subrows: ["velocity"], subrowsExpanded: true },
      { id: "snare", assignment: { type: "note", pitch: 38 }, subrows: ["gate"], subrowsExpanded: true }
    ]);
    await user.click(screen.getByRole("button", { name: "Vertical Auto Zoom" }));
    await waitFor(() => expect(screen.getByTestId("strip-kick-onOff").style.height).toBe("50px"));
    spy.mockRestore();
  });

  it("M/S is one evenly bordered pill: the group draws the border", () => {
    // jsdom does not resolve MUI's option border cascade, so this checks the
    // group border; the screenshot checks the options.
    setup();
    expect(getComputedStyle(screen.getByTestId("mute-kick").parentElement!).borderStyle).toBe("solid");
  });
});
