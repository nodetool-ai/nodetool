import { normalizePattern } from "@nodetool-ai/timeline";
import type { StepRow } from "@nodetool-ai/timeline";

import en from "../../../../i18n/locales/en.json";
import { STEP_COMMANDS, chordLabel, commandForKey, nonMacChord, type Chord, type CommandContext } from "../stepSequencerCommands";
import { stepKey } from "../stepSequencerModel";

const row = (partial: Partial<StepRow> & Pick<StepRow, "id" | "assignment">): StepRow =>
  normalizePattern({ lengthSteps: 64, rows: [partial as StepRow] }).rows[0]!;

const pattern = normalizePattern({
  rows: [
    row({ id: "kick", assignment: { type: "note", pitch: 36 }, lengthSteps: 16, steps: [{ on: true }] }),
    row({ id: "snare", assignment: { type: "note", pitch: 38 }, lengthSteps: 16 })
  ]
});

const ctx: CommandContext = {
  clipId: "clip",
  trackId: "track",
  pattern,
  selection: new Set([stepKey("kick", 2), stepKey("kick", 3)]),
  rowIds: ["kick"],
  editMode: "velocity"
};

const key = (k: string, code: string, mods: Partial<Record<"metaKey" | "altKey" | "ctrlKey" | "shiftKey", boolean>> = {}) => ({
  key: k,
  code,
  metaKey: false,
  altKey: false,
  ctrlKey: false,
  shiftKey: false,
  ...mods
});

