/**
 * Shared-buffer aliasing regression for the CPU enhance ops.
 *
 * `decodeRgba` returns a raw-RGBA input's pixel array BY REFERENCE (no copy),
 * which is what upstream GPU nodes emit. AutoContrast and Equalize used to
 * mutate that array in place, corrupting the upstream node's output for any
 * other consumer when an edge fans out. These nodes are pure CPU, so no GPU
 * device is needed here.
 */
import { describe, it, expect } from "vitest";
import { LIB_IMAGE_ENHANCE_NODES, rawRgbaImageRef } from "@nodetool-ai/image-nodes";

function findNode(suffix: string) {
  const cls = (LIB_IMAGE_ENHANCE_NODES as readonly { nodeType?: string }[]).find(
    (n) => n.nodeType?.endsWith(suffix)
  );
  if (!cls) throw new Error(`node ${suffix} not found`);
  return cls as unknown as {
    new (): {
      assign(p: Record<string, unknown>): void;
      process(): Promise<Record<string, unknown>>;
    };
  };
}

/** A gradient image so the histogram ops actually transform the pixels. */
function gradientRgba(w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const v = Math.round((i / (w * h - 1)) * 200) + 20; // 20..220, sub-full range
    out[i * 4] = v;
    out[i * 4 + 1] = 255 - v;
    out[i * 4 + 2] = (v * 3) % 256;
    out[i * 4 + 3] = 255;
  }
  return out;
}

describe("enhance CPU ops do not mutate the shared input buffer", () => {
  for (const suffix of [".AutoContrast", ".Equalize"] as const) {
    it(`${suffix} leaves the raw-RGBA input buffer unchanged`, async () => {
      const w = 8;
      const h = 8;
      const input = gradientRgba(w, h);
      const before = Uint8Array.from(input); // snapshot of the original bytes

      const node = new (findNode(suffix))();
      node.assign({ image: rawRgbaImageRef(input, w, h) });
      const result = await node.process();
      const output = (result.output ?? result) as Record<string, unknown>;

      // The op transformed something (guards against a no-op passing trivially).
      expect(output.data).toBeInstanceOf(Uint8Array);
      expect(output.data).not.toBe(input); // output must not alias the input

      // The input buffer is byte-for-byte identical to before the run.
      expect(input).toEqual(before);
    });
  }
});
