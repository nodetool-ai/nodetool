/**
 * Runs the DR-1 processor in a VM with a minimal AudioWorklet global scope
 * to verify sample-accurate controller gain segments (F44).
 */
import fs from "fs";
import path from "path";
import vm from "vm";

import { drumTables } from "../drumAssets";
import { defaultDrumParams, pad } from "../../params";

const SR = 48000;
const Q = 128;

interface Port {
  posted: unknown[];
  onmessage: ((event: { data: unknown }) => void) | null;
  postMessage: (message: unknown) => void;
}

interface Proc {
  port: Port;
  process: (inputs: Float32Array[][], outputs: Float32Array[][]) => boolean;
}

type ProcCtor = new (options: { processorOptions: Record<string, unknown> }) => Proc;

const fableEngineDir = path.join(__dirname, "..", "..", "..", "engine");
const tables = drumTables().map((t) => ({
  frames: t.frames,
  mips: t.mips,
  size: t.size,
  buf: t.data.buffer
}));

function loadProcessor(): { Ctor: ProcCtor; scope: { currentFrame: number } } {
  const registered: Record<string, ProcCtor> = {};
  const scope: { currentFrame: number } & Record<string, unknown> = {
    sampleRate: SR,
    currentFrame: 0,
    registerProcessor: (name: string, ctor: ProcCtor) => {
      registered[name] = ctor;
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
  vm.runInContext(fs.readFileSync(path.join(fableEngineDir, "ott-worklet.js"), "utf8"), context);
  vm.runInContext(fs.readFileSync(path.join(fableEngineDir, "lab-worklet.js"), "utf8"), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "worklet-drum.js"), "utf8"), context);
  return { Ctor: registered["fable-dr"], scope };
}

function dryDrumParams(): Record<string, number> {
  return {
    ...defaultDrumParams(),
    "fx.drive.on": 0,
    "fx.comp.on": 0,
    "fx.chorus.on": 0,
    "fx.delay.on": 0,
    "fx.reverb.on": 0,
    "fx.ott.on": 0,
    "fx.lab.on": 0,
    [pad(0, "a.lvl")]: 1,
    [pad(0, "env.dec")]: 0.5,
    [pad(0, "lvl")]: 1,
    [pad(0, "fx.drive.on")]: 0,
    [pad(0, "fx.comp.on")]: 0,
    [pad(0, "fx.chorus.on")]: 0,
    [pad(0, "fx.delay.on")]: 0,
    [pad(0, "fx.reverb.on")]: 0,
    [pad(0, "fx.ott.on")]: 0,
    [pad(0, "fx.lab.on")]: 0
  };
}

function ev(...quads: number[][]): Float64Array {
  return Float64Array.from(quads.flat());
}

function makeRunner(options: Record<string, unknown>) {
  const { Ctor, scope } = loadProcessor();
  const proc = new Ctor({
    processorOptions: {
      mixdown: true,
      baseNote: 36,
      params: dryDrumParams(),
      tables,
      samples: [],
      ...options
    }
  });
  const left: number[] = [];
  const quantum = () => {
    const out = [new Float32Array(Q), new Float32Array(Q)];
    proc.process([[]], [out]);
    left.push(...out[0]);
    scope.currentFrame += Q;
  };
  return { proc, scope, left, quantum };
}

const rms = (x: number[], from: number, to: number): number => {
  let s = 0;
  for (let i = from; i < to; i++) s += x[i] * x[i];
  return Math.sqrt(s / Math.max(1, to - from));
};

describe("DR-1 worklet controller gain segments (F44)", () => {
  it("applies mid-quantum CC11 mute only from the event sample onward", () => {
    const r = makeRunner({
      events: ev([0, 1, 36, 0.9]),
      controllers: ev([0, 2, 11, 127], [512 + 64, 2, 11, 0])
    });
    for (let i = 0; i < 5; i++) r.quantum();
    expect(rms(r.left, 512, 512 + 64)).toBeGreaterThan(0.01);
    expect(rms(r.left, 512 + 64, 512 + 128)).toBe(0);
  });

  it("preserves a down/up CC11 dip within a single render quantum", () => {
    const r = makeRunner({
      events: ev([0, 1, 36, 0.9]),
      controllers: ev([0, 2, 11, 127], [512 + 32, 2, 11, 0], [512 + 96, 2, 11, 127])
    });
    for (let i = 0; i < 5; i++) r.quantum();
    expect(rms(r.left, 512, 512 + 32)).toBeGreaterThan(0.01);
    expect(rms(r.left, 512 + 32, 512 + 96)).toBe(0);
    expect(rms(r.left, 512 + 96, 512 + 128)).toBeGreaterThan(0.01);
  });
});
