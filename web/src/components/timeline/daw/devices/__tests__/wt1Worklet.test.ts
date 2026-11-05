/**
 * The WT-1 worklet's timeline event protocol, run in-process: the processor
 * source is evaluated with a stand-in AudioWorklet scope and rendered block
 * by block.
 */

import { readFileSync } from "fs";
import { join } from "path";

import { generateTables } from "../../fablesynth/engine/wavetables";
import { defaultParams } from "../../fablesynth/params";
import { WorkletInstrumentDevice } from "../workletDevice";

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

  it("clears one clip without releasing another clip's sounding note", () => {
    const h = boot();
    class Device extends WorkletInstrumentDevice {
      protected readonly authoredParams: Readonly<Record<string, number>> = {};
      constructor() {
        super({ sampleRate: SR, get currentTime() { return h.frame() / SR; } } as BaseAudioContext,
          { port: { postMessage: (message: unknown) => h.send(message) } } as unknown as AudioWorkletNode,
          {} as AudioNode);
      }
      setInstrument(): void {}
      noteOn(): void {}
      noteOff(): void {}
      setTempo(): void {}
    }
    const device = new Device();
    device.schedule([{ timeSec: 0, on: true, pitch: 60, velocity: 127 }, { timeSec: 1, on: false, pitch: 60, velocity: 0 }], "held");
    device.schedule([{ timeSec: 0, on: true, pitch: 72, velocity: 127 }, { timeSec: 0.2, on: false, pitch: 72, velocity: 0 }], "edited");
    h.render(40);
    device.clear("edited");
    const out = h.render(450);
    expect(rms(out, 10000, 20000)).toBeGreaterThan(0.01);
    expect(rms(out, 50000, out.length)).toBeLessThan(1e-4);
  });

  it("keeps same-pitch ownership and unrelated queued notes when a tag is cleared", () => {
    const h = boot();
    h.send({ t: "evs", tag: "a", ev: ev([0, 1, 60, 1], [18000, 0, 60, 0], [25000, 1, 67, 1]) });
    h.send({ t: "evs", tag: "b", ev: ev([0, 1, 60, 1], [35000, 0, 60, 0], [27000, 1, 72, 1]) });
    h.render(40);
    h.send({ t: "evclear", tag: "a" });
    const held = h.render(110);
    expect(rms(held, 2000, held.length)).toBeGreaterThan(0.01);
    h.send({ t: "evclear", tag: "b" });
    const after = h.render(300);
    expect(rms(after, 12000, after.length)).toBeLessThan(1e-4);
  });

  it("retains another clip's future events and removes the cleared clip's events", () => {
    const h = boot();
    h.send({ t: "evs", tag: "a", ev: ev([8000, 1, 60, 1]) });
    h.send({ t: "evs", tag: "b", ev: ev([16000, 1, 72, 1], [24000, 0, 72, 0]) });
    h.send({ t: "evclear", tag: "a" });
    const out = h.render(300);
    expect(rms(out, 9000, 15000)).toBeLessThan(1e-4);
    expect(rms(out, 18000, 23000)).toBeGreaterThan(0.01);
    expect(rms(out, 30000, out.length)).toBeLessThan(1e-4);
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
