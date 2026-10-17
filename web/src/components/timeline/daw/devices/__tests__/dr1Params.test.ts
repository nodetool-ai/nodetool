import { findInstrumentPreset, type DrumMidiInstrument } from "@nodetool-ai/timeline";

import {
  dr1Defaults,
  dr1FactoryKit,
  dr1GainDbFromParams,
  dr1InstrumentFromParams,
  dr1PadFromParams,
  dr1PadNames,
  dr1ParamDiff,
  dr1ParamsFromInstrument
} from "../dr1Params";

function trVoid(): DrumMidiInstrument {
  const preset = findInstrumentPreset("dr1-tr-void");
  if (preset?.instrument.type !== "drum") throw new Error("missing dr1-tr-void");
  return preset.instrument;
}

describe("dr1Params", () => {
  it("opens a core-only document with knobs that match its pads", () => {
    const instrument = trVoid();
    const params = dr1ParamsFromInstrument(instrument);
    expect(params["pad0.oscA.table"]).toBe(0);
    expect(params["pad0.oscA.tune"]).toBe(-26);
    expect(params["pad0.penv.amt"]).toBe(22);
    expect(params["pad0.aenv.dec"]).toBeCloseTo(0.3);
    expect(params["pad2.noise.level"]).toBeCloseTo(0.5);
    expect(params["pad5.flt.on"]).toBe(1);
    expect(params["pad5.flt.type"]).toBe(3);
    expect(params["pad5.flt.cut"]).toBe(7200);
    expect(params["pad12.oscA.table"]).toBe(8);
    // gainDb -6 maps onto the output fader and back.
    expect(dr1GainDbFromParams(params)).toBeCloseTo(-6, 6);
    instrument.pads.forEach((pad, i) => {
      expect(dr1PadFromParams(params, i, pad.name)).toEqual(
        expect.objectContaining({ ...pad, filter: pad.filter ? expect.objectContaining(pad.filter) : null })
      );
    });
  });

  it("round-trips params through the instrument", () => {
    const base = trVoid();
    const params = { ...dr1ParamsFromInstrument(base) };
    params["pad3.oscA.tune"] = 9;
    params["pad3.oscA.fine"] = 25;
    params["pad3.fx.drive.on"] = 1;
    params["fx.reverb.mix"] = 0.4;
    const names = dr1PadNames(base);
    const next = dr1InstrumentFromParams(base, params, names);
    expect(next.baseNote).toBe(36);
    expect(next.pads[3].semitones).toBeCloseTo(9.25);
    expect(next.fableParams?.["pad3.fx.drive.on"]).toBe(1);
    expect(next.fableParams?.["fx.reverb.mix"]).toBe(0.4);
    expect(dr1ParamsFromInstrument(next)).toEqual(params);
  });

  it("lets an edit made through the core fields win over stale fableParams", () => {
    const base = trVoid();
    const written = dr1InstrumentFromParams(base, dr1ParamsFromInstrument(base), dr1PadNames(base));
    const edited: DrumMidiInstrument = {
      ...written,
      pads: written.pads.map((pad, i) => (i === 0 ? { ...pad, decayMs: 900, filter: null } : pad))
    };
    const params = dr1ParamsFromInstrument(edited);
    expect(params["pad0.aenv.dec"]).toBeCloseTo(0.9);
    expect(params["pad0.flt.on"]).toBe(0);
    // Unmapped params in fableParams survive.
    const withFx = { ...written, fableParams: { ...written.fableParams, "pad0.fx.ott.on": 1 } };
    expect(dr1ParamsFromInstrument(withFx)["pad0.fx.ott.on"]).toBe(1);
  });

  it("stores only values that differ from the defaults", () => {
    expect(dr1ParamDiff({ ...dr1Defaults() })).toEqual({});
    expect(dr1ParamDiff({ ...dr1Defaults(), "pad1.lvl": 0.5 })).toEqual({ "pad1.lvl": 0.5 });
  });

  it("loads a factory kit as a whole record", () => {
    const kit = dr1FactoryKit(0);
    expect(kit).not.toBeNull();
    if (!kit) return;
    expect(kit.padNames[0]).toBe("KICK");
    // TR-VOID plays the 808 snare one-shot on pad 3.
    expect(kit.params["pad2.oscB.level"]).toBeCloseTo(0.9);
    const instrument = dr1InstrumentFromParams(trVoid(), kit.params, kit.padNames);
    expect(instrument.pads[0].name).toBe("KICK");
    expect(dr1ParamsFromInstrument(instrument)).toEqual(kit.params);
  });

  it("plays sampled tables on the nearest core table", () => {
    const params = { ...dr1Defaults(), "pad0.oscA.table": 12 };
    expect(dr1PadFromParams(params, 0, "x").table).toBe("tine");
    const instrument = dr1InstrumentFromParams(trVoid(), params, dr1PadNames(trVoid()));
    expect(dr1ParamsFromInstrument(instrument)["pad0.oscA.table"]).toBe(12);
  });
});
