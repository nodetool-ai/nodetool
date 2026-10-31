import { describe, expect, it } from "vitest";
import {
  NativeImageDecoder,
  nativeRasterSize
} from "../src/native-cpp/image2d-verified.js";

describe("native raster preflight", () => {
  it("reads PNG dimensions before decode and rejects oversized allocations", async () => {
    const bytes = new Uint8Array(33),
      view = new DataView(bytes.buffer);
    view.setUint32(0, 0x89504e47);
    view.setUint32(4, 0x0d0a1a0a);
    view.setUint32(8, 13);
    view.setUint32(12, 0x49484452);
    view.setUint32(16, 8193);
    view.setUint32(20, 2);
    expect(nativeRasterSize(bytes)).toEqual({
      width: 8193,
      height: 2,
      mime: "image/png"
    });
    const decoder = new NativeImageDecoder();
    await expect(decoder.decode(bytes)).rejects.toThrow("decode budget");
    decoder.dispose();
    await expect(decoder.decode(bytes)).rejects.toThrow("disposed");
  });
  it("reads bounded JPEG SOF segments and rejects truncation, SVG and MIME mismatch", async () => {
    const jpeg = new Uint8Array([
      255, 216, 255, 224, 0, 4, 0, 0, 255, 192, 0, 8, 8, 0, 2, 0, 3, 1
    ]);
    expect(nativeRasterSize(jpeg)).toEqual({
      width: 3,
      height: 2,
      mime: "image/jpeg"
    });
    expect(() => nativeRasterSize(jpeg.subarray(0, 16))).toThrow("Truncated");
    expect(() =>
      nativeRasterSize(new TextEncoder().encode("<svg width='1' height='1'/>"))
    ).toThrow("PNG or JPEG");
    const decoder = new NativeImageDecoder();
    await expect(decoder.decode(jpeg, "image/png")).rejects.toThrow("MIME");
    decoder.dispose();
  });
});
