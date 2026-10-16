export type Sampling = "nearest" | "linear";

export interface TextureEntry {
  readonly texture: GPUTexture;
  readonly bindGroups: Readonly<Record<Sampling, GPUBindGroup>>;
  readonly width: number;
  readonly height: number;
}

export type Blend = "normal" | "additive";

export interface Batch {
  readonly texture: TextureEntry;
  readonly bindGroup: GPUBindGroup;
  readonly blend: Blend;
  readonly first: number;
  count: number;
}
