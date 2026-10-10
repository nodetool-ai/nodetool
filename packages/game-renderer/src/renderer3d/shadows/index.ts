import * as THREE from "three";
import { GAME_LOCAL_SHADOW_LIGHT_BUDGET_3D, type GameLight3D, type GameRenderFrame3D } from "@nodetool-ai/protocol";
import { GameCascadedShadows3D } from "./cascades.js";

export interface GameShadowOverflow3D {
  /** Shadowed point and spot lights over the scene budget. */
  readonly local: number;
  /** Shadowed directional lights after the one that cascades. */
  readonly directional: number;
}

export interface GameShadowPlan3D {
  /** Lights that render a shadow map this frame. */
  readonly casting: ReadonlySet<string>;
  /** The directional light drawn through cascaded shadow maps, when the scene enables cascades. */
  readonly cascadedLightId?: string;
  readonly overflow: GameShadowOverflow3D;
  /** One message per overflowing kind. Messages carry counts, not entity ids, so spawned lights add no new messages. */
  readonly diagnostics: readonly string[];
}

const overflowKinds = ["local", "directional"] as const;
type GameShadowOverflowKind3D = typeof overflowKinds[number];

function overflowMessage(kind: GameShadowOverflowKind3D, count: number): string {
  return kind === "local"
    ? `Shadow budget exceeded: ${count} point and spot ${count === 1 ? "light renders" : "lights render"} without shadows (at most ${GAME_LOCAL_SHADOW_LIGHT_BUDGET_3D} cast shadows per scene)`
    : `Cascaded shadows support one directional light: ${count} other shadowed directional ${count === 1 ? "light renders" : "lights render"} without shadows`;
}

/** Decides which lights cast shadows in a frame. Lights over a budget render unshadowed and produce a diagnostic. */
export function planGameShadows3D(frame: Pick<GameRenderFrame3D, "lights" | "environment">): GameShadowPlan3D {
  const casting = new Set<string>();
  const overflow = { local: 0, directional: 0 };
  if (!frame.environment.shadows.enabled) { return { casting, overflow, diagnostics: [] }; }
  const cascaded = frame.environment.shadows.cascades !== undefined;
  let cascadedLightId: string | undefined;
  let local = 0;
  for (const { entityId, light } of frame.lights) {
    if (light.kind === "directional") {
      if (!light.castShadow) { continue; }
      if (!cascaded) { casting.add(entityId); continue; }
      if (cascadedLightId === undefined) { cascadedLightId = entityId; casting.add(entityId); continue; }
      overflow.directional++;
      continue;
    }
    if (light.castShadow !== true) { continue; }
    if (local < GAME_LOCAL_SHADOW_LIGHT_BUDGET_3D) { local++; casting.add(entityId); continue; }
    overflow.local++;
  }
  const diagnostics = overflowKinds.filter((kind) => overflow[kind] > 0).map((kind) => overflowMessage(kind, overflow[kind]));
  return cascadedLightId === undefined ? { casting, overflow, diagnostics } : { casting, cascadedLightId, overflow, diagnostics };
}

export function applyGameShadowBias(shadow: THREE.LightShadow, definition: GameLight3D): void {
  shadow.bias = definition.shadowBias ?? 0;
  shadow.normalBias = definition.shadowNormalBias ?? 0;
}

export function configureDirectionalShadow(light: THREE.DirectionalLight, definition: Extract<GameLight3D, { kind: "directional" }>, environment: GameRenderFrame3D["environment"], casting = environment.shadows.enabled && definition.castShadow): void {
  light.castShadow = casting;
  light.shadow.mapSize.set(environment.shadows.mapSize, environment.shadows.mapSize);
  const extent = environment.shadows.extent;
  Object.assign(light.shadow.camera, { left: -extent, right: extent, top: extent, bottom: -extent, near: 0.1, far: extent * 4 });
  light.shadow.camera.updateProjectionMatrix();
  applyGameShadowBias(light.shadow, definition);
}

/** Point lights render six faces per shadow update, so their maps stay at most 1024 texels square. */
export function configureLocalShadow(light: THREE.PointLight | THREE.SpotLight, definition: Exclude<GameLight3D, { kind: "directional" }>, environment: GameRenderFrame3D["environment"], casting: boolean): void {
  light.castShadow = casting;
  if (!casting) { return; }
  const size = light instanceof THREE.PointLight ? Math.min(1024, environment.shadows.mapSize) : environment.shadows.mapSize;
  if (light.shadow.mapSize.x !== size) {
    light.shadow.mapSize.set(size, size);
    light.shadow.map?.dispose();
    light.shadow.map = null;
  }
  light.shadow.camera.near = Math.min(0.1, definition.range / 100);
  applyGameShadowBias(light.shadow, definition);
}

/**
 * Per-renderer shadow state: the frame's plan, overflow diagnostics and the cascade controller. Each overflow kind
 * keeps one diagnostics entry that is rewritten when the largest count seen grows, so the array stays bounded.
 */
export class GameShadows3D {
  private readonly reported = new Map<GameShadowOverflowKind3D, { readonly index: number; count: number }>();
  private readonly cascades = new GameCascadedShadows3D();
  plan: GameShadowPlan3D = { casting: new Set(), overflow: { local: 0, directional: 0 }, diagnostics: [] };

  constructor(private readonly diagnostics: string[], private readonly onDiagnostic?: (message: string) => void) {}

  prepare(frame: GameRenderFrame3D): GameShadowPlan3D {
    this.plan = planGameShadows3D(frame);
    for (const kind of overflowKinds) {
      const count = this.plan.overflow[kind];
      const previous = this.reported.get(kind);
      if (count <= (previous?.count ?? 0)) { continue; }
      const message = overflowMessage(kind, count);
      if (previous) {
        previous.count = count;
        this.diagnostics[previous.index] = message;
      } else {
        this.reported.set(kind, { index: this.diagnostics.length, count });
        this.diagnostics.push(message);
      }
      this.onDiagnostic?.(message);
    }
    return this.plan;
  }

  /** Draws the cascaded light through per-cascade lights and hides its single-map light. */
  update(scene: THREE.Scene, lights: ReadonlyMap<string, THREE.Light>, frame: GameRenderFrame3D, camera: THREE.Camera): void {
    const settings = frame.environment.shadows.cascades;
    const id = this.plan.cascadedLightId;
    const entry = id === undefined ? undefined : frame.lights.find((candidate) => candidate.entityId === id);
    const source = id === undefined ? undefined : lights.get(id);
    for (const [lightId, light] of lights) { light.visible = lightId !== id || !(source instanceof THREE.DirectionalLight); }
    if (!settings || !entry || entry.light.kind !== "directional" || !(source instanceof THREE.DirectionalLight)) {
      this.cascades.detach();
      return;
    }
    this.cascades.update(scene, source, entry.light, settings, frame.environment.shadows.mapSize, camera);
  }

  dispose(): void { this.cascades.detach(); }
}
