import { z } from "zod";

const finite = z.number().finite();
const positive = finite.positive();
const vec2 = z.object({ x: finite, y: finite });
const frame = z.object({
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative(),
  width: z.number().int().positive(),
  height: z.number().int().positive()
});

export const gameAssetBinding = z.object({
  assetId: z.string().min(1),
  digest: z.string().min(1),
  mediaKind: z.enum(["image", "audio"]).default("image"),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  frame: frame.optional(),
  pivot: vec2.default({ x: 0.5, y: 0.5 }),
  sampling: z.enum(["nearest", "linear"]).default("nearest"),
  provenance: z.string().optional()
});
export type GameAssetBinding = z.infer<typeof gameAssetBinding>;

export const gameTransform2D = z.object({
  x: finite,
  y: finite,
  rotation: finite.default(0),
  scaleX: positive.default(1),
  scaleY: positive.default(1)
});
export type GameTransform2D = z.infer<typeof gameTransform2D>;

export const gameBehavior = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("movement"), speed: positive, left: z.string(), right: z.string(), up: z.string(), down: z.string() }),
  z.object({ kind: z.literal("patrol"), speed: positive, distance: positive, axis: z.enum(["x", "y"]) }),
  z.object({ kind: z.literal("collectible"), score: z.number().int().positive().default(1) }),
  z.object({ kind: z.literal("health"), maximum: z.number().int().positive() }),
  z.object({ kind: z.literal("trigger"), event: z.string().min(1) }),
  z.object({ kind: z.literal("spawn"), prefabId: z.string().min(1), onEvent: z.string().min(1) }),
  z.object({ kind: z.literal("sceneTransition"), sceneId: z.string().min(1), onEvent: z.string().min(1) }),
  z.object({ kind: z.literal("winWhenCollected"), count: z.number().int().positive() }),
  z.object({ kind: z.literal("script"), source: z.string().min(1).max(16_384), maxCommands: z.number().int().min(1).max(64).default(16), maxTickMs: z.number().int().min(1).max(50).default(8) })
]);
export type GameBehavior = z.infer<typeof gameBehavior>;

export const gameEntity = z.strictObject({
  id: z.string().min(1),
  name: z.string().default(""),
  parentId: z.string().optional(),
  templateOnly: z.boolean().default(false),
  transform2d: gameTransform2D,
  sprite: z.object({ assetId: z.string().min(1), width: positive, height: positive, layer: z.number().int().default(0), frame: frame.optional(), tint: z.string().optional(), opacity: finite.min(0).max(1).optional() }).optional(),
  tilemap: z.object({ assetId: z.string().min(1), tiles: z.array(z.object({ x: finite, y: finite, width: positive, height: positive, frame: frame.optional() })), layer: z.number().int().default(0) }).optional(),
  camera2d: z.object({ zoom: positive.default(1), width: positive, height: positive }).optional(),
  body2d: z.object({ type: z.enum(["static", "kinematic"]), velocity: vec2.default({ x: 0, y: 0 }) }).optional(),
  collider2d: z.object({ width: positive, height: positive, sensor: z.boolean().default(false) }).optional(),
  animator: z.object({ frames: z.array(frame).min(1), ticksPerFrame: z.number().int().positive(), loop: z.boolean().default(true) }).optional(),
  audioSource: z.object({ assetId: z.string().min(1), onEvent: z.string().min(1) }).optional(),
  behaviors: z.array(gameBehavior).default([])
});
export type GameEntity = z.infer<typeof gameEntity>;

export const gameScene = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  entities: z.array(gameEntity)
});
export type GameScene = z.infer<typeof gameScene>;

export const gameDocument = z.strictObject({
  schemaVersion: z.literal(1),
  engineVersion: z.literal("1"),
  id: z.string().min(1),
  revision: z.string().min(1),
  entrySceneId: z.string().min(1),
  pixelsPerUnit: positive,
  tickRate: z.literal(60),
  inputActions: z.array(z.string().min(1)),
  renderEffects: z.array(z.strictObject({ kind: z.literal("brightnessContrast"), brightness: finite.min(-1).max(1), contrast: finite.min(0).max(4), required: z.boolean() })).max(1).optional(),
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
  z.object({ kind: z.literal("contact"), entityId: z.string(), otherId: z.string() }),
  z.object({ kind: z.literal("collected"), entityId: z.string(), byId: z.string(), score: z.number() }),
  z.object({ kind: z.literal("win"), score: z.number() }),
  z.object({ kind: z.literal("audio"), assetId: z.string() }),
  z.object({ kind: z.literal("trigger"), event: z.string(), entityId: z.string() }),
  z.object({ kind: z.literal("sceneTransition"), sceneId: z.string() })
]);
export type GameEvent = z.infer<typeof gameEvent>;

export const gameRenderFrame = z.object({
  tick: z.number().int().nonnegative(),
  width: positive,
  height: positive,
  pixelsPerUnit: positive,
  camera: z.object({ x: finite, y: finite, zoom: positive }),
  sprites: z.array(z.object({ entityId: z.string(), assetId: z.string(), x: finite, y: finite, previousX: finite, previousY: finite, rotation: finite, scaleX: positive, scaleY: positive, width: positive, height: positive, frame: frame.optional(), layer: z.number().int(), tint: z.string().optional(), opacity: finite.min(0).max(1).optional() })),
  tiles: z.array(z.object({ entityId: z.string(), assetId: z.string(), x: finite, y: finite, width: positive, height: positive, frame: frame.optional(), layer: z.number().int(), tint: z.string().optional(), opacity: finite.min(0).max(1).optional() })),
  hud: z.array(z.object({ id: z.string(), text: z.string(), x: finite, y: finite }))
});
export type GameRenderFrame = z.infer<typeof gameRenderFrame>;

export const gameSnapshot = z.object({
  gameRevision: z.string(),
  engineVersion: z.literal("1"),
  sceneId: z.string(),
  tick: z.number().int().nonnegative(),
  rngState: z.number().int().nonnegative(),
  score: z.number().int().nonnegative(),
  won: z.boolean(),
  spawnSequence: z.number().int().nonnegative().default(0),
  pendingEvents: z.array(gameEvent).default([]),
  scriptState: z.record(z.string(), z.json()).default({}),
  entities: z.array(z.object({ id: z.string(), sourceId: z.string().optional(), x: finite, y: finite, previousX: finite, previousY: finite, velocityX: finite, velocityY: finite, active: z.boolean(), health: z.number().int().optional(), patrolOrigin: finite.optional(), patrolDirection: z.union([z.literal(-1), z.literal(1)]).optional() }))
});
export type GameSnapshot = z.infer<typeof gameSnapshot>;
