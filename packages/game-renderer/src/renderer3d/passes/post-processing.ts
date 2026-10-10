import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { FXAAPass } from "three/addons/postprocessing/FXAAPass.js";
import { SMAAPass } from "three/addons/postprocessing/SMAAPass.js";
import type { Pass } from "three/addons/postprocessing/Pass.js";
import type { GamePostProcessing3D } from "@nodetool-ai/protocol";

const TONE_MAPPING = {
  aces: THREE.ACESFilmicToneMapping, agx: THREE.AgXToneMapping, neutral: THREE.NeutralToneMapping, linear: THREE.LinearToneMapping
} as const;

/** Multisample count of the composer's scene target when `antialias` is msaa. */
export const GAME_POST_MSAA_SAMPLES_3D = 4;

export interface GamePostProcessingPlan3D {
  readonly toneMapping: THREE.ToneMapping;
  readonly exposure: number;
  /** Null when the scene renders straight to the canvas, as it does without post-processing. */
  readonly composer: {
    readonly samples: number;
    readonly bloom: NonNullable<GamePostProcessing3D["bloom"]> | null;
    readonly vignette: NonNullable<GamePostProcessing3D["vignette"]> | null;
    readonly antialias: "fxaa" | "smaa" | null;
  } | null;
}

/**
 * Resolves scene post-processing into renderer settings and composer passes. Absent or disabled
 * settings give the renderer's defaults and no composer, so the output matches rendering without
 * post-processing. Exposure and tone mapping alone also render directly, because the renderer applies
 * them when it draws to the canvas.
 */
export function resolveGamePostProcessing3D(settings: GamePostProcessing3D | undefined, maxSamples: number): GamePostProcessingPlan3D {
  if (!settings || !settings.enabled) { return { toneMapping: THREE.ACESFilmicToneMapping, exposure: 1, composer: null }; }
  const base = { toneMapping: TONE_MAPPING[settings.toneMapping], exposure: settings.exposure };
  if (!settings.bloom && !settings.vignette && settings.antialias === "msaa") { return { ...base, composer: null }; }
  return { ...base, composer: {
    samples: settings.antialias === "msaa" ? Math.max(0, Math.min(GAME_POST_MSAA_SAMPLES_3D, maxSamples)) : 0,
    bloom: settings.bloom ?? null,
    vignette: settings.vignette ?? null,
    antialias: settings.antialias === "fxaa" || settings.antialias === "smaa" ? settings.antialias : null
  } };
}

/** Pass names in the order the composer runs them. */
export function gamePostProcessingPassNames3D(plan: GamePostProcessingPlan3D): readonly string[] {
  const composer = plan.composer;
  if (!composer) { return []; }
  return ["scene", ...(composer.bloom ? ["bloom"] : []), "output", ...(composer.vignette ? ["vignette"] : []),
    ...(composer.antialias ? [composer.antialias] : [])];
}

const vignetteShader = {
  name: "GameVignetteShader",
  uniforms: { tDiffuse: { value: null }, intensity: { value: 0.4 }, radius: { value: 0.5 }, softness: { value: 0.5 } },
  vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
  fragmentShader: `uniform sampler2D tDiffuse; uniform float intensity; uniform float radius; uniform float softness; varying vec2 vUv;
void main() {
  vec4 texel = texture2D(tDiffuse, vUv);
  float distanceFromCenter = length(vUv - vec2(0.5)) * 1.41421356;
  float shade = smoothstep(radius, radius + softness, distanceFromCenter);
  gl_FragColor = vec4(texel.rgb * (1.0 - intensity * shade), texel.a);
}`
};

/** three 0.185's SMAAPass keeps its lookups in private fields. The typings name the public fields of older releases. */
class GameSMAAPass extends SMAAPass {
  declare readonly _areaTexture: THREE.Texture;
  declare readonly _searchTexture: THREE.Texture;

  /**
   * Loads the area and search lookup images and marks their textures for upload.
   * SMAAPass points them at data URLs and flags the textures only in a later onload task, so a
   * composer that renders in the same task would run SMAA with unbound lookups and pass the image
   * through. The capture page and the standalone build only allow blob: images, so the lookups are
   * reloaded from blob URLs made from the same bytes. `fetch` is not used because connect-src blocks data: URLs there too.
   */
  async lookupsReady(): Promise<void> {
    await Promise.all([this._areaTexture, this._searchTexture].map(async (texture) => {
      if (!(texture instanceof THREE.Texture) || !(texture.image instanceof HTMLImageElement)) { throw new Error("SMAA lookup textures are missing"); }
      const match = /^data:([^;,]+);base64,(.*)$/.exec(texture.image.src);
      if (!match) { throw new Error("SMAA lookup textures are not data URLs"); }
      const bytes = Uint8Array.from(atob(match[2]!), (character) => character.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: match[1] }));
      try {
        const image = new Image();
        image.src = url;
        await image.decode();
        texture.image = image;
        texture.needsUpdate = true;
      } finally {
        URL.revokeObjectURL(url);
      }
    }));
  }
}

