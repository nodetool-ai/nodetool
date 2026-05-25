/**
 * `LabeledTexture` — a `GPUTexture` plus the metadata the Executor validates
 * against a module's I/O contract.
 *
 * Every texture in flight through the pool is labeled: it carries its color
 * space, alpha association, format, dimensions, and binding kind. The
 * Executor checks bound inputs against the module's declared contract at
 * bind time; mismatches fail loud or (later phases) route through a
 * registered conversion.
 *
 * It also exposes a `contentVersion` counter, bumped on every write. That is
 * the `inputs_content_hash` source for the future cache key (Phase 3) — full
 * pixel hashing is not required.
 */

import type { AlphaMode, BindingKind, ColorSpaceTag } from "./types.js";

/** Storage encoding + association recorded per texture. */
export interface LabeledTextureMeta {
  colorSpace: ColorSpaceTag;
  alpha: AlphaMode;
  bindingKind: BindingKind;
}

export interface CreateLabeledTextureOptions {
  width: number;
  height: number;
  format: GPUTextureFormat;
  usage: GPUTextureUsageFlags;
  label?: string;
  meta?: Partial<LabeledTextureMeta>;
}

const DEFAULT_META: LabeledTextureMeta = {
  colorSpace: "linear",
  alpha: "premultiplied",
  bindingKind: "texture_2d"
};

export class LabeledTexture {
  readonly texture: GPUTexture;
  readonly label: string;
  readonly format: GPUTextureFormat;
  readonly width: number;
  readonly height: number;
  readonly meta: LabeledTextureMeta;

  private version = 0;

  constructor(
    texture: GPUTexture,
    info: {
      label: string;
      format: GPUTextureFormat;
      width: number;
      height: number;
      meta: LabeledTextureMeta;
    }
  ) {
    this.texture = texture;
    this.label = info.label;
    this.format = info.format;
    this.width = info.width;
    this.height = info.height;
    this.meta = info.meta;
  }

  /** Monotonic counter, bumped by {@link markWritten}. */
  get contentVersion(): number {
    return this.version;
  }

  /** Record that this texture's pixels changed (cache-key source). */
  markWritten(): void {
    this.version += 1;
  }

  createView(descriptor?: GPUTextureViewDescriptor): GPUTextureView {
    return this.texture.createView(descriptor);
  }

  destroy(): void {
    this.texture.destroy();
  }
}

/** Allocate a fresh {@link LabeledTexture} on the given device. */
export function createLabeledTexture(
  device: GPUDevice,
  options: CreateLabeledTextureOptions
): LabeledTexture {
  const width = Math.max(1, Math.floor(options.width));
  const height = Math.max(1, Math.floor(options.height));
  const label = options.label ?? "labeled-texture";
  const texture = device.createTexture({
    label,
    size: { width, height },
    format: options.format,
    usage: options.usage
  });
  return new LabeledTexture(texture, {
    label,
    format: options.format,
    width,
    height,
    meta: { ...DEFAULT_META, ...options.meta }
  });
}
