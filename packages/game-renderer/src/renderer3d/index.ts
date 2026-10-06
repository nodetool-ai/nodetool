import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";
import type { GameAnimationState3D, GameLight3D, GameModel3D, GamePrimitive3D, GameRenderFrame3D, GameTransform3D } from "@nodetool-ai/protocol";
import { gameFontFamily } from "../fonts.js";
import { prepareGameModel, type PreparedGameModel } from "./preparation.js";

export { prepareGameModel, GAME_MODEL_BUDGETS } from "./preparation.js";
export type { GameModelBudgets, GameModelDiagnostic, PreparedGameModel, PrepareGameModelResult } from "./preparation.js";

export interface GameRendererCapabilities3D {
  readonly backend: "webgl2";
  readonly core3D: true;
  readonly minimalRenderSucceeded: boolean;
  readonly deviceStatus: "ready" | "lost" | "disposed";
  readonly deviceLossCount: number;
  readonly maxTextureSize: number;
  readonly maxSamples: number;
  readonly renderer: string;
  readonly adapterType: "hardware" | "software" | "unknown";
  readonly initializationMs: number;
  readonly missingFeatures: readonly string[];
}
export interface GameRendererStats3D {
  readonly backend: "webgl2";
  readonly drawCalls: number;
  readonly triangles: number;
  readonly geometries: number;
  readonly textures: number;
  readonly geometryBytes: number;
  readonly textureBytes: number;
  readonly modelLoadMs: number;
  readonly targetBytes: number;
  readonly diagnostics: readonly string[];
  readonly renderMs: number;
}
export interface GameModelSource3D {
  readonly bytes: Uint8Array;
  readonly digest?: string;
}
export interface CreateGameRenderer3DOptions {
  readonly canvas: HTMLCanvasElement;
  readonly resolveFont?: (logicalId: string, signal: AbortSignal) => Promise<GameModelSource3D | null>;
  readonly onDiagnostic?: (message: string) => void;
  readonly resolveModel?: (logicalId: string, signal: AbortSignal) => Promise<GameModelSource3D | null>;
  readonly signal?: AbortSignal;
  readonly preserveDrawingBuffer?: boolean;
  readonly onContextState?: (state: "lost" | "ready") => void;
}
export interface GameProjectedBounds3D {
  readonly entityId: string;
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}
export interface GameRenderer3D {
  readonly backend: "webgl2";
  readonly canvas: HTMLCanvasElement;
  readonly capabilities: GameRendererCapabilities3D;
  render(frame: GameRenderFrame3D, interpolation?: number): Promise<GameRendererStats3D>;
  resize(width: number, height: number): void;
  invalidateAsset(slot: string): void;
  pick(normalizedX: number, normalizedY: number): string | null;
  setCameraOverride(camera: GameRenderFrame3D["camera"] | null): void;
  getScene(): THREE.Scene;
  getCamera(): THREE.Camera;
  getEntityObject(entityId: string): THREE.Object3D | null;
  projectedBounds(): readonly GameProjectedBounds3D[];
  setEditorCamera(camera: THREE.PerspectiveCamera | THREE.OrthographicCamera | null): void;
  dispose(): void;
}

interface CachedModel {
  readonly prepared: PreparedGameModel;
  readonly gltf: GLTF;
}
interface RenderInstance {
  modelAssetId?: string;
  sampledAnimationKey?: string;
  readonly descriptor: string;
  readonly object: THREE.Object3D;
  readonly materials: readonly THREE.Material[];
  readonly primitiveGeometry?: THREE.BufferGeometry;
  readonly mixer?: THREE.AnimationMixer;
  readonly clips?: readonly THREE.AnimationClip[];
}

function applyTransform(object: THREE.Object3D, transform: GameTransform3D): void {
  object.position.set(transform.position.x, transform.position.y, transform.position.z);
  object.quaternion.fromArray(transform.rotation);
  object.scale.set(transform.scale.x, transform.scale.y, transform.scale.z);
}

