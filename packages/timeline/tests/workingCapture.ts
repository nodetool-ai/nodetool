import type { WorkingFrame } from "@nodetool-ai/gpu/webgpu";

export function workingValues(frame: WorkingFrame): number[] {
  if (frame.representation === "gpu-texture") throw new Error("Expected CPU capture");
  if (frame.representation === "rgba8unorm") return Array.from(frame.data, v => v / 255);
  return Array.from(frame.data, bits => {
    const sign = bits & 0x8000 ? -1 : 1;
    const exponent = (bits >> 10) & 31;
    const fraction = bits & 1023;
    return sign * (exponent === 0 ? fraction * 2 ** -24 : (1 + fraction / 1024) * 2 ** (exponent - 15));
  });
}

// Preserve the old precision diagnostics' nearest-code assertions, without delivery dither.
export function workingCodes(frame: WorkingFrame): Uint8Array {
  return Uint8Array.from(workingValues(frame), v => Math.round(v * 255));
}
