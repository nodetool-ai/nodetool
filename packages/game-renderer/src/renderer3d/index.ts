import { GameFonts3D } from "./hud/fonts.js";
import { RenderPipeline3D } from "./pipeline.js";
import { GameModelCache3D } from "./assets/cache.js";
import { applyTransform, interpolateGameTransform3D, syncGameScene } from "./scene-sync.js";
import { releaseInstance } from "./assets/dispose.js";
import type { RenderInstance } from "./types.js";
import { syncGameLights, removeGameLight } from "./lights/index.js";
import { configureGameEnvironment } from "./environment/index.js";
import { GameSkyRenderer3D, type GameSkySources3D } from "./environment/sky.js";
import { paintGameHud } from "./hud/paint.js";
export { interpolateGameTransform3D } from "./scene-sync.js";
export { sampleGameAnimation3D } from "./animation/index.js";
import * as THREE from "three";
import type { GameRenderFrame3D } from "@nodetool-ai/protocol";

export { prepareGameModel, GAME_MODEL_BUDGETS } from "./preparation.js";
export type { GameModelBudgets, GameModelDiagnostic, PreparedGameModel, PrepareGameModelResult } from "./preparation.js";
export type { DecodeGameHdri3D, PreparedGameHdri3D } from "./assets/hdri-contract.js";

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
export interface CreateGameRenderer3DOptions extends GameSkySources3D {
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

class ThreeGameRenderer implements GameRenderer3D {
  readonly backend = "webgl2";
  private readonly pipeline = new RenderPipeline3D();
  private readonly scene = new THREE.Scene();
  private readonly ambient = new THREE.AmbientLight();
  private readonly instances = new Map<string, RenderInstance>();
  private readonly invalidatedAssets = new Set<string>();
  private readonly modelCache: GameModelCache3D;
  private readonly fonts: GameFonts3D;
  private readonly diagnostics: string[] = [];
  private readonly lights = new Map<string, THREE.Light>();
  private readonly controller = new AbortController();
  private readonly sky: GameSkyRenderer3D;
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
    if (this.status !== "disposed") { this.status = "ready"; this.restoring = true; this.sky.reset(); }
  };
  private readonly onAbort = (): void => this.dispose();

  constructor(private readonly renderer: THREE.WebGLRenderer, private readonly options: CreateGameRenderer3DOptions) {
    this.modelCache = new GameModelCache3D(options, this.controller);
    this.fonts = new GameFonts3D(options, this.controller, this.diagnostics);
    this.sky = new GameSkyRenderer3D(renderer, options, this.controller.signal, this.diagnostics);
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
  private async renderFrame(frame: GameRenderFrame3D, interpolation: number): Promise<GameRendererStats3D> {
    const started = performance.now();
    for (const slot of this.invalidatedAssets) {
      for (const [id, instance] of this.instances) {
        if (instance.modelAssetId === slot) { releaseInstance(instance); this.instances.delete(id); }
      }
      await this.modelCache.invalidate(slot);
      await this.sky.invalidate(slot);
    }
    this.invalidatedAssets.clear();
    this.controller.signal.throwIfAborted();
    if (this.status === "lost") { throw new Error("WebGL2 context is lost; simulation must remain paused until recovery"); }
    if (this.presentation && (this.presentation.gameId !== frame.gameId || this.presentation.sceneId !== frame.sceneId || frame.tick < this.presentation.tick)) {
      this.instances.forEach(releaseInstance);
      this.instances.clear();
    }
    this.presentation = { gameId: frame.gameId, sceneId: frame.sceneId, tick: frame.tick };
    await syncGameScene(this.scene, this.instances, this.modelCache, this.controller.signal, frame, interpolation);
    this.controller.signal.throwIfAborted();
    this.configureCamera(frame, interpolation);
    const activeCamera = this.editorCamera ?? this.camera;
    activeCamera.updateMatrixWorld(true);
    syncGameLights(this.scene, this.lights, frame);
    configureGameEnvironment(this.scene, this.ambient, this.renderer, frame.environment);
    await this.sky.apply(this.scene, frame);
    this.controller.signal.throwIfAborted();
    await this.fonts.load(frame);
    this.controller.signal.throwIfAborted();
    paintGameHud(this.hudCanvas, this.hudTexture, frame);
    this.renderer.info.autoReset = false;
    this.renderer.info.reset();
    this.renderer.compile(this.scene, activeCamera);
    this.controller.signal.throwIfAborted();
    await this.pipeline.render({ renderer: this.renderer, scene: this.scene, camera: activeCamera,
      hudScene: this.hudScene, hudCamera: this.hudCamera });
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
    for (const model of this.modelCache.loadedModels) { geometryBytes += model.prepared.geometryBytes; textureBytes += model.prepared.textureBytes; }
    return { backend: this.backend, drawCalls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles,
      geometries: this.renderer.info.memory.geometries, textures: this.renderer.info.memory.textures, geometryBytes, textureBytes,
      modelLoadMs: this.modelCache.modelLoadMs, targetBytes: this.canvas.width * this.canvas.height * 8, diagnostics: [...this.diagnostics], renderMs: performance.now() - started };
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
    this.modelCache.dispose();
    this.fonts.dispose();
    this.sky.dispose();
    this.lights.forEach((light) => removeGameLight(light));
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
