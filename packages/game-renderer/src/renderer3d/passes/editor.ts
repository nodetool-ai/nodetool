import * as THREE from "three";
import { FullScreenQuad } from "three/addons/postprocessing/Pass.js";
import type { GameLight3D, GameRenderFrame3D } from "@nodetool-ai/protocol";
import type { RenderContext3D, RenderPipeline3D } from "../pipeline.js";

export const GAME_EDITOR_VIEW_MODES_3D = ["lit", "wireframe", "unlit", "overdraw"] as const;
export type GameEditorViewMode3D = typeof GAME_EDITOR_VIEW_MODES_3D[number];

/** What the editor overlays draw on top of, or instead of, the lit scene. Omitted fields take the lit, unselected defaults. */
export interface GameEditorView3D {
  readonly mode?: GameEditorViewMode3D;
  /** Entities outlined as selected. Unknown ids are ignored. */
  readonly selectedIds?: readonly string[];
  /** Draws each light's range sphere, spot cone or direction line. */
  readonly lightHelpers?: boolean;
  /** CSS colour of the selection outline. */
  readonly outlineColor?: string;
}

export interface ResolvedGameEditorView3D {
  readonly mode: GameEditorViewMode3D;
  readonly selectedIds: readonly string[];
  readonly lightHelpers: boolean;
  readonly outlineColor: string;
}

export const GAME_EDITOR_OUTLINE_COLOR_3D = "#ff9f1a";
/** Outline width in drawing-buffer pixels. */
export const GAME_EDITOR_OUTLINE_PIXELS_3D = 2;
/** Output (sRGB) colour each overdraw layer adds. Eight overlapping layers saturate the red channel. */
export const GAME_EDITOR_OVERDRAW_LAYER_3D = { r: 0.12, g: 0.04, b: 0.015 } as const;
/** Length of the direction line drawn for a directional light, in world units. */
export const GAME_EDITOR_DIRECTION_LENGTH_3D = 2;
/** Layer reserved for the selection mask render. Game content never uses it. */
const OUTLINE_LAYER = 31;
const CIRCLE_SEGMENTS = 48;

export function resolveGameEditorView3D(view: GameEditorView3D | null): ResolvedGameEditorView3D {
  return { mode: view?.mode ?? "lit", selectedIds: view?.selectedIds ?? [], lightHelpers: view?.lightHelpers ?? false,
    outlineColor: view?.outlineColor ?? GAME_EDITOR_OUTLINE_COLOR_3D };
}

/** Pass names the pipeline gains from the editor passes, in run order around the scene and HUD passes. */
export const GAME_EDITOR_PASS_NAMES_3D = ["editor-view", "editor-view-restore", "editor-outline", "editor-light-helpers"] as const;

/** Renderer state the editor passes read. Nothing here reaches simulation. */
export interface GameEditorPassHost3D {
  readonly scene: THREE.Scene;
  entityObject(entityId: string): THREE.Object3D | null;
  entityObjects(): Iterable<THREE.Object3D>;
  /** The frame being rendered, for light helpers. */
  frame(): GameRenderFrame3D | null;
  /** Renders the scene pass straight to the canvas, without post-processing, while true. */
  setDirectRender(direct: boolean): void;
}

export interface GameEditorPasses3D {
  readonly view: ResolvedGameEditorView3D;
  setView(view: GameEditorView3D | null): void;
  dispose(): void;
}

export type GameEditorPassesFactory3D = (pipeline: RenderPipeline3D, host: GameEditorPassHost3D) => GameEditorPasses3D;

function circlePoints(radius: number, plane: "xy" | "xz" | "yz", offset = 0): number[] {
  const points: number[] = [];
  for (let index = 0; index < CIRCLE_SEGMENTS; index++) {
    for (const step of [index, index + 1]) {
      const angle = step / CIRCLE_SEGMENTS * Math.PI * 2;
      const a = Math.cos(angle) * radius; const b = Math.sin(angle) * radius;
      if (plane === "xy") { points.push(a, b, offset); } else if (plane === "xz") { points.push(a, offset, b); } else { points.push(offset, a, b); }
    }
  }
  return points;
}

