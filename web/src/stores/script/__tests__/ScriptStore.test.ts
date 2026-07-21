/**
 * @jest-environment node
 *
 * Script store mutations and derived helpers: lines and takes accumulate,
 * the current take switches without dropping history, removing a speaker
 * unassigns its lines, and line status is derived from the current take's
 * text/voice snapshot vs. the live line.
 */

import {
  useScriptStore,
  lineStatus,
  effectiveVoice,
  type ScriptTake,
  type VoiceBinding
} from "../ScriptStore";

const SCRIPT = "script-1";

const voice = (name: string): VoiceBinding => ({
  provider: "openai",
  model: "tts-1",
  voice: name
});

const take = (over: Partial<ScriptTake>): ScriptTake => ({
  id: "take-x",
  assetId: "asset-x",
  durationMs: 1000,
  words: [],
  textSnapshot: "hello",
  voiceSnapshot: voice("alloy"),
  createdAt: "2026-01-01T00:00:00.000Z",
  ...over
});

const firstLineId = (): string => {
  const s = useScriptStore.getState().scripts[SCRIPT];
  return s.sections[0].lines[0].id;
};

afterEach(() => {
  useScriptStore.getState().removeScript(SCRIPT);
});

describe("addLine", () => {
  it("creates a section when the script is empty", () => {
    const store = useScriptStore.getState();
    store.ensureScript(SCRIPT);
    const lineId = store.addLine(SCRIPT);
    const s = useScriptStore.getState().scripts[SCRIPT];
    expect(s.sections).toHaveLength(1);
    expect(s.sections[0].lines[0].id).toBe(lineId);
  });

  it("appends to the last section when one exists", () => {
    const store = useScriptStore.getState();
    store.ensureScript(SCRIPT);
    store.addLine(SCRIPT);
    store.addLine(SCRIPT);
    const s = useScriptStore.getState().scripts[SCRIPT];
    expect(s.sections).toHaveLength(1);
    expect(s.sections[0].lines).toHaveLength(2);
  });
});

describe("removeScript", () => {
  it("clears lingering revision/status metadata even when the draft is gone", () => {
    const store = useScriptStore.getState();
    store.setServerRevision(SCRIPT, "rev-1");
    store.setSaveStatus(SCRIPT, "error");
    // No script draft present — only metadata (e.g. after a failed create).
    expect(useScriptStore.getState().scripts[SCRIPT]).toBeUndefined();

    store.removeScript(SCRIPT);

    expect(useScriptStore.getState().serverRevisions[SCRIPT]).toBeUndefined();
    expect(useScriptStore.getState().saveStatus[SCRIPT]).toBeUndefined();
  });
});

describe("insertLine", () => {
  const seed = (n: number): string => {
    const store = useScriptStore.getState();
    store.ensureScript(SCRIPT);
    for (let i = 0; i < n; i++) store.addLine(SCRIPT);
    return useScriptStore.getState().scripts[SCRIPT].sections[0].id;
  };

  it("inserts at the given index", () => {
    const sectionId = seed(2);
    const store = useScriptStore.getState();
    const [a, b] = store.scripts[SCRIPT].sections[0].lines.map((l) => l.id);
    const mid = store.insertLine(SCRIPT, sectionId, 1);
    const ids = useScriptStore
      .getState()
      .scripts[SCRIPT].sections[0].lines.map((l) => l.id);
    expect(ids).toEqual([a, mid, b]);
  });

  it("clamps an out-of-range index to the end", () => {
    const sectionId = seed(1);
    const store = useScriptStore.getState();
    const first = store.scripts[SCRIPT].sections[0].lines[0].id;
    const last = store.insertLine(SCRIPT, sectionId, 99);
    const ids = useScriptStore
      .getState()
      .scripts[SCRIPT].sections[0].lines.map((l) => l.id);
    expect(ids).toEqual([first, last]);
  });
});

describe("duplicateLine", () => {
  it("clones content into a fresh, unvoiced line right after the original", () => {
    const store = useScriptStore.getState();
    store.ensureScript(SCRIPT);
    store.addLine(SCRIPT);
    const lineId = firstLineId();
    store.patchLine(SCRIPT, lineId, {
      text: "hello",
      speakerId: "spk1",
      direction: "cheerful"
    });
    store.appendTake(SCRIPT, lineId, take({ id: "t1" }));

    const newId = store.duplicateLine(SCRIPT, lineId);
    const lines = useScriptStore.getState().scripts[SCRIPT].sections[0].lines;
    expect(lines.map((l) => l.id)).toEqual([lineId, newId]);
    const clone = lines[1];
    expect(clone.text).toBe("hello");
    expect(clone.speakerId).toBe("spk1");
    expect(clone.direction).toBe("cheerful");
    // Takes are dropped — a duplicate starts as a draft.
    expect(clone.takes).toEqual([]);
    expect(clone.currentTakeId).toBeNull();
  });

  it("returns null for an unknown line", () => {
    const store = useScriptStore.getState();
    store.ensureScript(SCRIPT);
    expect(store.duplicateLine(SCRIPT, "missing")).toBeNull();
  });
});

