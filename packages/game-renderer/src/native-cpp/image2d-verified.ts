import type { NativeGame2dDocument } from "@nodetool-ai/protocol/native-game";
import type { NativeAssetBroker } from "./contracts.js";
import type { NativeImage2D } from "./draw2d-plan.js";

/** Reads bounded PNG/JPEG dimensions before invoking browser decoders. */
export function nativeRasterSize(bytes: Uint8Array): {
  width: number;
  height: number;
  mime: string;
} {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    bytes.length >= 33 &&
    view.getUint32(0) === 0x89504e47 &&
    view.getUint32(4) === 0x0d0a1a0a &&
    view.getUint32(8) === 13 &&
    view.getUint32(12) === 0x49484452
  ) {
    return {
      width: view.getUint32(16),
      height: view.getUint32(20),
      mime: "image/png"
    };
  }
  if (bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216) {
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset] !== 255) {
        throw new Error("Invalid JPEG marker");
      }
      while (bytes[offset] === 255) {
        offset++;
      }
      const marker = bytes[offset++];
      if (marker === 0xd9 || marker === 0xda) {
        break;
      }
      if (
        marker === 0x01 ||
        (marker !== undefined && marker >= 0xd0 && marker <= 0xd7)
      ) {
        continue;
      }
      if (offset + 2 > bytes.length) {
        break;
      }
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) {
        throw new Error("Truncated JPEG segment");
      }
      if (
        marker !== undefined &&
        [
          0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd,
          0xce, 0xcf
        ].includes(marker)
      ) {
        if (length < 8) {
          throw new Error("Invalid JPEG dimensions");
        }
        return {
          width: view.getUint16(offset + 5),
          height: view.getUint16(offset + 3),
          mime: "image/jpeg"
        };
      }
      offset += length;
    }
  }
  throw new Error("Native images must be PNG or JPEG");
}
/** Owns aggregate decode budgets, including embedded verified model images. */
export class NativeImageDecoder {
  private pixels = 0;
  private count = 0;
  private readonly images: ImageBitmap[] = [];
  private disposed = false;
  async decode(
    bytes: Uint8Array,
    mimeType?: string,
    premultiplyAlpha: PremultiplyAlpha = "none"
  ): Promise<ImageBitmap> {
    if (this.disposed) {
      throw new Error("Native image decoder disposed");
    }
    const size = nativeRasterSize(bytes),
      pixels = size.width * size.height;
    if (mimeType && mimeType !== size.mime) {
      throw new Error("Native image MIME does not match bytes");
    }
    if (
      size.width < 1 ||
      size.height < 1 ||
      size.width > 8192 ||
      size.height > 8192 ||
      pixels > 16777216 ||
      this.pixels + pixels > 64 * 1024 * 1024 ||
      this.count >= 256
    ) {
      throw new Error("Native image decode budget exceeded");
    }
    this.pixels += pixels;
    this.count++;
    const image = await createImageBitmap(
      new Blob([new Uint8Array(bytes)], { type: size.mime }),
      { premultiplyAlpha, colorSpaceConversion: "none" }
    );
    if (this.disposed) {
      image.close();
      throw new Error("Native image decoder disposed");
    }
    if (image.width !== size.width || image.height !== size.height) {
      image.close();
      throw new Error("Native image dimensions changed during decode");
    }
    this.images.push(image);
    return image;
  }
  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    for (const image of this.images) {
      image.close();
    }
    this.images.length = 0;
  }
}
/** Decodes only bytes admitted by the closed asset broker. */
export async function prepareNativeImages2D(
  broker: NativeAssetBroker,
  assets: NativeGame2dDocument["assets"]
): Promise<{
  readonly images: ReadonlyMap<string, NativeImage2D>;
  dispose(): void;
}> {
  const decoder = new NativeImageDecoder(),
    images = new Map<string, NativeImage2D>();
  try {
    for (const asset of assets) {
      if (asset.kind !== "image") {
        continue;
      }
      const image = await decoder.decode(
        await broker.get(asset.id),
        undefined,
        "premultiply"
      );
      if (
        asset.trim &&
        (asset.trim.x + image.width > asset.trim.sourceWidth ||
          asset.trim.y + image.height > asset.trim.sourceHeight)
      ) {
        throw new Error(`Trim rectangle exceeds source canvas: ${asset.id}`);
      }
      images.set(asset.id, { image, width: image.width, height: image.height });
    }
    return { images, dispose: () => decoder.dispose() };
  } catch (error) {
    decoder.dispose();
    throw error;
  }
}

/** Creates one cumulative decode budget for a renderer asset set. */
export function createNativeImageDecoder(): NativeImageDecoder {
  return new NativeImageDecoder();
}
