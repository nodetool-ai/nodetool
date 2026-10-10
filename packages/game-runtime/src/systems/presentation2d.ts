import type { EntityState } from "./state2d.js";
import type { GameDocument, GameHudLabel, GameRenderFrame, GameScene } from "@nodetool-ai/protocol";
import { projectGameplayHud } from "../gameplay/lifecycle.js";
import { evaluateVisual } from "../visual-animation.js";
import type { GameSystemContext2D } from "./context2d.js";
type PresentationContext2D = Readonly<
  Pick<GameSystemContext2D, "tick" | "events" | "frameFor" | "document" | "scene" | "states" | "score" | "won" | "hud" | "scriptStats" | "queues">
> &
  Pick<GameSystemContext2D, "presentationEvents" | "result">;
export function stepPresentation2D(context: PresentationContext2D): void {
  context.presentationEvents = [...structuredClone(context.events), ...(context.queues.particles ?? [])];
  context.result = {
    tick: context.tick,
    events: context.events,
    frame: context.frameFor(context.document, context.scene, context.states, context.tick, context.score, context.won, context.hud)
  };
  if (context.scriptStats) {
    context.result = { ...context.result, scriptStats: context.scriptStats };
  }
}
export function readStepResult2D(context: GameSystemContext2D): NonNullable<GameSystemContext2D["result"]> {
  if (!context.result) {
    throw new Error("Presentation stage did not produce a frame");
  }
  return context.result;
}
/** The animator's current frame: the selected clip, or the default frames from spawn. */
function animationFrame(state: EntityState, tick: number): GameRenderFrame["sprites"][number]["frame"] {
  const animator = state.definition.animator;
  if (!animator) {
    return undefined;
  }
  const clip = (state.animation !== undefined ? animator.clips?.[state.animation] : undefined) ?? animator;
  const age = tick - (state.animation !== undefined ? (state.animationTick ?? state.spawnTick) : state.spawnTick);
  const index = Math.floor(Math.max(0, age) / clip.ticksPerFrame);
  return clip.frames[clip.loop ? index % clip.frames.length : Math.min(index, clip.frames.length - 1)];
}
export function frameFor(
  document: GameDocument,
  scene: GameScene,
  states: readonly EntityState[],
  tick: number,
  score: number,
  won: boolean,
  hud: ReadonlyMap<string, GameHudLabel>
): GameRenderFrame {
  const cameraState = states.find((state) => state.active && state.definition.camera2d);
  const camera = cameraState?.definition.camera2d;
  const sprites: GameRenderFrame["sprites"] = [];
  const tiles: GameRenderFrame["tiles"] = [];
  const particles: NonNullable<GameRenderFrame["particles"]> = [];
  const cameraX = cameraState?.x ?? 0;
  const cameraY = cameraState?.y ?? 0;
  // Tiles and lights outside the view plus a margin never reach the renderer, so large levels stay cheap.
  const viewHalfWidth = (camera?.width ?? 16) / (2 * (camera?.zoom ?? 1));
  const viewHalfHeight = (camera?.height ?? 9) / (2 * (camera?.zoom ?? 1));
  const cullHalfWidth = viewHalfWidth * 1.5 + 2;
  const cullHalfHeight = viewHalfHeight * 1.5 + 2;
  const entityLights: {
    x: number;
    y: number;
    color: string;
    intensity: number;
    radius: number;
    falloff: number;
    distance: number;
  }[] = [];
  for (const state of states) {
    if (!state.active) {
      continue;
    }
    const entity = state.definition;
    if (entity.sprite) {
      const spriteDefinition = entity.sprite;
      const binding = document.assets[entity.sprite.assetId];
      const age = tick - state.spawnTick;
      const lifetime = entity.behaviors.find((behavior) => behavior.kind === "lifetime");
      const progress = lifetime?.kind === "lifetime" ? Math.min(1, age / lifetime.ticks) : 0;
      const previousProgress = lifetime?.kind === "lifetime" ? Math.min(1, Math.max(0, age - 1) / lifetime.ticks) : 0;
      const lifeScale = lifetime?.kind === "lifetime" ? 1 + (lifetime.endScale - 1) * progress : 1;
      const previousLifeScale = lifetime?.kind === "lifetime" ? 1 + (lifetime.endScale - 1) * previousProgress : 1;
      const lifeOpacity = lifetime?.kind === "lifetime" && lifetime.fade ? 1 - progress : 1;
      const previousLifeOpacity = lifetime?.kind === "lifetime" && lifetime.fade ? 1 - previousProgress : 1;
      const visual = state.visual;
      const authored = evaluateVisual(entity, age, state.rotation, state.scaleX, state.scaleY);
      const previousAuthored = evaluateVisual(entity, Math.max(0, age - 1), state.rotation, state.scaleX, state.scaleY);
      const opacity = (visual?.opacity ?? authored.opacity) * lifeOpacity;
      const previousOpacity = (visual?.opacity ?? previousAuthored.opacity) * previousLifeOpacity;
      const sprite: GameRenderFrame["sprites"][number] = {
        entityId: entity.id,
        assetId: entity.sprite.assetId,
        x: state.x,
        y: state.y,
        previousX: state.previousX,
        previousY: state.previousY,
        rotation: visual?.rotation ?? authored.rotation,
        previousRotation: visual?.rotation ?? previousAuthored.rotation,
        scaleX: (visual?.scaleX ?? authored.scaleX) * lifeScale,
        previousScaleX: (visual?.scaleX ?? previousAuthored.scaleX) * previousLifeScale,
        scaleY: (visual?.scaleY ?? authored.scaleY) * lifeScale,
        previousScaleY: (visual?.scaleY ?? previousAuthored.scaleY) * previousLifeScale,
        width: entity.sprite.width,
        height: entity.sprite.height,
        layer: entity.sprite.layer
      };
      const spriteFrame = animationFrame(state, tick) ?? entity.sprite.frame ?? binding?.frame;
      if (document.schemaVersion !== 1 && binding) {
        const sourceWidth = spriteFrame?.width ?? binding.trim?.sourceWidth ?? binding.width;
        const sourceHeight = spriteFrame?.height ?? binding.trim?.sourceHeight ?? binding.height;
        const renderedWidth = spriteFrame?.width ?? binding.width;
        const renderedHeight = spriteFrame?.height ?? binding.height;
        const cropX = spriteFrame ? 0 : (binding.trim?.x ?? 0);
        const cropY = spriteFrame ? 0 : (binding.trim?.y ?? 0);
        const anchorOffset = (
          rotation: number,
          scaleX: number,
          scaleY: number
        ): {
          x: number;
          y: number;
        } => {
          const x = ((cropX + renderedWidth / 2) / sourceWidth - binding.pivot.x) * spriteDefinition.width * scaleX;
          const y = (binding.pivot.y - (cropY + renderedHeight / 2) / sourceHeight) * spriteDefinition.height * scaleY;
          const cosine = Math.cos(rotation);
          const sine = Math.sin(rotation);
          return { x: x * cosine - y * sine, y: x * sine + y * cosine };
        };
        const current = anchorOffset(sprite.rotation, sprite.scaleX, sprite.scaleY);
        const previous = anchorOffset(
          sprite.previousRotation ?? sprite.rotation,
          sprite.previousScaleX ?? sprite.scaleX,
          sprite.previousScaleY ?? sprite.scaleY
        );
        sprite.x += current.x;
        sprite.y += current.y;
        sprite.previousX += previous.x;
        sprite.previousY += previous.y;
        sprite.width *= renderedWidth / sourceWidth;
        sprite.height *= renderedHeight / sourceHeight;
      }
      if (spriteFrame) {
        sprite.frame = { ...spriteFrame };
      }
      const tint = visual?.tint ?? authored.tint;
      if (tint) {
        sprite.tint = tint;
      }
      const previousTint = visual?.tint ?? previousAuthored.tint;
      if (previousTint) {
        sprite.previousTint = previousTint;
      }
      if (opacity !== 1 || entity.sprite.opacity !== undefined) {
        sprite.opacity = Math.max(0, Math.min(1, opacity));
      }
      if (previousOpacity !== 1 || entity.sprite.opacity !== undefined) {
        sprite.previousOpacity = Math.max(0, Math.min(1, previousOpacity));
      }
      if (entity.sprite.blend === "additive") {
        sprite.blend = "additive";
      }
      if (entity.sprite.unlit) {
        sprite.unlit = true;
      }
      const facing = entity.sprite.faceMotion;
      const turned = facing !== undefined && state.velocityX !== 0 && state.velocityX < 0 !== (facing === "left");
      if (visual?.flipX ?? (entity.sprite.flipX || turned)) {
        sprite.flipX = true;
      }
      if (document.assets[entity.sprite.assetId]?.sampling === "linear") {
        sprite.sampling = "linear";
      }
      sprites.push(sprite);
    }
    if (entity.tilemap) {
      for (const tile of entity.tilemap.tiles) {
        if (
          Math.abs(state.x + tile.x - cameraX) - tile.width / 2 > cullHalfWidth ||
          Math.abs(state.y + tile.y - cameraY) - tile.height / 2 > cullHalfHeight
        ) {
          continue;
        }
        const item: GameRenderFrame["tiles"][number] = {
          entityId: entity.id,
          assetId: entity.tilemap.assetId,
          x: state.x + tile.x,
          y: state.y + tile.y,
          width: tile.width,
          height: tile.height,
          layer: entity.tilemap.layer
        };
        const tileFrame = tile.frame ?? document.assets[entity.tilemap.assetId]?.frame;
        if (tileFrame) {
          item.frame = { ...tileFrame };
        }
        if (document.assets[entity.tilemap.assetId]?.sampling === "linear") {
          item.sampling = "linear";
        }
        tiles.push(item);
      }
    }
    if (entity.particles) {
      particles.push({ entityId: entity.id, x: state.x, y: state.y, rotation: state.visual?.rotation ?? state.rotation, particles: entity.particles });
    }
    if (entity.light2d && scene.lighting) {
      const light = entity.light2d;
      const x = state.x + (light.offset?.x ?? 0);
      const y = state.y + (light.offset?.y ?? 0);
      if (Math.abs(x - cameraX) - light.radius <= viewHalfWidth && Math.abs(y - cameraY) - light.radius <= viewHalfHeight) {
        entityLights.push({
          x,
          y,
          color: light.color,
          intensity: light.intensity,
          radius: light.radius,
          falloff: light.falloff,
          distance: Math.hypot(x - cameraX, y - cameraY)
        });
      }
    }
  }
  sprites.sort((a, b) => a.layer - b.layer);
  tiles.sort((a, b) => a.layer - b.layer);
  const frame: GameRenderFrame = {
    gameId: document.id,
    fonts: Object.fromEntries(Object.entries(document.assets).filter(([, binding]) => binding.mediaKind === "font")),
    tick,
    width: camera?.width ?? 16,
    height: camera?.height ?? 9,
    pixelsPerUnit: document.pixelsPerUnit,
    camera: {
      x: cameraState?.x ?? 0,
      y: cameraState?.y ?? 0,
      previousX: cameraState?.previousX ?? 0,
      previousY: cameraState?.previousY ?? 0,
      zoom: camera?.zoom ?? 1
    },
    sprites,
    tiles,
    backgrounds: (scene.backgrounds ?? []).map((layer) =>
      document.assets[layer.assetId]?.sampling === "linear" ? { ...layer, sampling: "linear" as const } : layer
    ),
    hud: projectGameplayHud(usesCollectibles(document), score, won, hud)
  };
  if (particles.length > 0) {
    frame.particles = particles;
  }
  if (scene.lighting) {
    // Entity lights follow their entities; the nearest ones fill the slots the scene's fixed lights leave.
    const free = Math.max(0, MAX_LIGHTS - scene.lighting.points.length);
    const moving = entityLights
      .sort((a, b) => a.distance - b.distance)
      .slice(0, free)
      .map(({ distance: _distance, ...point }) => point);
    frame.lighting = moving.length === 0 ? scene.lighting : { ...scene.lighting, points: [...scene.lighting.points, ...moving] };
  }
  return frame;
}
const MAX_LIGHTS = 32;
function usesCollectibles(document: GameDocument): boolean {
  return document.scenes.some((scene) =>
    scene.entities.some((entity) =>
      entity.behaviors.some((behavior) => behavior.kind === "collectible" || behavior.kind === "winWhenCollected")
    )
  );
}
