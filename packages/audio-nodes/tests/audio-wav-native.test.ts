/**
 * Inside the graph runner, the WAV and CV sample loops run in the native
 * kernels (`globalThis.__host.kernels`). This test installs a stand-in host
 * that runs the same kernels through the WebAssembly build, and checks that
 * each helper calls it and returns the same bytes as the JavaScript loop.
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { loadWasmKernels, type KernelArg, type Kernels } from "@nodetool-ai/kernels";
import {
  encodeWav,
  float32ToPcm16,
  parseWavBytes,
  pcm16ToFloat32
} from "../src/lib/audio-wav.js";

type Host = {
  call(name: string, args: unknown[], modes: string, outputs: Uint8Array[]): number;
};
const g = globalThis as { __host?: { kernels?: Host } };

let wasm: Kernels;
const calls: string[] = [];

beforeAll(async () => {
  wasm = await loadWasmKernels();
});

afterEach(() => {
  delete g.__host;
  calls.length = 0;
});

/** The runner's call protocol over the WebAssembly backend. */
function installHost(): void {
  g.__host = {
    kernels: {
      call(name, args, modes, outputs) {
        calls.push(name);
        const typed = args.map((arg, i): KernelArg => {
          const mode = modes[i];
          if (mode === "n") return arg as number;
          if (mode === "z") return null;
          const view = arg as Uint8Array | Float32Array;
          if (mode === "i") return { in: view };
          return mode === "o" ? { out: view.slice() } : { inout: view.slice() };
        });
        const result = wasm.backend.call(name, typed);
        typed.forEach((arg) => {
          if (arg && typeof arg === "object" && !("in" in arg)) {
            const view = "out" in arg ? arg.out : arg.inout;
            outputs.push(new Uint8Array(view.buffer, view.byteOffset, view.byteLength).slice());
          }
        });
        return result;
      }
    }
  };
}

function samples(): Float32Array {
  const out = new Float32Array(4001);
  for (let i = 0; i < out.length; i++) out[i] = Math.sin(i * 0.37) * 1.3;
  out.set([NaN, -0, 0.5, -0.5, Infinity]);
  return out;
}

describe("WAV helpers on the native kernels", () => {
  it("encodeWav and float32ToPcm16 give the JavaScript bytes", () => {
    const input = samples();
    const wav = encodeWav(input, 44100, 1);
    const pcm = float32ToPcm16(input);
    installHost();
    expect(encodeWav(input, 44100, 1)).toEqual(wav);
    expect(float32ToPcm16(input)).toEqual(pcm);
    expect(calls).toEqual(["nt_pcm16_encode", "nt_pcm16_encode"]);
  });

  it("parseWavBytes and pcm16ToFloat32 give the JavaScript samples", () => {
    const wav = encodeWav(samples(), 22050, 1);
    const parsed = parseWavBytes(wav);
    const pcm = pcm16ToFloat32(wav.subarray(44));
    installHost();
    expect(parseWavBytes(wav)).toEqual(parsed);
    expect(pcm16ToFloat32(wav.subarray(44))).toEqual(pcm);
    expect(calls).toEqual(["nt_pcm_decode", "nt_pcm_decode"]);
  });

  it("parseWavBytes decodes 24-bit data through the kernel", () => {
    // A 24-bit mono WAV with three samples: full scale, -1 LSB, 0.
    const data = [0xff, 0xff, 0x7f, 0xff, 0xff, 0xff, 0, 0, 0];
    const wav = new Uint8Array(44 + data.length);
    const view = new DataView(wav.buffer);
    wav.set([...new TextEncoder().encode("RIFF")], 0);
    view.setUint32(4, 36 + data.length, true);
    wav.set([...new TextEncoder().encode("WAVEfmt ")], 8);
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, 8000, true);
    view.setUint32(28, 24000, true);
    view.setUint16(32, 3, true);
    view.setUint16(34, 24, true);
    wav.set([...new TextEncoder().encode("data")], 36);
    view.setUint32(40, data.length, true);
    wav.set(data, 44);
    const parsed = parseWavBytes(wav);
    installHost();
    expect(parseWavBytes(wav)).toEqual(parsed);
    expect(calls).toEqual(["nt_pcm_decode"]);
  });
});
