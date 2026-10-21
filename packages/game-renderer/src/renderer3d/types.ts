import * as THREE from "three";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import type { PreparedGameModel } from "./preparation.js";
export interface CachedModel {
  readonly prepared: PreparedGameModel;
  readonly gltf: GLTF;
}
export interface RenderInstance {
  modelAssetId?: string;
  /** The model or primitive object `descriptor` was last checked against. A frame that reuses it skips the check. */
  descriptorSource?: unknown;
  /** The pose or clip state object of the last sample, and its fractional tick. */
  sampledAnimationSource?: unknown;
  sampledAnimationTick?: number;
  sampledAnimationMode?: "graph" | "clip";
  /** Tick whose pose last set the skinned mesh bounds. */
  boundsTick?: number;
  readonly descriptor: string;
  readonly object: THREE.Object3D;
  readonly materials: readonly THREE.Material[];
  readonly primitiveGeometry?: THREE.BufferGeometry;
  readonly mixer?: THREE.AnimationMixer;
  readonly clips?: readonly THREE.AnimationClip[];
}
