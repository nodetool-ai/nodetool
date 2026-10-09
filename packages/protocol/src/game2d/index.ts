import { z } from "zod";
import { gameEntityProps, gameEntityTags } from "../game-entity-metadata.js";
import { gameLightingComponent } from "./components/lighting.js";
import { gameMusicComponent } from "./components/music.js";
import { finite, positive, vec2, frame } from "./components/common.js";
import { gameAssetBinding } from "./components/assets.js";
import { gameTransform2D } from "./components/transform.js";
import { gameBehavior } from "./components/behaviors.js";
import { gameBackgroundLayer } from "./components/background.js";
import { gameEntityComponents } from "./components/entity-components.js";
import { gameParticles } from "../game-particles.js";
import { gameAuthoring } from "../game-authoring.js";
import { gameAudioSettings } from "./components/audio.js";
import { gameInputBindings } from "../game-input.js";

export * from "../game-input.js";

export const gameEntity = z.strictObject({
  id: z.string().min(1),
  name: z.string().default(""),
  parentId: z.string().optional(),
  tags: gameEntityTags.optional(),
  props: gameEntityProps.optional(),
  templateOnly: z.boolean().default(false),
  transform2d: gameTransform2D,
  ...gameEntityComponents,
  behaviors: z.array(gameBehavior).default([])
});

export type GameEntity = z.infer<typeof gameEntity>;

const sceneFields = {
  music: gameMusicComponent,
  lighting: gameLightingComponent,
  gravity: vec2.optional(),
  entities: z.array(gameEntity),
  backgrounds: z.array(gameBackgroundLayer).max(32).optional()
};

export const gameScene = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  ...sceneFields,
});

export type GameScene = z.infer<typeof gameScene>;

export const gameRenderEffect = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("brightnessContrast"), brightness: finite.min(-1).max(1),
    contrast: finite.min(0).max(4), required: z.boolean() }),
  z.strictObject({ kind: z.literal("bloom"), threshold: finite.min(0).max(1).default(0.7),
    softness: finite.min(0).max(0.5).default(0.1), radius: finite.min(0).max(64).default(8),
    intensity: finite.min(0).max(4).default(1), required: z.boolean().default(false) }),
  z.strictObject({ kind: z.literal("lut"), assetId: z.string().min(1), size: z.number().int().min(2).max(32),
    intensity: finite.min(0).max(1).default(1),
    domainMin: z.tuple([finite, finite, finite]).default([0, 0, 0]),
    domainMax: z.tuple([finite, finite, finite]).default([1, 1, 1]),
    required: z.boolean().default(false) })
]);

export type GameRenderEffect = z.infer<typeof gameRenderEffect>;

/**
 * The engine each 2D schema runs on. Schemas 1 and 2 run on engine 1. Schema 4 adds entity
 * tags and props and runs on engine 3. Schema 5 is reserved for Rapier 2D physics on engine 4.
 * Schema 3 is the 3D document and engine 2 is its engine.
 */
export const GAME_2D_ENGINE_BY_SCHEMA = { 1: "1", 2: "1", 4: "3", 5: "4" } as const;

const gameEngineVersion2D = z.enum(["1", "3", "4"]);

export const gameDocument = z.strictObject({
  authoring: gameAuthoring.optional(),
  schemaVersion: z.union([z.literal(1), z.literal(2), z.literal(4), z.literal(5)]),
  engineVersion: gameEngineVersion2D,
  id: z.string().min(1),
  revision: z.string().min(1),
  entrySceneId: z.string().min(1),
  pixelsPerUnit: positive,
  tickRate: z.literal(60),
  inputActions: z.array(z.string().min(1)),
  inputBindings: gameInputBindings.optional(),
  collisionLayers: z.array(z.string().min(1)).max(32).optional(),
  renderEffects: z.array(gameRenderEffect).max(8).optional(),
  hudEffectOrder: z.enum(["beforeEffects", "afterEffects"]).optional(),
  audio: gameAudioSettings.optional(),
  assets: z.record(z.string(), gameAssetBinding),
  scenes: z.array(gameScene).min(1)
});

export type GameDocument = z.infer<typeof gameDocument>;

export const gameInputFrame = z.object({
  pressed: z.array(z.string()),
  justPressed: z.array(z.string()).default([])
});

export type GameInputFrame = z.infer<typeof gameInputFrame>;

export const gameEvent = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("contact"), entityId: z.string(), otherId: z.string(),
    phase: z.enum(["enter", "stay", "exit"]).optional(), normalX: finite.optional(), normalY: finite.optional() }),
  z.object({ kind: z.literal("collected"), entityId: z.string(), byId: z.string(), score: z.number() }),
  z.object({ kind: z.literal("win"), score: z.number() }),
  z.object({ kind: z.literal("audio"), assetId: z.string(), voiceId: z.string().optional(), action: z.enum(["start", "stop"]).default("start"), loop: z.boolean().default(false), volume: finite.min(0).max(1).default(1), fadeInTicks: z.number().int().min(0).max(600).default(0), fadeOutTicks: z.number().int().min(0).max(600).default(0) }),
  z.object({ kind: z.literal("trigger"), event: z.string(), entityId: z.string() }),
  z.object({ kind: z.literal("sceneTransition"), sceneId: z.string() })
]);

export type GameEvent = z.infer<typeof gameEvent>;

