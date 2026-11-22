/**
 * The WT-1 worklet's timeline event protocol, run in-process: the processor
 * source is evaluated with a stand-in AudioWorklet scope and rendered block
 * by block.
 */

import { readFileSync } from "fs";
import { join } from "path";

import { generateTables } from "../../fablesynth/engine/wavetables";
import { defaultParams } from "../../fablesynth/params";
import { defaultDrumParams } from "../../fablesynth/drum/params";
import { generateDrumTables } from "../../fablesynth/drum/engine/drumtables";
import {
  encodeLiveControllers,
  encodeLiveEvents,
  encodeLivePitchOffsets,
  WorkletInstrumentDevice
} from "../workletDevice";

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

  it("F5 (worklet): cevs pitch-bend controller clip bends a sounding WT-1 note", () => {
    const measureFreq = (buf: Float32Array, from: number, to: number): number => {
      let crossings = 0;
      for (let i = from + 1; i < to; i++) {
        if (buf[i - 1]! <= 0 && buf[i]! > 0) crossings++;
      }
      return crossings / ((to - from) / SR);
    };

    const hBase = boot(ev([0, 1, 69, 0.9], [40000, 0, 69, 0]));
    hBase.send({ t: "p", k: "oscA.table", v: 0 });
    hBase.send({ t: "p", k: "oscA.pos", v: 0 });
    hBase.send({ t: "p", k: "oscA.unison", v: 1 });
    hBase.send({ t: "p", k: "filter.on", v: 0 });
    const outBase = hBase.render(250);

    const hBent = boot(ev([0, 1, 69, 0.9], [40000, 0, 69, 0]));
    hBent.send({ t: "p", k: "oscA.table", v: 0 });
    hBent.send({ t: "p", k: "oscA.pos", v: 0 });
    hBent.send({ t: "p", k: "oscA.unison", v: 1 });
    hBent.send({ t: "p", k: "filter.on", v: 0 });
    hBent.send({
      t: "cevs",
      tag: "pb-clip",
      ev: encodeLiveControllers([{ timeSec: 0, kind: "pitchBend", value: 8191 }], SR)
    });
    const outBent = hBent.render(250);

    const baseHz = measureFreq(outBase, 8000, 28000);
    const bentHz = measureFreq(outBent, 8000, 28000);
    // +2 semitones raises frequency by 2^(2/12) ≈ 1.1225x
    expect(bentHz / baseHz).toBeGreaterThan(1.08);
    expect(bentHz / baseHz).toBeLessThan(1.17);
  });

  it("F38 (worklet): DR-1 worklet transposes a pad hit by +3 semitones via eventPitchOffsets", () => {
    const drumEngineDir = join(__dirname, "../../fablesynth/drum/engine");
    const drumTables = generateDrumTables().map((t) => ({
      frames: t.frames,
      mips: t.mips,
      size: t.size,
      buf: t.data.slice().buffer
    }));
    const bootDrum = (events: Array<{ timeSec: number; on: boolean; pitch: number; velocity: number; pitchOffset?: number }>) => {
      let DrumProc: (new (options?: unknown) => Proc) | null = null;
      class AWP {
        port = { onmessage: null as Proc["port"]["onmessage"], postMessage: () => {} };
      }
      const register = (_name: string, cls: new (options?: unknown) => Proc) => {
        DrumProc = cls;
      };
      let frame = 0;
      Object.defineProperty(globalThis, "currentFrame", { configurable: true, get: () => frame });
      for (const [dir, file] of [
        [ENGINE, "ott-worklet.js"],
        [ENGINE, "lab-worklet.js"],
        [drumEngineDir, "worklet-drum.js"]
      ]) {
        const src = readFileSync(join(dir, file), "utf8");
        new Function("sampleRate", "AudioWorkletProcessor", "registerProcessor", src)(SR, AWP, register);
      }
      const params = {
        ...defaultDrumParams(),
        "pad0.oscA.level": 0.9,
        "pad0.oscB.level": 0,
        "pad0.noise.level": 0,
        "pad0.penv.amt": 0,
        "pad0.aenv.dec": 0.5,
        "pad0.flt.on": 0,
        "fx.comp.on": 0,
        "fx.ott.on": 0,
        "fx.drive.on": 0,
        "fx.reverb.on": 0
      };
      const proc = new DrumProc!({
        processorOptions: {
          mixdown: true,
          baseNote: 36,
          params,
          tables: drumTables,
          samples: [],
          events: encodeLiveEvents(events, SR),
          eventPitchOffsets: encodeLivePitchOffsets(events)
        }
      });
      const out = new Float32Array(200 * 128);
      const l = new Float32Array(128);
      const r = new Float32Array(128);
      for (let b = 0; b < 200; b++) {
        proc.process([], [[l, r]]);
        out.set(l, b * 128);
        frame += 128;
      }
      return out;
    };

    const measureFreq = (buf: Float32Array, from: number, to: number): number => {
      let crossings = 0;
      for (let i = from + 1; i < to; i++) {
        if (buf[i - 1]! <= 0 && buf[i]! > 0) crossings++;
      }
      return crossings / ((to - from) / SR);
    };

    const plain = bootDrum([{ timeSec: 0, on: true, pitch: 36, velocity: 110 }]);
    const plus3 = bootDrum([{ timeSec: 0, on: true, pitch: 36, velocity: 110, pitchOffset: 3 }]);
    const plainHz = measureFreq(plain, 2000, 18000);
    const plus3Hz = measureFreq(plus3, 2000, 18000);
    // +3 semitones raises frequency by 2^(3/12) ≈ 1.1892x
    expect(plus3Hz / plainHz).toBeGreaterThan(1.14);
    expect(plus3Hz / plainHz).toBeLessThan(1.24);
  });
});
