import {
  type GameCameraState3D,
  type GameDocument3D,
  type GameEntity3D,
  type GameHudLabel,
  type GameRenderFrame3D,
  type GameScene3D,
  type GameTransform3D
} from "@nodetool-ai/protocol";
import { projectGameplayHud } from "../gameplay/lifecycle.js";
import { type EntityState3D } from "../spatial3d/state.js";
import type { GameSystemContext3D } from "./context3d.js";
import { animationPose3D } from "./animation-graph3d.js";
type PresentationContext3D = Readonly<Pick<GameSystemContext3D, "tick" | "events" | "frame" | "scriptStats" | "queues">> &
  Pick<GameSystemContext3D, "presentationEvents" | "result">;
export function stepPresentation3D(context: PresentationContext3D): void {
  context.presentationEvents = [...structuredClone(context.events), ...(context.queues.particles ?? [])];
  context.result = {
    tick: context.tick,
    events: context.events,
    frame: context.frame()
  };
  if (context.scriptStats) {
    context.result.scriptStats = context.scriptStats;
  }
}
export function readStepResult3D(context: GameSystemContext3D): NonNullable<GameSystemContext3D["result"]> {
  if (!context.result) {
    throw new Error("Presentation stage did not produce a frame");
  }
  return context.result;
}
/** Resolves an entity's cull distance from the nearest entity in its parent chain that sets one, so a culled parent hides its children. */
function cullDistanceResolver3D(document: GameDocument3D, states: readonly EntityState3D[]): (definition: GameEntity3D) => number | undefined {
  const byId = new Map(states.map((state) => [state.definition.id, state.definition]));
  return (definition) => {
    const visited = new Set<string>();
    for (let current: GameEntity3D | undefined = definition; current && !visited.has(current.id);
      current = current.parentId === undefined ? undefined : byId.get(current.parentId)) {
      visited.add(current.id);
      const culling = current.renderCulling;
      const distance = culling?.maxDistance ?? (culling?.layer === undefined ? undefined : document.performance?.cullLayers?.[culling.layer]?.maxDistance);
      if (distance !== undefined) {
        return distance;
      }
    }
    return undefined;
  };
}

export function frame3D(
  document: GameDocument3D,
  scene: GameScene3D,
  states: readonly EntityState3D[],
  camera: GameCameraState3D,
  previousCamera: GameTransform3D,
  tick: number,
  score: number,
  won: boolean,
  hud: ReadonlyMap<string, GameHudLabel>
): GameRenderFrame3D {
  const cameraDefinition = states.find((state) => state.definition.id === camera.entityId)?.definition.camera3d;
  const cullDistanceOf = states.some((state) => state.definition.renderCulling) ? cullDistanceResolver3D(document, states) : undefined;
  if (!cameraDefinition) {
    throw new Error(`Missing active camera ${camera.entityId}`);
  }
  return {
    dimension: "3d",
    gameId: document.id,
    sceneId: scene.id,
    tick,
    presentation: document.presentation,
    fonts: Object.fromEntries(
      Object.entries(document.assets).flatMap(([slot, binding]) => (binding.mediaKind === "font" ? [[slot, binding]] : []))
    ),
    camera: {
      entityId: camera.entityId,
      transform: structuredClone(camera.transform),
      previousTransform: structuredClone(previousCamera),
      projection: cameraDefinition.projection
    },
    entities: states
      .filter((state) => state.active)
      .map((state) => {
        const lifetime = state.definition.behaviors.find((behavior) => behavior.kind === "lifetime");
        const progress = lifetime?.kind === "lifetime" ? Math.max(0, Math.min(1, (tick - state.spawnTick) / lifetime.ticks)) : 0;
        const transform = structuredClone(state.transform);
        const previousTransform = structuredClone(state.previousTransform);
        if (lifetime?.kind === "lifetime") {
          const scale = 1 + (lifetime.endScale - 1) * progress;
          const previousScale = 1 + (lifetime.endScale - 1) * Math.max(0, (tick - state.spawnTick - 1) / lifetime.ticks);
          transform.scale = {
            x: transform.scale.x * scale,
            y: transform.scale.y * scale,
            z: transform.scale.z * scale
          };
          previousTransform.scale = {
            x: previousTransform.scale.x * previousScale,
            y: previousTransform.scale.y * previousScale,
            z: previousTransform.scale.z * previousScale
          };
        }
        const entity: GameRenderFrame3D["entities"][number] = {
          entityId: state.definition.id,
          transform,
          previousTransform,
          opacity: (state.opacity ?? 1) * (lifetime?.kind === "lifetime" && lifetime.fade ? 1 - progress : 1)
        };
        if (state.definition.primitive) {
          entity.primitive = state.definition.primitive;
        }
        if (state.definition.model) {
          entity.model = state.definition.model;
        }
        const pose = animationPose3D(document, state);
        if (pose) {
          entity.animationPose = pose;
        } else if (state.animation) {
          entity.animation = structuredClone(state.animation);
        }
        if (state.definition.particles) {
          entity.particles = state.definition.particles;
        }
        const cullDistance = cullDistanceOf?.(state.definition);
        if (cullDistance !== undefined) {
          entity.cullDistance = cullDistance;
        }
        return entity;
      }),
    lights: states
      .filter((state) => state.active && state.definition.light3d)
      .map((state) => ({
        entityId: state.definition.id,
        transform: structuredClone(state.transform),
        light: state.definition.light3d!
      })),
    environment: scene.environment,
    hud: projectGameplayHud(
      document.scenes.some((candidate) =>
        candidate.entities.some((entity) =>
          entity.behaviors.some((behavior) => behavior.kind === "collectible" || behavior.kind === "winWhenCollected")
        )
      ),
      score,
      won,
      hud
    )
  };
}
