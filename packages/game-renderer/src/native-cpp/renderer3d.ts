import {
  AmbientLight,
  BasicShadowMap,
  BoxGeometry,
  CapsuleGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  Group,
  Mesh,
  MeshLambertMaterial,
  MeshStandardMaterial,
  Material,
  Object3D,
  SRGBColorSpace,
  NoToneMapping,
  PerspectiveCamera,
  Scene,
  SphereGeometry,
  LinearSRGBColorSpace,
  LinearFilter,
  Texture,
  WebGLRenderer
} from "three";
import type {
  NativeFrame,
  NativeFrame3D,
  NativeGame3dDocument
} from "@nodetool-ai/protocol/native-game";
import type { NativeRenderer, NativeRendererOptions } from "./contracts.js";
import { NativeImageDecoder } from "./image2d-verified.js";
import { createNativeHud3D, type NativeHud3D } from "./3d-hud.js";
import { createNativeDecals3D, type NativeDecals3D } from "./3d-decals.js";
import { NativeParticles3D } from "./3d-particles.js";
import { resolveNativeModelImage } from "@nodetool-ai/game-runtime/native-browser";
import {
  NativePBRMaterials,
  NativeModelTexturePool,
  type NativeDecodedModelImage
} from "./3d-materials.js";
import { NativeEnvironment3D } from "./3d-environment.js";
import { createNativePost3D, type NativePost3D } from "./3d-post.js";
import { resolveNativeBuiltin } from "./3d-builtins.js";
import { NativeModelInstance } from "./model3d-instance.js";
import { NATIVE_SKIN_NORMAL_VERTEX } from "./3d-shaders.js";
import type { NativePreparedModel } from "./model3d-types.js";

