import { describe, expect, it } from "vitest";
import { gameAudioMixer } from "../src/game.js";

function messages(input: unknown): string[] {
  const parsed = gameAudioMixer.safeParse(input);
  return parsed.success ? [] : parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
}

describe("audio mixer schema", () => {
  it("defaults to the built-in buses, a master limiter and music ducking under voice", () => {
    expect(gameAudioMixer.parse({})).toEqual({
      buses: {}, assetBuses: {}, limiter: { enabled: true, thresholdDb: -1 }, reverb: { decaySeconds: 1.8 },
      ducking: [{ bus: "music", when: "voice", gain: 0.35, attackTicks: 6, releaseTicks: 30 }], snapshots: {}, transitions: []
    });
  });

  it("accepts user buses that nest under built-in buses", () => {
    expect(messages({ buses: { footsteps: { parent: "sfx" }, near: { parent: "footsteps", lowpassHz: 4000, reverbSend: 0.2 } },
      assetBuses: { step: "near" }, snapshots: { pause: { buses: { near: { muted: true } } } },
      transitions: [{ on: { kind: "trigger", event: "pause" }, snapshot: "pause" }, { on: { kind: "win" }, snapshot: "base" }] })).toEqual([]);
  });

  it("rejects references to missing buses and snapshots, parent cycles, and reserved names", () => {
    expect(messages({
      buses: { master: { parent: "sfx", reverbSend: 0.5 }, a: { parent: "b" }, b: { parent: "a" }, c: { parent: "missing" } },
      assetBuses: { step: "missing" }, ducking: [{ bus: "music", when: "music" }],
      snapshots: { base: { buses: {} }, quiet: { buses: { missing: { volume: 0 } } } },
      transitions: [{ on: { kind: "win" }, snapshot: "absent" }]
    })).toEqual([
      "snapshots.base: \"base\" is reserved for the base mix",
      "buses.master.parent: master has no parent",
      "buses.master.reverbSend: master cannot send to reverb because the reverb returns into master",
      "buses.c.parent: Bus missing does not exist",
      "buses.a.parent: Bus a is part of a parent cycle",
      "buses.b.parent: Bus b is part of a parent cycle",
      "assetBuses.step: Bus missing does not exist",
      "ducking.0.when: A bus cannot duck itself",
      "snapshots.quiet.buses.missing: Bus missing does not exist",
      "transitions.0.snapshot: Mixer snapshot absent does not exist"
    ]);
  });
});
