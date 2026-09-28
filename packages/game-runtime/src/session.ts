import type {
  GameDocument,
  GameEntity,
  GameEvent,
  GameHudLabel,
  GameInputFrame,
  GameRenderFrame,
  GameScene,
  GameSnapshot
} from "@nodetool-ai/protocol";
import { gameSnapshot } from "@nodetool-ai/protocol";
import { advanceGameplayRandom, applyGameplayCommand, claimGameplayContact, finalizeGameplayEntities, initialGameplayState, MAX_GAME_EVENTS_PER_TICK, MAX_GAME_SPAWNED_INSTANCES, projectGameplayHud, queueGameplayBehavior, runGameplayPhases, runGameplayTick, type GameplayQueues } from "./gameplay/lifecycle.js";
import { validateGame } from "./validate.js";
import { evaluateVisual } from "./visual-animation.js";
import { FACE_LEFT, FACE_RIGHT, faceOf, queryTiles, sweepBox, tileCollision, type Box, type SweepHit } from "./physics.js";
import { hasGameScripts, prepareGameScripts, scriptSourceKey, type GameScriptCall, type GameScriptRunner, type GameScriptStats, type GameScriptTouching } from "./scripts.js";

interface EntityState {
  readonly definition: GameEntity;
  readonly sourceId?: string;
  spawnTick: number;
  readonly rotation: number;
  readonly scaleX: number;
  readonly scaleY: number;
  visual?: ScriptVisual;
  x: number;
  y: number;
  previousX: number;
  previousY: number;
  velocityX: number;
  velocityY: number;
  active: boolean;
  health?: number;
  patrolOrigin?: number;
  patrolDirection?: -1 | 1;
  animation?: string;
  animationTick?: number;
}

export interface GameStepResult {
  readonly tick: number;
  readonly events: readonly GameEvent[];
  readonly frame: GameRenderFrame;
  readonly scriptStats?: GameScriptStats;
}

export interface GameInspection {
  readonly tick: number;
  readonly sceneId: string;
  readonly score: number;
  readonly won: boolean;
  readonly entities: readonly GameSnapshot["entities"][number][];
}

export interface GameSession {
  step(input: GameInputFrame): GameStepResult;
  frame(): GameRenderFrame;
  inspect(query?: { entityId?: string }): GameInspection;
  snapshot(): GameSnapshot;
  dispose(): void;
}

export interface GameReplayResult {
  readonly snapshot: GameSnapshot;
  readonly steps: readonly GameStepResult[];
}

function overlaps(a: EntityState, b: EntityState): boolean {
  const ac = a.definition.collider2d;
  const bc = b.definition.collider2d;
  if (!ac || !bc || !a.active || !b.active) {
    return false;
  }
  return Math.abs(a.x - b.x) * 2 < ac.width + bc.width &&
    Math.abs(a.y - b.y) * 2 < ac.height + bc.height;
}

const MAX_EVENTS_PER_TICK = MAX_GAME_EVENTS_PER_TICK;
const MAX_SPAWNED_INSTANCES = MAX_GAME_SPAWNED_INSTANCES;

interface ContactPair {
  readonly entityId: string;
  readonly otherId: string;
  readonly sensor: boolean;
  readonly normalX: number;
  readonly normalY: number;
}

function contactKey(a: string, b: string): string {
  return a < b ? JSON.stringify([a, b]) : JSON.stringify([b, a]);
}

function canCollide(a: EntityState, b: EntityState): boolean {
  const ac = a.definition.collider2d;
  const bc = b.definition.collider2d;
  return Boolean(ac && bc && a.active && b.active &&
    ((ac.mask ?? 0xffffffff) & (bc.category ?? 1)) !== 0 &&
    ((bc.mask ?? 0xffffffff) & (ac.category ?? 1)) !== 0);
}

function colliderBox(state: EntityState): Box | undefined {
  const collider = state.definition.collider2d;
  return collider ? { x: state.x, y: state.y, halfWidth: collider.width / 2, halfHeight: collider.height / 2 } : undefined;
}

/** Sweep one entity's collider through a displacement against another entity's collider. */
function sweepAabb(moving: EntityState, other: EntityState, dx: number, dy: number): SweepHit | undefined {
  const a = colliderBox(moving);
  const b = colliderBox(other);
  if (!a || !b) {
    return undefined;
  }
  return sweepBox(a, b, dx, dy, Boolean(moving.definition.collider2d?.sensor || other.definition.collider2d?.sensor));
}

/** A box that kinematic bodies test against: a non-kinematic collider or one solid tile. */
interface Obstacle {
  readonly owner: EntityState;
  readonly box: Box;
  /** Blocks movement: a static collider or a solid tile. Other colliders only report contact. */
  readonly solid: boolean;
  readonly sensor: boolean;
  readonly oneWay: boolean;
  readonly internal: number;
  readonly category: number;
  readonly mask: number;
}

function obstaclesOf(state: EntityState, minX: number, minY: number, maxX: number, maxY: number, into: Obstacle[]): void {
  const entity = state.definition;
  const collider = entity.collider2d;
  if (collider && Math.abs(state.x - (minX + maxX) / 2) * 2 <= maxX - minX + collider.width &&
    Math.abs(state.y - (minY + maxY) / 2) * 2 <= maxY - minY + collider.height) {
    into.push({ owner: state, box: { x: state.x, y: state.y, halfWidth: collider.width / 2, halfHeight: collider.height / 2 },
      solid: entity.body2d?.type === "static", sensor: collider.sensor, oneWay: collider.oneWay ?? false, internal: 0,
      category: collider.category ?? 1, mask: collider.mask ?? 0xffffffff });
  }
  const tilemap = entity.tilemap;
  if (tilemap && tilemap.tiles.length > 0) {
    for (const tile of queryTiles(tileCollision(tilemap), minX - state.x, minY - state.y, maxX - state.x, maxY - state.y)) {
      into.push({ owner: state, box: { x: state.x + tile.x, y: state.y + tile.y, halfWidth: tile.halfWidth, halfHeight: tile.halfHeight },
        solid: true, sensor: false, oneWay: tile.oneWay, internal: tile.internal,
        category: tilemap.category ?? 1, mask: tilemap.mask ?? 0xffffffff });
    }
  }
}