export const gameHudLabel = z.object({
  id: z.string(),
  text: z.string(),
  x: finite,
  y: finite,
  size: positive.max(256).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  align: z.enum(["left", "center", "right"]).optional(),
  fontId: z.string().min(1).optional()
});

export type GameHudLabel = z.infer<typeof gameHudLabel>;

export const gameRenderFrame = z.object({
  gameId: z.string().optional(),
  fonts: z.record(z.string(), gameAssetBinding).optional(),
  tick: z.number().int().nonnegative(),
  width: positive,
  height: positive,
  pixelsPerUnit: positive,
  camera: z.object({ x: finite, y: finite, previousX: finite.optional(), previousY: finite.optional(), zoom: positive }),
  sprites: z.array(z.object({ entityId: z.string(), assetId: z.string(), x: finite, y: finite, previousX: finite, previousY: finite, rotation: finite, previousRotation: finite.optional(), scaleX: positive, scaleY: positive, previousScaleX: positive.optional(), previousScaleY: positive.optional(), width: positive, height: positive, frame: frame.optional(), layer: z.number().int(), tint: z.string().optional(), previousTint: z.string().optional(), opacity: finite.min(0).max(1).optional(), previousOpacity: finite.min(0).max(1).optional(), blend: z.enum(["normal", "additive"]).optional(), sampling: z.enum(["nearest", "linear"]).optional(), unlit: z.boolean().optional(), flipX: z.boolean().optional() })),
  backgrounds: z.array(gameBackgroundLayer).optional(),
  lighting: gameScene.shape.lighting,
  tiles: z.array(z.object({ entityId: z.string(), assetId: z.string(), x: finite, y: finite, width: positive, height: positive, frame: frame.optional(), layer: z.number().int(), tint: z.string().optional(), opacity: finite.min(0).max(1).optional(), sampling: z.enum(["nearest", "linear"]).optional() })),
  hud: z.array(gameHudLabel),
  particles: z.array(z.object({ entityId: z.string(), x: finite, y: finite, rotation: finite, particles: gameParticles })).optional()
});

export type GameRenderFrame = z.infer<typeof gameRenderFrame>;

export const gameSnapshot = z.object({
  gameRevision: z.string(),
  engineVersion: gameEngineVersion2D,
  sceneId: z.string(),
  tick: z.number().int().nonnegative(),
  rngState: z.number().int().nonnegative(),
  score: z.number().int().nonnegative(),
  won: z.boolean(),
  music: z.strictObject({ voiceId: z.string(), assetId: z.string(), startTick: z.number().int().nonnegative(), volume: finite.min(0).max(1), fadeInTicks: z.number().int().min(0).max(600), fadeOutTicks: z.number().int().min(0).max(600) }).nullable().default(null),
  spawnSequence: z.number().int().nonnegative().default(0),
  pendingEvents: z.array(gameEvent).default([]),
  activeContacts: z.array(z.strictObject({ entityId: z.string(), otherId: z.string(), sensor: z.boolean() })).default([]),
  scriptState: z.record(z.string(), z.json()).default({}),
  hud: z.array(gameHudLabel).default([]),
  entities: z.array(z.object({ id: z.string(), sourceId: z.string().optional(), spawnTick: z.number().int().nonnegative().optional(),
    rotation: finite.optional(), scaleX: positive.optional(), scaleY: positive.optional(), tint: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(), opacity: finite.min(0).max(1).optional(), flipX: z.boolean().optional(),
    animation: z.string().optional(), animationTick: z.number().int().nonnegative().optional(), x: finite, y: finite, previousX: finite, previousY: finite, velocityX: finite, velocityY: finite, active: z.boolean(), props: gameEntityProps.optional(), health: z.number().int().optional(), patrolOrigin: finite.optional(), patrolDirection: z.union([z.literal(-1), z.literal(1)]).optional() }))
});

export type GameSnapshot = z.infer<typeof gameSnapshot>;

/** A shipped example game as the Examples page lists it. */
export const exampleGameSummary = z.object({
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  controls: z.string(),
  sceneCount: z.number().int().positive(),
  assetCount: z.number().int().nonnegative(),
  posterUri: z.string()
});

export type ExampleGameSummary = z.infer<typeof exampleGameSummary>;

export const installExampleGameInput = z.object({
  slug: z.string(),
  projectId: z.string().min(1),
  name: z.string().min(1).max(200).optional()
});

export { gameSheetPreparation, gameTilesetPreparation, gameLutPreparation, gameImagePreparation, gameAssetBinding, type GameAssetBinding } from "./components/assets.js";

export { gameTransform2D, type GameTransform2D } from "./components/transform.js";

export { gameBehavior, type GameBehavior } from "./components/behaviors.js";

export { gameVisualTrack, type GameVisualTrack } from "./components/visual-animation.js";

export { gameBackgroundLayer, type GameBackgroundLayer } from "./components/background.js";

export { gameEntityPropertyValue, gameEntityProps, gameEntityTags, type GameEntityProps, type GameEntityTags } from "../game-entity-metadata.js";

export { GAME_AUDIO_BUILTIN_BUSES, GAME_AUDIO_BASE_SNAPSHOT, gameAudioBus, type GameAudioBus, gameAudioMixerSnapshot, type GameAudioMixerSnapshot, gameAudioMixerTransition, type GameAudioMixerTransition, gameAudioDucking, type GameAudioDucking, gameAudioMixer, type GameAudioMixer, type GameAudioMixerInput, gameAudioSettings, type GameAudioSettings } from "./components/audio.js";
