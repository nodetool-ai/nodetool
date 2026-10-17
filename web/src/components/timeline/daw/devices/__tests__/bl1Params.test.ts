import { findInstrumentPreset, type BassMidiInstrument } from "@nodetool-ai/timeline";

import { defaultBassParams } from "../../fablesynth/bass/params";
import { FACTORY_PATCHES } from "../../fablesynth/bass/patches";
import {
  BL1_CORE_PARAMS,
  bl1FactoryPatchParams,
  bl1InstrumentFromParams,
  bl1ParamRecord,
  bl1ParamsFromCore,
  changedBl1Params,
  setBl1Param
} from "../bl1Params";

function preset(id: string): BassMidiInstrument {
  const instrument = findInstrumentPreset(id)?.instrument;
  if (instrument?.type !== "bass") throw new Error(`no bass preset ${id}`);
  return instrument;
}

describe("BL-1 params and core fields", () => {
  it("opens a document without fableParams with knobs that match its core fields", () => {
    const deep = preset("bl1-deep");
    const record = bl1ParamRecord(deep);
    expect(record["osc.table"]).toBe(2); // pulse
    expect(record["osc.pos"]).toBeCloseTo(0.15);
    expect(record["flt.cut"]).toBe(220);
    expect(record["flt.res"]).toBeCloseTo(0.4);
    expect(record["flt.env"]).toBeCloseTo(1.8 / 4);
    expect(record["fenv.dec"]).toBeCloseTo(0.32);
    expect(record["aenv.sus"]).toBeCloseTo(0.7);
    expect(record["slide.time"]).toBeCloseTo(0.09);
    expect(record["sub.shape"]).toBe(1); // square
    // Params without a core field keep their defaults.
    expect(record["fx.reverb.on"]).toBe(defaultBassParams()["fx.reverb.on"]);
  });

  it("maps the default acid preset onto BL-1's own defaults", () => {
    const fromCore = bl1ParamsFromCore(preset("bl1-acid"));
    const defaults = defaultBassParams();
    for (const id of ["osc.pos", "flt.cut", "flt.res", "flt.env", "aenv.dec", "acc.amt", "slide.time", "master.volume", "acc.vel"]) {
      expect(fromCore[id]).toBeCloseTo(defaults[id], 6);
    }
  });

  it("writes a mapped param to its core field and keeps it out of fableParams", () => {
    const next = setBl1Param(preset("bl1-acid"), "flt.cut", 1200);
    expect(next.cutoffHz).toBe(1200);
    expect(next.fableParams?.["flt.cut"]).toBeUndefined();
    expect(bl1ParamRecord(next)["flt.cut"]).toBe(1200);
  });

  it("writes an unmapped param to fableParams", () => {
    const next = setBl1Param(preset("bl1-acid"), "fx.delay.on", 1);
    expect(next.fableParams?.["fx.delay.on"]).toBe(1);
    expect(next.cutoffHz).toBe(340);
  });

  it("round-trips every mapped param through the core fields", () => {
    const params = {
      ...defaultBassParams(),
      "osc.table": 4,
      "osc.pos": 0.61,
      "osc.tune": -12,
      "sub.shape": 0,
      "sub.oct": -2,
      "sub.level": 0.2,
      "flt.type": 3,
      "flt.cut": 880,
      "flt.res": 0.9,
      "flt.drive": 0.1,
      "flt.env": -0.4,
      "flt.track": 0.8,
      "fenv.att": 0.01,
      "fenv.dec": 0.7,
      "aenv.att": 0.02,
      "aenv.dec": 1.1,
      "aenv.sus": 0.25,
      "aenv.rel": 0.3,
      "acc.amt": 0.45,
      "acc.vel": 110,
      "slide.time": 0.2,
      "master.volume": 0.5
    };
    const inst = bl1InstrumentFromParams(preset("bl1-acid"), params);
    expect(inst.table).toBe("chime");
    expect(inst.subShape).toBe("sine");
    expect(inst.subOctave).toBe(-2);
    expect(inst.filterType).toBe("hp12");
    expect(inst.filterEnvAmount).toBeCloseTo(-1.6);
    expect(inst.accentVelocity).toBe(110);
    expect(inst.slideMs).toBeCloseTo(200);
    expect(inst.gainDb).toBeLessThan(-6);
    // Reopen from the core fields alone.
    const reopened = bl1ParamRecord({ ...inst, fableParams: undefined });
    for (const id of BL1_CORE_PARAMS) {
      expect(reopened[id]).toBeCloseTo(params[id as keyof typeof params], 6);
    }
  });

  it("clamps out-of-range values into the param's range", () => {
    expect(setBl1Param(preset("bl1-acid"), "flt.res", 3).resonance).toBe(1);
    expect(bl1ParamRecord({ ...preset("bl1-acid"), filterEnvAmount: 9 })["flt.env"]).toBe(1);
  });

  it("loads a factory patch as a whole record", () => {
    const params = bl1FactoryPatchParams(1);
    expect(params).not.toBeNull();
    if (!params) return;
    expect(Object.keys(params).sort()).toEqual(Object.keys(defaultBassParams()).sort());
    expect(params["osc.table"]).toBe(FACTORY_PATCHES[1].params["osc.table"]);
    // A dirty edit before the load is gone after it.
    const edited = setBl1Param(preset("bl1-acid"), "fx.chorus.on", 1);
    const loaded = bl1InstrumentFromParams(edited, params);
    expect(bl1ParamRecord(loaded)["fx.chorus.on"]).toBe(params["fx.chorus.on"]);
    expect(loaded.table).toBe("pulse");
    expect(bl1FactoryPatchParams(999)).toBeNull();
  });

  it("lists only the params that changed", () => {
    const a = bl1ParamRecord(preset("bl1-acid"));
    const b = { ...a, "flt.cut": 500, "fx.reverb.mix": 0.4 };
    expect(changedBl1Params(a, b).sort()).toEqual(["flt.cut", "fx.reverb.mix"]);
  });
});
