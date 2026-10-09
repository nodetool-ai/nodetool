import * as THREE from "three";
import { Sky } from "three/addons/objects/Sky.js";
import type { GameRenderFrame3D, GameSky3D } from "@nodetool-ai/protocol";
import type { DecodeGameHdri3D, PreparedGameHdri3D } from "../assets/hdri-contract.js";

export interface GameSkySources3D {
  readonly resolveHdri?: (logicalId: string, signal: AbortSignal) => Promise<PreparedGameHdri3D | null>;
  readonly decodeHdri?: DecodeGameHdri3D;
}

type ProceduralSky3D = Extract<GameSky3D, { kind: "procedural" }>;
type HdriSky3D = Extract<GameSky3D, { kind: "hdri" }>;

const DEFAULT_SUN_DIRECTION: readonly [number, number, number] = [0, 0.5, -1];
const PROCEDURAL_CUBE_SIZE = 256;

/** Direction toward the sun: the linked directional light's reverse forward axis, or a fixed default. */
export function gameSkySunDirection3D(sky: ProceduralSky3D, frame: Pick<GameRenderFrame3D, "lights">): THREE.Vector3 {
  const light = frame.lights.find((entry) => entry.light.kind === "directional" && (sky.sunEntityId === undefined || entry.entityId === sky.sunEntityId));
  if (!light) { return new THREE.Vector3(...DEFAULT_SUN_DIRECTION).normalize(); }
  return new THREE.Vector3(0, 0, 1).applyQuaternion(new THREE.Quaternion().fromArray(light.transform.rotation)).normalize();
}

interface LoadedHdri {
  readonly digest: string;
  readonly texture: THREE.DataTexture;
  readonly environment: THREE.WebGLRenderTarget;
}

/** Builds the PMREM environment and background for a scene sky. A color sky leaves the scene untouched. */
export class GameSkyRenderer3D {
  private applied: string | undefined;
  private pmrem: THREE.PMREMGenerator | undefined;
  private procedural: { key: string; readonly cube: THREE.WebGLCubeRenderTarget; readonly camera: THREE.CubeCamera; readonly environment: THREE.WebGLRenderTarget } | undefined;
  private proceduralScene: { readonly scene: THREE.Scene; readonly sky: Sky; readonly ground: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial> } | undefined;
  private readonly hdris = new Map<string, Promise<LoadedHdri | null>>();
  private readonly reported = new Set<string>();

  constructor(private readonly renderer: THREE.WebGLRenderer, private readonly sources: GameSkySources3D,
    private readonly signal: AbortSignal, private readonly diagnostics: string[]) {}

  async apply(scene: THREE.Scene, frame: GameRenderFrame3D): Promise<void> {
    const sky = frame.environment.sky;
    if (sky?.kind === "procedural") { this.applyProcedural(scene, sky, frame); return; }
    if (sky?.kind === "hdri") {
      let pending: Promise<LoadedHdri | null>;
      let loaded: LoadedHdri | null;
      // A reset or invalidation during the await disposes the awaited result, so load the slot again.
      do {
        pending = this.loadHdri(sky);
        loaded = await pending;
        this.signal.throwIfAborted();
      } while (this.hdris.get(sky.assetId) !== pending);
      if (loaded) { this.applyHdri(scene, sky, loaded); return; }
    }
    this.clear(scene);
  }

  /** Drops a cached HDRI so the next frame resolves the slot again. */
  async invalidate(slot: string): Promise<void> {
    const pending = this.hdris.get(slot);
    this.hdris.delete(slot);
    this.reported.delete(slot);
    const loaded = await pending?.catch(() => null);
    if (loaded) { this.releaseHdri(loaded); }
    if (this.applied?.startsWith(`hdri:${slot}:`)) { this.applied = undefined; }
  }

  /** Regenerates GPU-built maps after a context restore. Decoded HDRI pixels are uploaded again by three. */
  reset(): void {
    this.releaseProcedural();
    for (const pending of this.hdris.values()) { void pending.then((loaded) => { if (loaded) { this.releaseHdri(loaded); } }, () => undefined); }
    this.hdris.clear();
    this.pmrem?.dispose();
    this.pmrem = undefined;
    this.applied = undefined;
  }

  dispose(): void {
    this.reset();
    if (this.proceduralScene) {
      this.proceduralScene.sky.geometry.dispose();
      this.proceduralScene.sky.material.dispose();
      this.proceduralScene.ground.geometry.dispose();
      this.proceduralScene.ground.material.dispose();
      this.proceduralScene = undefined;
    }
  }

  private generator(): THREE.PMREMGenerator {
    this.pmrem ??= new THREE.PMREMGenerator(this.renderer);
    return this.pmrem;
  }

  private clear(scene: THREE.Scene): void {
    if (this.applied === undefined) { return; }
    scene.environment = null;
    scene.environmentIntensity = 1;
    scene.backgroundIntensity = 1;
    scene.environmentRotation.set(0, 0, 0);
    scene.backgroundRotation.set(0, 0, 0);
    this.releaseProcedural();
    this.applied = undefined;
  }

