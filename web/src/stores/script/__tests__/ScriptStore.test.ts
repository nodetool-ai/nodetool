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
