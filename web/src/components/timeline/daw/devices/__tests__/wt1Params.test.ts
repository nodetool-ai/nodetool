import {
  findInstrumentPreset,
  MIDI_INSTRUMENT_PRESETS,
  type WavetableMidiInstrument
} from "@nodetool-ai/timeline";

import { defaultParams } from "../../fablesynth/params";
import { FACTORY_PRESETS, resolvePresetMods } from "../../fablesynth/presets";
import {
  wt1CoreFromParams,
  wt1InstrumentWithParams,
  wt1ParamDiff,
  wt1ParamsFromInstrument
} from "../wt1Params";

function preset(id: string): WavetableMidiInstrument {
  const instrument = findInstrumentPreset(id)?.instrument;
  if (instrument?.type !== "wavetable") throw new Error(`no wavetable preset ${id}`);
  return instrument;
}

describe("WT-1 params and core fields", () => {
  it("opens a document without fableParams with knobs that match its core fields", () => {
    const pad = preset("wt1-bloom-pad");
    expect(pad.fableParams).toBeUndefined();
    const p = wt1ParamsFromInstrument(pad);
    expect(p["oscA.table"]).toBe(1); // bloom
    expect(p["oscA.pos"]).toBeCloseTo(0.35);
    expect(p["oscA.unison"]).toBe(5);
    expect(p["oscA.detune"]).toBeCloseTo(0.35);
    expect(p["oscB.on"]).toBe(1);
    expect(p["oscB.table"]).toBe(3); // vox
    expect(p["oscB.fine"]).toBe(7);
    expect(p["oscB.level"]).toBeCloseTo(0.55);
    expect(p["sub.on"]).toBe(1);
    expect(p["sub.level"]).toBeCloseTo(0.25);
    expect(p["noise.on"]).toBe(0);
    expect(p["filter.on"]).toBe(1);
    expect(p["filter.type"]).toBe(1); // LP 24
    expect(p["filter.cutoff"]).toBe(1400);
    expect(p["filter.res"]).toBeCloseTo(0.25);
    expect(p["filter.env"]).toBeCloseTo(0.5); // 2 octaves of 4
    expect(p["env1.a"]).toBeCloseTo(0.6);
    expect(p["env1.s"]).toBeCloseTo(0.85);
    expect(p["env2.d"]).toBeCloseTo(1.6);
    // -11 dB is 3 dB under the core's -8 dB at the default 0.75 volume.
    expect(p["master.volume"]).toBeCloseTo(0.75 * Math.pow(10, -3 / 40));
    // Everything the core has no field for stays at its default.
    expect(p["lfo1.rate"]).toBe(defaultParams()["lfo1.rate"]);
    expect(p["fx.comp.on"]).toBe(1);
  });

  it("maps every timeline WT-1 preset to params and back to the same core fields", () => {
    const wavetables = MIDI_INSTRUMENT_PRESETS.map((p) => p.instrument).filter(
      (i): i is WavetableMidiInstrument => i.type === "wavetable"
    );
    expect(wavetables.length).toBeGreaterThan(3);
    for (const instrument of wavetables) {
      const core = wt1CoreFromParams(wt1ParamsFromInstrument(instrument));
      expect(core.oscA).toEqual(
        expect.objectContaining({ table: instrument.oscA.table, semitones: instrument.oscA.semitones })
      );
      expect(core.oscA.position).toBeCloseTo(instrument.oscA.position);
      expect(core.oscB.level).toBeCloseTo(instrument.oscB.level);
      expect(core.subLevel).toBeCloseTo(instrument.subLevel);
      expect(core.noiseLevel).toBeCloseTo(instrument.noiseLevel);
      expect(core.filterType).toBe(instrument.filterType);
      expect(core.cutoffHz).toBeCloseTo(instrument.cutoffHz);
      expect(core.resonance).toBeCloseTo(instrument.resonance);
      expect(core.filterEnvAmount).toBeCloseTo(instrument.filterEnvAmount);
      expect(core.keyTrack).toBeCloseTo(instrument.keyTrack);
      expect(core.ampEnv.attackMs).toBeCloseTo(Math.max(1, instrument.ampEnv.attackMs));
      expect(core.ampEnv.releaseMs).toBeCloseTo(instrument.ampEnv.releaseMs);
      expect(core.modEnv.decayMs).toBeCloseTo(instrument.modEnv.decayMs);
      expect(core.gainDb).toBeCloseTo(instrument.gainDb, 3);
    }
  });

  it("writes an edit to the core fields and keeps the rest in fableParams", () => {
    const pad = preset("wt1-bloom-pad");
    const params = wt1ParamsFromInstrument(pad);
    params["filter.cutoff"] = 4200;
    params["oscA.oct"] = -1;
    params["lfo1.rate"] = 7.5;
    params["mat1.src"] = 1;
    params["mat1.dst"] = 3;
    params["mat1.amt"] = 0.4;
    const next = wt1InstrumentWithParams(pad, params);
    expect(next.type).toBe("wavetable");
    expect(next.cutoffHz).toBe(4200);
    expect(next.oscA.semitones).toBe(-12);
    expect(next.fableParams).toEqual(expect.objectContaining({ "lfo1.rate": 7.5, "mat1.amt": 0.4 }));
    // The record reads back exactly.
    expect(wt1ParamsFromInstrument(next)).toEqual(params);
  });

  it("stores only parameters that differ from their defaults", () => {
    const params = defaultParams();
    expect(wt1ParamDiff(params)).toEqual({});
    params["fx.reverb.on"] = 1;
    expect(wt1ParamDiff(params)).toEqual({ "fx.reverb.on": 1 });
  });

  it("round-trips every factory preset through the document", () => {
    const base = preset("wt1-prime-lead");
    for (const factory of FACTORY_PRESETS) {
      const params = resolvePresetMods(factory.params, factory.mods);
      const doc = wt1InstrumentWithParams(base, params);
      const back = wt1ParamsFromInstrument(doc);
      for (const [id, v] of Object.entries(params)) {
        expect([factory.name, id, back[id]]).toEqual([factory.name, id, expect.closeTo(v, 6)]);
      }
    }
  });

  it("lets a core field edited elsewhere win over a stale fableParams entry", () => {
    const pad = preset("wt1-bloom-pad");
    const params = wt1ParamsFromInstrument(pad);
    params["filter.type"] = 2; // BP 12
    const doc = wt1InstrumentWithParams(pad, params);
    expect(doc.filterType).toBe("bp12");
    const edited: WavetableMidiInstrument = { ...doc, filterType: "hp12", cutoffHz: 800 };
    const back = wt1ParamsFromInstrument(edited);
    expect(back["filter.type"]).toBe(3);
    expect(back["filter.cutoff"]).toBe(800);
    // Unrelated params from fableParams survive.
    expect(back["filter.res"]).toBeCloseTo(params["filter.res"]);
  });

  it("keeps a bypassed filter and switched-off oscillators", () => {
    const params = defaultParams();
    params["filter.on"] = 0;
    params["oscB.on"] = 0;
    params["sub.on"] = 0;
    const core = wt1CoreFromParams(params);
    expect(core.cutoffHz).toBe(20000);
    expect(core.oscB.level).toBe(0);
    expect(core.subLevel).toBe(0);
    const back = wt1ParamsFromInstrument(
      wt1InstrumentWithParams(preset("wt1-prime-lead"), params)
    );
    expect(back["filter.on"]).toBe(0);
    expect(back["oscB.on"]).toBe(0);
    expect(back["oscB.level"]).toBe(params["oscB.level"]);
  });
});