function canCollideObstacle(state: EntityState, obstacle: Obstacle): boolean {
  const collider = state.definition.collider2d;
  return Boolean(collider && obstacle.owner.active && obstacle.owner !== state &&
    ((collider.mask ?? 0xffffffff) & obstacle.category) !== 0 &&
    (obstacle.mask & (collider.category ?? 1)) !== 0);
}

const TOUCH_EPSILON = 1e-3;
const RIDE_EPSILON = 0.02;

interface ScriptVisual {
  flipX?: boolean;
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
  tint?: string;
  opacity?: number;
}

interface WorldTransform {
  readonly x: number;
  readonly y: number;
  readonly rotation: number;
  readonly scaleX: number;
  readonly scaleY: number;
}

function initialState(entity: GameEntity, world: WorldTransform, spawnTick = 0): EntityState {
  const patrol = entity.behaviors.find((behavior) => behavior.kind === "patrol");
  const state: EntityState = {
    definition: entity,
    ...initialGameplayState(entity, spawnTick),
    x: world.x,
    y: world.y,
    previousX: world.x,
    previousY: world.y,
    rotation: world.rotation,
    scaleX: world.scaleX,
    scaleY: world.scaleY,
    velocityX: entity.body2d?.velocity.x ?? 0,
    velocityY: entity.body2d?.velocity.y ?? 0
  };
  if (patrol?.kind === "patrol") {
    state.patrolOrigin = patrol.axis === "x" ? state.x : state.y;
    state.patrolDirection = 1;
  }
  return state;
}

function initialSceneStates(scene: GameScene, spawnTick = 0): EntityState[] {
  const definitions = new Map(scene.entities.map((entity) => [entity.id, entity]));
  const children = new Map<string, string[]>();
  const queue: string[] = [];
  for (const entity of scene.entities) {
    if (!entity.parentId) {
      queue.push(entity.id);
    } else {
      const siblings = children.get(entity.parentId) ?? [];
      siblings.push(entity.id);
      children.set(entity.parentId, siblings);
    }
  }
  const transforms = new Map<string, WorldTransform>();
  for (let head = 0; head < queue.length; head += 1) {
    const id = queue[head];
    const entity = definitions.get(id);
    if (!entity) continue;
    const local = entity.transform2d;
    const ancestor = entity.parentId ? transforms.get(entity.parentId) : undefined;
    if (!ancestor) {
      const world = { x: local.x, y: local.y, rotation: local.rotation, scaleX: local.scaleX, scaleY: local.scaleY };
      transforms.set(entity.id, world);
    } else {
      const x = local.x * ancestor.scaleX;
      const y = local.y * ancestor.scaleY;
      const cos = Math.cos(ancestor.rotation);
      const sin = Math.sin(ancestor.rotation);
      transforms.set(entity.id, {
        x: ancestor.x + x * cos - y * sin,
        y: ancestor.y + x * sin + y * cos,
        rotation: ancestor.rotation + local.rotation,
        scaleX: ancestor.scaleX * local.scaleX,
        scaleY: ancestor.scaleY * local.scaleY
      });
    }
    for (const childId of children.get(id) ?? []) queue.push(childId);
  }
  return scene.entities.map((entity) => {
    const world = transforms.get(entity.id);
    if (!world) throw new Error(`Missing world transform for ${entity.id}`);
    return initialState(entity, world, spawnTick);
  });
}

/** The animator's current frame: the clip a script selected, or the default frames from spawn. */
function animationFrame(state: EntityState, tick: number): GameRenderFrame["sprites"][number]["frame"] {
  const animator = state.definition.animator;
  if (!animator) return undefined;
  const clip = (state.animation !== undefined ? animator.clips?.[state.animation] : undefined) ?? animator;
  const age = tick - (state.animation !== undefined ? state.animationTick ?? state.spawnTick : state.spawnTick);
  const index = Math.floor(Math.max(0, age) / clip.ticksPerFrame);
  return clip.frames[clip.loop ? index % clip.frames.length : Math.min(index, clip.frames.length - 1)];
}

const MAX_LIGHTS = 32;

