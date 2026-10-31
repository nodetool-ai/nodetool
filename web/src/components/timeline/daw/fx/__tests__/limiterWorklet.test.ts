/**
 * The limiter insert of `fx-worklet.js`, run in a VM with a stand-in
 * AudioWorklet scope: it holds the ceiling on steady and sudden peaks, passes
 * quiet audio unchanged after its lookahead, applies its input gain, and
 * reports its gain reduction.
 */
import fs from "fs";
import path from "path";
import vm from "vm";

const SR = 48000;
const Q = 128;
const LOOK = Math.round(0.0015 * SR);
const FABLE = path.join(__dirname, "..", "..", "fablesynth");

interface Proc {
  port: { posted: unknown[]; onmessage: ((event: { data: unknown }) => void) | null };
  process: (inputs: Float32Array[][], outputs: Float32Array[][]) => boolean;
}

type ProcCtor = new (options: { processorOptions: Record<string, unknown> }) => Proc;

function limiter(params: Record<string, number>, enabled = true): Proc {
  const registered: Record<string, ProcCtor> = {};
  const scope: Record<string, unknown> = {
    sampleRate: SR,
    currentFrame: 0,
    registerProcessor: (name: string, ctor: ProcCtor) => {
      registered[name] = ctor;
    },
    console
  };
  scope.globalThis = scope;
  scope.AudioWorkletProcessor = class {
    port: Proc["port"];
    constructor() {
      const posted: unknown[] = [];
      this.port = { posted, onmessage: null };
      Object.assign(this.port, { postMessage: (m: unknown) => posted.push(m) });
    }
  };
  const context = vm.createContext(scope);
  for (const file of ["engine/ott-worklet.js", "engine/lab-worklet.js", "fx/fx-worklet.js"]) {
    vm.runInContext(fs.readFileSync(path.join(FABLE, file), "utf8"), context);
  }
  return new registered["fable-fx"]({
    processorOptions: { kind: "limiter", params, enabled, bpm: 120 }
  });
}

/** Run `input` (mono, both channels) through the processor; returns the left output. */
function run(proc: Proc, input: Float32Array): Float32Array {
  const out = new Float32Array(input.length);
  for (let at = 0; at < input.length; at += Q) {
    const block = input.subarray(at, at + Q);
    const outL = new Float32Array(Q), outR = new Float32Array(Q);
    proc.process([[block, block]], [[outL, outR]]);
    out.set(outL.subarray(0, block.length), at);
  }
  return out;
}

const sine = (amp: number, frames: number, hz = 440): Float32Array =>
  Float32Array.from({ length: frames }, (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / SR));

const peak = (x: Float32Array, from = 0): number => {
  let p = 0;
  for (let i = from; i < x.length; i++) p = Math.max(p, Math.abs(x[i]));
  return p;
};

const db = (v: number): number => Math.pow(10, v / 20);

describe("fable-fx limiter", () => {
  it("holds a loud signal under the ceiling without flattening it", () => {
    const out = run(limiter({ "fx.limit.ceil": -1, "fx.limit.rel": 0.1 }), sine(2, SR));
    const ceil = db(-1);
    // The tolerance covers the Float32 output.
    expect(peak(out)).toBeLessThanOrEqual(ceil + 1e-5);
    // Limited, not silenced: the peaks reach the ceiling.
    expect(peak(out, SR / 2)).toBeGreaterThan(ceil * 0.97);
    // Gain, not a clipper: few samples sit at the ceiling.
    const atCeiling = out.filter((v) => Math.abs(v) >= ceil * 0.9999).length;
    expect(atCeiling).toBeLessThan(SR / 100);
  });

  it("catches a sudden peak inside the lookahead", () => {
    const input = sine(0.1, SR / 2);
    input.set(sine(1.5, SR / 4), SR / 4);
    const out = run(limiter({ "fx.limit.ceil": -3 }), input);
    expect(peak(out)).toBeLessThanOrEqual(db(-3) + 1e-5);
    const atCeiling = out.filter((v) => Math.abs(v) >= db(-3) * 0.9999).length;
    expect(atCeiling).toBeLessThan(200);
  });

  it("passes a quiet signal unchanged, one lookahead late", () => {
    const input = sine(0.2, 4096);
    const out = run(limiter({ "fx.limit.ceil": -1 }), input);
    for (let i = 1024; i < 4096; i++) expect(out[i]).toBeCloseTo(input[i - LOOK], 5);
  });

  it("applies its input gain before limiting", () => {
    const out = run(limiter({ "fx.limit.gain": 12, "fx.limit.ceil": 0 }), sine(0.1, SR / 2));
    expect(peak(out, SR / 4)).toBeCloseTo(0.1 * db(12), 2);
  });

  it("passes the signal through when bypassed", () => {
    const input = sine(0.8, SR / 2);
    const out = run(limiter({ "fx.limit.ceil": -6 }, false), input);
    expect(peak(out, SR / 4)).toBeCloseTo(0.8, 2);
  });

  it("reports its gain reduction while metered", () => {
    const proc = limiter({ "fx.limit.ceil": -6 });
    proc.port.onmessage?.({ data: { t: "dynamics", on: true } });
    run(proc, sine(1, SR / 2));
    const reports = proc.port.posted.filter(
      (m): m is { t: string; limiter?: { reduction: number; inputPeak: number; outputPeak: number } } =>
        typeof m === "object" && m !== null && (m as { t?: string }).t === "dynamics"
    );
    expect(reports.length).toBeGreaterThan(0);
    // 0 dBFS into a -6 dB ceiling: about 6 dB of reduction.
    expect(reports.at(-1)?.limiter?.reduction).toBeCloseTo(6, 0);
    // The display's peaks: the input at 0 dBFS, the output at the ceiling.
    expect(reports.at(-1)?.limiter?.inputPeak).toBeCloseTo(0, 0);
    expect(reports.at(-1)?.limiter?.outputPeak).toBeCloseTo(-6, 0);
  });
});
