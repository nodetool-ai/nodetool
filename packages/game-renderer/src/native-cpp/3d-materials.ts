import {
  ClampToEdgeWrapping,
  Color,
  DoubleSide,
  FrontSide,
  LinearFilter,
  LinearMipmapLinearFilter,
  LinearMipmapNearestFilter,
  NoColorSpace,
  MeshStandardMaterial,
  MirroredRepeatWrapping,
  NearestFilter,
  NearestMipmapLinearFilter,
  NearestMipmapNearestFilter,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
  Vector2
} from "three";
import type {
  NativeModelSampler,
  NativePreparedModel
} from "./model3d-types.js";
import { DEFAULT_NATIVE_MODEL_SAMPLER } from "./model3d-types.js";
import { NATIVE_SKIN_NORMAL_VERTEX } from "./3d-shaders.js";

function wrapping(
  value: number
):
  | typeof ClampToEdgeWrapping
  | typeof MirroredRepeatWrapping
  | typeof RepeatWrapping {
  return value === 33071
    ? ClampToEdgeWrapping
    : value === 33648
      ? MirroredRepeatWrapping
      : RepeatWrapping;
}
function minification(
  value: number
):
  | typeof NearestFilter
  | typeof LinearFilter
  | typeof NearestMipmapNearestFilter
  | typeof LinearMipmapNearestFilter
  | typeof NearestMipmapLinearFilter
  | typeof LinearMipmapLinearFilter {
  switch (value) {
    case 9728:
      return NearestFilter;
    case 9729:
      return LinearFilter;
    case 9984:
      return NearestMipmapNearestFilter;
    case 9985:
      return LinearMipmapNearestFilter;
    case 9986:
      return NearestMipmapLinearFilter;
    default:
      return LinearMipmapLinearFilter;
  }
}
export interface NativeDecodedModelImage {
  readonly bitmap: ImageBitmap;
  readonly digest: string;
}
/** Reuses GPU texture variants across model chunks by encoded image digest, color space and sampler. */
export class NativeModelTexturePool {
  constructor(readonly anisotropy = 1) {}
  private readonly textures = new Map<string, Texture>();
  private readonly uploaded = new Set<Texture>();
  get(
    image: NativeDecodedModelImage,
    sampler: NativeModelSampler | undefined,
    color: boolean
  ): Texture {
    const settings = sampler ?? DEFAULT_NATIVE_MODEL_SAMPLER;
    const key = `${image.digest}:${settings.wrapS}:${settings.wrapT}:${settings.minFilter}:${settings.magFilter}:${color}`;
    const existing = this.textures.get(key);
    if (existing) {
      return existing;
    }
    const result = new Texture(image.bitmap);
    result.flipY = false;
    result.anisotropy = this.anisotropy;
    result.colorSpace = color ? SRGBColorSpace : NoColorSpace;
    result.wrapS = wrapping(settings.wrapS);
    result.wrapT = wrapping(settings.wrapT);
    result.magFilter =
      settings.magFilter === 9728 ? NearestFilter : LinearFilter;
    result.minFilter = minification(settings.minFilter);
    result.generateMipmaps = settings.minFilter >= 9984;
    result.needsUpdate = true;
    result.onUpdate = () => {
      this.uploaded.add(result);
    };
    this.textures.set(key, result);
    return result;
  }
  get variants(): number {
    return this.textures.size;
  }
  get uploadedVariants(): number {
    return this.uploaded.size;
  }
  contextRestored(): void {
    this.uploaded.clear();
    for (const texture of this.textures.values()) {
      texture.needsUpdate = true;
    }
  }
  dispose(): void {
    for (const texture of this.textures.values()) {
      texture.dispose();
    }
    this.textures.clear();
    this.uploaded.clear();
  }
}
/** Owns PBR materials; encoded images are admitted before entering the shared texture pool. */
export class NativePBRMaterials {
  readonly materials: MeshStandardMaterial[];
  private readonly textures: NativeModelTexturePool;
  private readonly ownTextures: boolean;
  constructor(
    model: NativePreparedModel,
    images: readonly NativeDecodedModelImage[],
    pool?: NativeModelTexturePool
  ) {
    this.textures = pool ?? new NativeModelTexturePool();
    this.ownTextures = !pool;
    const texture = (
      index: number,
      sampler: NativeModelSampler | undefined,
      color: boolean
    ): Texture | null => {
      if (index < 0) {
        return null;
      }
      const image = images[index];
      if (!image) {
        throw new Error("Native admitted model image is missing");
      }
      return this.textures.get(image, sampler, color);
    };
    this.materials = model.materials.map((source) => {
      const emissive = source.emissive ?? [0, 0, 0],
        alpha = source.alphaMode ?? "OPAQUE";
      const material = new MeshStandardMaterial({
        color: new Color(source.color[0], source.color[1], source.color[2]),
        metalness: source.metallic,
        roughness: source.roughness,
        emissive: new Color(emissive[0], emissive[1], emissive[2]),
        opacity: source.color[3],
        transparent: alpha === "BLEND",
        depthWrite: alpha !== "BLEND",
        alphaTest: alpha === "MASK" ? (source.alphaCutoff ?? 0.5) : 0,
        side: source.doubleSided ? DoubleSide : FrontSide,
        map: texture(source.image, source.baseColorSampler, true),
        normalMap: texture(
          source.normalImage ?? -1,
          source.normalSampler,
          false
        ),
        // GLTFLoader flips Y for derivative tangents (three@0.185.1 GLTFLoader.js:3507).
        normalScale: new Vector2(
          source.normalScale ?? 1,
          -(source.normalScale ?? 1)
        )
      });
      material.onBeforeCompile = (shader) => {
        shader.vertexShader = shader.vertexShader.replace(
          "#include <skinnormal_vertex>",
          NATIVE_SKIN_NORMAL_VERTEX
        );
      };
      material.customProgramCacheKey = () => "native-pbr-skin-normal-1";
      return material;
    });
    if (!this.materials.length) {
      this.materials.push(new MeshStandardMaterial());
    }
  }
  contextRestored(): void {
    if (this.ownTextures) {
      this.textures.contextRestored();
    }
  }
  dispose(): void {
    for (const material of this.materials) {
      material.dispose();
    }
    if (this.ownTextures) {
      this.textures.dispose();
    }
  }
}