function frameFor(document: GameDocument, scene: GameScene, states: readonly EntityState[], tick: number, score: number, won: boolean, hud: ReadonlyMap<string, GameHudLabel>): GameRenderFrame {
  const cameraState = states.find((state) => state.active && state.definition.camera2d);
  const camera = cameraState?.definition.camera2d;
  const sprites: GameRenderFrame["sprites"] = [];
  const tiles: GameRenderFrame["tiles"] = [];
  const cameraX = cameraState?.x ?? 0;
  const cameraY = cameraState?.y ?? 0;
  // Tiles and lights outside the view plus a margin never reach the renderer, so large levels stay cheap.
  const viewHalfWidth = (camera?.width ?? 16) / (2 * (camera?.zoom ?? 1));
  const viewHalfHeight = (camera?.height ?? 9) / (2 * (camera?.zoom ?? 1));
  const cullHalfWidth = viewHalfWidth * 1.5 + 2;
  const cullHalfHeight = viewHalfHeight * 1.5 + 2;
  const entityLights: { x: number; y: number; color: string; intensity: number; radius: number; falloff: number; distance: number }[] = [];
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
      if (document.schemaVersion === 2 && binding) {
        const sourceWidth = spriteFrame?.width ?? binding.trim?.sourceWidth ?? binding.width;
        const sourceHeight = spriteFrame?.height ?? binding.trim?.sourceHeight ?? binding.height;
        const renderedWidth = spriteFrame?.width ?? binding.width;
        const renderedHeight = spriteFrame?.height ?? binding.height;
        const cropX = spriteFrame ? 0 : binding.trim?.x ?? 0;
        const cropY = spriteFrame ? 0 : binding.trim?.y ?? 0;
        const anchorOffset = (rotation: number, scaleX: number, scaleY: number): { x: number; y: number } => {
          const x = ((cropX + renderedWidth / 2) / sourceWidth - binding.pivot.x) * spriteDefinition.width * scaleX;
          const y = (binding.pivot.y - (cropY + renderedHeight / 2) / sourceHeight) * spriteDefinition.height * scaleY;
          const cosine = Math.cos(rotation);
          const sine = Math.sin(rotation);
          return { x: x * cosine - y * sine, y: x * sine + y * cosine };
        };
        const current = anchorOffset(sprite.rotation, sprite.scaleX, sprite.scaleY);
        const previous = anchorOffset(sprite.previousRotation ?? sprite.rotation,
          sprite.previousScaleX ?? sprite.scaleX, sprite.previousScaleY ?? sprite.scaleY);
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
      if (tint) sprite.tint = tint;
      const previousTint = visual?.tint ?? previousAuthored.tint;
      if (previousTint) sprite.previousTint = previousTint;
      if (opacity !== 1 || entity.sprite.opacity !== undefined) sprite.opacity = Math.max(0, Math.min(1, opacity));
      if (previousOpacity !== 1 || entity.sprite.opacity !== undefined) sprite.previousOpacity = Math.max(0, Math.min(1, previousOpacity));
      if (entity.sprite.blend === "additive") sprite.blend = "additive";
      if (entity.sprite.unlit) sprite.unlit = true;
      const facing = entity.sprite.faceMotion;
      const turned = facing !== undefined && state.velocityX !== 0 && (state.velocityX < 0) !== (facing === "left");
      if (visual?.flipX ?? (entity.sprite.flipX || turned)) sprite.flipX = true;
      if (document.assets[entity.sprite.assetId]?.sampling === "linear") sprite.sampling = "linear";
      sprites.push(sprite);
    }
    if (entity.tilemap) {
      for (const tile of entity.tilemap.tiles) {
        if (Math.abs(state.x + tile.x - cameraX) - tile.width / 2 > cullHalfWidth ||
          Math.abs(state.y + tile.y - cameraY) - tile.height / 2 > cullHalfHeight) {
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
        if (document.assets[entity.tilemap.assetId]?.sampling === "linear") item.sampling = "linear";
        tiles.push(item);
      }
    }
    if (entity.light2d && scene.lighting) {
      const light = entity.light2d;
      const x = state.x + (light.offset?.x ?? 0);
      const y = state.y + (light.offset?.y ?? 0);
      if (Math.abs(x - cameraX) - light.radius <= viewHalfWidth && Math.abs(y - cameraY) - light.radius <= viewHalfHeight) {
        entityLights.push({ x, y, color: light.color, intensity: light.intensity, radius: light.radius, falloff: light.falloff,
          distance: Math.hypot(x - cameraX, y - cameraY) });
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
    camera: { x: cameraState?.x ?? 0, y: cameraState?.y ?? 0, previousX: cameraState?.previousX ?? 0, previousY: cameraState?.previousY ?? 0, zoom: camera?.zoom ?? 1 },
    sprites,
    tiles,
    backgrounds: (scene.backgrounds ?? []).map((layer) => document.assets[layer.assetId]?.sampling === "linear" ? { ...layer, sampling: "linear" as const } : layer),
    hud: projectGameplayHud(usesCollectibles(document), score, won, hud)
  };
  if (scene.lighting) {
    // Entity lights follow their entities; the nearest ones fill the slots the scene's fixed lights leave.
    const free = Math.max(0, MAX_LIGHTS - scene.lighting.points.length);
    const moving = entityLights.sort((a, b) => a.distance - b.distance).slice(0, free)
      .map(({ distance: _distance, ...point }) => point);
    frame.lighting = moving.length === 0 ? scene.lighting : { ...scene.lighting, points: [...scene.lighting.points, ...moving] };
  }
  return frame;
}

function usesCollectibles(document: GameDocument): boolean {
  return document.scenes.some((scene) => scene.entities.some((entity) =>
    entity.behaviors.some((behavior) => behavior.kind === "collectible" || behavior.kind === "winWhenCollected")));
}

interface QueuedSpawn {
  readonly prefabId: string;
  readonly x?: number;
  readonly y?: number;
  readonly velocityX?: number;
  readonly velocityY?: number;
}

/** One session owns mutable simulation state. All boundaries remain plain data. */
function createGameSessionWithRunner(value: GameDocument, seed: number, savedSnapshot?: GameSnapshot, eventSink?: (event: GameEvent) => void, scriptRunner?: GameScriptRunner): GameSession {
  const validation = validateGame(value);
  if (!validation.valid || !validation.document) {
    throw new Error(`Invalid game: ${validation.errors.join("; ")}`);
  }
  const document = validation.document;
  if (!Number.isSafeInteger(seed) || seed < 0) {
    throw new Error("Game seed must be a nonnegative safe integer");
  }
  if (hasGameScripts(document) && !scriptRunner) {
    throw new Error("Scripted games require createScriptedGameSession");
  }
  let sceneId = document.entrySceneId;
  const initialScene = document.scenes.find((candidate) => candidate.id === sceneId);
  if (!initialScene) {
    throw new Error(`Missing entry scene ${sceneId}`);
  }
  let scene: GameScene = initialScene;
  let music: GameSnapshot["music"] = scene.music ? {
    voiceId: `scene:${scene.id}:music`, assetId: scene.music.assetId, startTick: 0,
    volume: scene.music.volume, fadeInTicks: scene.music.fadeInTicks, fadeOutTicks: scene.music.fadeOutTicks
  } : null;
  let states = initialSceneStates(scene);
  let tick = 0;
  let score = 0;
  let won = false;
  let rngState = seed >>> 0;
  let spawnSequence = 0;
  let previousEvents: GameEvent[] = [];
  let activeContacts = new Map<string, ContactPair>();
  let scriptState: GameSnapshot["scriptState"] = {};
  let hud = new Map<string, GameHudLabel>();
  let disposed = false;
  let failed = false;

  if (savedSnapshot) {
    const parsed = gameSnapshot.parse(savedSnapshot);
    if (parsed.gameRevision !== document.revision || parsed.engineVersion !== document.engineVersion) {
      throw new Error("Save revision or engine version does not match the game");
    }
    const savedScene = document.scenes.find((candidate) => candidate.id === parsed.sceneId);
    if (!savedScene) {
      throw new Error(`Save refers to missing scene ${parsed.sceneId}`);
    }
    scene = savedScene;
    sceneId = savedScene.id;
    music = parsed.music ?? (savedScene.music ? {
      voiceId: `scene:${savedScene.id}:music`, assetId: savedScene.music.assetId, startTick: parsed.tick,
      volume: savedScene.music.volume, fadeInTicks: savedScene.music.fadeInTicks, fadeOutTicks: savedScene.music.fadeOutTicks
    } : null);
    if (music && (!savedScene.music || music.assetId !== savedScene.music.assetId || music.voiceId !== `scene:${savedScene.id}:music` || music.startTick > parsed.tick)) {
      throw new Error("Save music does not match the scene");
    }
    states = initialSceneStates(savedScene, parsed.tick);
    const byId = new Map(parsed.entities.map((entity) => [entity.id, entity]));
    if (byId.size !== parsed.entities.length || states.some((state) => !byId.has(state.definition.id))) {
      throw new Error("Save entity set does not match the game revision");
    }
    for (const saved of parsed.entities) {
      if (!saved.sourceId) {
        if (!savedScene.entities.some((entity) => entity.id === saved.id)) {
          throw new Error(`Save has unknown entity ${saved.id}`);
        }
        continue;
      }
      const source = savedScene.entities.find((entity) => entity.id === saved.sourceId && entity.templateOnly);
      if (!source) {
        throw new Error(`Save refers to missing spawn template ${saved.sourceId}`);
      }
      const sourceState = states.find((state) => state.definition.id === source.id);
      if (!sourceState) throw new Error(`Missing spawn template state ${source.id}`);
      const spawned = initialState({ ...source, id: saved.id, templateOnly: false }, sourceState, saved.spawnTick ?? 0);
      states.push({ ...spawned, sourceId: source.id });
    }
    for (const state of states) {
      const saved = byId.get(state.definition.id);
      if (!saved) {
        continue;
      }
      state.x = saved.x;
      state.y = saved.y;
      state.previousX = saved.previousX;
      state.previousY = saved.previousY;
      state.velocityX = saved.velocityX;
      state.velocityY = saved.velocityY;
      state.spawnTick = saved.spawnTick ?? 0;
      state.active = saved.active;
      state.health = saved.health;
      state.patrolOrigin = saved.patrolOrigin;
      state.patrolDirection = saved.patrolDirection;
      state.animation = saved.animation;
      state.animationTick = saved.animationTick;
      const visual: ScriptVisual = {};
      if (saved.flipX !== undefined) visual.flipX = saved.flipX;
      if (saved.rotation !== undefined) visual.rotation = saved.rotation;
      if (saved.scaleX !== undefined) visual.scaleX = saved.scaleX;
      if (saved.scaleY !== undefined) visual.scaleY = saved.scaleY;
      if (saved.tint !== undefined) visual.tint = saved.tint;
      if (saved.opacity !== undefined) visual.opacity = saved.opacity;
      state.visual = Object.keys(visual).length > 0 ? visual : undefined;
    }
    tick = parsed.tick;
    score = parsed.score;
    won = parsed.won;
    rngState = parsed.rngState;
    spawnSequence = parsed.spawnSequence;
    previousEvents = structuredClone(parsed.pendingEvents);
    activeContacts = new Map(parsed.activeContacts.map((pair) => [contactKey(pair.entityId, pair.otherId), { ...pair, normalX: 0, normalY: 0 }]));
    scriptState = structuredClone(parsed.scriptState);
    hud = new Map(parsed.hud.map((label) => [label.id, { ...label }]));
  }

  function snapshot(): GameSnapshot {
    if (disposed) {
      throw new Error("Game session is disposed");
    }
    if (failed) {
      throw new Error("Game session stopped after a failed step");
    }
    return {
      gameRevision: document.revision,
      engineVersion: "1",
      sceneId,
      tick,
      rngState,
      score,
      won,
      music: music ? { ...music } : null,
      spawnSequence,
      pendingEvents: structuredClone(previousEvents),
      activeContacts: [...activeContacts.values()].map(({ entityId, otherId, sensor }) => ({ entityId, otherId, sensor })),
      scriptState: structuredClone(scriptState),
      hud: [...hud.values()].map((label) => ({ ...label })),
      entities: states.map((state) => {
        const entity: GameSnapshot["entities"][number] = {
          id: state.definition.id,
          x: state.x,
          y: state.y,
          previousX: state.previousX,
          previousY: state.previousY,
          velocityX: state.velocityX,
          velocityY: state.velocityY,
          active: state.active
        };
        entity.spawnTick = state.spawnTick;
        if (state.sourceId) {
          entity.sourceId = state.sourceId;
        }
        if (state.visual) Object.assign(entity, state.visual);
        if (state.health !== undefined) entity.health = state.health;
        if (state.patrolOrigin !== undefined) entity.patrolOrigin = state.patrolOrigin;
        if (state.patrolDirection !== undefined) entity.patrolDirection = state.patrolDirection;
        if (state.animation !== undefined) entity.animation = state.animation;
        if (state.animationTick !== undefined) entity.animationTick = state.animationTick;
        return entity;
      })
    };
  }

  function isSpawnedId(entityId: string): boolean {
    const separator = entityId.lastIndexOf("#");
    const prefabId = entityId.slice(0, separator);
    return separator > 0 && scene.entities.some((entity) => entity.templateOnly && entity.id === prefabId);
  }

  function gravityScaleOf(state: EntityState): number {
    return scene.gravity && state.definition.body2d?.type === "kinematic" ? state.definition.body2d.gravityScale ?? 1 : 0;
  }

  function obstacleStates(): EntityState[] {
    return states.filter((state) => state.active && state.definition.body2d?.type !== "kinematic" &&
      (state.definition.collider2d !== undefined || (state.definition.tilemap?.tiles.length ?? 0) > 0));
  }

  /** Solid obstacles that could block this body, near its collider grown by a margin. */
  function solidsNear(state: EntityState, margin: number, only?: EntityState): Obstacle[] {
    const box = colliderBox(state);
    if (!box || box && state.definition.collider2d?.sensor) return [];
    const found: Obstacle[] = [];
    for (const other of only ? [only] : obstacleStates()) {
      if (other !== state) {
        obstaclesOf(other, box.x - box.halfWidth - margin, box.y - box.halfHeight - margin,
          box.x + box.halfWidth + margin, box.y + box.halfHeight + margin, found);
      }
    }
    return found.filter((obstacle) => obstacle.solid && !obstacle.sensor && canCollideObstacle(state, obstacle));
  }

  /** Sides of the collider that rest against a solid. A one-way solid supports only from below. */
  function touchingOf(state: EntityState): GameScriptTouching {
    const box = colliderBox(state);
    const touching = { down: false, up: false, left: false, right: false };
    if (!box) return touching;
    for (const obstacle of solidsNear(state, TOUCH_EPSILON)) {
      const o = obstacle.box;
      const overlapX = Math.min(box.x + box.halfWidth, o.x + o.halfWidth) - Math.max(box.x - box.halfWidth, o.x - o.halfWidth);
      const overlapY = Math.min(box.y + box.halfHeight, o.y + o.halfHeight) - Math.max(box.y - box.halfHeight, o.y - o.halfHeight);
      if (overlapX > TOUCH_EPSILON && Math.abs(box.y - box.halfHeight - (o.y + o.halfHeight)) <= TOUCH_EPSILON) touching.down = true;
      if (obstacle.oneWay) continue;
      if (overlapX > TOUCH_EPSILON && Math.abs(box.y + box.halfHeight - (o.y - o.halfHeight)) <= TOUCH_EPSILON) touching.up = true;
      if (overlapY > TOUCH_EPSILON && (obstacle.internal & FACE_RIGHT) === 0 &&
        Math.abs(box.x - box.halfWidth - (o.x + o.halfWidth)) <= TOUCH_EPSILON) touching.left = true;
      if (overlapY > TOUCH_EPSILON && (obstacle.internal & FACE_LEFT) === 0 &&
        Math.abs(box.x + box.halfWidth - (o.x - o.halfWidth)) <= TOUCH_EPSILON) touching.right = true;
    }
    return touching;
  }

  /** Whether the body rests on top of one of the platform's solids. */
  function standsOn(body: EntityState, platform: EntityState): boolean {
    const box = colliderBox(body);
    if (!box) return false;
    return solidsNear(body, RIDE_EPSILON, platform).some(({ box: o }) =>
      Math.min(box.x + box.halfWidth, o.x + o.halfWidth) - Math.max(box.x - box.halfWidth, o.x - o.halfWidth) > TOUCH_EPSILON &&
      Math.abs(box.y - box.halfHeight - (o.y + o.halfHeight)) <= RIDE_EPSILON);
  }

  /** Whether ground continues just past the body's leading edge. */
  function solidBelowAhead(state: EntityState, direction: number): boolean {
    const box = colliderBox(state);
    if (!box) return false;
    const probeX = state.x + direction * (box.halfWidth + 0.05);
    const probeY = state.y - box.halfHeight - 0.1;
    return solidsNear(state, 0.3).some(({ box: o }) => Math.abs(probeX - o.x) <= o.halfWidth && Math.abs(probeY - o.y) <= o.halfHeight);
  }

  function step(input: GameInputFrame): GameStepResult {
    if (disposed) {
      throw new Error("Game session is disposed");
    }
    if (failed) {
      throw new Error("Game session stopped after a failed step");
    }
    const pressed = new Set(input.pressed);
    for (const action of pressed) {
      if (!document.inputActions.includes(action)) {
        throw new Error(`Unknown input action ${action}`);
      }
    }
    return runGameplayTick(({ events, emit }) => {
      const queuedDespawns = new Set<string>();
      const queuedSpawns: QueuedSpawn[] = [];
      const queues: GameplayQueues<QueuedSpawn> = { despawns: queuedDespawns, spawns: queuedSpawns };
      const scriptCalls: GameScriptCall[] = [];
      let scriptStats: GameScriptStats | undefined;
      return runGameplayPhases({
        prepare(): void {
          for (const state of states) {
            state.previousX = state.x;
            state.previousY = state.y;
            if (!state.active) {
              continue;
            }
            const entity = state.definition;
            for (const [index, behavior] of entity.behaviors.entries()) {
              if (behavior.kind === "movement") {
                const dx = Number(pressed.has(behavior.right)) - Number(pressed.has(behavior.left));
                const dy = Number(pressed.has(behavior.up)) - Number(pressed.has(behavior.down));
                const length = Math.hypot(dx, dy) || 1;
                state.velocityX = (dx / length) * behavior.speed;
                state.velocityY = (dy / length) * behavior.speed;
              } else if (behavior.kind === "patrol") {
                const coordinate = behavior.axis === "x" ? state.x : state.y;
                const origin = state.patrolOrigin ?? coordinate;
                // Only travel away from the origin turns the body, so a wall at the limit cannot cancel a turn.
                if ((coordinate - origin) * (state.patrolDirection ?? 1) >= behavior.distance) {
                  state.patrolDirection = state.patrolDirection === 1 ? -1 : 1;
                }
                const speed = behavior.speed * (state.patrolDirection ?? 1);
                // A body under gravity keeps its fall speed while it walks.
                const falls = gravityScaleOf(state) !== 0;
                state.velocityX = behavior.axis === "x" ? speed : falls ? state.velocityX : 0;
                state.velocityY = behavior.axis === "y" ? speed : falls ? state.velocityY : 0;
              } else if (behavior.kind === "script") {
                const sourceKey = scriptSourceKey(scene.id, state.sourceId ?? entity.id, index);
                const stateKey = scriptSourceKey(scene.id, entity.id, index);
                scriptCalls.push({ sourceKey, stateKey, entityId: entity.id, source: state.sourceId ?? entity.id, state: scriptState[stateKey] ?? null,
                  x: state.x, y: state.y, velocityX: state.velocityX, velocityY: state.velocityY,
                  touching: touchingOf(state),
                  maxCommands: behavior.maxCommands, maxTickMs: behavior.maxTickMs });
              } else {
                queueGameplayBehavior(behavior, entity.id, state.spawnTick, tick, previousEvents, queues);
              }
            }
          }
          if (scriptRunner && scriptCalls.length > 0) {
            const world = states
              .filter((state) => state.active && (state.definition.collider2d || state.definition.camera2d))
              .map((state) => ({ id: state.definition.id, source: state.sourceId ?? state.definition.id, x: state.x, y: state.y }));
            const batch = scriptRunner.run(scriptCalls, { tick, pressed: [...pressed], justPressed: input.justPressed, events: previousEvents, world }, rngState);
            const byId = new Map(states.map((state) => [state.definition.id, state]));
            for (const item of batch.results) {
              for (const command of item.commands) {
                if (command.kind === "spawn" && !scene.entities.some((entity) => entity.id === command.prefabId && entity.templateOnly)) {
                  throw new Error(`Game script uses missing prefab ${command.prefabId}`);
                }
                if (command.kind === "sceneTransition" && !document.scenes.some((candidate) => candidate.id === command.sceneId)) {
                  throw new Error(`Game script uses missing scene ${command.sceneId}`);
                }
                if (command.kind === "playAnimation" && !byId.get(item.entityId)?.definition.animator?.clips?.[command.clip]) {
                  throw new Error(`Game script plays missing animation clip ${command.clip} on ${item.entityId}`);
                }
                if (command.kind === "hud" && command.fontId && document.assets[command.fontId]?.mediaKind !== "font") {
                  throw new Error(`Game script uses missing font ${command.fontId}`);
                }
                // A spawned instance can expire in the tick before a script reacts to its contact.
                if (command.kind === "despawn" && !byId.get(command.entityId)?.active && !isSpawnedId(command.entityId)) {
                  throw new Error(`Game script uses missing entity ${command.entityId}`);
                }
              }
            }
            for (const [index, item] of batch.results.entries()) {
              const call = scriptCalls[index];
              scriptState[call.stateKey] = item.state;
              const state = byId.get(item.entityId);
              if (!state) throw new Error(`Game script entity ${item.entityId} disappeared`);
              for (const command of item.commands) {
                if (command.kind === "setVelocity") {
                  state.velocityX = command.x;
                  state.velocityY = command.y;
                } else if (command.kind === "setPosition") {
                  state.x = command.x;
                  state.y = command.y;
                  state.previousX = command.x;
                  state.previousY = command.y;
                } else if (command.kind === "setVisual") {
                  const { kind: _kind, ...visual } = command;
                  state.visual = { ...state.visual, ...visual };
                } else if (command.kind === "playAnimation") {
                  // Replaying the current clip continues it, so scripts can request a clip every tick.
                  if (state.animation !== command.clip) {
                    state.animation = command.clip;
                    state.animationTick = tick + 1;
                  }
                } else {
                  applyGameplayCommand(command, item.entityId, queues, hud, emit);
                }
              }
            }
            rngState = batch.rngState;
            scriptStats = batch.stats;
          }
        },
        advanceSpatial(): Map<string, ContactPair> {
          const dt = 1 / document.tickRate;
          const motionStarts = new Map(states.map((state) => [state.definition.id, { x: state.x, y: state.y }]));
          const currentContacts = new Map<string, ContactPair>();
          const recordContact = (moving: EntityState, other: EntityState, hit: SweepHit): void => {
            const key = contactKey(moving.definition.id, other.definition.id);
            if (!currentContacts.has(key)) {
              if (events.length + currentContacts.size >= MAX_EVENTS_PER_TICK) {
                throw new Error(`Game event limit exceeded (${MAX_EVENTS_PER_TICK} per tick)`);
              }
              currentContacts.set(key, {
                entityId: moving.definition.id,
                otherId: other.definition.id,
                sensor: Boolean(moving.definition.collider2d?.sensor || other.definition.collider2d?.sensor),
                normalX: hit.normalX,
                normalY: hit.normalY
              });
            }
          };
          const kinematic = states.filter((state) => state.active && state.definition.body2d?.type === "kinematic");
          const obstacles = obstacleStates();
          const gravity = scene.gravity;
          if (gravity) {
            for (const state of kinematic) {
              const scale = gravityScaleOf(state);
              state.velocityX += gravity.x * scale * dt;
              state.velocityY += gravity.y * scale * dt;
            }
          }
          // Static bodies with a velocity are moving solids. They move first and carry the bodies that
          // stand on them; a body in the way is pushed out along the motion.
          const carries = new Map<EntityState, { dx: number; dy: number; platform: EntityState }>();
          for (const platform of states) {
            if (!platform.active || platform.definition.body2d?.type !== "static" || platform.velocityX === 0 && platform.velocityY === 0) {
              continue;
            }
            const dx = platform.velocityX * dt;
            const dy = platform.velocityY * dt;
            const riders = kinematic.filter((body) => !carries.has(body) && standsOn(body, platform));
            platform.x += dx;
            platform.y += dy;
            for (const rider of riders) carries.set(rider, { dx, dy, platform });
            for (const body of kinematic) {
              const box = colliderBox(body);
              if (!box || carries.get(body)?.platform === platform || body.definition.collider2d?.sensor) continue;
              const found: Obstacle[] = [];
              obstaclesOf(platform, body.x - box.halfWidth, body.y - box.halfHeight, body.x + box.halfWidth, body.y + box.halfHeight, found);
              for (const obstacle of found) {
                if (!obstacle.solid || obstacle.sensor || obstacle.oneWay || !canCollideObstacle(body, obstacle)) continue;
                const o = obstacle.box;
                if (Math.abs(body.x - o.x) >= box.halfWidth + o.halfWidth - TOUCH_EPSILON ||
                  Math.abs(body.y - o.y) >= box.halfHeight + o.halfHeight - TOUCH_EPSILON) continue;
                if (Math.abs(dy) >= Math.abs(dx)) body.y = o.y + Math.sign(dy) * (o.halfHeight + box.halfHeight);
                else body.x = o.x + Math.sign(dx) * (o.halfWidth + box.halfWidth);
              }
            }
          }
          const moveBody = (state: EntityState, dx: number, dy: number, exclude: EntityState | undefined): { blockedX: number; blockedY: number } => {
            const collider = state.definition.collider2d;
            const blocked = { blockedX: 0, blockedY: 0 };
            if (!collider) return blocked;
            const halfWidth = collider.width / 2;
            const halfHeight = collider.height / 2;
            let remainingX = dx;
            let remainingY = dy;
            for (let pass = 0; pass < 2 && (remainingX !== 0 || remainingY !== 0); pass += 1) {
              const box = { x: state.x, y: state.y, halfWidth, halfHeight };
              const found: Obstacle[] = [];
              const minX = state.x - halfWidth + Math.min(0, remainingX);
              const maxX = state.x + halfWidth + Math.max(0, remainingX);
              const minY = state.y - halfHeight + Math.min(0, remainingY);
              const maxY = state.y + halfHeight + Math.max(0, remainingY);
              for (const other of obstacles) {
                if (other !== state && other !== exclude) obstaclesOf(other, minX, minY, maxX, maxY, found);
              }
              const hits: { obstacle: Obstacle; hit: SweepHit; blocks: boolean }[] = [];
              for (const obstacle of found) {
                if (!canCollideObstacle(state, obstacle)) continue;
                const hit = sweepBox(box, obstacle.box, remainingX, remainingY, obstacle.sensor || collider.sensor);
                if (!hit) continue;
                const blocks = obstacle.solid && !obstacle.sensor && !collider.sensor;
                if (blocks) {
                  // A face shared with a neighboring tile is inside the wall, so it never stops a body.
                  if ((obstacle.internal & faceOf(hit)) !== 0) continue;
                  // A one-way solid stops only a body that falls onto its top from above.
                  if (obstacle.oneWay && !(hit.normalY > 0 && state.y - halfHeight >= obstacle.box.y + obstacle.box.halfHeight - TOUCH_EPSILON)) continue;
                }
                hits.push({ obstacle, hit, blocks });
              }
              hits.sort((a, b) => a.hit.time - b.hit.time ||
                (a.obstacle.owner.definition.id < b.obstacle.owner.definition.id ? -1 : a.obstacle.owner.definition.id > b.obstacle.owner.definition.id ? 1 : 0));
              const solid = hits.find((item) => item.blocks);
              const travel = solid?.hit.time ?? 1;
              for (const { obstacle, hit, blocks } of hits) {
                if (hit.time > travel) {
                  break;
                }
                if (!blocks || obstacle === solid?.obstacle) {
                  recordContact(state, obstacle.owner, hit);
                }
              }
              state.x += remainingX * travel;
              state.y += remainingY * travel;
              if (!solid) {
                break;
              }
              if (solid.hit.normalX !== 0) blocked.blockedX = solid.hit.normalX;
              if (solid.hit.normalY !== 0) blocked.blockedY = solid.hit.normalY;
              remainingX = solid.hit.normalX === 0 ? remainingX * (1 - travel) : 0;
              remainingY = solid.hit.normalY === 0 ? remainingY * (1 - travel) : 0;
            }
            return blocked;
          };
          for (const state of kinematic) {
            if (!state.definition.collider2d) {
              state.x += state.velocityX * dt;
              state.y += state.velocityY * dt;
              continue;
            }
            const carry = carries.get(state);
            if (carry) moveBody(state, carry.dx, carry.dy, carry.platform);
            const { blockedX, blockedY } = moveBody(state, state.velocityX * dt, state.velocityY * dt, undefined);
            // A blocked body loses the velocity that pushed into the solid, so gravity cannot build up while resting.
            if (blockedX * state.velocityX < 0) state.velocityX = 0;
            if (blockedY * state.velocityY < 0) state.velocityY = 0;
            const patrol = state.definition.behaviors.find((behavior) => behavior.kind === "patrol");
            if (patrol?.kind === "patrol" && patrol.axis === "x") {
              const direction = state.patrolDirection ?? 1;
              const ledge = patrol.turnAtLedges && touchingOf(state).down && !solidBelowAhead(state, direction);
              if (blockedX === -direction || ledge) state.patrolDirection = direction === 1 ? -1 : 1;
            }
          }
          for (let index = 0; index < states.length; index += 1) {
            const state = states[index];
            if (!state.active || state.definition.body2d?.type !== "kinematic") {
              continue;
            }
            for (let otherIndex = index + 1; otherIndex < states.length; otherIndex += 1) {
              const other = states[otherIndex];
              if (other.definition.body2d?.type !== "kinematic" || !canCollide(state, other)) {
                continue;
              }
              const stateStart = motionStarts.get(state.definition.id);
              const otherStart = motionStarts.get(other.definition.id);
              if (!stateStart || !otherStart) {
                continue;
              }
              const relativeX = (state.x - stateStart.x) - (other.x - otherStart.x);
              const relativeY = (state.y - stateStart.y) - (other.y - otherStart.y);
              const atStart = { ...state, x: stateStart.x, y: stateStart.y };
              const targetAtStart = { ...other, x: otherStart.x, y: otherStart.y };
              const hit = sweepAabb(atStart, targetAtStart, relativeX, relativeY);
              if (hit) {
                recordContact(state, other, hit);
              }
            }
          }
          const recordTouch = (state: EntityState, other: EntityState, a: Box, b: Box): void => {
            const horizontalGap = Math.abs(a.x - b.x) - (a.halfWidth + b.halfWidth);
            const verticalGap = Math.abs(a.y - b.y) - (a.halfHeight + b.halfHeight);
            const horizontal = horizontalGap >= verticalGap;
            recordContact(state, other, { time: 0, normalX: horizontal ? Math.sign(a.x - b.x) : 0, normalY: horizontal ? 0 : Math.sign(a.y - b.y) });
          };
          for (const state of kinematic) {
            const box = colliderBox(state);
            if (!box) {
              continue;
            }
            for (const other of kinematic) {
              if (state !== other && canCollide(state, other) && overlaps(state, other)) {
                recordTouch(state, other, box, colliderBox(other)!);
              }
            }
            const found: Obstacle[] = [];
            for (const other of obstacles) {
              if (other !== state) obstaclesOf(other, box.x - box.halfWidth, box.y - box.halfHeight, box.x + box.halfWidth, box.y + box.halfHeight, found);
            }
            for (const obstacle of found) {
              if (!canCollideObstacle(state, obstacle)) continue;
              const o = obstacle.box;
              const gapX = Math.abs(box.x - o.x) - (box.halfWidth + o.halfWidth);
              const gapY = Math.abs(box.y - o.y) - (box.halfHeight + o.halfHeight);
              const overlapping = gapX < 0 && gapY < 0;
              const touching = gapX <= 0 && gapY <= 0 && obstacle.solid && !obstacle.sensor;
              if (overlapping || touching) recordTouch(state, obstacle.owner, box, o);
            }
          }
          return currentContacts;
        },
        reduceContacts(currentContacts): void {
          const stateById = new Map(states.map((state) => [state.definition.id, state]));
          for (const [key, pair] of currentContacts) {
            const phase = activeContacts.has(key) ? "stay" : "enter";
            emit({ kind: "contact", entityId: pair.entityId, otherId: pair.otherId, phase, normalX: pair.normalX, normalY: pair.normalY });
            if (phase !== "enter") {
              continue;
            }
            const state = stateById.get(pair.entityId);
            const other = stateById.get(pair.otherId);
            if (!state || !other) {
              continue;
            }
            for (const [actor, target] of [[state, other], [other, state]]) {
              if (actor.definition.body2d?.type !== "kinematic") {
                continue;
              }
              score = claimGameplayContact(actor, target, {
                collects: !actor.definition.collider2d?.sensor, activatesTriggers: true
              }, queues, score, emit);
            }
          }
          for (const [key, pair] of activeContacts) {
            if (!currentContacts.has(key)) {
              emit({ kind: "contact", entityId: pair.entityId, otherId: pair.otherId, phase: "exit", normalX: 0, normalY: 0 });
            }
          }
          activeContacts = currentContacts;
          won = finalizeGameplayEntities(states, queues, score, won, sceneId, tick, events, emit);
        },
        commit(): GameStepResult {
          if (queuedDespawns.size > 0) {
            // Spawned instances leave the world when despawned; authored entities stay as inactive state.
            states = states.filter((state) => {
              if (!state.sourceId || !queuedDespawns.has(state.definition.id)) return true;
              state.definition.behaviors.forEach((behavior, index) => {
                if (behavior.kind === "script") delete scriptState[scriptSourceKey(scene.id, state.definition.id, index)];
              });
              return false;
            });
          }
          if (states.filter((state) => state.sourceId).length + queuedSpawns.length > MAX_SPAWNED_INSTANCES) {
            failed = true;
            throw new Error(`Game spawned instance limit exceeded (${MAX_SPAWNED_INSTANCES})`);
          }
          for (const spawn of queuedSpawns) {
            const prefabId = spawn.prefabId;
            const source = scene.entities.find((entity) => entity.id === prefabId && entity.templateOnly);
            if (!source) {
              throw new Error(`Missing spawn template ${prefabId}`);
            }
            spawnSequence += 1;
            const sourceState = states.find((state) => state.definition.id === source.id);
            if (!sourceState) throw new Error(`Missing spawn template state ${source.id}`);
            const spawned = initialState({ ...source, id: `${prefabId}#${spawnSequence}`, templateOnly: false }, sourceState, tick + 1);
            if (spawn.x !== undefined) spawned.x = spawned.previousX = spawn.x;
            if (spawn.y !== undefined) spawned.y = spawned.previousY = spawn.y;
            if (spawn.velocityX !== undefined) spawned.velocityX = spawn.velocityX;
            if (spawn.velocityY !== undefined) spawned.velocityY = spawn.velocityY;
            states.push({ ...spawned, sourceId: prefabId });
          }
          if (queues.transitionTo) {
            const nextScene = document.scenes.find((candidate) => candidate.id === queues.transitionTo);
            if (!nextScene) {
              throw new Error(`Missing scene ${queues.transitionTo}`);
            }
            scene = nextScene;
            sceneId = nextScene.id;
            music = nextScene.music ? {
              voiceId: `scene:${sceneId}:music`, assetId: nextScene.music.assetId, startTick: tick + 1,
              volume: nextScene.music.volume, fadeInTicks: nextScene.music.fadeInTicks, fadeOutTicks: nextScene.music.fadeOutTicks
            } : null;
            states = initialSceneStates(nextScene, tick + 1);
            activeContacts = new Map();
            spawnSequence = 0;
            scriptState = {};
            hud = new Map();
            emit({ kind: "sceneTransition", sceneId });
          }
          previousEvents = structuredClone(events);
          rngState = advanceGameplayRandom(rngState);
          tick += 1;
          const result: GameStepResult = { tick, events, frame: frameFor(document, scene, states, tick, score, won, hud) };
          if (scriptStats) {
            return { ...result, scriptStats };
          }
          return result;
        }
      });
    }, () => { failed = true; }, eventSink);
  }

  return {
    step,
    frame(): GameRenderFrame {
      if (disposed) {
        throw new Error("Game session is disposed");
      }
      if (failed) {
        throw new Error("Game session stopped after a failed step");
      }
      return frameFor(document, scene, states, tick, score, won, hud);
    },
    inspect(query): GameInspection {
      const current = snapshot();
      return { tick, sceneId, score, won, entities: query?.entityId ? current.entities.filter((entity) => entity.id === query.entityId) : current.entities };
    },
    snapshot,
    dispose(): void {
      disposed = true;
      states = [];
      previousEvents = [];
      scriptRunner?.dispose();
    }
  };
}

export function createGameSession(document: GameDocument, seed: number, savedSnapshot?: GameSnapshot, eventSink?: (event: GameEvent) => void): GameSession {
  return createGameSessionWithRunner(document, seed, savedSnapshot, eventSink);
}

export async function createScriptedGameSession(document: GameDocument, seed: number, savedSnapshot?: GameSnapshot, eventSink?: (event: GameEvent) => void): Promise<GameSession> {
  const validation = validateGame(document);
  if (!validation.valid || !validation.document) throw new Error(`Invalid game: ${validation.errors.join("; ")}`);
  if (!hasGameScripts(validation.document)) return createGameSession(validation.document, seed, savedSnapshot, eventSink);
  const runner = await prepareGameScripts(validation.document);
  try {
    return createGameSessionWithRunner(validation.document, seed, savedSnapshot, eventSink, runner);
  } catch (error) {
    runner.dispose();
    throw error;
  }
}

export async function replayScriptedGame(document: GameDocument, seed: number, inputs: readonly GameInputFrame[], snapshot?: GameSnapshot): Promise<GameReplayResult> {
  const session = await createScriptedGameSession(document, seed, snapshot);
  try {
    const steps = inputs.map((input) => session.step(input));
    return { snapshot: session.snapshot(), steps };
  } finally {
    session.dispose();
  }
}

export function replayGame(document: GameDocument, seed: number, inputs: readonly GameInputFrame[], snapshot?: GameSnapshot): GameReplayResult {
  const session = createGameSession(document, seed, snapshot);
  try {
    const steps = inputs.map((input) => session.step(input));
    return { snapshot: session.snapshot(), steps };
  } finally {
    session.dispose();
  }
}
