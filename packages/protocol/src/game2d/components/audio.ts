import { z } from "zod";
import { finite } from "./common.js";

/** Buses every mixer has. Authors may override their settings and add buses of their own. */
export const GAME_AUDIO_BUILTIN_BUSES = ["master", "music", "sfx", "voice", "ui"] as const;

/** The mixer snapshot id that means "the base mix with no snapshot overrides". */
export const GAME_AUDIO_BASE_SNAPSHOT = "base";

const MAX_BUSES = 32;
const MAX_SNAPSHOTS = 32;

const busId = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/, "Bus ids use letters, digits, _ and -");
const snapshotId = z.string().min(1).max(64);
const ticks = z.number().int().min(0).max(600);
const lowpassHz = finite.min(20).max(20000);

/** Settings shared by a bus and by a mixer snapshot's override of that bus. */
const busFields = {
  volume: finite.min(0).max(2).describe("Linear fader gain. 1 is unity."),
  muted: z.boolean(),
  lowpassHz: lowpassHz.describe("Low-pass cutoff in Hz. Omit for an open filter."),
  reverbSend: finite.min(0).max(1).describe("Post-fader send level to the shared reverb.")
};

export const gameAudioBus = z.strictObject({
  parent: busId.optional().describe("Bus this bus feeds. Defaults to master. Master has no parent."),
  volume: busFields.volume.default(1),
  muted: busFields.muted.default(false),
  lowpassHz: busFields.lowpassHz.optional(),
  reverbSend: busFields.reverbSend.default(0)
});

export type GameAudioBus = z.infer<typeof gameAudioBus>;

/** A mixer snapshot replaces the named fields of the listed buses while it is active. */
export const gameAudioMixerSnapshot = z.strictObject({
  buses: z.record(busId, z.strictObject({
    volume: busFields.volume.optional(),
    muted: busFields.muted.optional(),
    lowpassHz: busFields.lowpassHz.optional(),
    reverbSend: busFields.reverbSend.optional()
  }))
});

export type GameAudioMixerSnapshot = z.infer<typeof gameAudioMixerSnapshot>;

/** Moves the mixer to a snapshot when a simulation event or scene change is observed. Never writes back. */
export const gameAudioMixerTransition = z.strictObject({
  on: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("trigger"), event: z.string().min(1).max(128) }),
    z.strictObject({ kind: z.literal("scene"), sceneId: z.string().min(1) }),
    z.strictObject({ kind: z.literal("win") })
  ]),
  snapshot: snapshotId.describe(`Mixer snapshot to move to. "${GAME_AUDIO_BASE_SNAPSHOT}" returns to the base mix.`),
  fadeTicks: ticks.default(30)
});

export type GameAudioMixerTransition = z.infer<typeof gameAudioMixerTransition>;

/** Lowers one bus while any voice plays on another bus or its descendants. */
export const gameAudioDucking = z.strictObject({
  bus: busId.describe("Bus that is lowered."),
  when: busId.describe("Bus whose playing voices cause the duck."),
  gain: finite.min(0).max(1).default(0.35),
  attackTicks: ticks.default(6),
  releaseTicks: ticks.default(30)
});

export type GameAudioDucking = z.infer<typeof gameAudioDucking>;