interface ComposerState {
  readonly key: string;
  readonly composer: EffectComposer;
  readonly scenePass: RenderPass;
  readonly passes: readonly Pass[];
  readonly bloom: UnrealBloomPass | null;
  readonly vignette: ShaderPass | null;
  width: number;
  height: number;
}

/** Owns the composer for one renderer. The scene pass of `RenderPipeline3D` draws through it. */
export class GamePostProcessor3D {
  private plan: GamePostProcessingPlan3D = resolveGamePostProcessing3D(undefined, 0);
  private state: ComposerState | null = null;
  private readonly size = new THREE.Vector2();
  private disposed = false;

  constructor(private readonly renderer: THREE.WebGLRenderer) {}

  /** Names of the composer passes the next render runs, or an empty list for a direct render. */
  get passNames(): readonly string[] { return gamePostProcessingPassNames3D(this.plan); }

  /** Bytes of the composer's two full-resolution half-float colour targets, or 0 on the direct path. */
  get targetBytes(): number { return this.state ? this.state.width * this.state.height * 8 * 2 : 0; }

  async configure(settings: GamePostProcessing3D | undefined): Promise<void> {
    this.plan = resolveGamePostProcessing3D(settings, this.renderer.capabilities.maxSamples);
    this.renderer.toneMapping = this.plan.toneMapping;
    this.renderer.toneMappingExposure = this.plan.exposure;
    const composer = this.plan.composer;
    if (!composer) { this.release(); return; }
    const key = gamePostProcessingPassNames3D(this.plan).join(",") + `:${composer.samples}`;
    if (this.state?.key !== key) { this.release(); this.state = await this.build(key, composer); }
    // A renderer disposed while SMAA lookups decoded must not keep the new targets.
    if (this.disposed) { this.release(); return; }
    const state = this.state;
    if (!state) { return; }
    if (state.bloom && composer.bloom) {
      state.bloom.threshold = composer.bloom.threshold;
      state.bloom.strength = composer.bloom.intensity;
      state.bloom.radius = composer.bloom.radius;
      state.bloom.materialHighPassFilter.uniforms["smoothWidth"]!.value = composer.bloom.softness;
    }
    if (state.vignette && composer.vignette) {
      state.vignette.uniforms["intensity"]!.value = composer.vignette.intensity;
      state.vignette.uniforms["radius"]!.value = composer.vignette.radius;
      state.vignette.uniforms["softness"]!.value = composer.vignette.softness;
    }
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    const state = this.state;
    if (!state) {
      this.renderer.clear();
      this.renderer.render(scene, camera);
      return;
    }
    const size = this.renderer.getDrawingBufferSize(this.size);
    if (size.x !== state.width || size.y !== state.height) {
      state.composer.setPixelRatio(1);
      state.composer.setSize(size.x, size.y);
      state.width = size.x; state.height = size.y;
    }
    state.scenePass.scene = scene;
    state.scenePass.camera = camera;
    state.composer.render();
  }

  dispose(): void {
    this.disposed = true;
    this.release();
  }

  /** Drops GPU targets, for example after a context loss. The next configure rebuilds them. */
  release(): void {
    if (!this.state) { return; }
    for (const pass of this.state.passes) { pass.dispose(); }
    this.state.composer.dispose();
    this.state = null;
  }

  private async build(key: string, plan: NonNullable<GamePostProcessingPlan3D["composer"]>): Promise<ComposerState> {
    const size = this.renderer.getDrawingBufferSize(this.size);
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: plan.samples });
    const composer = new EffectComposer(this.renderer, target);
    composer.setPixelRatio(1);
    composer.setSize(size.x, size.y);
    const scenePass = new RenderPass(new THREE.Scene(), new THREE.Camera());
    const passes: Pass[] = [scenePass];
    let bloom: UnrealBloomPass | null = null;
    let vignette: ShaderPass | null = null;
    if (plan.bloom) {
      bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), plan.bloom.intensity, plan.bloom.radius, plan.bloom.threshold);
      passes.push(bloom);
    }
    passes.push(new OutputPass());
    if (plan.vignette) {
      vignette = new ShaderPass(vignetteShader);
      passes.push(vignette);
    }
    if (plan.antialias === "fxaa") { passes.push(new FXAAPass()); }
    if (plan.antialias === "smaa") {
      const smaa = new GameSMAAPass();
      passes.push(smaa);
      try { await smaa.lookupsReady(); } catch (error) {
        for (const pass of passes) { pass.dispose(); }
        composer.dispose();
        throw error;
      }
    }
    for (const pass of passes) { composer.addPass(pass); }
    return { key, composer, scenePass, passes, bloom, vignette, width: size.x, height: size.y };
  }
}