/**
 * Line segments in the light's local space, where it shines along -Z. A point light gets three circles of its range,
 * a spot light the cone its range and angle cover, and a directional light a ring and a line along its direction.
 */
export function gameLightHelperPositions3D(light: GameLight3D): Float32Array {
  if (light.kind === "point") {
    return new Float32Array([...circlePoints(light.range, "xy"), ...circlePoints(light.range, "xz"), ...circlePoints(light.range, "yz")]);
  }
  if (light.kind === "spot") {
    const radius = light.range * Math.sin(light.angle);
    const depth = -light.range * Math.cos(light.angle);
    const rays = [[radius, 0], [-radius, 0], [0, radius], [0, -radius]].flatMap(([x, y]) => [0, 0, 0, x ?? 0, y ?? 0, depth]);
    return new Float32Array([...circlePoints(radius, "xy", depth), ...rays]);
  }
  return new Float32Array([...circlePoints(0.25, "xy"), 0, 0, 0, 0, 0, -GAME_EDITOR_DIRECTION_LENGTH_3D]);
}

/** Built on demand: a module-level `new` would keep this module in player bundles that never install the passes. */
const outlineShader = (): THREE.ShaderMaterialParameters => ({
  name: "GameEditorOutlineShader",
  uniforms: { mask: { value: null }, texel: { value: new THREE.Vector2() }, color: { value: new THREE.Color() } },
  vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
  fragmentShader: `uniform sampler2D mask; uniform vec2 texel; uniform vec3 color; varying vec2 vUv;
void main() {
  if (texture2D(mask, vUv).r > 0.5) { discard; }
  float edge = 0.0;
  for (int x = -${GAME_EDITOR_OUTLINE_PIXELS_3D}; x <= ${GAME_EDITOR_OUTLINE_PIXELS_3D}; x++) {
    for (int y = -${GAME_EDITOR_OUTLINE_PIXELS_3D}; y <= ${GAME_EDITOR_OUTLINE_PIXELS_3D}; y++) {
      edge = max(edge, texture2D(mask, vUv + vec2(float(x), float(y)) * texel).r);
    }
  }
  if (edge < 0.5) { discard; }
  gl_FragColor = vec4(color, 1.0);
  #include <colorspace_fragment>
}`
});

interface LightHelper {
  readonly key: string;
  readonly lines: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
}

/**
 * Editor-only passes: a debug view mode around the scene pass, a selection outline and light helpers after it.
 * The player and capture pages never install them, so their output and bundles are unchanged.
 */
