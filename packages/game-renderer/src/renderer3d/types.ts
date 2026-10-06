import * as THREE from "three";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import type { PreparedGameModel } from "./preparation.js";
export interface CachedModel {
  readonly prepared: PreparedGameModel;
  readonly gltf: GLTF;
}
export interface RenderInstance {
  modelAssetId?: string;
  sampledAnimationKey?: string;
  readonly descriptor: string;
  readonly object: THREE.Object3D;
  readonly materials: readonly THREE.Material[];
  readonly primitiveGeometry?: THREE.BufferGeometry;
  readonly mixer?: THREE.AnimationMixer;
  readonly clips?: readonly THREE.AnimationClip[];
}