export function interpolateGameTransform3D(previous: GameTransform3D, current: GameTransform3D, alpha: number): GameTransform3D {
  const amount = Math.max(0, Math.min(1, alpha));
  const position = new THREE.Vector3(previous.position.x, previous.position.y, previous.position.z)
    .lerp(new THREE.Vector3(current.position.x, current.position.y, current.position.z), amount);
  const rotation = new THREE.Quaternion().fromArray(previous.rotation).slerp(new THREE.Quaternion().fromArray(current.rotation), amount);
  return { position: { x: position.x, y: position.y, z: position.z }, rotation: [rotation.x, rotation.y, rotation.z, rotation.w],
    scale: { x: previous.scale.x + (current.scale.x - previous.scale.x) * amount,
      y: previous.scale.y + (current.scale.y - previous.scale.y) * amount,
      z: previous.scale.z + (current.scale.z - previous.scale.z) * amount } };
}

function primitiveInstance(primitive: GamePrimitive3D): RenderInstance {
  const size = primitive.dimensions;
  let geometry: THREE.BufferGeometry;
  if (primitive.kind === "box") { geometry = new THREE.BoxGeometry(size.x, size.y, size.z); }
  else if (primitive.kind === "sphere") { geometry = new THREE.SphereGeometry(0.5, 24, 16); geometry.scale(size.x, size.y, size.z); }
  else if (primitive.kind === "capsule") { geometry = new THREE.CapsuleGeometry(size.x / 2, Math.max(0, size.y - size.x), 8, 16); geometry.scale(1, 1, size.z / size.x); }
  else { geometry = new THREE.PlaneGeometry(size.x, size.z); geometry.rotateX(-Math.PI / 2); }
  const settings = primitive.material;
  const material = new THREE.MeshStandardMaterial({ color: settings.color, roughness: settings.roughness,
    metalness: settings.metalness, opacity: settings.opacity, transparent: settings.alphaMode === "blend",
    alphaTest: settings.alphaMode === "mask" ? settings.alphaCutoff : 0,
    emissive: settings.emissive ?? "#000000", side: primitive.kind === "plane" ? THREE.DoubleSide : THREE.FrontSide });
  const object = new THREE.Mesh(geometry, material);
  object.castShadow = primitive.castShadow;
  object.receiveShadow = primitive.receiveShadow;
  return { descriptor: JSON.stringify(primitive), object, materials: [material], primitiveGeometry: geometry };
}

function modelInstance(model: GameModel3D, cached: CachedModel): RenderInstance {
  // SkeletonUtils duplicates the skin's bones and bind state while retaining immutable geometry/texture resources.
  const object = cloneSkeleton(cached.gltf.scene);
  let selected: THREE.Object3D | undefined;
  if (model.nodeId !== undefined) {
    object.traverse((child) => { if (child.userData.gameNodeId === model.nodeId) { selected = child; } });
    if (!selected) { throw new Error(`Prepared model node ${model.nodeId} does not exist`); }
  }
  const selectedNodes = new Set<THREE.Object3D>();
  selected?.traverse((child) => selectedNodes.add(child));
  const materials: THREE.Material[] = [];
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) { return; }
    child.visible = selected === undefined || selectedNodes.has(child);
    child.castShadow = model.castShadow;
    child.receiveShadow = model.receiveShadow;
    const original = Array.isArray(child.material) ? child.material : [child.material];
    const cloned = original.map((material) => {
      const copy = material.clone();
      if (copy instanceof THREE.MeshStandardMaterial && model.material) {
        const override = model.material;
        if (override.color !== undefined) { copy.color.set(override.color); }
        if (override.emissive !== undefined) { copy.emissive.set(override.emissive); }
        if (override.metalness !== undefined) { copy.metalness = override.metalness; }
        if (override.roughness !== undefined) { copy.roughness = override.roughness; }
        if (override.opacity !== undefined) { copy.opacity = override.opacity; }
        if (override.alphaMode !== undefined) { copy.transparent = override.alphaMode === "blend"; }
        if (override.alphaCutoff !== undefined && override.alphaMode === "mask") { copy.alphaTest = override.alphaCutoff; }
      }
      copy.userData.baseOpacity = copy.opacity;
      copy.userData.baseTransparent = copy.transparent;
      materials.push(copy);
      return copy;
    });
    child.material = Array.isArray(child.material) ? cloned : cloned[0] ?? child.material;
  });
  return { descriptor: JSON.stringify(model), object, materials, mixer: new THREE.AnimationMixer(object), clips: cached.gltf.animations };
}