  private applyProcedural(scene: THREE.Scene, sky: ProceduralSky3D, frame: GameRenderFrame3D): void {
    const sun = gameSkySunDirection3D(sky, frame);
    const key = JSON.stringify([sky.turbidity, sky.rayleigh, sky.groundColor, sun.x, sun.y, sun.z]);
    if (this.procedural?.key !== key) { this.renderProcedural(key, sky, sun); }
    if (!this.procedural) { throw new Error("Procedural sky targets are missing"); }
    const { cube, environment } = this.procedural;
    scene.background = cube.texture;
    scene.environment = environment.texture;
    scene.environmentIntensity = sky.intensity;
    scene.backgroundIntensity = sky.intensity;
    scene.environmentRotation.set(0, 0, 0);
    scene.backgroundRotation.set(0, 0, 0);
    this.applied = "procedural";
  }

  /** Renders the sky into the retained cube and PMREM targets, allocating them only on first use. */
  private renderProcedural(key: string, sky: ProceduralSky3D, sun: THREE.Vector3): void {
    if (!this.proceduralScene) {
      const skyMesh = new Sky();
      skyMesh.scale.setScalar(10);
      skyMesh.material.uniforms.cloudCoverage.value = 0;
      // The sun disc radiance exceeds half-float range and turns the PMREM into NaN. The linked light draws the sun highlight.
      skyMesh.material.uniforms.showSunDisc.value = 0;
      // The lower hemisphere sits inside the sky box, so it covers the sky shader below the horizon.
      const ground = new THREE.Mesh(new THREE.SphereGeometry(4, 32, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
        new THREE.MeshBasicMaterial({ side: THREE.BackSide }));
      const proceduralScene = new THREE.Scene();
      proceduralScene.add(skyMesh, ground);
      this.proceduralScene = { scene: proceduralScene, sky: skyMesh, ground };
    }
    const { scene, sky: skyMesh, ground } = this.proceduralScene;
    skyMesh.material.uniforms.turbidity.value = sky.turbidity;
    skyMesh.material.uniforms.rayleigh.value = sky.rayleigh;
    skyMesh.material.uniforms.sunPosition.value.copy(sun);
    ground.material.color.set(sky.groundColor);
    const existing = this.procedural;
    const cube = existing?.cube ?? new THREE.WebGLCubeRenderTarget(PROCEDURAL_CUBE_SIZE, { type: THREE.HalfFloatType, generateMipmaps: false });
    const camera = existing?.camera ?? new THREE.CubeCamera(0.1, 100, cube);
    const autoClear = this.renderer.autoClear;
    this.renderer.autoClear = true;
    try { camera.update(this.renderer, scene); }
    finally { this.renderer.autoClear = autoClear; }
    const environment = this.generator().fromCubemap(cube.texture, existing?.environment ?? null);
    this.procedural = { key, cube, camera, environment };
  }

  private applyHdri(scene: THREE.Scene, sky: HdriSky3D, loaded: LoadedHdri): void {
    if (this.applied !== `hdri:${sky.assetId}:${loaded.digest}`) { this.releaseProcedural(); }
    scene.background = loaded.texture;
    scene.environment = loaded.environment.texture;
    scene.environmentIntensity = sky.intensity;
    scene.backgroundIntensity = sky.intensity;
    scene.environmentRotation.set(0, sky.rotation, 0);
    scene.backgroundRotation.set(0, sky.rotation, 0);
    this.applied = `hdri:${sky.assetId}:${loaded.digest}`;
  }

  private loadHdri(sky: HdriSky3D): Promise<LoadedHdri | null> {
    let pending = this.hdris.get(sky.assetId);
    if (!pending) {
      pending = this.decodeHdri(sky.assetId).catch((error: unknown) => {
        if (this.signal.aborted) { throw error; }
        this.report(sky.assetId, `HDRI sky ${sky.assetId} failed to load: ${error instanceof Error ? error.message : String(error)}`);
        return null;
      });
      this.hdris.set(sky.assetId, pending);
    }
    return pending;
  }

  private async decodeHdri(slot: string): Promise<LoadedHdri | null> {
    const { resolveHdri, decodeHdri } = this.sources;
    if (!resolveHdri || !decodeHdri) {
      this.report(slot, `HDRI sky ${slot} needs an HDRI decoder; rendering the background color`);
      return null;
    }
    const prepared = await resolveHdri(slot, this.signal);
    this.signal.throwIfAborted();
    if (!prepared) {
      this.report(slot, `HDRI sky ${slot} is missing; rendering the background color`);
      return null;
    }
    const texture = await decodeHdri(prepared, this.signal);
    if (this.signal.aborted) { texture.dispose(); this.signal.throwIfAborted(); }
    texture.mapping = THREE.EquirectangularReflectionMapping;
    texture.colorSpace = THREE.LinearSRGBColorSpace;
    texture.needsUpdate = true;
    return { digest: prepared.binding.digest, texture, environment: this.generator().fromEquirectangular(texture) };
  }

  private report(slot: string, message: string): void {
    if (this.reported.has(slot)) { return; }
    this.reported.add(slot);
    this.diagnostics.push(message);
  }

  private releaseProcedural(): void {
    this.procedural?.cube.dispose();
    this.procedural?.environment.dispose();
    this.procedural = undefined;
  }

  private releaseHdri(loaded: LoadedHdri): void {
    loaded.texture.dispose();
    loaded.environment.dispose();
  }
}
