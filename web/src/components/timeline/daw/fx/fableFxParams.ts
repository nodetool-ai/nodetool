/**
 * The FableSynth FX stages as timeline track effects: which FableSynth
 * parameters each `fable` effect kind owns, their defaults, and the names the
 * add-effect menu shows.
 */

import {
  createTimeOrderedUuid,
  FABLE_EFFECT_KINDS,
  type FableEffectKind,
  type TrackFableEffect
} from "@nodetool-ai/timeline";

import { PARAMS } from "../fablesynth/params";

export const FABLE_FX_KINDS: readonly FableEffectKind[] = FABLE_EFFECT_KINDS;

export const FABLE_FX_LABELS: Record<FableEffectKind, string> = {
  eq: "EQ",
  ott: "OTT",
  comp: "Compressor",
  drive: "Drive",
  lab: "Lab",
  chorus: "Chorus",
  echo: "Tape Echo",
  reverb: "Reverb"
};

/** FableSynth parameter id prefixes per kind (`fx.delay.` is the tape echo). */
const PREFIXES: Record<FableEffectKind, readonly string[]> = {
  eq: ["fx.eq."],
  ott: ["fx.ott."],
  comp: ["fx.comp."],
  drive: ["fx.drive."],
  lab: ["fx.crush.", "fx.reso.", "fx.shift.", "fx.spray.", "fx.glitch."],
  chorus: ["fx.chorus."],
  echo: ["fx.delay."],
  reverb: ["fx.reverb."]
};

/**
 * The stage's own on switch. The track effect's `enabled` stands for it, so
 * it is not stored in `params`. LAB has none: each of its five stages keeps
 * its own `.on` param.
 */
export const FABLE_FX_ON_PARAM: Record<FableEffectKind, string | null> = {
  eq: "fx.eq.on",
  ott: "fx.ott.on",
  comp: "fx.comp.on",
  drive: "fx.drive.on",
  lab: null,
  chorus: "fx.chorus.on",
  echo: "fx.delay.on",
  reverb: "fx.reverb.on"
};

/** Side-chain keys need the SQ-4 key bus, which a track insert does not have. */
const EXCLUDED = new Set(["fx.comp.sc", "fx.comp.gain"]);

/** The FableSynth parameter ids a kind owns, in `params.ts` order. */
export function fableFxParamIds(kind: FableEffectKind): string[] {
  const onParam = FABLE_FX_ON_PARAM[kind];
  return Object.keys(PARAMS).filter(
    (id) =>
      PREFIXES[kind].some((prefix) => id.startsWith(prefix)) &&
      id !== onParam &&
      !EXCLUDED.has(id)
  );
}

/**
 * FableSynth defaults for a kind. LAB turns its first stage (CRUSH) on, so a
 * freshly added Lab is audible; the WT-1 patch default leaves every LAB stage
 * off because the patch carries them all the time.
 */
export function defaultFableFxParams(
  kind: FableEffectKind
): Record<string, number> {
  const params: Record<string, number> = {};
  for (const id of fableFxParamIds(kind)) {
    params[id] = PARAMS[id].def;
  }
  if (kind === "lab") {
    params["fx.crush.on"] = 1;
  }
  return params;
}

/** A new `fable` track effect of `kind` with FableSynth defaults. */
export function makeFableEffect(kind: FableEffectKind): TrackFableEffect {
  return {
    id: createTimeOrderedUuid(),
    type: "fable",
    enabled: true,
    kind,
    params: defaultFableFxParams(kind)
  };
}

/** Stored params over the defaults: what the processor and the panels read. */
export function resolvedFableFxParams(
  effect: TrackFableEffect
): Record<string, number> {
  return { ...defaultFableFxParams(effect.kind), ...effect.params };
}