describe("moveLine", () => {
  const seed = (n: number): { sectionId: string; ids: string[] } => {
    const store = useScriptStore.getState();
    store.ensureScript(SCRIPT);
    for (let i = 0; i < n; i++) store.addLine(SCRIPT);
    const section = useScriptStore.getState().scripts[SCRIPT].sections[0];
    return { sectionId: section.id, ids: section.lines.map((l) => l.id) };
  };
  const currentIds = (sectionIdx = 0): string[] =>
    useScriptStore
      .getState()
      .scripts[SCRIPT].sections[sectionIdx].lines.map((l) => l.id);

  it("moves a line before another within a section", () => {
    const { sectionId, ids } = seed(3); // [a, b, c]
    useScriptStore.getState().moveLine(SCRIPT, ids[2], sectionId, ids[0]);
    expect(currentIds()).toEqual([ids[2], ids[0], ids[1]]);
  });

  it("appends to the end when beforeLineId is null", () => {
    const { sectionId, ids } = seed(3); // [a, b, c]
    useScriptStore.getState().moveLine(SCRIPT, ids[0], sectionId, null);
    expect(currentIds()).toEqual([ids[1], ids[2], ids[0]]);
  });

  it("is a no-op when dropped on itself", () => {
    const { sectionId, ids } = seed(3);
    useScriptStore.getState().moveLine(SCRIPT, ids[1], sectionId, ids[1]);
    expect(currentIds()).toEqual(ids);
  });

  it("moves a line across sections", () => {
    const { sectionId: secA, ids } = seed(2); // section A: [a, b]
    const store = useScriptStore.getState();
    const secB = store.addSection(SCRIPT);
    store.addLine(SCRIPT, secB); // section B: [c]
    const cId = useScriptStore.getState().scripts[SCRIPT].sections[1].lines[0]
      .id;
    store.moveLine(SCRIPT, ids[0], secB, cId);
    expect(currentIds(0)).toEqual([ids[1]]);
    expect(currentIds(1)).toEqual([ids[0], cId]);
    void secA;
  });
});

describe("takes", () => {
  it("appendTake accumulates and sets current", () => {
    const store = useScriptStore.getState();
    store.ensureScript(SCRIPT);
    store.addLine(SCRIPT);
    const lineId = firstLineId();
    store.appendTake(SCRIPT, lineId, take({ id: "t1" }));
    store.appendTake(SCRIPT, lineId, take({ id: "t2" }));
    const line = useScriptStore
      .getState()
      .scripts[SCRIPT].sections[0].lines[0];
    expect(line.takes.map((t) => t.id)).toEqual(["t1", "t2"]);
    expect(line.currentTakeId).toBe("t2");
  });

  it("removeTake falls back to the last remaining take", () => {
    const store = useScriptStore.getState();
    store.ensureScript(SCRIPT);
    store.addLine(SCRIPT);
    const lineId = firstLineId();
    store.appendTake(SCRIPT, lineId, take({ id: "t1" }));
    store.appendTake(SCRIPT, lineId, take({ id: "t2" }));
    store.removeTake(SCRIPT, lineId, "t2");
    const line = useScriptStore
      .getState()
      .scripts[SCRIPT].sections[0].lines[0];
    expect(line.takes.map((t) => t.id)).toEqual(["t1"]);
    expect(line.currentTakeId).toBe("t1");
  });
});

describe("removeSpeaker", () => {
  it("unassigns the removed speaker from every line", () => {
    const store = useScriptStore.getState();
    store.ensureScript(SCRIPT);
    store.addSpeaker(SCRIPT, { id: "spk1", name: "A", voice: voice("alloy") });
    store.addLine(SCRIPT);
    const lineId = firstLineId();
    store.patchLine(SCRIPT, lineId, { speakerId: "spk1" });
    store.removeSpeaker(SCRIPT, "spk1");
    const s = useScriptStore.getState().scripts[SCRIPT];
    expect(s.cast).toHaveLength(0);
    expect(s.sections[0].lines[0].speakerId).toBeNull();
  });
});

