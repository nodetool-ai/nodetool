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

export interface FrameReadbackLayout {
  readonly rowBytes: number;
  readonly bytesPerRow: number;
  readonly byteLength: number;
}

export function frameReadbackLayout(width: number, height: number, format: WorkingFormat): FrameReadbackLayout {
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

export function copyWorkingRows(mapped: ArrayBuffer, width: number, height: number, format: "rgba8unorm"): Uint8Array;
export function copyWorkingRows(mapped: ArrayBuffer, width: number, height: number, format: "rgba16float"): Uint16Array;
export function copyWorkingRows(mapped: ArrayBuffer, width: number, height: number, format: WorkingFormat): Uint8Array | Uint16Array;
/** Copy before unmap. Returned rows own their storage and never alias a GPU mapping. */
export function copyWorkingRows(mapped: ArrayBuffer, width: number, height: number, format: WorkingFormat): Uint8Array | Uint16Array {
  const { rowBytes, bytesPerRow, byteLength } = frameReadbackLayout(width, height, format);
  if (mapped.byteLength < byteLength) {
    throw new Error("Mapped frame is shorter than its readback layout");
  }
  const packed = new Uint8Array(rowBytes * height);
  const source = new Uint8Array(mapped);
  for (let row = 0; row < height; row++) {
    packed.set(source.subarray(row * bytesPerRow, row * bytesPerRow + rowBytes), row * rowBytes);
  }
  return format === "rgba16float" ? new Uint16Array(packed.buffer) : packed;
}

/** Fixed resources never inherit working precision. */
export type PrecisionSlots = Readonly<Record<string, "working" | "working-or-mask" | "fixed">>;
