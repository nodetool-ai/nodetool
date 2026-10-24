import { describe, it, expect } from "vitest";
import type {
  ScriptLine,
  Take
} from "@nodetool-ai/protocol/api-schemas/scripts.js";
import { needsVoicing } from "../src/script.js";

const voice = { provider: "openai", model: "tts-1", voice: "alloy" };

const take = (over: Partial<Take> = {}): Take => ({
  id: "t1",
  assetId: "a1",
  durationMs: 1000,
  words: [],
  textSnapshot: "Hello.",
  voiceSnapshot: voice,
  createdAt: "2026-01-01T00:00:00.000Z",
  ...over
});

const line = (direction: string | undefined, t: Take): ScriptLine => ({
  id: "l1",
  text: "Hello.",
  direction,
  takes: [t],
  currentTakeId: t.id
});

describe("needsVoicing", () => {
  it("re-voices a take whose recorded direction no longer matches", () => {
    const t = take({ directionSnapshot: "warm" });
    expect(needsVoicing(line("  warm ", t), voice)).toBe(false);
    expect(needsVoicing(line("angry", t), voice)).toBe(true);
    expect(needsVoicing(line(undefined, t), voice)).toBe(true);
  });

  it("ignores direction on a take that recorded none", () => {
    expect(needsVoicing(line("angry", take()), voice)).toBe(false);
  });
});
