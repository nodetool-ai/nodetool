export interface TextureEntry {
  readonly texture: GPUTexture;
  readonly bindGroup: GPUBindGroup;
  readonly width: number;
  readonly height: number;
}

export type Blend = "normal" | "additive";

export interface Batch {
  readonly texture: TextureEntry;
  readonly blend: Blend;
  readonly first: number;
  count: number;
}
