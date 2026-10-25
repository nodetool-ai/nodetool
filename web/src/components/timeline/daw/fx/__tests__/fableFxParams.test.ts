import { trackEffect } from "@nodetool-ai/protocol/api-schemas/timeline.js";
import { FABLE_EFFECT_KINDS, makeTrackEffect } from "@nodetool-ai/timeline";

import { PARAMS } from "../../fablesynth/params";
import {
  FABLE_FX_LABELS,
  FABLE_FX_ON_PARAM,
  defaultFableFxParams,
  fableFxParamIds,
  makeFableEffect,
  resolvedFableFxParams
} from "../fableFxParams";

describe("fable effect params", () => {
  it("takes every kind's defaults from the FableSynth param table", () => {
    for (const kind of FABLE_EFFECT_KINDS) {
      const params = defaultFableFxParams(kind);
      const ids = Object.keys(params);
      expect(ids.length).toBeGreaterThan(1);
      for (const id of ids) {
        expect(PARAMS[id]).toBeDefined();
        if (!(kind === "lab" && id === "fx.crush.on")) {
          expect(params[id]).toBe(PARAMS[id].def);
        }
      }
    }
  });

  it("keeps each kind to its own stage", () => {
    expect(Object.keys(defaultFableFxParams("reverb")).sort()).toEqual([
      "fx.reverb.mix",
      "fx.reverb.size"
    ]);
    expect(fableFxParamIds("echo")).toEqual(
      expect.arrayContaining(["fx.delay.time", "fx.delay.fb", "fx.delay.sync", "fx.delay.div", "fx.delay.wow"])
    );
    expect(fableFxParamIds("echo").every((id) => id.startsWith("fx.delay."))).toBe(true);
    expect(fableFxParamIds("eq")).toHaveLength(20);
    expect(fableFxParamIds("comp")).not.toContain("fx.comp.sc");
    const lab = fableFxParamIds("lab");
    for (const stage of ["crush", "reso", "shift", "spray", "glitch"]) {
      expect(lab).toContain(`fx.${stage}.on`);
    }
  });

  it("leaves the stage's on switch to `enabled`", () => {
    for (const kind of FABLE_EFFECT_KINDS) {
      const on = FABLE_FX_ON_PARAM[kind];
      if (on) expect(defaultFableFxParams(kind)).not.toHaveProperty(on);
    }
    expect(defaultFableFxParams("lab")["fx.crush.on"]).toBe(1);
  });

  it("names every kind", () => {
    expect(FABLE_EFFECT_KINDS.map((kind) => FABLE_FX_LABELS[kind])).toEqual([
      "EQ",
      "OTT",
      "Compressor",
      "Drive",
      "Lab",
      "Chorus",
      "Tape Echo",
      "Reverb",
      "Limiter"
    ]);
  });

  it("reads absent params as their defaults", () => {
    const effect = { ...makeFableEffect("echo"), params: { "fx.delay.fb": 0.7 } };
    const resolved = resolvedFableFxParams(effect);
    expect(resolved["fx.delay.fb"]).toBe(0.7);
    expect(resolved["fx.delay.time"]).toBe(PARAMS["fx.delay.time"].def);
  });
});

describe("fable effect schema", () => {
  it("survives the zod trackEffect union unchanged", () => {
    for (const kind of FABLE_EFFECT_KINDS) {
      const effect = makeFableEffect(kind);
      expect(trackEffect.parse(JSON.parse(JSON.stringify(effect)))).toEqual(effect);
    }
  });

  it("parses the package default and rejects an unknown kind", () => {
    const effect = makeTrackEffect("fable");
    expect(trackEffect.parse(effect)).toEqual(effect);
    expect(trackEffect.safeParse({ ...effect, kind: "flanger" }).success).toBe(false);
    expect(trackEffect.safeParse({ ...effect, params: { "fx.eq.low": "loud" } }).success).toBe(false);
  });
});