export const gameAudioMixer = z.strictObject({
  buses: z.record(busId, gameAudioBus).default({}),
  assetBuses: z.record(z.string().min(1), busId).default({})
    .describe("Bus per audio asset slot. Unlisted music plays on music and other audio on sfx."),
  limiter: z.strictObject({ enabled: z.boolean().default(true), thresholdDb: finite.min(-24).max(0).default(-1) })
    .default({ enabled: true, thresholdDb: -1 }),
  reverb: z.strictObject({ decaySeconds: finite.min(0.1).max(10).default(1.8) }).default({ decaySeconds: 1.8 }),
  ducking: z.array(gameAudioDucking).max(16).default([{ bus: "music", when: "voice", gain: 0.35, attackTicks: 6, releaseTicks: 30 }]),
  snapshots: z.record(snapshotId, gameAudioMixerSnapshot).default({}),
  transitions: z.array(gameAudioMixerTransition).max(64).default([])
}).superRefine((mixer, context) => {
  const issue = (path: (string | number)[], message: string): void => { context.addIssue({ code: "custom", path, message }); };
  const buses = new Set<string>([...GAME_AUDIO_BUILTIN_BUSES, ...Object.keys(mixer.buses)]);
  if (buses.size > MAX_BUSES) { issue(["buses"], `A mixer has at most ${MAX_BUSES} buses including the built-in buses`); }
  if (Object.keys(mixer.snapshots).length > MAX_SNAPSHOTS) { issue(["snapshots"], `A mixer has at most ${MAX_SNAPSHOTS} snapshots`); }
  if (GAME_AUDIO_BASE_SNAPSHOT in mixer.snapshots) { issue(["snapshots", GAME_AUDIO_BASE_SNAPSHOT], `"${GAME_AUDIO_BASE_SNAPSHOT}" is reserved for the base mix`); }
  const master = mixer.buses.master;
  if (master?.parent !== undefined) { issue(["buses", "master", "parent"], "master has no parent"); }
  if ((master?.reverbSend ?? 0) > 0) { issue(["buses", "master", "reverbSend"], "master cannot send to reverb because the reverb returns into master"); }
  for (const [id, bus] of Object.entries(mixer.buses)) {
    if (bus.parent !== undefined && !buses.has(bus.parent)) { issue(["buses", id, "parent"], `Bus ${bus.parent} does not exist`); }
  }
  for (const id of buses) {
    const seen = new Set<string>();
    let current: string | undefined = id;
    while (current !== undefined && current !== "master") {
      if (seen.has(current)) { issue(["buses", id, "parent"], `Bus ${id} is part of a parent cycle`); break; }
      seen.add(current);
      current = mixer.buses[current]?.parent ?? "master";
      if (!buses.has(current)) { break; }
    }
  }
  for (const [slot, bus] of Object.entries(mixer.assetBuses)) {
    if (!buses.has(bus)) { issue(["assetBuses", slot], `Bus ${bus} does not exist`); }
  }
  for (const [index, rule] of mixer.ducking.entries()) {
    if (!buses.has(rule.bus)) { issue(["ducking", index, "bus"], `Bus ${rule.bus} does not exist`); }
    if (!buses.has(rule.when)) { issue(["ducking", index, "when"], `Bus ${rule.when} does not exist`); }
    if (rule.bus === rule.when) { issue(["ducking", index, "when"], "A bus cannot duck itself"); }
  }
  for (const [id, snapshot] of Object.entries(mixer.snapshots)) {
    for (const [bus, override] of Object.entries(snapshot.buses)) {
      if (!buses.has(bus)) { issue(["snapshots", id, "buses", bus], `Bus ${bus} does not exist`); }
      if (bus === "master" && (override.reverbSend ?? 0) > 0) { issue(["snapshots", id, "buses", bus, "reverbSend"], "master cannot send to reverb"); }
    }
  }
  for (const [index, transition] of mixer.transitions.entries()) {
    if (transition.snapshot !== GAME_AUDIO_BASE_SNAPSHOT && !(transition.snapshot in mixer.snapshots)) {
      issue(["transitions", index, "snapshot"], `Mixer snapshot ${transition.snapshot} does not exist`);
    }
  }
});

export type GameAudioMixer = z.infer<typeof gameAudioMixer>;
export type GameAudioMixerInput = z.input<typeof gameAudioMixer>;

/** Document-level audio settings. Presentation only: never read by simulation and never stored in game snapshots. */
export const gameAudioSettings = z.strictObject({ mixer: gameAudioMixer.optional() });

export type GameAudioSettings = z.infer<typeof gameAudioSettings>;
