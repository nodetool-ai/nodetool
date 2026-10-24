/**
 * Timeline automation inside the FableSynth processors: the
 * `param-automation-worklet.js` lanes, run in a VM with a stand-in AudioWorklet
 * scope next to the BL-1 and fable-fx processors that apply them.
 */
import fs from "fs";
import path from "path";
import vm from "vm";

import { generateTables } from "../../fablesynth/engine/wavetables";
import { defaultBassParams } from "../../fablesynth/bass/params";

const SR = 48000;
const Q = 128;
const FABLE = path.join(__dirname, "..", "..", "fablesynth");

interface Port {
  posted: unknown[];
  onmessage: ((event: { data: unknown }) => void) | null;
  postMessage: (message: unknown) => void;
}

interface Proc {
  port: Port;
  p: Record<string, number>;
  process: (inputs: Float32Array[][], outputs: Float32Array[][]) => boolean;
}

type ProcCtor = new (options: { processorOptions: Record<string, unknown> }) => Proc;

function load(files: string[], name: string, withAutomation = true) {
  const registered: Record<string, ProcCtor> = {};
  const scope: { currentFrame: number } & Record<string, unknown> = {
    sampleRate: SR,
    currentFrame: 0,
    registerProcessor: (n: string, ctor: ProcCtor) => {
      registered[n] = ctor;
    },
    console
  };
  scope.globalThis = scope;
  scope.AudioWorkletProcessor = class {
    port: Port;
    constructor() {
      const posted: unknown[] = [];
      this.port = { posted, onmessage: null, postMessage: (m: unknown) => posted.push(m) };
    }
  };
  const context = vm.createContext(scope);
  const all = withAutomation ? [path.join(__dirname, "..", "param-automation-worklet.js"), ...files] : files;
  for (const file of all) vm.runInContext(fs.readFileSync(file, "utf8"), context);
  return { Ctor: registered[name], scope };
}

function runner(proc: Proc, scope: { currentFrame: number }) {
  const quantum = () => {
    proc.process([[]], [[new Float32Array(Q), new Float32Array(Q)]]);
    scope.currentFrame += Q;
  };
  const send = (data: unknown) => proc.port.onmessage?.({ data });
  return { quantum, send };
}

const tables = generateTables().map((t) => ({ frames: t.frames, mips: t.mips, size: t.size, data: t.data }));

function bass(withAutomation = true) {
  const { Ctor, scope } = load(
    [path.join(FABLE, "engine", "ott-worklet.js"), path.join(FABLE, "bass", "engine", "worklet-bass.js")],
    "fable-bl",
    withAutomation
  );
  const proc = new Ctor({ processorOptions: { params: defaultBassParams(), tables } });
  return { proc, ...runner(proc, scope) };
}

const lane = (k: string, ...pairs: number[][]) => ({ k, ev: Float64Array.from(pairs.flat()) });

describe("FableSynth timeline automation lanes", () => {
  it("ramps a BL-1 parameter along its lane, one value per render quantum", () => {
    const r = bass();
    r.send({ t: "pauto", clear: true, lanes: [lane("flt.cut", [0, 200], [10 * Q, 2200])] });
    const seen: number[] = [];
    for (let i = 0; i < 12; i++) {
      r.quantum();
      seen.push(r.proc.p["flt.cut"]);
    }
    // Each quantum applies the lane's value at its first frame.
    for (let i = 0; i <= 10; i++) expect(seen[i]).toBeCloseTo(200 + 200 * i);
    // After the last breakpoint the value holds.
    expect(seen[11]).toBeCloseTo(2200);
  });

  it("leaves a parameter alone once its lane is cleared", () => {
    const r = bass();
    r.send({ t: "pauto", lanes: [lane("flt.cut", [0, 500])] });
    r.quantum();
    expect(r.proc.p["flt.cut"]).toBe(500);
    r.send({ t: "pauto", clear: true, lanes: [] });
    r.send({ t: "p", k: "flt.cut", v: 900 });
    r.quantum();
    expect(r.proc.p["flt.cut"]).toBe(900);
  });

  it("acknowledges a sync once every earlier message has arrived", () => {
    const r = bass();
    r.send({ t: "pauto", lanes: [lane("flt.res", [0, 0.4])] });
    r.send({ t: "pauto-sync", n: 7 });
    expect(r.proc.port.posted).toContainEqual({ t: "pauto-ack", n: 7 });
  });

  it("plays without the automation module loaded", () => {
    const r = bass(false);
    r.send({ t: "pauto", lanes: [lane("flt.cut", [0, 500])] });
    expect(() => r.quantum()).not.toThrow();
    expect(r.proc.p["flt.cut"]).not.toBe(500);
  });

  it("drives a fable-fx insert through its params path", () => {
    const { Ctor, scope } = load(
      [
        path.join(FABLE, "engine", "ott-worklet.js"),
        path.join(FABLE, "engine", "lab-worklet.js"),
        path.join(FABLE, "fx", "fx-worklet.js")
      ],
      "fable-fx"
    );
    const proc = new Ctor({ processorOptions: { kind: "reverb", params: {}, enabled: true, bpm: 120 } });
    const r = runner(proc, scope);
    r.send({ t: "pauto", lanes: [lane("fx.reverb.mix", [0, 0.1], [4 * Q, 0.9])] });
    r.quantum();
    expect(proc.p["fx.reverb.mix"]).toBeCloseTo(0.1);
    for (let i = 0; i < 4; i++) r.quantum();
    expect(proc.p["fx.reverb.mix"]).toBeCloseTo(0.9);
  });
});
