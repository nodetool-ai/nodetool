/**
 * Review round 8 (SQ2 F10, F23, F27, F31, F41, F42): gestures on the canvas grid through the
 * clip-editor panel against a real timeline store. Geometry as in
 * StepSequencer.test.tsx: 40 px steps, 6 px after every fourth step, 60 px
 * rows, every strip at (0, 0) in jsdom. Off macOS, Command is Control.
 */

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
import { STEP_COMMANDS } from "../stepSequencerCommands";

jest.mock("../../preview/audition", () => ({
  playAuditionNote: jest.fn(() => Promise.resolve()),
  AUDITION_NOTE_MS: 600,
  AUDITION_DEFAULT_PITCH: 60
}));
let macPlatform = false;
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

describe("Step Sequencer review round 8", () => {
  it("F10: dragging the loop start keeps the loop end", async () => {
    const user = userEvent.setup();
    const instance = setup();
    await pickMode(user, /Loop/);
    const strip = screen.getByTestId("strip-kick-loop");
    await user.pointer([press(strip, x(1), 20), move(strip, x(5), 20), release(strip, x(5), 20)]);
    await waitFor(() => expect([rowOf(instance).loopStart, rowOf(instance).loopEnd]).toEqual([5, 16]));
  });

  it("F10: dragging the loop end keeps the loop start", async () => {
    const user = userEvent.setup();
    const instance = setup([{ id: "kick", assignment: { type: "note", pitch: 36 }, loopStart: 4 } as RowSeed]);
    await pickMode(user, /Loop/);
    const strip = screen.getByTestId("strip-kick-loop");
    await user.pointer([press(strip, x(14), 20), move(strip, x(9), 20), release(strip, x(9), 20)]);
    await waitFor(() => expect([rowOf(instance).loopStart, rowOf(instance).loopEnd]).toEqual([4, 10]));
  });

  it("F10: a vertical loop drag sets the same edge on every row it crosses", async () => {
    const user = userEvent.setup();
    const instance = setup([
      { id: "kick", assignment: { type: "note", pitch: 36 } },
      { id: "snare", assignment: { type: "note", pitch: 38 }, loopStart: 2 } as RowSeed,
      { id: "hat", assignment: { type: "note", pitch: 42 } }
    ]);
    await pickMode(user, /Loop/);
    const kick = screen.getByTestId("strip-kick-loop");
    rect(kick, 0);
    rect(screen.getByTestId("strip-snare-loop"), 60);
    rect(screen.getByTestId("strip-hat-loop"), 120);
    const before = undoDepth(instance);
    await user.pointer([press(kick, x(15), 20), move(kick, x(11), 90), release(kick, x(11), 90)]);
    await waitFor(() => expect([rowOf(instance, "snare").loopStart, rowOf(instance, "snare").loopEnd]).toEqual([2, 12]));
    expect([rowOf(instance).loopStart, rowOf(instance).loopEnd]).toEqual([0, 12]);
    expect(rowOf(instance, "hat").loopEnd).toBe(16);
    expect(undoDepth(instance)).toBe(before + 1);
  });

  describe("F23: Learn covers every input type", () => {
    let send: (data: number[]) => void;
    beforeEach(() => {
      const input = new EventTarget() as EventTarget & { type: string };
      input.type = "input";
      const access = Object.assign(new EventTarget(), { inputs: new Map([["i", input]]) });
      Object.defineProperty(navigator, "requestMIDIAccess", { configurable: true, value: () => Promise.resolve(access) });
      send = (data) => input.dispatchEvent(Object.assign(new Event("midimessage"), { data: Uint8Array.from(data) }));
    });
    afterEach(() => {
      delete (navigator as { requestMIDIAccess?: unknown }).requestMIDIAccess;
    });
    const learn = async (user: ReturnType<typeof userEvent.setup>, item: RegExp) => {
      await user.click(screen.getByRole("button", { name: /Add Row/ }));
      await user.click(screen.getByRole("menuitem", { name: item }));
      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });
    };
    const play = async (...msgs: number[][]) => {
      await act(async () => {
        for (const m of msgs) {
          send(m);
          await new Promise((r) => setTimeout(r, 5));
        }
      });
    };

    it.each([
      ["a note", [[0x90, 38, 100], [0x80, 38, 0]], { type: "note", pitch: 38 }],
      ["a controller", [[0xb0, 74, 90]], { type: "automation", target: { kind: "cc", cc: 74 } }],
      ["pitch bend", [[0xe0, 0, 80]], { type: "automation", target: { kind: "pitchBend" } }],
      ["channel pressure", [[0xd0, 70]], { type: "automation", target: { kind: "channelPressure" } }]
    ])("Learn (Add) adds a row for %s once", async (_name, msgs, assignment) => {
      const user = userEvent.setup();
      const instance = setup();
      await learn(user, /Learn \(Add\)/);
      await play(...msgs);
      await waitFor(() => expect(patternOf(instance).rows).toHaveLength(2));
      expect(patternOf(instance).rows[1]!.assignment).toEqual(assignment);
      await play(...msgs);
      expect(patternOf(instance).rows).toHaveLength(2);
    });

    it("Learn (Add) adds a kit pad row on a drum track", async () => {
      const user = userEvent.setup();
      const drum = { type: "drum", baseNote: 36, pads: [{ name: "Kick" }, { name: "Snare" }] } as never;
      const instance = setup([{ id: "kick", assignment: { type: "kit", pad: 0 } }], {}, drum);
      await learn(user, /Learn \(Add\)/);
      await play([0x90, 37, 100], [0x80, 37, 0], [0x90, 36, 100], [0x80, 36, 0]);
      await waitFor(() => expect(patternOf(instance).rows).toHaveLength(2));
      expect(patternOf(instance).rows[1]!.assignment).toEqual({ type: "kit", pad: 1 });
    });

    it.each([
      ["pitch bend", [0xe0, 0, 80], { type: "automation", target: { kind: "pitchBend" } }],
      ["channel pressure", [0xd0, 70], { type: "automation", target: { kind: "channelPressure" } }]
    ])("Learn (Assign) assigns %s to the selected row", async (_name, msg, assignment) => {
      const user = userEvent.setup();
      const instance = setup([
        { id: "kick", assignment: { type: "note", pitch: 36 } },
        { id: "cc", assignment: { type: "automation", target: { kind: "cc", cc: 1 } } }
      ]);
      await user.click(screen.getByTestId("row-header-cc"));
      await learn(user, /Learn \(Assign\)/);
      await play(msg);
      await waitFor(() => expect(rowOf(instance, "cc").assignment).toEqual(assignment));
    });
  });

  describe("F27: pattern length menu and page overview menus", () => {
    it("offers the 4, 3, 5 and 7 based lengths up to 64", async () => {
      const user = userEvent.setup();
      const instance = setup();
      await user.click(screen.getByRole("button", { name: "Pattern length" }));
      for (const [base, n] of [["4 Based", 4], ["3 Based", 3], ["5 Based", 5], ["7 Based", 7]] as const) {
        expect(screen.getByRole("menuitem", { name: base })).toBeInTheDocument();
        void n;
      }
      await user.click(screen.getByRole("menuitem", { name: "5 Based" }));
      const five = screen.getAllByRole("menuitemradio").map((el) => el.textContent);
      expect(five).toEqual(Array.from({ length: 12 }, (_, i) => `${(i + 1) * 5} Steps`));
      await user.click(screen.getByRole("menuitemradio", { name: "20 Steps" }));
      await waitFor(() => expect(patternOf(instance).lengthSteps).toBe(20));
    });

    it("lists 21 three based and 9 seven based lengths", async () => {
      const user = userEvent.setup();
      setup();
      await user.click(screen.getByRole("button", { name: "Pattern length" }));
      await user.click(screen.getByRole("menuitem", { name: "3 Based" }));
      expect(screen.getAllByRole("menuitemradio")).toHaveLength(21);
      await user.keyboard("{Escape}");
      await user.click(screen.getByRole("button", { name: "Pattern length" }));
      await user.click(screen.getByRole("menuitem", { name: "7 Based" }));
      expect(screen.getAllByRole("menuitemradio")).toHaveLength(9);
    });

    const pageSetup = () =>
      setup(
        [
          {
            id: "kick",
            assignment: { type: "note", pitch: 36 },
            lengthSteps: 32,
            steps: Array.from({ length: 32 }, (_, i) => (i < 16 && i % 4 === 0 ? { on: true, velocity: 90 } : { on: false }))
          } as RowSeed
        ],
        { lengthSteps: 32 }
      );
    const pageMenu = async (user: ReturnType<typeof userEvent.setup>, page: number, item: string) => {
      const pages = within(screen.getByTestId("page-overview")).getAllByRole("button");
      fireEvent.contextMenu(pages[page]!);
      await user.click(screen.getByRole("menuitem", { name: item }));
    };

    it("copies one page onto another and clears a page from the overview menu", async () => {
      const user = userEvent.setup();
      const instance = pageSetup();
      await pageMenu(user, 0, "Copy Page");
      await pageMenu(user, 1, "Paste Page");
      await waitFor(() => expect(stepsOf(instance).slice(16, 32).map((s) => s?.on === true)).toEqual(stepsOf(instance).slice(0, 16).map((s) => s?.on === true)));
      expect(stepsOf(instance)[16]?.velocity).toBe(90);
      await pageMenu(user, 0, "Clear Page");
      await waitFor(() => expect(stepsOf(instance).slice(0, 16).some((s) => s?.on)).toBe(false));
      expect(stepsOf(instance)[20]?.on).toBe(true);
    });

    it("cuts a page: copies it and leaves it empty", async () => {
      const user = userEvent.setup();
      const instance = pageSetup();
      await pageMenu(user, 0, "Cut Page");
      await waitFor(() => expect(stepsOf(instance).slice(0, 16).some((s) => s?.on)).toBe(false));
      await pageMenu(user, 1, "Paste Page");
      await waitFor(() => expect(stepsOf(instance)[28]?.on).toBe(true));
    });
  });

  describe("F31: audition during value drags", () => {
    const audition = () => jest.requireMock("../../preview/audition") as { playAuditionNote: jest.Mock };
    let now = 0;
    beforeEach(() => {
      now = 1000;
      jest.spyOn(performance, "now").mockImplementation(() => now);
      audition().playAuditionNote.mockClear();
    });
    afterEach(() => jest.restoreAllMocks());

    it("a velocity drag auditions the dragged value, throttled", async () => {
      const user = userEvent.setup();
      setup([{ id: "kick", assignment: { type: "note", pitch: 36 }, steps: [{ on: true }] } as RowSeed]);
      await pickMode(user, /Velocity/);
      const strip = screen.getByTestId("strip-kick-velocity");
      await user.pointer([press(strip, x(0), y(0.2)), move(strip, x(0), y(0.4)), move(strip, x(0), y(0.6))]);
      expect(audition().playAuditionNote).toHaveBeenCalledTimes(1);
      now += 200;
      await user.pointer([move(strip, x(0), y(0.9)), release(strip, x(0), y(0.9))]);
      const calls = audition().playAuditionNote.mock.calls;
      expect(calls).toHaveLength(2);
      expect(calls[0]![1]).toBe(36);
      expect(calls[1]![2]).toBeGreaterThan(calls[0]![2]);
    });

    it("a note drag auditions the dragged pitch", async () => {
      const user = userEvent.setup();
      setup([{ id: "kick", assignment: { type: "melodic", pitch: 60 }, steps: [{ on: true }] } as RowSeed]);
      await pickMode(user, /^Note/);
      const strip = screen.getByTestId("strip-kick-note");
      await user.pointer([press(strip, x(0), y(1)), release(strip, x(0), y(1))]);
      const pitch = audition().playAuditionNote.mock.calls.at(-1)![1] as number;
      expect(pitch).toBeGreaterThan(60);
    });

    it("a ramp drag plays one note per step it crosses", async () => {
      const user = userEvent.setup();
      setup([{ id: "kick", assignment: { type: "note", pitch: 36 }, steps: [{ on: true }, { on: true }, { on: true }, { on: true }] } as RowSeed]);
      await pickMode(user, /Velocity/);
      const strip = screen.getByTestId("strip-kick-velocity");
      await user.keyboard("{Control>}{Alt>}");
      await user.pointer([
        press(strip, x(0), y(0.2)),
        move(strip, x(1), y(0.3)),
        move(strip, x(1) + 5, y(0.35)),
        move(strip, x(2), y(0.5)),
        move(strip, x(3), y(0.9)),
        move(strip, x(3), y(0.95)),
        release(strip, x(3), y(0.95))
      ]);
      await user.keyboard("{/Alt}{/Control}");
      expect(audition().playAuditionNote).toHaveBeenCalledTimes(4);
    });
  });

  describe("F41: every command has an item in the rendered menus", () => {
    const labels = (en as unknown as { stepSequencer: { cmd: Record<string, unknown>; menu: Record<string, string> } }).stepSequencer;
    const labelOf = (id: string): string => {
      const [head, tail] = id.split(".");
      return tail ? (labels.cmd[head!] as Record<string, string>)[tail]! : (labels.cmd[head!] as string);
    };

    it("renders each STEP_COMMANDS entry in its own menu, navigation included", async () => {
      const user = userEvent.setup();
      setup([
        { id: "kick", assignment: { type: "note", pitch: 36 }, steps: [{ on: true }] } as RowSeed,
        { id: "snare", assignment: { type: "note", pitch: 38 } }
      ]);
      const rendered = new Map<string, Map<string, string>>();
      for (const menu of ["edit", "functions", "view"] as const) {
        await user.click(screen.getByRole("button", { name: labels.menu[menu] }));
        const found = new Map<string, string>();
        const collect = () => {
          for (const el of document.querySelectorAll<HTMLElement>("[data-testid^='step-cmd-']")) {
            found.set(el.dataset.testid!.slice("step-cmd-".length), el.querySelector(".MuiListItemText-primary")?.textContent ?? "");
          }
        };
        collect();
        const nav = screen.queryByTestId("step-menu-navigate");
        if (nav) {
          await user.click(nav);
          collect();
        }
        rendered.set(menu, found);
        await user.keyboard("{Escape}");
        await waitFor(() => expect(document.querySelector("[data-testid^='step-cmd-']")).toBeNull());
      }
      const missing = STEP_COMMANDS.filter((c) => rendered.get(c.menu)?.get(c.id) !== labelOf(c.id)).map((c) => c.id);
      expect(missing).toEqual([]);
    });

    it("runs a navigation command from its menu item", async () => {
      const user = userEvent.setup();
      setup();
      const strip = screen.getByTestId("strip-kick-onOff");
      await user.keyboard("{Shift>}");
      await user.pointer(click(strip, 0));
      await user.keyboard("{/Shift}");
      expect(strip).toHaveAttribute("data-selected", "0");
      await user.click(screen.getByRole("button", { name: labels.menu.edit }));
      await user.click(screen.getByTestId("step-menu-navigate"));
      await user.click(screen.getByTestId("step-cmd-moveRight"));
      await waitFor(() => expect(screen.getByTestId("strip-kick-onOff")).toHaveAttribute("data-selected", "1"));
    });
  });

  describe("F42: macOS gestures use Command and Option", () => {
    beforeEach(() => {
      macPlatform = true;
    });
    afterEach(() => {
      macPlatform = false;
    });

    it("Command-click turns a Velocity step on", async () => {
      const user = userEvent.setup();
      const instance = setup();
      await pickMode(user, /Velocity/);
      await user.keyboard("{Meta>}");
      await user.pointer(click(screen.getByTestId("strip-kick-velocity"), 2, y(0.5)));
      await user.keyboard("{/Meta}");
      await waitFor(() => expect(stepsOf(instance)[2]?.on).toBe(true));
    });

    it("Command-drag ties steps in On/Off mode, one undo entry", async () => {
      const user = userEvent.setup();
      const instance = setup([{ id: "kick", assignment: { type: "note", pitch: 36 }, steps: [{ on: true }] } as RowSeed]);
      const strip = screen.getByTestId("strip-kick-onOff");
      const before = undoDepth(instance);
      await user.keyboard("{Meta>}");
      await user.pointer([press(strip, x(0), 20), move(strip, x(2), 20), release(strip, x(2), 20)]);
      await user.keyboard("{/Meta}");
      await waitFor(() => expect(stepsOf(instance).slice(1, 3).map((s) => s?.tie)).toEqual([true, true]));
      expect(undoDepth(instance)).toBe(before + 1);
    });

    it("Option-Command-drag ramps velocity", async () => {
      const user = userEvent.setup();
      const instance = setup([{ id: "kick", assignment: { type: "note", pitch: 36 }, steps: allOn4 } as RowSeed]);
      await pickMode(user, /Velocity/);
      const strip = screen.getByTestId("strip-kick-velocity");
      await user.keyboard("{Meta>}{Alt>}");
      await user.pointer([press(strip, x(0), y(0.1)), move(strip, x(3), y(0.9)), release(strip, x(3), y(0.9))]);
      await user.keyboard("{/Alt}{/Meta}");
      await waitFor(() => {
        const v = stepsOf(instance).slice(0, 4).map((s) => s?.velocity ?? 0);
        expect(v[0]).toBeLessThan(v[1]!);
        expect(v[1]).toBeLessThan(v[2]!);
        expect(v[2]).toBeLessThan(v[3]!);
      });
    });

    it("Control-click is not Command on macOS: it does not toggle a Velocity step", async () => {
      const user = userEvent.setup();
      const instance = setup([{ id: "kick", assignment: { type: "note", pitch: 36 }, steps: [{ on: true, velocity: 20 }] } as RowSeed]);
      await pickMode(user, /Velocity/);
      await user.keyboard("{Control>}");
      await user.pointer(click(screen.getByTestId("strip-kick-velocity"), 0, y(0.9)));
      await user.keyboard("{/Control}");
      await waitFor(() => expect(stepsOf(instance)[0]?.velocity).toBeGreaterThan(20));
      expect(stepsOf(instance)[0]?.on).toBe(true);
    });
  });
});