/** Evaluates cosmetic clips from an explicit simulation tick without accumulating wall-clock deltas. */
export function sampleGameAnimation3D(mixer: THREE.AnimationMixer, clips: readonly THREE.AnimationClip[], state: GameAnimationState3D, tick: number): void {
  mixer.stopAllAction();
  const elapsed = Math.max(0, tick - state.startTick);
  const transition = state.previousClipId !== undefined && (state.transitionTicks ?? 0) > 0
    ? Math.min(1, elapsed / (state.transitionTicks ?? 1)) : 1;
  const sample = (id: string, startTick: number, weight: number): void => {
    const match = /^clip:(\d+)$/.exec(id);
    const clip = match ? clips[Number(match[1])] : undefined;
    if (!clip) { throw new Error(`Prepared animation clip ${id} does not exist`); }
    const time = Math.max(0, tick - startTick) / 60 * state.playbackRate;
    const action = mixer.clipAction(clip);
    action.reset().setEffectiveWeight(weight).setEffectiveTimeScale(0).play();
    action.loop = state.loop ? THREE.LoopRepeat : THREE.LoopOnce;
    action.clampWhenFinished = !state.loop;
    action.time = state.loop && clip.duration > 0 ? time % clip.duration : Math.min(time, clip.duration);
  };
  if (state.previousClipId !== undefined && transition < 1) { sample(state.previousClipId, state.previousStartTick ?? state.startTick, 1 - transition); }
  sample(state.clipId, state.startTick, transition);
  mixer.update(0);
}

function releaseInstance(instance: RenderInstance): void {
  instance.mixer?.stopAllAction();
  instance.mixer?.uncacheRoot(instance.object);
  const skeletons = new Set<THREE.Skeleton>();
  instance.object.traverse((object) => { if (object instanceof THREE.SkinnedMesh) { skeletons.add(object.skeleton); } });
  skeletons.forEach((skeleton) => skeleton.dispose());
  instance.materials.forEach((material) => material.dispose());
  instance.primitiveGeometry?.dispose();
  instance.object.removeFromParent();
}

function releaseModel(model: CachedModel): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  model.gltf.scenes.forEach((scene) => scene.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      geometries.add(object.geometry);
      (Array.isArray(object.material) ? object.material : [object.material]).forEach((material) => {
        materials.add(material);
        for (const value of Object.values(material)) { if (value instanceof THREE.Texture) { textures.add(value); } }
      });
    }
  }));
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
  textures.forEach((texture) => {
    const image: unknown = texture.source.data;
    if (typeof ImageBitmap !== "undefined" && image instanceof ImageBitmap) { image.close(); }
    texture.dispose();
  });
}