describe("Step Sequencer shortcuts (SQ35)", () => {
  const table: Array<[string, ReturnType<typeof key>, ReturnType<typeof key>, unknown]> = [
    ["repeatStep", key("r", "KeyR", { metaKey: true }), key("r", "KeyR", { ctrlKey: true }), { op: "repeat_step", clipId: "clip", row: "kick", step: 4 }],
    ["clearStep", key("Backspace", "Backspace", { ctrlKey: true }), key("Backspace", "Backspace", { ctrlKey: true, altKey: true }), { op: "clear_pattern", clipId: "clip", scope: "steps", row: "kick", steps: [3, 4] }],
    ["duplicateRow", key("d", "KeyD", { metaKey: true }), key("d", "KeyD", { ctrlKey: true }), { op: "copy_pattern_row", clipId: "clip", row: "kick", nextAssignment: true }],
    ["deleteRow", key("Backspace", "Backspace", { metaKey: true }), key("Delete", "Delete", { ctrlKey: true }), { op: "remove_pattern_rows", clipId: "clip", rows: ["kick"] }],
    ["transposeUp", key("ArrowUp", "ArrowUp", { altKey: true }), key("ArrowUp", "ArrowUp", { altKey: true }), { op: "transpose_pattern", clipId: "clip", row: "kick", steps: [3, 4], semitones: 1 }],
    ["rotateRowRight", key("ArrowRight", "ArrowRight", { altKey: true, metaKey: true }), key("ArrowRight", "ArrowRight", { altKey: true, ctrlKey: true }), { op: "rotate_pattern", clipId: "clip", row: "kick", by: 1 }],
    ["rotatePatternLeft", key("ArrowLeft", "ArrowLeft", { ctrlKey: true, altKey: true, metaKey: true }), key("ArrowLeft", "ArrowLeft", { ctrlKey: true, altKey: true }), { op: "rotate_pattern", clipId: "clip", by: -1 }],
    ["randomizeAll", key("®", "KeyR", { altKey: true, metaKey: true }), key("r", "KeyR", { altKey: true, ctrlKey: true }), { op: "randomize_pattern", clipId: "clip", mode: "velocity", seed: expect.any(Number) }],
    ["mono", key("m", "KeyM", { ctrlKey: true, shiftKey: true, metaKey: true }), key("M", "KeyM", { ctrlKey: true, shiftKey: true, altKey: true }), { op: "set_pattern", clipId: "clip", mono: true }],
    ["patternPlayback.pingPong", key("π", "KeyP", { ctrlKey: true, altKey: true }), key("p", "KeyP", { ctrlKey: true, altKey: true }), { op: "set_pattern", clipId: "clip", playback: "pingPong" }],
    ["rowPlayback.backward", key("[", "BracketLeft", { ctrlKey: true }), key("[", "BracketLeft", { ctrlKey: true, altKey: true }), { op: "set_pattern_row", clipId: "clip", row: "kick", playback: "backward" }],
    ["toggleStep", key("'", "Quote"), key("'", "Quote"), { op: "set_steps", clipId: "clip", row: "kick", steps: [3, 4], values: { on: true } }]
  ];

  it.each(table)("%s dispatches its op on macOS", (id, mac, _other, op) => {
    const cmd = commandForKey(mac, true);
    expect(cmd?.id).toBe(id);
    expect(cmd!.run(ctx)?.ops?.[0]).toEqual(op);
  });

  it.each(table)("%s uses Ctrl for Command off macOS (D106)", (id, _mac, other) => {
    const keeps = nonMacChord(STEP_COMMANDS.find((c) => c.id === id)!) !== undefined;
    const cmd = commandForKey(other, false);
    if (keeps) expect(cmd?.id).toBe(id);
    else expect(cmd?.id).not.toBe(id);
  });

  /** The event a chord produces on each platform (D106). */
  const eventFor = (c: Chord, mac: boolean) => {
    const code = c.key.length === 1 && /[a-z]/.test(c.key) ? `Key${c.key.toUpperCase()}` : CODE[c.key] ?? c.key;
    return mac
      ? key(c.key, code, { metaKey: c.cmd === true, altKey: c.opt === true, ctrlKey: c.ctrl === true, shiftKey: c.shift === true })
      : key(c.key, code, {
          ctrlKey: c.cmd === true || c.ctrl === true,
          altKey: c.opt === true || c.ctrl === true,
          shiftKey: c.shift === true
        });
  };
  const CODE: Record<string, string> = { "=": "Equal", "-": "Minus", "]": "BracketRight", "[": "BracketLeft", "\\": "Backslash", "'": "Quote", "`": "Backquote" };
  const chorded = STEP_COMMANDS.filter((c) => c.chord).map((c) => [c.id, c] as const);

  it.each(chorded)("%s: its macOS chord dispatches it", (id, c) => {
    expect(commandForKey(eventFor(c.chord!, true), true)?.id).toBe(id);
  });

  it.each(chorded)("%s: off macOS its chord dispatches it, or it is menu-only behind an Option-Command chord (D106)", (id, c) => {
    const chord = nonMacChord(c);
    const hit = commandForKey(eventFor(c.chord!, false), false);
    if (chord) {
      expect(hit?.id).toBe(id);
      expect(chordLabel(chord, false)).toBeDefined();
    } else {
      // Menu-only: a Control chord that collides; the winner keeps the key.
      expect(c.chord!.ctrl).toBe(true);
      expect(hit).toBeDefined();
      expect(hit!.id).not.toBe(id);
      expect(nonMacChord(hit!)).toBeDefined();
    }
  });

  it("keeps the Option-Command entry on a Control collision off macOS (D106)", () => {
    expect(commandForKey(key("Backspace", "Backspace", { ctrlKey: true, altKey: true }), false)?.id).toBe("clearModeRow");
    expect(commandForKey(key("ArrowRight", "ArrowRight", { ctrlKey: true, altKey: true }), false)?.id).toBe("rotateRowRight");
    expect(nonMacChord(STEP_COMMANDS.find((c) => c.id === "clearStep")!)).toBeUndefined();
  });

  it("maps the single-letter mode keys", () => {
    expect(commandForKey(key("g", "KeyG"), true)?.run(ctx)?.ui).toEqual({ type: "setMode", mode: "gate" });
    expect(commandForKey(key("k", "KeyK"), true)?.run(ctx)?.ui).toEqual({ type: "setMode", mode: "skip" });
  });

  it("gives every command a menu label and every macOS chord one command", () => {
    const labels = (en as { stepSequencer: { cmd: Record<string, unknown> } }).stepSequencer.cmd;
    const seen = new Map<string, string>();
    for (const c of STEP_COMMANDS) {
      const [head, tail] = c.id.split(".");
      const entry = tail ? (labels[head!] as Record<string, string>)[tail] : labels[head!];
      expect(typeof entry).toBe("string");
      const label = chordLabel(c.chord, true);
      if (label) {
        expect(seen.get(label)).toBeUndefined();
        seen.set(label, c.id);
      }
    }
  });

  it("passes a fresh seed on every randomize (F6)", () => {
    const run = () => STEP_COMMANDS.find((c) => c.id === "randomizeAll")!.run(ctx)!.ops![0] as { seed?: number };
    const a = run();
    const b = run();
    expect(typeof a.seed).toBe("number");
    expect(a.seed).not.toBe(b.seed);
  });

  it("sends Value, not Velocity, to automation rows (F8)", () => {
    const auto = normalizePattern({
      rows: [
        row({ id: "kick", assignment: { type: "note", pitch: 36 }, lengthSteps: 16 }),
        row({ id: "mod", assignment: { type: "automation", target: { kind: "cc", cc: 1 } }, lengthSteps: 16 })
      ]
    });
    const c = { ...ctx, pattern: auto, rowIds: ["kick", "mod"] };
    const ops = (id: string) => STEP_COMMANDS.find((x) => x.id === id)!.run(c)!.ops! as Array<{ mode?: string; rows?: string[]; row?: string; rowType?: string }>;
    expect(ops("clearModeAutomationRows")[0]!.mode).toBe("value");
    const rnd = ops("randomizeAll");
    expect(rnd.map((o) => [o.mode, o.rows])).toEqual([["velocity", ["kick"]], ["value", ["mod"]]]);
    expect(ops("rotateModeRight").map((o) => [o.row, o.mode])).toEqual([["kick", "velocity"], ["mod", "value"]]);
    expect(ops("clearModeAll").map((o) => [o.mode, o.rowType])).toEqual([["velocity", "note"], ["value", "automation"]]);
  });
});