describe("lineStatus", () => {
  it("is draft with no takes, voiced when matching, stale when text drifts", () => {
    const store = useScriptStore.getState();
    store.ensureScript(SCRIPT);
    store.addSpeaker(SCRIPT, { id: "spk1", name: "A", voice: voice("alloy") });
    store.addLine(SCRIPT);
    const lineId = firstLineId();
    store.patchLine(SCRIPT, lineId, { speakerId: "spk1", text: "hello" });

    const draftLine = useScriptStore
      .getState()
      .scripts[SCRIPT].sections[0].lines[0];
    const eff = effectiveVoice(draftLine, useScriptStore.getState().scripts[SCRIPT].cast);
    expect(lineStatus(draftLine, eff)).toBe("draft");

    store.appendTake(SCRIPT, lineId, take({ id: "t1", textSnapshot: "hello", voiceSnapshot: voice("alloy") }));
    const voicedLine = useScriptStore
      .getState()
      .scripts[SCRIPT].sections[0].lines[0];
    expect(lineStatus(voicedLine, eff)).toBe("voiced");

    store.patchLine(SCRIPT, lineId, { text: "hello there" });
    const staleLine = useScriptStore
      .getState()
      .scripts[SCRIPT].sections[0].lines[0];
    expect(lineStatus(staleLine, eff)).toBe("stale");
  });
});

describe("effectiveVoice", () => {
  it("prefers a line override over the speaker voice", () => {
    const store = useScriptStore.getState();
    store.ensureScript(SCRIPT);
    store.addSpeaker(SCRIPT, { id: "spk1", name: "A", voice: voice("alloy") });
    store.addLine(SCRIPT);
    const lineId = firstLineId();
    store.patchLine(SCRIPT, lineId, {
      speakerId: "spk1",
      voiceOverride: voice("echo")
    });
    const s = useScriptStore.getState().scripts[SCRIPT];
    const eff = effectiveVoice(s.sections[0].lines[0], s.cast);
    expect(eff?.voice).toBe("echo");
  });
});

describe("undo/redo", () => {
  const sectionCount = (): number =>
    useScriptStore.getState().scripts[SCRIPT]?.sections.length ?? 0;
  const lineText = (lineId: string): string | undefined =>
    useScriptStore
      .getState()
      .scripts[SCRIPT]?.sections.flatMap((s) => s.lines)
      .find((l) => l.id === lineId)?.text;

  it("undoes and redoes a line addition", () => {
    const store = useScriptStore.getState();
    store.ensureScript(SCRIPT);
    expect(sectionCount()).toBe(0);
    store.addLine(SCRIPT);
    expect(sectionCount()).toBe(1);

    store.undo(SCRIPT);
    expect(sectionCount()).toBe(0);

    store.redo(SCRIPT);
    expect(sectionCount()).toBe(1);
  });

  it("folds rapid text edits to one line into a single undo step", () => {
    const store = useScriptStore.getState();
    store.ensureScript(SCRIPT);
    const lineId = store.addLine(SCRIPT);
    store.patchLine(SCRIPT, lineId, { text: "h" });
    store.patchLine(SCRIPT, lineId, { text: "he" });
    store.patchLine(SCRIPT, lineId, { text: "hel" });
    expect(lineText(lineId)).toBe("hel");

    // One undo reverts the whole typing run, not one keystroke.
    store.undo(SCRIPT);
    expect(lineText(lineId)).toBe("");
    // A second undo steps back past the line's creation.
    store.undo(SCRIPT);
    expect(sectionCount()).toBe(0);
  });

  it("a fresh edit clears the redo stack", () => {
    const store = useScriptStore.getState();
    store.ensureScript(SCRIPT);
    store.addLine(SCRIPT);
    store.undo(SCRIPT);
    expect(useScriptStore.getState().history[SCRIPT]?.future.length).toBe(1);
    store.addLine(SCRIPT);
    expect(useScriptStore.getState().history[SCRIPT]?.future.length ?? 0).toBe(0);
  });

  it("undo is a no-op with an empty history", () => {
    const store = useScriptStore.getState();
    store.ensureScript(SCRIPT);
    expect(() => store.undo(SCRIPT)).not.toThrow();
    expect(sectionCount()).toBe(0);
  });

  it("removeScript drops the script's history", () => {
    const store = useScriptStore.getState();
    store.ensureScript(SCRIPT);
    store.addLine(SCRIPT);
    expect(useScriptStore.getState().history[SCRIPT]?.past.length).toBe(1);
    store.removeScript(SCRIPT);
    expect(useScriptStore.getState().history[SCRIPT]).toBeUndefined();
  });
});
