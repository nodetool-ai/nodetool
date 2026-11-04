/** Storage precision is independent of transfer encoding. */
export type WorkingFormat = "rgba8unorm" | "rgba16float";
export type FrameInterpretation = "unknown" | "encoded-sdr" | "linear-srgb" | "data";

export interface FrameLayout {
  readonly width: number;
  readonly height: number;
  readonly alpha: "straight" | "premultiplied";
  readonly interpretation: FrameInterpretation;
}

/** CPU rows have an explicit byte stride. Half samples are IEEE binary16 bits. */
export type WorkingFrame = FrameLayout & (
  | { readonly representation: "rgba8unorm"; readonly data: Uint8Array; readonly bytesPerRow: number }
  | { readonly representation: "rgba16float"; readonly data: Uint16Array; readonly bytesPerRow: number }
  | { readonly representation: "gpu-texture"; readonly texture: GPUTexture; readonly format: WorkingFormat; readonly bytesPerRow: null }
);

export function frameBytesPerPixel(format: WorkingFormat): number {
  return format === "rgba16float" ? 8 : 4;
}

export function frameReadbackLayout(width: number, height: number, format: WorkingFormat): {
  readonly rowBytes: number;
  readonly bytesPerRow: number;
  readonly byteLength: number;
} {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) {
    throw new Error("Frame dimensions must be positive integers");
  }
  const rowBytes = width * frameBytesPerPixel(format);
  const bytesPerRow = Math.ceil(rowBytes / 256) * 256;
  const byteLength = bytesPerRow * height;
  if (!Number.isSafeInteger(byteLength)) {
    throw new Error("Frame byte length exceeds the safe integer range");
  }
  return { rowBytes, bytesPerRow, byteLength };
}
