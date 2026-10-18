/**
 * The WT-1 worklet's timeline event protocol, run in-process: the processor
 * source is evaluated with a stand-in AudioWorklet scope and rendered block
 * by block.
 */

import { readFileSync } from "fs";
import { join } from "path";

import { generateTables } from "../../fablesynth/engine/wavetables";
import { defaultParams } from "../../fablesynth/params";

const ENGINE = join(__dirname, "../../fablesynth/engine");
const SR = 48000;

interface Proc {
  port: { onmessage: ((e: { data: unknown }) => void) | null; postMessage(m: unknown): void };
  process(inputs: unknown[], outputs: Float32Array[][]): boolean;
}

const TABLES = generateTables().map((t) => ({
  frames: t.frames,
  mips: t.mips,
  size: t.size,
  buf: t.data.slice().buffer
}));

function boot(events?: Float64Array) {
  const sent: Array<{ t: string }> = [];
  let Proc: (new (options?: unknown) => Proc) | null = null;
  class AWP {
    port = {
      onmessage: null as Proc["port"]["onmessage"],
      postMessage: (m: unknown) => {
        sent.push(m as { t: string });
      }
    };
  }
  const register = (_name: string, cls: new (options?: unknown) => Proc) => {
    Proc = cls;
  };
  let frame = 0;
  Object.defineProperty(globalThis, "currentFrame", { configurable: true, get: () => frame });
  for (const file of ["ott-worklet.js", "lab-worklet.js", "worklet.js"]) {
    const src = readFileSync(join(ENGINE, file), "utf8");
    new Function("sampleRate", "AudioWorkletProcessor", "registerProcessor", src)(SR, AWP, register);
  }
  if (!Proc) throw new Error("worklet did not register");
  const Ctor: new (options?: unknown) => Proc = Proc;
  const params = { ...defaultParams(), "env1.a": 0.001, "env1.r": 0.01, "fx.comp.on": 0 };
  const proc = new Ctor({ processorOptions: { params, tables: TABLES, events } });
  const send = (data: unknown) => proc.port.onmessage?.({ data });
  const render = (blocks: number): Float32Array => {
    const out = new Float32Array(blocks * 128);
    const l = new Float32Array(128);
    const r = new Float32Array(128);
    for (let b = 0; b < blocks; b++) {
      proc.process([], [[l, r]]);
      out.set(l, b * 128);
      frame += 128;
    }
    return out;
  };
  return { sent, send, render, frame: () => frame };
}

const ev = (...quads: number[][]): Float64Array => new Float64Array(quads.flat());
const firstSound = (x: Float32Array, from = 0): number => {
  for (let i = from; i < x.length; i++) if (Math.abs(x[i]) > 1e-5) return i;
  return -1;
};
const rms = (x: Float32Array, from: number, to: number): number => {
  let sum = 0;
  for (let i = from; i < to; i++) sum += x[i] * x[i];
  return Math.sqrt(sum / Math.max(1, to - from));
};

describe("WT-1 worklet timeline events", () => {
  it("has tables, params and the score from processorOptions before the first block", () => {
    const h = boot(ev([1000, 1, 60, 0.9], [9000, 0, 60, 0]));
    expect(h.sent.some((m) => m.t === "ready")).toBe(true);
    const out = h.render(200);
    const onset = firstSound(out);
    // The note starts at its own frame (mid-block), after the FX chain latency.
    const latency = (h.sent.find((m) => m.t === "latency") as { n?: number } | undefined)?.n ?? 0;
    expect(onset).toBeGreaterThanOrEqual(1000 + latency);
    expect(onset).toBeLessThan(1000 + latency + 8);
    expect(rms(out, 2000, 8000)).toBeGreaterThan(0.01);
    // Released at 9000: silent well after the short release.
    expect(rms(out, 20000, 25000)).toBeLessThan(1e-4);
  });

  it("queues evs messages and drops a note-on that arrives too late", () => {
    const h = boot();
    h.render(10); // frame 1280
    h.send({ t: "evs", ev: ev([2000, 1, 64, 0.8]) });
    const out = h.render(40);
    expect(firstSound(out)).toBeGreaterThan(2000 - 1280);
    h.send({ t: "evs", ev: ev([2000 + 128 * 40 + 512, 0, 64, 0]) });
    h.render(40);
    // A note-on 0.2 s in the past is dropped.
    const late = h.frame() - 0.2 * SR;
    h.send({ t: "evs", ev: ev([late, 1, 67, 0.8]) });
    const after = h.render(60);
    expect(rms(after, 0, after.length)).toBeLessThan(1e-4);
  });

  it("evclear drops queued events and releases sounding notes", () => {
    const h = boot(ev([0, 1, 60, 1], [30000, 1, 72, 1]));
    const held = h.render(40);
    expect(rms(held, 2000, 5000)).toBeGreaterThan(0.01);
    h.send({ t: "evclear" });
    const out = h.render(300);
    // The held note releases, and the queued note at 30000 never plays.
    expect(rms(out, 10000, out.length)).toBeLessThan(1e-4);
  });
});
