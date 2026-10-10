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
    readonly bloom?: NonNullable<GamePostProcessing3D["bloom"]>;
    readonly vignette?: NonNullable<GamePostProcessing3D["vignette"]>;
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
    ...(settings.bloom ? { bloom: settings.bloom } : {}),
    ...(settings.vignette ? { vignette: settings.vignette } : {}),
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

interface ComposerState {
  readonly key: string;
  readonly composer: EffectComposer;
  readonly scenePass: RenderPass;
  readonly passes: readonly Pass[];
  readonly bloom?: UnrealBloomPass;
  readonly vignette?: ShaderPass;
  width: number;
  height: number;
}

/** Owns the composer for one renderer. The scene pass of `RenderPipeline3D` draws through it. */
export class GamePostProcessor3D {
  private plan: GamePostProcessingPlan3D = resolveGamePostProcessing3D(undefined, 0);
  private state: ComposerState | null = null;

  constructor(private readonly renderer: THREE.WebGLRenderer) {}

  /** Names of the composer passes the next render runs, or an empty list for a direct render. */
  get passNames(): readonly string[] { return gamePostProcessingPassNames3D(this.plan); }

  configure(settings: GamePostProcessing3D | undefined): void {
    this.plan = resolveGamePostProcessing3D(settings, this.renderer.capabilities.maxSamples);
    this.renderer.toneMapping = this.plan.toneMapping;
    this.renderer.toneMappingExposure = this.plan.exposure;
    const composer = this.plan.composer;
    if (!composer) { this.release(); return; }
    const key = gamePostProcessingPassNames3D(this.plan).join(",") + `:${composer.samples}`;
    if (this.state?.key !== key) { this.release(); this.state = this.build(key, composer); }
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
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    if (size.x !== state.width || size.y !== state.height) {
      state.composer.setPixelRatio(1);
      state.composer.setSize(size.x, size.y);
      state.width = size.x; state.height = size.y;
    }
    state.scenePass.scene = scene;
    state.scenePass.camera = camera;
    state.composer.render();
  }

  /** Drops GPU targets, for example after a context loss. The next configure rebuilds them. */
  release(): void {
    if (!this.state) { return; }
    for (const pass of this.state.passes) { pass.dispose(); }
    this.state.composer.dispose();
    this.state = null;
  }

  private build(key: string, plan: NonNullable<GamePostProcessingPlan3D["composer"]>): ComposerState {
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: plan.samples });
    const composer = new EffectComposer(this.renderer, target);
    composer.setPixelRatio(1);
    composer.setSize(size.x, size.y);
    const scenePass = new RenderPass(new THREE.Scene(), new THREE.Camera());
    const passes: Pass[] = [scenePass];
    let bloom: UnrealBloomPass | undefined;
    let vignette: ShaderPass | undefined;
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
    if (plan.antialias === "smaa") { passes.push(new SMAAPass()); }
    for (const pass of passes) { composer.addPass(pass); }
    return { key, composer, scenePass, passes, ...(bloom ? { bloom } : {}), ...(vignette ? { vignette } : {}), width: size.x, height: size.y };
  }
}