export interface NativeRenderer3DOptions extends NativeRendererOptions {
  readonly prepareModel: (id: string) => Promise<NativePreparedModel>;
  readonly onDiagnostic?: (message: string) => void;
  readonly imageDecoder?: {
    decode(bytes: Uint8Array, mimeType?: string): Promise<ImageBitmap>;
  };
}
/** Matches the fixed per-vertex lighting and shadow multiplier in GameViewport.cpp. */
function configureNativeMaterial(material: MeshLambertMaterial): void {
  material.side = DoubleSide;
  material.shadowSide = DoubleSide;
  material.onBeforeCompile = (shader) => {
    shader.vertexShader =
      "varying float nativeLight;\n" +
      shader.vertexShader
        .replace("#include <skinnormal_vertex>", NATIVE_SKIN_NORMAL_VERTEX)
        .replace(
          "#include <normal_vertex>",
          "#include <normal_vertex>\nnativeLight = 0.35 + 0.65 * max(0.0, dot(normalize(inverseTransformDirection(transformedNormal, viewMatrix)), normalize(vec3(0.4, 0.8, 0.5))));"
        );
    shader.fragmentShader =
      "varying float nativeLight;\n" +
      shader.fragmentShader
        .replace(
          "#include <shadowmap_pars_fragment>",
          "#include <shadowmap_pars_fragment>\n#include <shadowmask_pars_fragment>"
        )
        .replace(
          "vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;",
          "vec3 outgoingLight = diffuseColor.rgb * nativeLight * (0.4 + 0.6 * getShadowMask());"
        );
  };
  material.customProgramCacheKey = () => "native-cpp-fixed-shading-1";
}
type NativeVisual = NonNullable<NativeFrame3D["entities"][number]["visual"]>;
function sameVisual(a: NativeVisual, b: NativeVisual): boolean {
  if (a.kind === "model" && b.kind === "model") {
    return (
      a.assetId === b.assetId &&
      a.castShadow === b.castShadow &&
      a.receiveShadow === b.receiveShadow
    );
  }
  if (a.kind !== "primitive" || b.kind !== "primitive") {
    return false;
  }
  return (
    a.shape === b.shape &&
    a.material?.color === b.material?.color &&
    a.material?.metalness === b.material?.metalness &&
    a.material?.roughness === b.material?.roughness &&
    a.material?.opacity === b.material?.opacity &&
    a.material?.emissive === b.material?.emissive &&
    a.material?.alphaMode === b.material?.alphaMode &&
    a.material?.alphaCutoff === b.material?.alphaCutoff &&
    a.castShadow === b.castShadow &&
    a.receiveShadow === b.receiveShadow &&
    a.color[0] === b.color[0] &&
    a.color[1] === b.color[1] &&
    a.color[2] === b.color[2] &&
    a.color[3] === b.color[3]
  );
}
export interface NativeRenderer3D extends NativeRenderer {
  finishFrame(): void;
  readonly stats: {
    readonly entities: number;
    readonly models: number;
    readonly drawCalls: number;
    readonly vertices: number;
    readonly geometries: number;
    readonly textures: number;
    readonly programs: number;
    readonly contextLost: boolean;
    readonly diagnostics: readonly string[];
    readonly particles: number;
    readonly softDepthBytes: number;
    readonly skyBuilds: number;
    readonly decodedModelImages: number;
    readonly modelImageReferences: number;
    readonly decodedModelImageBytes: number;
    readonly modelTextureVariants: number;
    readonly modelTextureAnisotropy: number;
    readonly uploadedModelTextureVariants: number;
    readonly softDepthPasses: number;
  };
}
/** Renders admitted native frames without loading a legacy game session. */
export async function createNativeRenderer3D(
  options: NativeRenderer3DOptions,
  document?: NativeGame3dDocument
): Promise<NativeRenderer3D> {
  const decoder = options.imageDecoder ?? new NativeImageDecoder();
  const scene = new Scene();
  const fixedBackground = new Color(18 / 255, 22 / 255, 30 / 255);
  scene.background = fixedBackground;
  const camera = new PerspectiveCamera(60, 1, 0.05, 10000);
  const renderer = new WebGLRenderer({
    canvas: options.canvas,
    antialias: false,
    preserveDrawingBuffer: true
  });
  renderer.info.autoReset = false;
  renderer.outputColorSpace = LinearSRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = BasicShadowMap;
  const fixedAmbient = new AmbientLight(0xffffff, 0.35);
  scene.add(fixedAmbient);
  const sun = new DirectionalLight(0xffffff, 0.65);
  sun.position.set(20, 40, 25);
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -40;
  sun.shadow.camera.right = 40;
  sun.shadow.camera.top = 40;
  sun.shadow.camera.bottom = -40;
  sun.shadow.camera.near = 0.1;
  sun.shadow.camera.far = 150;
  sun.shadow.bias = -0.002;
  sun.castShadow = true;
  sun.shadow.autoUpdate = false;
  scene.add(sun);
  const models = new Map<
    string,
    {
      model: NativePreparedModel;
      materials: MeshLambertMaterial[];
      pbr: NativePBRMaterials;
      vertices: number;
    }
  >();
  const materials = new Set<Material>();
  const environment = new NativeEnvironment3D(renderer);
  const particles = new NativeParticles3D(scene);
  let post: NativePost3D | undefined;
  let decals: NativeDecals3D | undefined;
  let hud: NativeHud3D | undefined;
  const roots = new Map<string, Object3D>();
  let enhancedMode = false;
  const textures = new Set<Texture>();
  const fixedTextures = new Map<string, Texture>();
  const decodedImages = new Map<string, NativeDecodedModelImage>();
  const modelTexturePool = new NativeModelTexturePool(
    Math.max(1, renderer.capabilities.getMaxAnisotropy())
  );
  let modelImageReferences = 0;
  let decodedImageBytes = 0;
  const instances = new Map<
    string,
    {
      root: Group | Mesh;
      model?: NativeModelInstance;
      visual: NativeVisual;
      tick: number;
      generation: number;
      animation?: number;
      animationTime?: number;
      animationLoop?: boolean;
    }
  >();
  const box = new BoxGeometry(1, 1, 1),
    sphere = new SphereGeometry(0.5, 24, 16).toNonIndexed(),
    capsule = new CapsuleGeometry(0.5, 0.5, 8, 24).toNonIndexed();
  sphere.computeVertexNormals();
  capsule.computeVertexNormals();
  let disposed = false,
    lost = false,
    last: NativeFrame3D | undefined;
  const diagnostics: string[] = [];
  const stats = {
    entities: 0,
    models: 0,
    drawCalls: 0,
    vertices: 0,
    geometries: 0,
    textures: 0,
    programs: 0,
    contextLost: false,
    diagnostics,
    particles: 0,
    softDepthBytes: 0,
    skyBuilds: 0,
    decodedModelImages: 0,
    modelImageReferences: 0,
    decodedModelImageBytes: 0,
    modelTextureVariants: 0,
    modelTextureAnisotropy: modelTexturePool.anisotropy,
    uploadedModelTextureVariants: 0,
    softDepthPasses: 0
  };
  const dispose = (): void => {
    if (disposed) {
      return;
    }
    disposed = true;
    options.canvas.removeEventListener("webglcontextlost", contextLost);
    options.canvas.removeEventListener("webglcontextrestored", contextRestored);
    for (const instance of instances.values()) {
      instance.model?.dispose();
    }
    instances.clear();
    roots.clear();
    for (const material of materials) {
      material.dispose();
    }
    for (const texture of textures) {
      texture.dispose();
    }
    for (const model of models.values()) {
      model.pbr.dispose();
    }
    hud?.dispose();
    decals?.dispose();
    particles.dispose();
    modelTexturePool.dispose();
    decodedImages.clear();
    fixedTextures.clear();
    environment.dispose();
    post?.dispose();
    models.clear();
    materials.clear();
    textures.clear();
    box.dispose();
    sphere.dispose();
    capsule.dispose();
    sun.shadow.dispose();
    if (!options.imageDecoder && decoder instanceof NativeImageDecoder) {
      decoder.dispose();
    }
    scene.clear();
    renderer.dispose();
  };
  const contextLost = (event: Event): void => {
    event.preventDefault();
    lost = true;
    stats.contextLost = true;
    options.onContextLost?.();
  };
  const restoreResources = async (): Promise<void> => {
    for (const texture of textures) {
      texture.needsUpdate = true;
    }
    modelTexturePool.contextRestored();
    sun.shadow.needsUpdate = true;
    hud?.contextRestored();
    decals?.contextRestored();
    post?.dispose();
    post = undefined;
    await environment.contextRestored();
    if (disposed) {
      return;
    }
    const rebuilt = environment.environments.size
      ? await createNativePost3D(
          renderer,
          environment.environments,
          resolveNativeBuiltin
        )
      : undefined;
    if (disposed) {
      rebuilt?.dispose();
      return;
    }
    post = rebuilt;
    lost = false;
    stats.contextLost = false;
    if (last) {
      render(last);
    }
    options.onContextRestored?.();
  };
  const contextRestored = (): void => {
    void restoreResources().catch((error) => {
      const failure = error instanceof Error ? error : new Error(String(error));
      if (options.onError) {
        options.onError(failure);
      } else {
        queueMicrotask(() => {
          throw failure;
        });
      }
    });
  };
  const render = (frame: NativeFrame): void => {
    if (disposed) {
      throw new Error("Native 3D renderer is closed");
    }
    if (frame.dimension !== "3d") {
      throw new Error("Native 3D renderer requires a 3D frame");
    }
    last = frame;
    if (lost) {
      return;
    }
    renderer.info.reset();
    let vertices = 0;
    for (const entity of frame.entities) {
      const visual = entity.visual;
      if (!visual) {
        continue;
      }
      vertices +=
        visual.kind === "primitive"
          ? visual.shape === "box"
            ? 36
            : 2304
          : (models.get(visual.assetId)?.vertices ?? 0);
      if (vertices > 1_000_000) {
        throw new Error("Native render vertex budget exceeded");
      }
    }
    stats.vertices = vertices;
    const enhanced = frame.environment !== undefined;
    if (enhanced !== enhancedMode) {
      for (const instance of instances.values()) {
        scene.remove(instance.root);
        instance.model?.dispose();
        if (
          instance.root instanceof Mesh &&
          instance.root.material instanceof Material
        ) {
          instance.root.material.dispose();
          materials.delete(instance.root.material);
        }
      }
      instances.clear();
      roots.clear();
      particles.prepare(renderer, camera, { ...frame, particles: [] });
      decals?.sync({ ...frame, entities: [] }, roots);
      environment.detach();
      enhancedMode = enhanced;
    }
    fixedAmbient.visible = !enhanced;
    sun.visible = !enhanced;
    renderer.outputColorSpace = enhanced
      ? SRGBColorSpace
      : LinearSRGBColorSpace;
    if (!enhanced) {
      renderer.toneMapping = NoToneMapping;
      renderer.shadowMap.type = BasicShadowMap;
      scene.background = fixedBackground;
      scene.environment = null;
      scene.fog = null;
      environment.ambient.visible = false;
    }
    const live = new Set<string>();
    for (const entity of frame.entities) {
      const visual = entity.visual;
      if (!visual) {
        continue;
      }
      live.add(entity.id);
      let instance = instances.get(entity.id);
      if (instance && !sameVisual(instance.visual, visual)) {
        scene.remove(instance.root);
        instance.model?.dispose();
        if (
          instance.root instanceof Mesh &&
          instance.root.material instanceof Material
        ) {
          instance.root.material.dispose();
          materials.delete(instance.root.material);
        }
        instances.delete(entity.id);
        roots.delete(entity.id);
        instance = undefined;
      }
      if (!instance) {
        if (visual.kind === "model") {
          const prepared = models.get(visual.assetId);
          if (!prepared) {
            throw new Error(`Native model was not prepared: ${visual.assetId}`);
          }
          const model = new NativeModelInstance(
            prepared.model,
            enhanced ? prepared.pbr.materials : prepared.materials
          );
          model.setShadows(
            visual.castShadow ?? true,
            visual.receiveShadow ?? true
          );
          instance = {
            root: model.root,
            model,
            visual,
            tick: -1,
            generation: -1
          };
        } else {
          const color = visual.color;
          const material = enhanced
            ? new MeshStandardMaterial({
                color:
                  visual.material?.color ??
                  new Color(color[0], color[1], color[2]),
                metalness: visual.material?.metalness ?? 0,
                roughness: visual.material?.roughness ?? 0.8,
                opacity: visual.material?.opacity ?? color[3],
                transparent: visual.material?.alphaMode === "blend",
                alphaTest:
                  visual.material?.alphaMode === "mask"
                    ? (visual.material.alphaCutoff ?? 0.5)
                    : 0,
                emissive: visual.material?.emissive ?? "#000000"
              })
            : new MeshLambertMaterial({
                color: new Color(color[0], color[1], color[2]),
                opacity: color[3],
                transparent: false
              });
          if (material instanceof MeshLambertMaterial) {
            configureNativeMaterial(material);
          }
          materials.add(material);
          const mesh = new Mesh(
            visual.shape === "box"
              ? box
              : visual.shape === "sphere"
                ? sphere
                : capsule,
            material
          );
          mesh.castShadow = visual.castShadow ?? true;
          mesh.receiveShadow = visual.receiveShadow ?? true;
          instance = { root: mesh, visual, tick: -1, generation: -1 };
        }
        instances.set(entity.id, instance);
        roots.set(entity.id, instance.root);
        scene.add(instance.root);
      }
      const transform = entity.transform;
      instance.root.position.fromArray(transform.position);
      instance.root.quaternion.fromArray(transform.rotation);
      instance.root.scale.fromArray(transform.scale);
      if (visual.kind === "primitive") {
        instance.root.scale.set(
          transform.scale[0] * visual.size[0],
          transform.scale[1] * visual.size[1],
          transform.scale[2] * visual.size[2]
        );
      }
      if (instance.model && visual.kind === "model") {
        const animation = visual.animation ?? 0,
          animationTime = visual.animationTime ?? frame.tick / 60,
          animationLoop = visual.animationLoop ?? true;
        if (
          instance.animation !== animation ||
          instance.animationTime !== animationTime ||
          instance.animationLoop !== animationLoop ||
          instance.generation !== frame.generation
        ) {
          instance.model.sample(animation, animationTime, animationLoop);
          instance.animation = animation;
          instance.animationTime = animationTime;
          instance.animationLoop = animationLoop;
          instance.generation = frame.generation;
        }
        instance.tick = frame.tick;
      }
    }
    for (const [id, instance] of instances) {
      if (!live.has(id)) {
        scene.remove(instance.root);
        instance.model?.dispose();
        if (
          instance.root instanceof Mesh &&
          instance.root.material instanceof Material
        ) {
          instance.root.material.dispose();
          materials.delete(instance.root.material);
        }
        instances.delete(id);
        roots.delete(id);
      }
    }
    if ("position" in frame.camera) {
      camera.position.fromArray(frame.camera.position);
      if (frame.camera.up) {
        camera.up.fromArray(frame.camera.up);
      } else {
        camera.up.set(0, 1, 0);
      }
      camera.fov = frame.camera.fov;
      camera.near = frame.camera.near ?? 0.05;
      camera.far = frame.camera.far ?? 10000;
      camera.lookAt(
        frame.camera.target[0],
        frame.camera.target[1],
        frame.camera.target[2]
      );
    } else {
      camera.position.set(6, 5, 8);
      camera.up.set(0, 1, 0);
      camera.fov = 60;
      camera.near = 0.05;
      camera.far = 10000;
      camera.lookAt(0, 0, 0);
    }
    camera.updateProjectionMatrix();
    sun.shadow.needsUpdate = true;
    if (enhanced) {
      environment.configure(scene, camera, frame);
      scene.updateMatrixWorld(true);
      decals?.sync(frame, roots);
      particles.prepare(renderer, camera, frame);
      stats.particles = particles.count;
      stats.softDepthBytes = particles.targetBytes;
      stats.softDepthPasses = particles.depthPasses;
      stats.skyBuilds = environment.skyBuilds;
      environment.bindMaterials(scene, camera, frame);
      if (!post) {
        throw new Error("Native environment postprocessing was not prepared");
      }
      post.render(scene, camera, frame.sceneId);
    } else {
      renderer.render(scene, camera);
    }
    hud?.render(renderer, frame);
    stats.decodedModelImages = decodedImages.size;
    stats.modelImageReferences = modelImageReferences;
    stats.decodedModelImageBytes = decodedImageBytes;
    stats.modelTextureVariants = modelTexturePool.variants;
    stats.uploadedModelTextureVariants = modelTexturePool.uploadedVariants;
    stats.entities = instances.size;
    stats.models = models.size;
    stats.drawCalls = renderer.info.render.calls;
    stats.geometries = renderer.info.memory.geometries;
    stats.textures = renderer.info.memory.textures;
    stats.programs = renderer.info.programs?.length ?? 0;
  };
  options.canvas.addEventListener("webglcontextlost", contextLost);
  options.canvas.addEventListener("webglcontextrestored", contextRestored);
  try {
    for (const entry of options.assets.entries) {
      if (entry.kind !== "model") {
        continue;
      }
      const model = await options.prepareModel(entry.id);
      const modelTextures: Texture[] = [];
      const modelImages: NativeDecodedModelImage[] = [];
      for (const image of model.images) {
        modelImageReferences++;
        const resolved = await resolveNativeModelImage(
          image,
          entry.id,
          options.assets
        );
        let decoded = decodedImages.get(resolved.digest);
        if (!decoded) {
          decoded = {
            bitmap: await decoder.decode(resolved.bytes, resolved.mimeType),
            digest: resolved.digest
          };
          decodedImages.set(resolved.digest, decoded);
          decodedImageBytes += decoded.bitmap.width * decoded.bitmap.height * 4;
        }
        modelImages.push(decoded);
        let texture = fixedTextures.get(resolved.digest);
        if (!texture) {
          texture = new Texture(decoded.bitmap);
          texture.flipY = false;
          texture.minFilter = LinearFilter;
          texture.magFilter = LinearFilter;
          texture.generateMipmaps = false;
          texture.colorSpace = LinearSRGBColorSpace;
          texture.needsUpdate = true;
          textures.add(texture);
          fixedTextures.set(resolved.digest, texture);
        }
        modelTextures.push(texture);
      }
      const modelMaterials = model.materials.map((source) => {
        const material = new MeshLambertMaterial({
          color: new Color(source.color[0], source.color[1], source.color[2]),
          opacity: source.color[3],
          side: DoubleSide,
          map: source.image < 0 ? null : modelTextures[source.image]
        });
        configureNativeMaterial(material);
        materials.add(material);
        return material;
      });
      if (!modelMaterials.length) {
        const material = new MeshLambertMaterial();
        configureNativeMaterial(material);
        materials.add(material);
        modelMaterials.push(material);
      }
      models.set(entry.id, {
        model: { ...model, images: [] },
        materials: modelMaterials,
        pbr: new NativePBRMaterials(model, modelImages, modelTexturePool),
        vertices: model.nodes.reduce(
          (total, node) =>
            total +
            (node.mesh < 0
              ? 0
              : model.meshes[node.mesh].reduce(
                  (count, primitive) => count + primitive.indices.length,
                  0
                )),
          0
        )
      });
      options.assets.release(entry.id);
    }
    if (document) {
      decals = await createNativeDecals3D(
        scene,
        options.assets,
        decoder,
        document,
        (message) => {
          if (
            !stats.diagnostics.includes(message) &&
            stats.diagnostics.length < 64
          ) {
            stats.diagnostics.push(message);
            options.onDiagnostic?.(message);
          }
        }
      );
    }
    hud = await createNativeHud3D({ assets: options.assets, document });
    await environment.prepare(document);
    if (environment.environments.size) {
      post = await createNativePost3D(
        renderer,
        environment.environments,
        resolveNativeBuiltin
      );
    }
  } catch (error) {
    dispose();
    throw error;
  }
  return {
    stats,
    render,
    finishFrame(): void {
      if (disposed) {
        throw new Error("Native 3D renderer is closed");
      }
      if (lost) {
        throw new Error("Native graphics context is lost");
      }
      renderer.getContext().finish();
    },
    resize(width, height, pixelRatio = 1): void {
      if (
        !Number.isFinite(width) ||
        !Number.isFinite(height) ||
        width <= 0 ||
        height <= 0 ||
        !Number.isFinite(pixelRatio) ||
        pixelRatio <= 0 ||
        pixelRatio > 4
      ) {
        throw new Error("Invalid native renderer dimensions");
      }
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(width, height, false);
      post?.resize(
        Math.floor(width * pixelRatio),
        Math.floor(height * pixelRatio)
      );
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    },
    dispose
  };
}
