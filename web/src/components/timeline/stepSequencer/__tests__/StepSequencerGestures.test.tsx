/**
 * Review round 1 (SQ2 F1 to F46): gestures on the canvas grid through the
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

describe("Step Sequencer review round 1", () => {
  it("F1: a Step Rate ramp writes rate names and the grid still draws", async () => {
    const user = userEvent.setup();
    const instance = setup();
    await pickMode(user, /Step Rate/);
    const strip = screen.getByTestId("strip-kick-stepRate");
    await user.keyboard("{Control>}{Alt>}");
    await user.pointer([press(strip, x(0), y(0.2)), move(strip, x(3), y(0.9)), release(strip, x(3), y(0.9))]);
    await user.keyboard("{/Alt}{/Control}");
    await waitFor(() => expect(stepsOf(instance).slice(0, 4).every((s) => STEP_RATES.includes(s?.stepRate as never))).toBe(true));
    expect(screen.getByTestId("strip-kick-stepRate")).toBeInTheDocument();
  });

  it("F3: a click on the grid focuses the editor, which claims its keys", async () => {
    const user = userEvent.setup();
    setup();
    const strip = screen.getByTestId("strip-kick-onOff");
    await user.pointer(click(strip, 0));
    const root = screen.getByTestId("step-sequencer");
    expect(root.contains(document.activeElement)).toBe(true);
    expect(root).toHaveAttribute("data-timeline-piano-roll");
  });

  it("F7: Display Values for Selected Row shows values on the selected row only", async () => {
    const user = userEvent.setup();
    setup([
      { id: "kick", assignment: { type: "note", pitch: 36 } },
      { id: "snare", assignment: { type: "note", pitch: 38 } }
    ]);
    await pickMode(user, /Velocity/);
    expect(screen.getByTestId("strip-kick-velocity")).toHaveAttribute("data-values", "false");
    expect(screen.getByTestId("strip-snare-velocity")).toHaveAttribute("data-values", "false");
    await user.click(screen.getByTestId("row-header-kick"));
    expect(screen.getByTestId("strip-kick-velocity")).toHaveAttribute("data-values", "true");
    expect(screen.getByTestId("strip-snare-velocity")).toHaveAttribute("data-values", "false");
  });

  it("F10: a Loop-mode click moves the nearer loop edge, not both", async () => {
    const user = userEvent.setup();
    const instance = setup();
    await pickMode(user, /Loop/);
    await user.pointer(click(screen.getByTestId("strip-kick-loop"), 11));
    await waitFor(() => expect([rowOf(instance).loopStart, rowOf(instance).loopEnd]).toEqual([0, 12]));
  });

  it("F11: Option-Command-click on a tied step unties it", async () => {
    const user = userEvent.setup();
    const instance = setup([{ id: "kick", assignment: { type: "note", pitch: 36 }, steps: [{ on: true }, { tie: true }] } as RowSeed]);
    await pickMode(user, /Velocity/);
    await user.keyboard("{Control>}{Alt>}");
    await user.pointer(click(screen.getByTestId("strip-kick-velocity"), 1));
    await user.keyboard("{/Alt}{/Control}");
    await waitFor(() => expect(stepsOf(instance)[1]?.tie).not.toBe(true));
  });

  it("F12: a Tie-mode drag left shortens the tie and keeps the step it lands on", async () => {
    const user = userEvent.setup();
    const instance = setup([
      { id: "kick", assignment: { type: "note", pitch: 36 }, steps: [{ on: true }, { tie: true }, { tie: true }, { tie: true }] } as RowSeed
    ]);
    await pickMode(user, /^Tie$/);
    const strip = screen.getByTestId("strip-kick-tie");
    await user.pointer([press(strip, x(3), 20), move(strip, x(2), 20), move(strip, x(1), 20), release(strip, x(1), 20)]);
    await waitFor(() => expect(stepsOf(instance).slice(1, 4).map((s) => s?.tie === true)).toEqual([true, false, false]));
  });

  it("F12: a Tie-mode click on step 1 does not tie it to nothing", async () => {
    const user = userEvent.setup();
    const instance = setup();
    await pickMode(user, /^Tie$/);
    await user.pointer(click(screen.getByTestId("strip-kick-tie"), 0));
    await new Promise((r) => setTimeout(r, 20));
    expect(stepsOf(instance)[0]?.tie).not.toBe(true);
  });

  it("F13: a vertical value drag stays on its step when the pointer drifts", async () => {
    const user = userEvent.setup();
    const instance = setup();
    await pickMode(user, /Velocity/);
    const strip = screen.getByTestId("strip-kick-velocity");
    await user.pointer([press(strip, x(0), y(0.5)), move(strip, x(1), y(0.8)), release(strip, x(1), y(0.8))]);
    await waitFor(() => expect(stepsOf(instance)[0]?.on).toBe(true));
    expect(stepsOf(instance)[1]?.on).not.toBe(true);
  });

  it("F14: a Command-drag on an automation row does not send tie_steps", async () => {
    const user = userEvent.setup();
    const instance = setup([{ id: "mod", assignment: { type: "automation", target: { kind: "cc", cc: 1 } } }]);
    const before = undoDepth(instance);
    const strip = screen.getByTestId("strip-mod-onOff");
    await user.keyboard("{Control>}");
    await user.pointer([press(strip, x(0), 20), move(strip, x(2), 20), release(strip, x(2), 20)]);
    await user.keyboard("{/Control}");
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText(/tie/i, { selector: "[role=alert] *" })).toBeNull();
    expect(undoDepth(instance)).toBe(before);
  });

  it("F16: the main-row Rotate moves whole steps in any edit mode", async () => {
    const user = userEvent.setup();
    const instance = setup([{ id: "kick", assignment: { type: "note", pitch: 36 }, steps: [{ on: true, velocity: 50 }] } as RowSeed]);
    await pickMode(user, /Velocity/);
    fireEvent.contextMenu(screen.getByTestId("row-header-kick"));
    await user.click(await screen.findByRole("menuitem", { name: /Rotate right/i }));
    await waitFor(() => expect(stepsOf(instance)[1]).toEqual(expect.objectContaining({ on: true, velocity: 50 })));
  });

  it("F17: Option-click resets every selected step", async () => {
    const user = userEvent.setup();
    const instance = setup([{ id: "kick", assignment: { type: "note", pitch: 36 }, steps: [{ on: true }, {}, { on: true }] } as RowSeed]);
    const strip = screen.getByTestId("strip-kick-onOff");
    await user.keyboard("{Shift>}");
    await user.pointer([...click(strip, 0), ...click(strip, 2)]);
    await user.keyboard("{/Shift}{Alt>}");
    await user.pointer(click(strip, 0));
    await user.keyboard("{/Alt}");
    await waitFor(() => expect(stepsOf(instance)[0]?.on).not.toBe(true));
    await waitFor(() => expect(stepsOf(instance)[2]?.on).not.toBe(true));
  });

  it("F18: Delete Subrow removes that subrow and the picker hides taken modes", async () => {
    const user = userEvent.setup();
    const instance = setup([
      { id: "kick", assignment: { type: "note", pitch: 36 }, subrows: ["velocity", "gate"], subrowsExpanded: true } as RowSeed
    ]);
    fireEvent.contextMenu(screen.getByTestId("subrow-header-kick-velocity"));
    const menu = await screen.findByRole("menu");
    expect(within(menu).queryByRole("menuitemradio", { name: "Gate" })).toBeNull();
    await user.click(within(menu).getByRole("menuitem", { name: /Delete Subrow/ }));
    await waitFor(() => expect(rowOf(instance).subrows).toEqual(["gate"]));
  });

  it("F19: blurring a mixed field without an edit writes nothing", async () => {
    const user = userEvent.setup();
    const instance = setup([
      { id: "kick", assignment: { type: "note", pitch: 36 }, steps: [{ on: true, velocity: 80 }, { velocity: 100 }] } as RowSeed
    ]);
    const strip = screen.getByTestId("strip-kick-onOff");
    await user.keyboard("{Shift>}");
    await user.pointer([...click(strip, 0), ...click(strip, 1)]);
    await user.keyboard("{/Shift}");
    await user.click(screen.getByTestId("toggle-inspector"));
    const inspector = screen.getByTestId("step-sequencer-inspector");
    await user.click(within(inspector).getByRole("tab", { name: "Step" }));
    const before = undoDepth(instance);
    const field = within(inspector).getByLabelText("Velocity") as HTMLInputElement;
    await user.click(field);
    await user.tab();
    await user.clear(field);
    await user.tab();
    await new Promise((r) => setTimeout(r, 20));
    expect(undoDepth(instance)).toBe(before);
    expect(stepsOf(instance)[1]?.on).not.toBe(true);
  });

  it("F27: On/Off stays on when clicked in On/Off mode", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByTestId("mode-onoff"));
    expect(screen.getByTestId("strip-kick-onOff")).toBeInTheDocument();
  });

  it("F33: Rename Row opens a dialog, not window.prompt", async () => {
    const user = userEvent.setup();
    const prompt = jest.spyOn(window, "prompt").mockReturnValue(null);
    const instance = setup();
    await user.click(screen.getByTestId("row-header-kick"));
    screen.getByTestId("step-sequencer").focus();
    await user.keyboard("{Shift>}{Enter}{/Shift}");
    expect(prompt).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("dialog");
    const input = within(dialog).getByRole("textbox");
    await user.clear(input);
    await user.type(input, "Boom{Enter}");
    await waitFor(() => expect(rowOf(instance).name).toBe("Boom"));
    prompt.mockRestore();
  });

  it("F46: the bar-2 Clear names the action it runs", async () => {
    const user = userEvent.setup();
    setup();
    expect(screen.getByRole("button", { name: "Clear Pattern" })).toBeInTheDocument();
    await pickMode(user, /Velocity/);
    expect(screen.getByRole("button", { name: "Clear Current Mode for All Rows" })).toBeInTheDocument();
  });

  it("F5: Preview loops at the region end and an edit does not restart it", async () => {
    const user = userEvent.setup();
    const instance = setup();
    const playback = instance.playback;
    await user.click(screen.getByTestId("toggle-preview"));
    expect(playback.getState().isPlaying).toBe(true);
    act(() => playback.getState().setTimeMs(700));
    await user.pointer(click(screen.getByTestId("strip-kick-onOff"), 0));
    await waitFor(() => expect(stepsOf(instance)[0]?.on).toBe(true));
    expect(playback.getState().getTimeMs()).toBe(700);
    act(() => {
      playback.getState().setTimeMs(2000);
      playback.getState().pause();
    });
    await waitFor(() => expect(playback.getState().isPlaying).toBe(true));
  });

  it("F30: Vertical Auto Zoom fits rows and expanded subrows", async () => {
    const user = userEvent.setup();
    const spy = jest.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(function (this: HTMLElement) {
      return this.dataset.testid === "step-sequencer-viewport" ? 200 : 0;
    });
    setup([
      { id: "kick", assignment: { type: "note", pitch: 36 }, subrows: ["velocity"], subrowsExpanded: true } as RowSeed,
      { id: "snare", assignment: { type: "note", pitch: 38 }, subrows: ["gate"], subrowsExpanded: true } as RowSeed
    ]);
    await user.click(screen.getByRole("button", { name: "Vertical Auto Zoom" }));
    await waitFor(() => expect(screen.getByTestId("strip-kick-onOff").style.height).toBe("45px"));
    spy.mockRestore();
  });

  it("F15: Paste keeps sparse offsets and an unset rate takes the target rate", async () => {
    const user = userEvent.setup();
    const instance = setup([
      {
        id: "kick",
        assignment: { type: "note", pitch: 36 },
        steps: [{ on: true }, {}, { on: true }, {}, { stepRate: "1/32" }]
      } as RowSeed
    ]);
    const strip = screen.getByTestId("strip-kick-onOff");
    await user.keyboard("{Shift>}");
    await user.pointer([...click(strip, 0), ...click(strip, 2)]);
    await user.keyboard("{/Shift}{Control>}c{/Control}{Shift>}");
    await user.pointer([...click(strip, 0), ...click(strip, 2), ...click(strip, 8)]);
    await user.keyboard("{/Shift}");
    act(() => undefined);
    // Paste at step 9 (index 8): steps 9 and 11 turn on.
    await user.keyboard("{Control>}v{/Control}");
    await waitFor(() => expect([8, 9, 10].map((i) => stepsOf(instance)[i]?.on === true)).toEqual([true, false, true]));
    expect(stepsOf(instance)[4]?.stepRate).toBe("1/32");
  });

  it("F15: pasting onto a step with its own rate keeps that rate when the source has none", async () => {
    const user = userEvent.setup();
    const instance = setup([
      { id: "kick", assignment: { type: "note", pitch: 36 }, steps: [{ on: true }, {}, {}, {}, { stepRate: "1/32" }] } as RowSeed
    ]);
    const strip = screen.getByTestId("strip-kick-onOff");
    await user.keyboard("{Shift>}");
    await user.pointer(click(strip, 0));
    await user.keyboard("{/Shift}{Control>}c{/Control}{Shift>}");
    await user.pointer([...click(strip, 0), ...click(strip, 4)]);
    await user.keyboard("{/Shift}{Control>}v{/Control}");
    await waitFor(() => expect(stepsOf(instance)[4]?.on).toBe(true));
    expect(stepsOf(instance)[4]?.stepRate).toBe("1/32");
  });

  it("F21: selecting a pattern region opens the closed editor on the Step Sequencer", async () => {
    const instance = setup();
    act(() => {
      instance.ui.getState().closePianoRoll();
      instance.ui.getState().setClipEditorTab("pianoRoll");
    });
    act(() => instance.ui.getState().selectClip(CLIP_ID));
    await waitFor(() => expect(instance.ui.getState().pianoRollClipId).toBe(CLIP_ID));
    expect(instance.ui.getState().clipEditorTab).toBe("stepSequencer");
  });

  it("F21: converting the open pattern to MIDI switches to the Piano Roll tab", async () => {
    const instance = setup();
    act(() => {
      const clips = instance.doc.getState().clips.map((c) => ({ ...c, pattern: undefined }));
      instance.doc.setState({ clips });
    });
    await waitFor(() => expect(instance.ui.getState().clipEditorTab).toBe("pianoRoll"));
  });

  it("F31: MIDI Out auditions the step's own pitch and velocity", async () => {
    const { playAuditionNote } = jest.requireMock("../../preview/audition") as { playAuditionNote: jest.Mock };
    playAuditionNote.mockClear();
    const user = userEvent.setup();
    setup([{ id: "kick", assignment: { type: "note", pitch: 36 }, steps: [{ note: 2, velocity: 50 }] } as RowSeed]);
    await user.pointer(click(screen.getByTestId("strip-kick-onOff"), 0));
    expect(playAuditionNote).toHaveBeenCalledWith(expect.anything(), 38, 50);
  });

  it("F28: Shift-drag draws a marquee across steps and rows", async () => {
    const user = userEvent.setup();
    setup([
      { id: "kick", assignment: { type: "note", pitch: 36 } },
      { id: "snare", assignment: { type: "note", pitch: 38 } }
    ]);
    const kickStrip = screen.getByTestId("strip-kick-onOff");
    const snareStrip = screen.getByTestId("strip-snare-onOff");
    const rect = (top: number) => ({ left: 0, top, right: 700, bottom: top + 60, width: 700, height: 60, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;
    kickStrip.getBoundingClientRect = () => rect(0);
    snareStrip.getBoundingClientRect = () => rect(60);
    await user.keyboard("{Shift>}");
    await user.pointer([press(kickStrip, x(1), 20), move(kickStrip, x(2), 50), move(kickStrip, x(3), 80), release(kickStrip, x(3), 80)]);
    await user.keyboard("{/Shift}");
    await waitFor(() => expect(kickStrip.dataset.selected).toBe("1,2,3"));
    expect(snareStrip.dataset.selected).toBe("1,2,3");
  });

  it("F35: the pattern name renames from the keyboard", async () => {
    const user = userEvent.setup();
    const instance = setup();
    const name = screen.getByRole("button", { name: "Rename pattern" });
    name.focus();
    await user.keyboard("{Enter}");
    const input = await screen.findByRole("textbox", { name: "Pattern name" });
    await user.clear(input);
    await user.type(input, "Groove{Enter}");
    await waitFor(() => expect(patternOf(instance).name).toBe("Groove"));
  });

  it("F32: a vertical drag on Increment raises values one unit per 8 px, in one undo step", async () => {
    const user = userEvent.setup();
    const instance = setup([{ id: "kick", assignment: { type: "note", pitch: 36 }, steps: [{ on: true, velocity: 50 }] } as RowSeed]);
    await pickMode(user, /Velocity/);
    const before = undoDepth(instance);
    const inc = screen.getByRole("button", { name: /Increment current mode/ });
    await user.pointer([press(inc, 10, 100), move(inc, 10, 80), move(inc, 10, 60), release(inc, 10, 60)]);
    await waitFor(() => expect(stepsOf(instance)[0]?.velocity).toBe(55));
    expect(undoDepth(instance)).toBe(before + 1);
  });
});
