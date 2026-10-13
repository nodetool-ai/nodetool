import { Texture } from "three";
import { gameAssetBinding3D } from "@nodetool-ai/protocol";
import type { GameImageSources3D, PreparedGameImage3D } from "./image-contract.js";
import { prepareGameImage3D } from "./image-preparation.js";

/** Decodes prepared bytes without issuing a URL request, retaining bitmap ownership until texture disposal. */
export async function decodeGameImage3D(image: PreparedGameImage3D, signal: AbortSignal): Promise<Texture> {
  signal.throwIfAborted();
  const bitmap = await createImageBitmap(new Blob([new Uint8Array(image.bytes).buffer], { type: `image/${image.binding.format}` }),
    { imageOrientation: "none", premultiplyAlpha: "none", colorSpaceConversion: "none" });
  if (signal.aborted) { bitmap.close(); signal.throwIfAborted(); }
  const texture = new Texture(bitmap);
  const close = (): void => { texture.removeEventListener("dispose", close); bitmap.close(); };
  texture.addEventListener("dispose", close);
  texture.needsUpdate = true;
  return texture;
}

interface ImageEntry3D {
  readonly controller: AbortController;
  readonly pending: Promise<Texture>;
  texture?: Texture;
  textureBytes: number;
}

/** Owns canonical image textures. Materials clone them when choosing UV transforms or color space. */
export class GameImageCache3D {
  private readonly entries = new Map<string, ImageEntry3D>();
  private disposed = false;
  private readonly onAbort = (): void => this.dispose();
  constructor(private readonly sources: GameImageSources3D, private readonly signal: AbortSignal) {
    signal.addEventListener("abort", this.onAbort, { once: true });
    if (signal.aborted) { this.dispose(); }
  }
  get textureBytes(): number { return [...this.entries.values()].reduce((sum, entry) => sum + entry.textureBytes, 0); }
  async get(logicalId: string): Promise<Texture> {
    this.signal.throwIfAborted();
    if (this.disposed) { throw new Error("Image cache is disposed"); }
    const existing = this.entries.get(logicalId);
    if (existing) { return existing.pending; }
    const controller = new AbortController();
    const signal = AbortSignal.any([this.signal, controller.signal]);
    const entry: ImageEntry3D = { controller, textureBytes: 0, pending: this.load(logicalId, signal).then((texture) => {
      if (signal.aborted || this.disposed) { texture.dispose(); signal.throwIfAborted(); throw new Error("Image cache is disposed"); }
      entry.texture = texture;
      const image: unknown = texture.image;
      if (image !== null && typeof image === "object" && "width" in image && "height" in image && typeof image.width === "number" && typeof image.height === "number") {
        entry.textureBytes = image.width * image.height * 4;
      }
      return texture;
    }) };
    this.entries.set(logicalId, entry);
    return entry.pending;
  }
  private async load(logicalId: string, signal: AbortSignal): Promise<Texture> {
    const source = await this.sources.resolveImage?.(logicalId, signal);
    signal.throwIfAborted();
    if (!source) { throw new Error(`Image asset ${logicalId} is missing`); }
    const binding = gameAssetBinding3D.parse(source.binding);
    if (binding.mediaKind !== "image") { throw new Error("Expected image binding"); }
    const checked = await prepareGameImage3D(source.bytes, { assetId: binding.assetId, expectedDigest: binding.digest, signal });
    if (!checked.ok) { throw new Error(`Image ${logicalId} failed preparation: ${checked.diagnostics.map((entry) => entry.message).join("; ")}`); }
    if (binding.width !== checked.image.binding.width || binding.height !== checked.image.binding.height || binding.format !== checked.image.binding.format || binding.byteLength !== source.bytes.length) {
      throw new Error("Image source metadata does not match binding");
    }
    const texture = await (this.sources.decodeImage ?? decodeGameImage3D)(checked.image, signal);
    try {
      signal.throwIfAborted();
      const image: unknown = texture.image;
      if (image === null || typeof image !== "object" || !("width" in image) || !("height" in image) || image.width !== binding.width || image.height !== binding.height) {
        throw new Error("Decoded image dimensions do not match binding");
      }
      return texture;
    } catch (error) { texture.dispose(); throw error; }
  }
  async invalidate(slot: string): Promise<void> {
    const entry = this.entries.get(slot);
    this.entries.delete(slot);
    if (entry) { entry.controller.abort(); entry.texture?.dispose(); entry.texture = undefined; await entry.pending.catch(() => undefined); }
  }
  dispose(): void {
    if (this.disposed) { return; }
    this.disposed = true;
    this.signal.removeEventListener("abort", this.onAbort);
    for (const entry of this.entries.values()) { entry.controller.abort(); entry.texture?.dispose(); }
    this.entries.clear();
  }
}
