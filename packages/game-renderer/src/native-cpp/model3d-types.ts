import {
  nativePreparedModel,
  type NativePreparedImage
} from "@nodetool-ai/protocol/native-game";

export interface NativeModelSampler {
  readonly wrapS: 33071 | 33648 | 10497;
  readonly wrapT: 33071 | 33648 | 10497;
  readonly magFilter: 9728 | 9729;
  readonly minFilter: 9728 | 9729 | 9984 | 9985 | 9986 | 9987;
}
export const DEFAULT_NATIVE_MODEL_SAMPLER: NativeModelSampler = {
  wrapS: 10497,
  wrapT: 10497,
  magFilter: 9729,
  minFilter: 9987
};

/** Immutable model data admitted by the native PreparedAssets importer. */
export interface NativePreparedModel {
  readonly meshes: readonly (readonly NativeModelPrimitive[])[];
  readonly materials: readonly {
    readonly color: readonly number[];
    readonly metallic: number;
    readonly roughness: number;
    readonly image: number;
    readonly doubleSided: boolean;
    readonly emissive?: readonly number[];
    readonly emissiveStrength?: number;
    readonly normalImage?: number;
    readonly normalScale?: number;
    readonly alphaMode?: "OPAQUE" | "MASK" | "BLEND";
    readonly alphaCutoff?: number;
    readonly baseColorSampler?: NativeModelSampler;
    readonly normalSampler?: NativeModelSampler;
  }[];
  readonly images: readonly NativePreparedImage[];
  readonly nodes: readonly {
    readonly local: readonly number[];
    readonly children: readonly number[];
    readonly mesh: number;
    readonly skin: number;
  }[];
  readonly roots: readonly number[];
  readonly skins: readonly {
    readonly joints: readonly number[];
    readonly inverseBind: readonly (readonly number[])[];
  }[];
  readonly animations: readonly {
    readonly name: string;
    readonly duration: number;
    readonly channels: readonly {
      readonly node: number;
      readonly path: string;
      readonly interpolation: string;
      readonly times: readonly number[];
      readonly values: readonly (readonly number[])[];
    }[];
  }[];
}
export interface NativeModelPrimitive {
  readonly vertices: readonly {
    readonly position: readonly number[];
    readonly normal: readonly number[];
    readonly color?: readonly number[];
    readonly uv: readonly number[];
    readonly joints: readonly number[];
    readonly weights: readonly number[];
  }[];
  readonly indices: readonly number[];
  readonly material: number;
}

/** Checks the shared bridge response and releases its original glTF source graph. */
export function parseNativePreparedModel(value: unknown): NativePreparedModel {
  const model = nativePreparedModel.parse(value);
  return {
    meshes: model.meshes,
    materials: model.materials,
    images: model.images,
    nodes: model.nodes,
    roots: model.roots,
    skins: model.skins,
    animations: model.animations
  };
}