class ThreeGameRenderer implements GameRenderer3D {
  readonly backend = "webgl2";
  private readonly scene = new THREE.Scene();
  private readonly ambient = new THREE.AmbientLight();
  private readonly instances = new Map<string, RenderInstance>();
  private readonly invalidatedAssets = new Set<string>();
  private readonly models = new Map<string, Promise<CachedModel>>();
  private readonly loadedModels = new Set<CachedModel>();
  private readonly fonts = new Map<string, FontFace>();
  private readonly optionalFonts = new Set<string>();
  private readonly diagnostics: string[] = [];
  private readonly lights = new Map<string, THREE.Light>();
  private readonly controller = new AbortController();
  private readonly hudCanvas = document.createElement("canvas");
  private readonly hudScene = new THREE.Scene();
  private readonly hudCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2);
  private readonly hudTexture = new THREE.CanvasTexture(this.hudCanvas);
  private readonly hudGeometry = new THREE.PlaneGeometry(2, 2);
  private readonly hudMaterial = new THREE.MeshBasicMaterial({ map: this.hudTexture, transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
  private camera: THREE.PerspectiveCamera | THREE.OrthographicCamera = new THREE.PerspectiveCamera();
  private editorCamera: THREE.PerspectiveCamera | THREE.OrthographicCamera | null = null;
  private cameraOverride: GameRenderFrame3D["camera"] | null = null;
  private status: "ready" | "lost" | "disposed" = "ready";
  private lossCount = 0;
  private successful = false;
  private restoring = false;
  private modelLoadMs = 0;
  private readonly initializationStarted = performance.now();
  private initializationMs = 0;
  private renderTail: Promise<void> = Promise.resolve();
  private presentation?: Pick<GameRenderFrame3D, "gameId" | "sceneId" | "tick">;
  private readonly onLost = (event: Event): void => {
    event.preventDefault();
    if (this.status === "disposed") { return; }
    this.status = "lost";
    this.successful = false;
    this.lossCount++;
    this.options.onContextState?.("lost");
  };
  private readonly onRestored = (): void => {
    if (this.status !== "disposed") { this.status = "ready"; this.restoring = true; }
  };
  private readonly onAbort = (): void => this.dispose();

  constructor(private readonly renderer: THREE.WebGLRenderer, private readonly options: CreateGameRenderer3DOptions) {
    this.scene.add(this.ambient);
    this.hudCamera.position.z = 1;
    this.hudTexture.colorSpace = THREE.SRGBColorSpace;
    this.hudScene.add(new THREE.Mesh(this.hudGeometry, this.hudMaterial));
    options.canvas.addEventListener("webglcontextlost", this.onLost);
    options.canvas.addEventListener("webglcontextrestored", this.onRestored);
    options.signal?.addEventListener("abort", this.onAbort, { once: true });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.autoClear = false;
  }
  get canvas(): HTMLCanvasElement { return this.options.canvas; }
  get capabilities(): GameRendererCapabilities3D {
    const context = this.renderer.getContext();
    const debug = context.getExtension("WEBGL_debug_renderer_info");
    const renderer: unknown = context.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : context.RENDERER);
    return { backend: this.backend, core3D: true, minimalRenderSucceeded: this.successful, deviceStatus: this.status,
      deviceLossCount: this.lossCount, maxTextureSize: this.renderer.capabilities.maxTextureSize,
      maxSamples: this.renderer.capabilities.maxSamples, renderer: typeof renderer === "string" ? renderer : "unknown",
      adapterType: typeof renderer === "string" && /swiftshader|llvmpipe|lavapipe|software/i.test(renderer) ? "software" : debug ? "hardware" : "unknown",
      initializationMs: this.initializationMs, missingFeatures: this.status === "lost" ? ["context_lost"] : [] };
  }
  probe(): void {
    const context = this.renderer.getContext();
    // A reused canvas can retain the context-loss notification in its error queue.
    for (let index = 0; index < 16 && context.getError() !== context.NO_ERROR; index++) { /* Drain errors preceding this probe. */ }
    this.renderer.resetState();
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial({ color: "#ffffff" });
    const mesh = new THREE.Mesh(geometry, material);
    const scene = new THREE.Scene(); scene.add(mesh);
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 10); camera.position.z = 3;
    try {
      this.renderer.clear(); this.renderer.render(scene, camera);
      const error = context.getError();
      if (error !== context.NO_ERROR || context.isContextLost()) { throw new Error(`WebGL2 render probe failed (error ${error})`); }
      this.successful = true;
      this.initializationMs = performance.now() - this.initializationStarted;
    } finally { geometry.dispose(); material.dispose(); }
  }
  resize(width: number, height: number): void {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1 || width > 8192 || height > 8192) { throw new Error("3D viewport dimensions must be between 1 and 8192"); }
    this.renderer.setSize(Math.round(width), Math.round(height), false);
  }
  setCameraOverride(camera: GameRenderFrame3D["camera"] | null): void { this.cameraOverride = camera; }
  getScene(): THREE.Scene { return this.scene; }
  getCamera(): THREE.Camera { return this.editorCamera ?? this.camera; }
  getEntityObject(entityId: string): THREE.Object3D | null { return this.instances.get(entityId)?.object ?? null; }
  setEditorCamera(camera: THREE.PerspectiveCamera | THREE.OrthographicCamera | null): void { this.editorCamera = camera; }
  projectedBounds(): readonly GameProjectedBounds3D[] {
    const camera = this.getCamera();
    const result: GameProjectedBounds3D[] = [];
    for (const [entityId, instance] of this.instances) {
      const box = new THREE.Box3().setFromObject(instance.object);
      if (box.isEmpty()) { continue; }
      let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
      for (const x of [box.min.x, box.max.x]) {
        for (const y of [box.min.y, box.max.y]) {
          for (const z of [box.min.z, box.max.z]) {
            const point = new THREE.Vector3(x, y, z).project(camera);
            if (point.z < -1 || point.z > 1) { continue; }
            const px = (point.x + 1) * this.canvas.width / 2;
            const py = (1 - point.y) * this.canvas.height / 2;
            minX = Math.min(minX, px); minY = Math.min(minY, py); maxX = Math.max(maxX, px); maxY = Math.max(maxY, py);
          }
        }
      }
      if (Number.isFinite(minX)) { result.push({ entityId, minX, minY, maxX, maxY }); }
    }
    return result;
  }
  pick(x: number, y: number): string | null {
    if (this.status !== "ready") { return null; }
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(x, y), this.getCamera());
    for (const hit of ray.intersectObjects([...this.instances.values()].map((instance) => instance.object), true)) {
      let current: THREE.Object3D | null = hit.object;
      while (current) {
        const id: unknown = current.userData.gameEntityId;
        if (typeof id === "string" && this.instances.get(id)?.object === current) { return id; }
        current = current.parent;
      }
    }
    return null;
  }
  render(frame: GameRenderFrame3D, interpolation = 1): Promise<GameRendererStats3D> {
    const promise = this.renderTail.then(() => this.renderFrame(frame, interpolation));
    this.renderTail = promise.then(() => undefined, () => undefined);
    return promise;
  }
  invalidateAsset(slot: string): void {
    this.invalidatedAssets.add(slot);
  }

  private async getModel(id: string): Promise<CachedModel> {
    let pending = this.models.get(id);
    if (!pending) {
      pending = (async () => {
        const started = performance.now();
        const source = await this.options.resolveModel?.(id, this.controller.signal);
        this.controller.signal.throwIfAborted();
        if (!source) { throw new Error(`Model asset ${id} is missing`); }
        const checked = await prepareGameModel(source.bytes, { expectedDigest: source.digest, signal: this.controller.signal });
        if (!checked.ok) { throw new Error(`Model ${id} failed preparation: ${checked.diagnostics.map((entry) => entry.message).join("; ")}`); }
        const manager = new THREE.LoadingManager();
        manager.setURLModifier((url) => {
          if (!url.startsWith("blob:")) { throw new Error("Prepared model attempted an external resource request"); }
          return url;
        });
        const loader = new GLTFLoader(manager);
        loader.register((parser) => ({ name: "NODETOOL_game_node_ids",
          loadNode: async (index) => {
            const node = await parser.loadNode(index);
            node.userData.gameNodeId = `node:${index}`;
            return node;
          } }));
        const gltf = await loader.parseAsync(new Uint8Array(checked.model.bytes).buffer, "");
        const cached = { prepared: checked.model, gltf };
        if (this.controller.signal.aborted) { releaseModel(cached); this.controller.signal.throwIfAborted(); }
        this.loadedModels.add(cached);
        this.modelLoadMs += performance.now() - started;
        return cached;
      })();
      this.models.set(id, pending);
    }
    return pending;
  }
  private configureCamera(frame: GameRenderFrame3D, interpolation: number): void {
    const state = this.cameraOverride ?? frame.camera;
    const projection = state.projection;
    const aspect = this.canvas.width / this.canvas.height;
    if (projection.kind === "perspective") {
      if (!(this.camera instanceof THREE.PerspectiveCamera)) { this.camera = new THREE.PerspectiveCamera(); }
      this.camera.fov = projection.fov;
      this.camera.aspect = aspect;
    } else {
      if (!(this.camera instanceof THREE.OrthographicCamera)) { this.camera = new THREE.OrthographicCamera(); }
      this.camera.top = projection.size / 2;
      this.camera.bottom = -projection.size / 2;
      this.camera.left = -projection.size * aspect / 2;
      this.camera.right = projection.size * aspect / 2;
    }
    this.camera.near = projection.near;
    this.camera.far = projection.far;
    applyTransform(this.camera, "previousTransform" in state && state.previousTransform
      ? interpolateGameTransform3D(state.previousTransform, state.transform, interpolation) : state.transform);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld(true);
  }
  private configureLights(frame: GameRenderFrame3D): void {
    const present = new Set(frame.lights.map((entry) => entry.entityId));
    for (const [id, light] of this.lights) {
      if (!present.has(id)) { this.removeLight(light); this.lights.delete(id); }
    }
    for (const entry of frame.lights) {
      let light = this.lights.get(entry.entityId);
      if (!light || light.userData.gameLightKind !== entry.light.kind) {
        if (light) { this.removeLight(light); }
        light = this.makeLight(entry.light);
        light.userData.gameLightKind = entry.light.kind;
        this.lights.set(entry.entityId, light);
        this.scene.add(light);
      }
      applyTransform(light, entry.transform);
      light.color.set(entry.light.color);
      light.intensity = entry.light.intensity;
      if (light instanceof THREE.DirectionalLight && entry.light.kind === "directional") {
        light.castShadow = frame.environment.shadows.enabled && entry.light.castShadow;
        light.shadow.mapSize.set(frame.environment.shadows.mapSize, frame.environment.shadows.mapSize);
        const extent = frame.environment.shadows.extent;
        Object.assign(light.shadow.camera, { left: -extent, right: extent, top: extent, bottom: -extent, near: 0.1, far: extent * 4 });
        light.shadow.camera.updateProjectionMatrix();
      }
      if ((light instanceof THREE.PointLight || light instanceof THREE.SpotLight) && entry.light.kind !== "directional") { light.distance = entry.light.range; light.decay = entry.light.decay; }
      if (light instanceof THREE.SpotLight && entry.light.kind === "spot") { light.angle = entry.light.angle; light.penumbra = entry.light.penumbra; }
      if (light instanceof THREE.DirectionalLight || light instanceof THREE.SpotLight) {
        light.target.position.set(0, 0, -1).applyQuaternion(light.quaternion).add(light.position);
        light.target.updateMatrixWorld(true);
      }
    }
  }
  private makeLight(definition: GameLight3D): THREE.Light {
    if (definition.kind === "directional") { const light = new THREE.DirectionalLight(); this.scene.add(light.target); return light; }
    if (definition.kind === "point") { return new THREE.PointLight(); }
    const light = new THREE.SpotLight();
    this.scene.add(light.target);
    return light;
  }
  private removeLight(light: THREE.Light): void {
    if (light instanceof THREE.DirectionalLight || light instanceof THREE.SpotLight) { light.target.removeFromParent(); light.shadow.dispose(); }
    light.removeFromParent();
    light.dispose();
  }
  private paintHud(frame: GameRenderFrame3D): void {
    const { hudWidth, hudHeight } = frame.presentation;
    if (this.hudCanvas.width !== Math.round(hudWidth) || this.hudCanvas.height !== Math.round(hudHeight)) {
      this.hudCanvas.width = Math.round(hudWidth);
      this.hudCanvas.height = Math.round(hudHeight);
    }
    const context = this.hudCanvas.getContext("2d");
    if (!context) { throw new Error("HUD Canvas2D context is unavailable"); }
    context.clearRect(0, 0, hudWidth, hudHeight);
    for (const label of frame.hud) {
      context.font = `${label.size ?? 18}px ${label.fontId ? `"${gameFontFamily(frame.gameId, label.fontId)}",` : ""}system-ui,sans-serif`;
      context.fillStyle = label.color ?? "#ffffff";
      context.textAlign = label.align ?? "left";
      context.textBaseline = "top";
      context.fillText(label.text, label.x, label.y);
    }
    this.hudTexture.needsUpdate = true;
  }
  private async loadFonts(frame: GameRenderFrame3D): Promise<void> {
    const present = new Set(Object.entries(frame.fonts ?? {}).map(([id, binding]) => JSON.stringify([frame.gameId, id, binding])));
    for (const [key, face] of this.fonts) {
      if (!present.has(key)) { document.fonts.delete(face); this.fonts.delete(key); }
    }
    for (const key of this.optionalFonts) {
      if (!present.has(key)) { this.optionalFonts.delete(key); }
    }
    for (const [id, binding] of Object.entries(frame.fonts ?? {})) {
      const key = JSON.stringify([frame.gameId, id, binding]);
      if (this.fonts.has(key) || this.optionalFonts.has(key)) { continue; }
      try {
        const source = await this.options.resolveFont?.(id, this.controller.signal);
        this.controller.signal.throwIfAborted();
        if (!source) { throw new Error("asset is missing"); }
        if (source.bytes.length > 16 * 1024 * 1024) { throw new Error("font exceeds 16 MiB"); }
        const bytes = new Uint8Array(source.bytes);
        const hashed = await crypto.subtle.digest("SHA-256", bytes);
        const digest = Array.from(new Uint8Array(hashed), (byte) => byte.toString(16).padStart(2, "0")).join("");
        if (digest !== binding.digest) { throw new Error("font digest changed"); }
        const face = await new FontFace(gameFontFamily(frame.gameId, id), bytes.buffer).load();
        this.controller.signal.throwIfAborted();
        document.fonts.add(face);
        this.fonts.set(key, face);
      } catch (error) {
        this.controller.signal.throwIfAborted();
        const message = `${binding.required ? "Required" : "Optional"} font ${id} could not load: ${error instanceof Error ? error.message : "invalid font"}`;
        if (binding.required) { throw new Error(message, { cause: error }); }
        this.optionalFonts.add(key);
        this.diagnostics.push(message);
        this.options.onDiagnostic?.(message);
      }
    }
  }
  private async renderFrame(frame: GameRenderFrame3D, interpolation: number): Promise<GameRendererStats3D> {
    const started = performance.now();
    for (const slot of this.invalidatedAssets) {
      for (const [id, instance] of this.instances) {
        if (instance.modelAssetId === slot) { releaseInstance(instance); this.instances.delete(id); }
      }
      const pending = this.models.get(slot);
      this.models.delete(slot);
      if (pending) {
        const cached = await pending.catch(() => null);
        if (cached) { releaseModel(cached); this.loadedModels.delete(cached); }
      }
    }
    this.invalidatedAssets.clear();
    this.controller.signal.throwIfAborted();
    if (this.status === "lost") { throw new Error("WebGL2 context is lost; simulation must remain paused until recovery"); }
    if (this.presentation && (this.presentation.gameId !== frame.gameId || this.presentation.sceneId !== frame.sceneId || frame.tick < this.presentation.tick)) {
      this.instances.forEach(releaseInstance);
      this.instances.clear();
    }
    this.presentation = { gameId: frame.gameId, sceneId: frame.sceneId, tick: frame.tick };
    const present = new Set(frame.entities.map((entry) => entry.entityId));
    for (const [id, instance] of this.instances) {
      if (!present.has(id)) { releaseInstance(instance); this.instances.delete(id); }
    }
    for (const entity of frame.entities) {
      const descriptor = JSON.stringify(entity.model ?? entity.primitive) ?? "transform";
      let instance = this.instances.get(entity.entityId);
      if (instance && instance.descriptor !== descriptor) { releaseInstance(instance); this.instances.delete(entity.entityId); instance = undefined; }
      if (!instance) {
        if (entity.model) {
          instance = modelInstance(entity.model, await this.getModel(entity.model.assetId));
          instance.modelAssetId = entity.model.assetId;
        }
        else if (entity.primitive) { instance = primitiveInstance(entity.primitive); }
        else { instance = { descriptor: "transform", object: new THREE.Group(), materials: [] }; }
        this.controller.signal.throwIfAborted();
        instance.object.userData.gameEntityId = entity.entityId;
        this.instances.set(entity.entityId, instance);
        this.scene.add(instance.object);
      }
      applyTransform(instance.object, interpolateGameTransform3D(entity.previousTransform, entity.transform, interpolation));
      for (const material of instance.materials) {
        const base: unknown = material.userData.baseOpacity;
        material.opacity = (typeof base === "number" ? base : entity.primitive?.material.opacity ?? 1) * (entity.opacity ?? 1);
        material.transparent = material.userData.baseTransparent === true || material.opacity < 1 || (entity.primitive?.material.alphaMode === "blend") || (entity.model?.material?.alphaMode === "blend");
      }
      let poseChanged = false;
      if (instance.mixer && instance.clips && entity.animation) {
        const sampledTick = frame.tick - 1 + Math.max(0, Math.min(1, interpolation));
        const key = `${JSON.stringify(entity.animation)}:${sampledTick}`;
        if (instance.sampledAnimationKey !== key) {
          sampleGameAnimation3D(instance.mixer, instance.clips, entity.animation, sampledTick);
          instance.sampledAnimationKey = key;
          poseChanged = true;
        }
      } else if (instance.mixer && instance.sampledAnimationKey !== undefined) {
        instance.mixer.stopAllAction();
        delete instance.sampledAnimationKey;
        poseChanged = true;
      }
      if (poseChanged) {
        instance.object.updateMatrixWorld(true);
        instance.object.traverse((object) => {
          if (!(object instanceof THREE.SkinnedMesh)) { return; }
          object.computeBoundingBox();
          if (object.boundingBox) { object.boundingSphere = object.boundingBox.getBoundingSphere(object.boundingSphere ?? new THREE.Sphere()); }
        });
      }
    }
    this.controller.signal.throwIfAborted();
    this.configureCamera(frame, interpolation);
    const activeCamera = this.editorCamera ?? this.camera;
    activeCamera.updateMatrixWorld(true);
    this.configureLights(frame);
    this.scene.background = new THREE.Color(frame.environment.background);
    this.ambient.color.set(frame.environment.ambient.color);
    this.ambient.intensity = frame.environment.ambient.intensity;
    this.scene.fog = frame.environment.fog ? new THREE.Fog(frame.environment.fog.color, frame.environment.fog.near, frame.environment.fog.far) : null;
    this.renderer.shadowMap.enabled = frame.environment.shadows.enabled;
    await this.loadFonts(frame);
    this.controller.signal.throwIfAborted();
    this.paintHud(frame);
    this.renderer.info.autoReset = false;
    this.renderer.info.reset();
    this.renderer.compile(this.scene, activeCamera);
    this.controller.signal.throwIfAborted();
    this.renderer.clear();
    this.renderer.render(this.scene, activeCamera);
    this.renderer.clearDepth();
    this.renderer.render(this.hudScene, this.hudCamera);
    if (this.renderer.getContext().isContextLost()) { throw new Error("WebGL2 context was lost during render"); }
    this.successful = true;
    if (this.restoring) { this.restoring = false; this.options.onContextState?.("ready"); }
    let geometryBytes = 0;
    let textureBytes = this.hudCanvas.width * this.hudCanvas.height * 4;
    for (const instance of this.instances.values()) {
      const geometry = instance.primitiveGeometry;
      if (geometry) {
        for (const attribute of Object.values(geometry.attributes)) {
          geometryBytes += attribute instanceof THREE.InterleavedBufferAttribute ? attribute.data.array.byteLength : attribute.array.byteLength;
        }
        geometryBytes += geometry.index?.array.byteLength ?? 0;
      }
    }
    for (const model of this.loadedModels) { geometryBytes += model.prepared.geometryBytes; textureBytes += model.prepared.textureBytes; }
    return { backend: this.backend, drawCalls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles,
      geometries: this.renderer.info.memory.geometries, textures: this.renderer.info.memory.textures, geometryBytes, textureBytes,
      modelLoadMs: this.modelLoadMs, targetBytes: this.canvas.width * this.canvas.height * 8, diagnostics: [...this.diagnostics], renderMs: performance.now() - started };
  }
  dispose(): void {
    if (this.status === "disposed") { return; }
    this.status = "disposed";
    this.controller.abort();
    this.options.signal?.removeEventListener("abort", this.onAbort);
    this.canvas.removeEventListener("webglcontextlost", this.onLost);
    this.canvas.removeEventListener("webglcontextrestored", this.onRestored);
    this.instances.forEach(releaseInstance);
    this.instances.clear();
    this.loadedModels.forEach(releaseModel);
    this.loadedModels.clear();
    this.models.clear();
    this.fonts.forEach((face) => document.fonts.delete(face));
    this.fonts.clear();
    this.optionalFonts.clear();
    this.lights.forEach((light) => this.removeLight(light));
    this.lights.clear();
    this.hudTexture.dispose();
    this.hudGeometry.dispose();
    this.hudMaterial.dispose();
    if (!this.renderer.getContext().isContextLost()) { this.renderer.resetState(); }
    this.renderer.dispose();
  }
}

export async function createGameRenderer3D(options: CreateGameRenderer3DOptions): Promise<GameRenderer3D> {
  options.signal?.throwIfAborted();
  const context = options.canvas.getContext("webgl2", { antialias: true, alpha: false, preserveDrawingBuffer: options.preserveDrawingBuffer ?? false });
  if (!context) { throw new Error("3D play requires WebGL2; simulation and document editing remain available"); }
  const renderer = new ThreeGameRenderer(new THREE.WebGLRenderer({ canvas: options.canvas, context,
    antialias: true, preserveDrawingBuffer: options.preserveDrawingBuffer ?? false }), options);
  try { renderer.probe(); return renderer; }
  catch (error) { renderer.dispose(); throw error; }
}