class EditorPasses3D implements GameEditorPasses3D {
  view = resolveGameEditorView3D(null);
  private readonly swapped: Array<[THREE.Mesh, THREE.Material | THREE.Material[]]> = [];
  private readonly replacements = new Map<THREE.Material, THREE.MeshBasicMaterial>();
  private readonly seen = new Set<THREE.Material>();
  private readonly overdraw = new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(GAME_EDITOR_OVERDRAW_LAYER_3D.r, GAME_EDITOR_OVERDRAW_LAYER_3D.g, GAME_EDITOR_OVERDRAW_LAYER_3D.b, THREE.SRGBColorSpace),
    blending: THREE.AdditiveBlending, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false });
  private readonly overdrawBackground = new THREE.Color(0, 0, 0);
  private savedBackground: THREE.Scene["background"] | undefined;
  private readonly maskMaterial = new THREE.MeshBasicMaterial({ color: "#ffffff", fog: false, toneMapped: false, side: THREE.DoubleSide });
  private readonly outlineMaterial = new THREE.ShaderMaterial(outlineShader());
  private readonly outlineQuad = new FullScreenQuad(this.outlineMaterial);
  private maskTarget: THREE.WebGLRenderTarget | null = null;
  private readonly size = new THREE.Vector2();
  private readonly clearColor = new THREE.Color();
  private readonly helperScene = new THREE.Scene();
  private readonly lightHelpers = new Map<string, LightHelper>();

  constructor(pipeline: RenderPipeline3D, private readonly host: GameEditorPassHost3D) {
    pipeline.register({ name: "editor-view", order: -1, render: () => this.beginView() });
    pipeline.register({ name: "editor-view-restore", order: 0.25, render: () => this.restoreView() });
    pipeline.register({ name: "editor-outline", order: 0.5, render: (context) => this.renderOutline(context) });
    pipeline.register({ name: "editor-light-helpers", order: 0.75, render: (context) => this.renderLightHelpers(context) });
  }

  setView(view: GameEditorView3D | null): void {
    this.restoreView();
    this.view = resolveGameEditorView3D(view);
    if (this.view.mode === "lit") { this.releaseReplacements(); }
    if (this.view.selectedIds.length === 0) { this.maskTarget?.dispose(); this.maskTarget = null; }
    if (!this.view.lightHelpers) { this.releaseLightHelpers(); }
  }

  dispose(): void {
    this.restoreView();
    this.releaseReplacements();
    this.releaseLightHelpers();
    this.overdraw.dispose();
    this.maskMaterial.dispose();
    this.outlineMaterial.dispose();
    this.outlineQuad.dispose();
    this.maskTarget?.dispose();
    this.maskTarget = null;
  }

  private beginView(): void {
    this.restoreView();
    const mode = this.view.mode;
    if (mode === "lit") { return; }
    this.seen.clear();
    for (const root of this.host.entityObjects()) {
      root.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) { return; }
        const material: THREE.Material | THREE.Material[] = object.material;
        this.swapped.push([object, material]);
        object.material = Array.isArray(material) ? material.map((entry) => this.replacement(entry, mode)) : this.replacement(material, mode);
      });
    }
    for (const material of this.replacements.keys()) {
      if (!this.seen.has(material)) { this.replacements.get(material)?.dispose(); this.replacements.delete(material); }
    }
    if (mode === "overdraw") { this.savedBackground = this.host.scene.background; this.host.scene.background = this.overdrawBackground; }
    this.host.setDirectRender(true);
  }

  private restoreView(): void {
    for (const [mesh, material] of this.swapped) { mesh.material = material; }
    this.swapped.length = 0;
    if (this.savedBackground !== undefined) { this.host.scene.background = this.savedBackground; this.savedBackground = undefined; }
    this.host.setDirectRender(false);
  }

  private replacement(material: THREE.Material, mode: Exclude<GameEditorViewMode3D, "lit">): THREE.Material {
    if (mode === "overdraw") { return this.overdraw; }
    this.seen.add(material);
    let replacement = this.replacements.get(material);
    if (!replacement) {
      const color = "color" in material && material.color instanceof THREE.Color ? material.color : "#ffffff";
      const map = "map" in material && material.map instanceof THREE.Texture ? material.map : null;
      const alphaMap = "alphaMap" in material && material.alphaMap instanceof THREE.Texture ? material.alphaMap : null;
      replacement = new THREE.MeshBasicMaterial({ fog: false, toneMapped: false, side: material.side, vertexColors: material.vertexColors,
        alphaTest: material.alphaTest, color, map, alphaMap });
      this.replacements.set(material, replacement);
    }
    replacement.wireframe = mode === "wireframe";
    replacement.opacity = material.opacity;
    replacement.transparent = material.transparent;
    return replacement;
  }

  private renderOutline({ renderer, scene, camera }: RenderContext3D): void {
    const objects = this.view.selectedIds.flatMap((id) => { const object = this.host.entityObject(id); return object ? [object] : []; });
    if (objects.length === 0) { return; }
    const size = renderer.getDrawingBufferSize(this.size);
    if (!this.maskTarget) { this.maskTarget = new THREE.WebGLRenderTarget(size.x, size.y, { depthBuffer: true }); }
    else if (this.maskTarget.width !== size.x || this.maskTarget.height !== size.y) { this.maskTarget.setSize(size.x, size.y); }
    for (const object of objects) { object.traverse((child) => child.layers.enable(OUTLINE_LAYER)); }
    const layers = camera.layers.mask;
    const background = scene.background;
    const override = scene.overrideMaterial;
    const target = renderer.getRenderTarget();
    const clearAlpha = renderer.getClearAlpha();
    const shadowUpdate = renderer.shadowMap.autoUpdate;
    renderer.getClearColor(this.clearColor);
    try {
      // The scene pass already rendered this frame's shadow maps.
      renderer.shadowMap.autoUpdate = false;
      camera.layers.set(OUTLINE_LAYER);
      scene.background = null;
      scene.overrideMaterial = this.maskMaterial;
      renderer.setRenderTarget(this.maskTarget);
      renderer.setClearColor(0x000000, 0);
      renderer.clear();
      renderer.render(scene, camera);
    } finally {
      renderer.shadowMap.autoUpdate = shadowUpdate;
      camera.layers.mask = layers;
      scene.background = background;
      scene.overrideMaterial = override;
      renderer.setClearColor(this.clearColor, clearAlpha);
      renderer.setRenderTarget(target);
      for (const object of objects) { object.traverse((child) => child.layers.disable(OUTLINE_LAYER)); }
    }
    this.outlineMaterial.uniforms["mask"]!.value = this.maskTarget.texture;
    this.outlineMaterial.uniforms["texel"]!.value.set(1 / size.x, 1 / size.y);
    this.outlineMaterial.uniforms["color"]!.value.set(this.view.outlineColor);
    this.outlineQuad.render(renderer);
  }

  private renderLightHelpers({ renderer, camera }: RenderContext3D): void {
    const lights = this.view.lightHelpers ? this.host.frame()?.lights ?? [] : [];
    const present = new Set(lights.map((entry) => entry.entityId));
    for (const [id, helper] of this.lightHelpers) {
      if (!present.has(id)) { this.releaseLightHelper(helper); this.lightHelpers.delete(id); }
    }
    if (lights.length === 0) { return; }
    for (const entry of lights) {
      const light = entry.light;
      const key = `${light.kind}:${light.kind === "directional" ? "" : light.range}:${light.kind === "spot" ? light.angle : ""}`;
      let helper = this.lightHelpers.get(entry.entityId);
      if (helper?.key !== key) {
        if (helper) { this.releaseLightHelper(helper); }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(gameLightHelperPositions3D(light), 3));
        const lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ depthTest: false, depthWrite: false, fog: false, toneMapped: false, transparent: true, opacity: 0.85 }));
        helper = { key, lines };
        this.lightHelpers.set(entry.entityId, helper);
        this.helperScene.add(lines);
      }
      helper.lines.material.color.set(light.color);
      helper.lines.position.set(entry.transform.position.x, entry.transform.position.y, entry.transform.position.z);
      helper.lines.quaternion.fromArray(entry.transform.rotation);
    }
    renderer.render(this.helperScene, camera);
  }

  private releaseReplacements(): void {
    for (const replacement of this.replacements.values()) { replacement.dispose(); }
    this.replacements.clear();
  }

  private releaseLightHelper(helper: LightHelper): void {
    helper.lines.removeFromParent();
    helper.lines.geometry.dispose();
    helper.lines.material.dispose();
  }

  private releaseLightHelpers(): void {
    for (const helper of this.lightHelpers.values()) { this.releaseLightHelper(helper); }
    this.lightHelpers.clear();
  }
}

/** Installs the editor passes on a renderer. Pass it as `editorPasses` to `createGameRenderer3D`. */
export const createGameEditorPasses3D: GameEditorPassesFactory3D = (pipeline, host) => new EditorPasses3D(pipeline, host);
