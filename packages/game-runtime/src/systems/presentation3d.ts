import {
  resolveGameUiFrame,
  type GameCameraState3D,
  type GameDocument3D,
  type GameEntity3D,
  type GameHudLabel,
  type GameRenderFrame3D,
  type GameScene3D,
  type GameTransform3D,
  type GameUiOverride
} from "@nodetool-ai/protocol";
import { projectGameplayHud } from "../gameplay/lifecycle.js";
import { type EntityState3D } from "../spatial3d/state.js";
import type { GameSystemContext3D } from "./context3d.js";
import { animationPose3D } from "./animation-graph3d.js";
import { copyTransform3D } from "../spatial3d/math.js";
type PresentationContext3D = Readonly<Pick<GameSystemContext3D, "tick" | "events" | "frame" | "scriptStats" | "scriptLogs" | "scriptSaves" | "queues">> &
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
  if (context.scriptLogs) {
    context.result.scriptLogs = context.scriptLogs;
  }
  if (context.scriptSaves) {
    context.result.saveRequests = context.scriptSaves;
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

/** The frame parts that depend only on the document. A session's document does not change, so each is built once. */
interface DocumentFrameParts3D {
  readonly fonts: GameRenderFrame3D["fonts"];
  readonly materials: GameRenderFrame3D["materials"];
  readonly images: GameRenderFrame3D["images"];
  readonly collectibles: boolean;
}

const documentFrameParts = new WeakMap<GameDocument3D, DocumentFrameParts3D>();

/** Freezes a copy that every frame shares, so a consumer that writes to it fails instead of changing later frames. */
function deepFreeze<Value>(value: Value): Value {
  if (value instanceof Object && !Object.isFrozen(value)) {
    for (const entry of Object.values(value)) { deepFreeze(entry); }
    Object.freeze(value);
  }
  return value;
}

function documentFrameParts3D(document: GameDocument3D): DocumentFrameParts3D {
  let parts = documentFrameParts.get(document);
  if (!parts) {
    const images = Object.fromEntries(Object.entries(document.assets)
      .flatMap(([slot, binding]) => binding.mediaKind === "image" ? [[slot, structuredClone(binding)]] : []));
    parts = {
      // The container is shared and frozen. Its bindings are the document's own, as before.
      fonts: Object.freeze(Object.fromEntries(Object.entries(document.assets).flatMap(([slot, binding]) => (binding.mediaKind === "font" ? [[slot, binding]] : [])))),
      materials: document.materials === undefined ? undefined : deepFreeze(structuredClone(document.materials)),
      images: Object.keys(images).length > 0 ? deepFreeze(images) : undefined,
      collectibles: document.scenes.some((candidate) => candidate.entities.some((entity) =>
        entity.behaviors.some((behavior) => behavior.kind === "collectible" || behavior.kind === "winWhenCollected")))
    };
    documentFrameParts.set(document, parts);
  }
  return parts;
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
  hud: ReadonlyMap<string, GameHudLabel>,
  ui: ReadonlyMap<string, GameUiOverride>
): GameRenderFrame3D {
  const cameraDefinition = states.find((state) => state.definition.id === camera.entityId)?.definition.camera3d;
  const cullDistanceOf = states.some((state) => state.definition.renderCulling) ? cullDistanceResolver3D(document, states) : undefined;
  if (!cameraDefinition) {
    throw new Error(`Missing active camera ${camera.entityId}`);
  }
  const parts = documentFrameParts3D(document);
  const frame: GameRenderFrame3D = {
    dimension: "3d",
    gameId: document.id,
    sceneId: scene.id,
    tick,
    presentation: document.presentation,
    fonts: parts.fonts,
    camera: {
      entityId: camera.entityId,
      transform: copyTransform3D(camera.transform),
      previousTransform: copyTransform3D(previousCamera),
      projection: cameraDefinition.projection
    },
    entities: states
      .filter((state) => state.active)
      .map((state) => {
        const lifetime = state.definition.behaviors.find((behavior) => behavior.kind === "lifetime");
        const progress = lifetime?.kind === "lifetime" ? Math.max(0, Math.min(1, (tick - state.spawnTick) / lifetime.ticks)) : 0;
        const transform = copyTransform3D(state.transform);
        const previousTransform = copyTransform3D(state.previousTransform);
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
        if (state.definition.decal3d) {
          entity.decal3d = structuredClone(state.definition.decal3d);
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
        transform: copyTransform3D(state.transform),
        light: state.definition.light3d!
      })),
    environment: scene.environment,
    hud: projectGameplayHud(parts.collectibles, score, won, hud)
  };
  const uiFrame = resolveGameUiFrame(document.ui, scene.ui, ui, (entityId) => {
    const state = states.find((candidate) => candidate.definition.id === entityId);
    const health = state?.definition.behaviors.find((behavior) => behavior.kind === "health");
    return state && health?.kind === "health" ? { value: state.health ?? 0, max: health.maximum } : undefined;
  });
  // Left out without a HUD tree, so frames of games without one keep their bytes.
  if (uiFrame) {
    frame.ui = uiFrame;
  }
  // Frames share these frozen document copies.
  if (parts.materials !== undefined) { frame.materials = parts.materials; }
  if (parts.images !== undefined) { frame.images = parts.images; }
  return frame;
}
