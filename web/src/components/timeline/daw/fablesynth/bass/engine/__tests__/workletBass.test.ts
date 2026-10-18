/**
 * Runs the BL-1 processor in a VM with a minimal AudioWorklet global scope:
 * the timeline event protocol, mono slide, accent and late-event handling.
 */
import fs from "fs";
import path from "path";
import vm from "vm";

import { generateTables } from "../../../engine/wavetables";
import { defaultBassParams } from "../../params";

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
  gate: boolean;
  acc: boolean;
  fenvT: number;
  semiTarget: number;
}

type ProcCtor = new (options: { processorOptions: Record<string, unknown> }) => Proc;

const engineDir = path.join(__dirname, "..", "..", "..", "engine");
const tables = generateTables().map((t) => ({ frames: t.frames, mips: t.mips, size: t.size, data: t.data }));

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
  vm.runInContext(fs.readFileSync(path.join(engineDir, "ott-worklet.js"), "utf8"), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "worklet-bass.js"), "utf8"), context);
  return { Ctor: registered["fable-bl"], scope };
}

function dryParams(): Record<string, number> {
  return {
    ...defaultBassParams(),
    "fx.drive.on": 0,
    "fx.reverb.on": 0,
    "fx.delay.on": 0,
    "fx.chorus.on": 0,
    "lfo.depth": 0
  };
}

function ev(...quads: number[][]): Float64Array {
  return Float64Array.from(quads.flat());
}

function makeRunner(options: Record<string, unknown>) {
  const { Ctor, scope } = loadProcessor();
  const proc = new Ctor({ processorOptions: { params: dryParams(), tables, ...options } });
  const left: number[] = [];
  const quantum = () => {
    const out = [new Float32Array(Q), new Float32Array(Q)];
    proc.process([[]], [out]);
    left.push(...out[0]);
    scope.currentFrame += Q;
  };
  const send = (data: unknown) => proc.port.onmessage?.({ data });
  return { proc, scope, left, quantum, send };
}

const rms = (x: number[], from: number, to: number): number => {
  let s = 0;
  for (let i = from; i < to; i++) s += x[i] * x[i];
  return Math.sqrt(s / Math.max(1, to - from));
};

describe("BL-1 worklet timeline protocol", () => {
  it("renders processorOptions events from the first quantum, at their frame", () => {
    const onset = 1000;
    const r = makeRunner({ events: ev([onset, 1, 45, 0.8], [onset + 9600, 0, 45, 0]) });
    expect(r.proc.port.posted).toContainEqual({ t: "ready" });
    for (let i = 0; i < 140; i++) r.quantum();
    expect(rms(r.left, 0, onset)).toBe(0);
    expect(rms(r.left, onset, onset + 4800)).toBeGreaterThan(0.01);
    // Released at 10600: 100 ms later the tail sits far below the held level.
    expect(rms(r.left, 15400, 16200)).toBeLessThan(rms(r.left, 9800, 10600) / 10);
  });

  it("queues evs messages and drops a note-on whose frame has passed", () => {
    const r = makeRunner({});
    for (let i = 0; i < 10; i++) r.quantum();
    r.send({ t: "evs", ev: ev([200, 1, 40, 0.8]) });
    for (let i = 0; i < 10; i++) r.quantum();
    expect(r.proc.gate).toBe(false);
    expect(rms(r.left, 0, r.left.length)).toBe(0);
  });

  it("slides into a note that starts while another is held", () => {
    const r = makeRunner({ events: ev([0, 1, 36, 0.7], [4800, 1, 48, 0.7]) });
    for (let i = 0; i < 40; i++) r.quantum();
    expect(r.proc.gate).toBe(true);
    expect(r.proc.semiTarget).toBe(12);
    // A slide keeps the envelopes running: no retrigger at 4800.
    expect(r.proc.fenvT).toBeGreaterThan(4800);
  });

  it("retriggers a note that starts when the last one ends", () => {
    const r = makeRunner({ events: ev([0, 1, 36, 0.7], [4800, 0, 36, 0], [4800, 1, 48, 0.7]) });
    for (let i = 0; i < 40; i++) r.quantum();
    expect(r.proc.fenvT).toBeLessThan(5120 - 4800 + Q);
  });

  it("accents a note at or above the accent velocity", () => {
    const plain = makeRunner({ events: ev([0, 1, 36, 99 / 127]) });
    plain.quantum();
    expect(plain.proc.acc).toBe(false);
    const accented = makeRunner({ events: ev([0, 1, 36, 100 / 127]) });
    accented.quantum();
    expect(accented.proc.acc).toBe(true);
  });

  it("evclear drops queued events and releases the voice", () => {
    const r = makeRunner({ events: ev([0, 1, 36, 0.8], [9000, 1, 40, 0.8]) });
    r.quantum();
    expect(r.proc.gate).toBe(true);
    r.send({ t: "evclear" });
    for (let i = 0; i < 100; i++) r.quantum();
    expect(r.proc.gate).toBe(false);
    expect(r.proc.semiTarget).toBe(0);
  });

  it("plays the keyboard messages immediately, last-note priority", () => {
    const r = makeRunner({});
    r.send({ t: "noteon", pitch: 40, vel: 0.8 });
    r.send({ t: "noteon", pitch: 43, vel: 0.8 });
    r.quantum();
    expect(r.proc.semiTarget).toBe(7);
    r.send({ t: "noteoff", pitch: 43 });
    r.quantum();
    expect(r.proc.semiTarget).toBe(4);
    expect(r.proc.gate).toBe(true);
    r.send({ t: "noteoff", pitch: 40 });
    r.quantum();
    expect(r.proc.gate).toBe(false);
  });
});
