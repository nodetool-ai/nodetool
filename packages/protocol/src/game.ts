import { z } from "zod";

const finite = z.number().finite();
const positive = finite.positive();
const uint32 = z.number().int().min(0).max(0xffffffff);
const vec2 = z.strictObject({ x: finite, y: finite });
const frame = z.strictObject({
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative(),
  width: z.number().int().positive(),
  height: z.number().int().positive()
});
const preparation = z.strictObject({
  trimAlpha: z.boolean(),
  targetWidth: z.number().int().positive().optional(),
  targetHeight: z.number().int().positive().optional(),
  cropPolicy: z.enum(["cover", "contain", "stretch"]).optional(),
  mirrorX: z.boolean(),
  mirrorY: z.boolean()
});

export const gameAssetBinding = z.strictObject({
  assetId: z.string().min(1),
  digest: z.string().min(1),
  mediaKind: z.enum(["image", "audio", "font"]).default("image"),
  fontFormat: z.enum(["ttf", "otf"]).optional(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  frame: frame.optional(),
  pivot: z.strictObject({ x: finite.min(0).max(1), y: finite.min(0).max(1) }).default({ x: 0.5, y: 0.5 }),
  sampling: z.enum(["nearest", "linear"]).default("nearest"),
  required: z.boolean().optional(),
  preparation: preparation.optional(),
  originalDimensions: z.strictObject({ width: z.number().int().positive(), height: z.number().int().positive() }).optional(),
  trim: z.strictObject({ sourceWidth: z.number().int().positive(), sourceHeight: z.number().int().positive(), x: z.number().int().nonnegative(), y: z.number().int().nonnegative() }).optional(),
  referenceAssetId: z.string().optional(),
  provenance: z.string().optional()
});
export type GameAssetBinding = z.infer<typeof gameAssetBinding>;

export const gameTransform2D = z.strictObject({
  x: finite,
  y: finite,
  rotation: finite.default(0),
  scaleX: positive.default(1),
  scaleY: positive.default(1)
});
export type GameTransform2D = z.infer<typeof gameTransform2D>;

export const gameBehavior = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("movement"), speed: positive, left: z.string(), right: z.string(), up: z.string(), down: z.string() }),
  z.strictObject({ kind: z.literal("patrol"), speed: positive, distance: positive, axis: z.enum(["x", "y"]) }),
  z.strictObject({ kind: z.literal("collectible"), score: z.number().int().positive().default(1) }),
  z.strictObject({ kind: z.literal("health"), maximum: z.number().int().positive() }),
  z.strictObject({ kind: z.literal("trigger"), event: z.string().min(1) }),
  z.strictObject({ kind: z.literal("spawn"), prefabId: z.string().min(1), onEvent: z.string().min(1) }),
  z.strictObject({ kind: z.literal("sceneTransition"), sceneId: z.string().min(1), onEvent: z.string().min(1) }),
  z.strictObject({ kind: z.literal("winWhenCollected"), count: z.number().int().positive() }),
  z.strictObject({ kind: z.literal("lifetime"), ticks: z.number().int().positive(), fade: z.boolean().default(true), endScale: positive.default(1) }),
  z.strictObject({ kind: z.literal("script"), source: z.string().min(1).max(16_384), maxCommands: z.number().int().min(1).max(64).default(16), maxTickMs: z.number().int().min(1).max(50).default(8) })
]);
export type GameBehavior = z.infer<typeof gameBehavior>;

const visualTiming = { durationTicks: z.number().int().min(1).max(36000), delayTicks: z.number().int().min(0).max(36000).default(0), repeat: z.boolean().default(false), pingPong: z.boolean().default(false), easing: z.enum(["linear", "easeIn", "easeOut", "easeInOut"]).default("linear") };
const numericTrack = (property: "rotation" | "scaleX" | "scaleY" | "opacity") => z.strictObject({ property: z.literal(property), from: finite, to: finite, ...visualTiming });
export const gameVisualTrack = z.discriminatedUnion("property", [
  numericTrack("rotation"), numericTrack("scaleX"), numericTrack("scaleY"), numericTrack("opacity"),
  z.strictObject({ property: z.literal("tint"), from: z.string().regex(/^#[0-9a-fA-F]{6}$/), to: z.string().regex(/^#[0-9a-fA-F]{6}$/), ...visualTiming })
]);
export type GameVisualTrack = z.infer<typeof gameVisualTrack>;

export const gameBackgroundLayer = z.strictObject({
  id: z.string().min(1), assetId: z.string().min(1), width: positive, height: positive,
  layer: z.number().int().default(-100), origin: vec2.default({ x: 0, y: 0 }),
  parallax: z.strictObject({ x: finite.min(0).max(1), y: finite.min(0).max(1) }).default({ x: 1, y: 1 }),
  scrollRate: vec2.default({ x: 0, y: 0 }), mode: z.enum(["none", "repeat", "mirror"]).default("repeat"),
  frame: frame.optional(), sampling: z.enum(["nearest", "linear"]).optional()
});
export type GameBackgroundLayer = z.infer<typeof gameBackgroundLayer>;

export const gameEntity = z.strictObject({
  id: z.string().min(1),
  name: z.string().default(""),
  parentId: z.string().optional(),
  templateOnly: z.boolean().default(false),
  transform2d: gameTransform2D,
  sprite: z.strictObject({ assetId: z.string().min(1), width: positive, height: positive, layer: z.number().int().default(0), frame: frame.optional(), tint: z.string().optional(), opacity: finite.min(0).max(1).optional(), blend: z.enum(["normal", "additive"]).optional(), unlit: z.boolean().optional() }).optional(),
  tilemap: z.strictObject({ assetId: z.string().min(1), tiles: z.array(z.strictObject({ x: finite, y: finite, width: positive, height: positive, frame: frame.optional() })), layer: z.number().int().default(0) }).optional(),
  camera2d: z.strictObject({ zoom: positive.default(1), width: positive, height: positive }).optional(),
  body2d: z.strictObject({ type: z.enum(["static", "kinematic"]), velocity: vec2.default({ x: 0, y: 0 }) }).optional(),
  collider2d: z.strictObject({ width: positive, height: positive, sensor: z.boolean().default(false),
    category: uint32.default(1), mask: uint32.default(0xffffffff) }).optional(),
  animator: z.strictObject({ frames: z.array(frame).min(1), ticksPerFrame: z.number().int().positive(), loop: z.boolean().default(true) }).optional(),
  visualAnimation: z.strictObject({ tracks: z.array(gameVisualTrack).max(5).default([]), rotationRate: finite.optional() }).optional(),
  audioSource: z.strictObject({ assetId: z.string().min(1), onEvent: z.string().min(1), volume: finite.min(0).max(1).default(1) }).optional(),
  behaviors: z.array(gameBehavior).default([])
});
export type GameEntity = z.infer<typeof gameEntity>;

export const gameScene = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  music: z.strictObject({ assetId: z.string().min(1), volume: finite.min(0).max(1).default(1), fadeInTicks: z.number().int().min(0).max(600).default(0), fadeOutTicks: z.number().int().min(0).max(600).default(0) }).optional(),
  lighting: z.strictObject({ required: z.boolean().optional(), ambient: z.strictObject({ color: z.string().regex(/^#[0-9a-fA-F]{6}$/), intensity: finite.min(0).max(1) }),
    points: z.array(z.strictObject({ x: finite, y: finite, color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      intensity: finite.min(0).max(4), radius: positive, falloff: finite.min(0.5).max(4) })).max(32) }).optional(),
  entities: z.array(gameEntity),
  backgrounds: z.array(gameBackgroundLayer).max(32).optional()
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

export const gameDocument = z.strictObject({
  schemaVersion: z.union([z.literal(1), z.literal(2)]),
  engineVersion: z.literal("1"),
  id: z.string().min(1),
  revision: z.string().min(1),
  entrySceneId: z.string().min(1),
  pixelsPerUnit: positive,
  tickRate: z.literal(60),
  inputActions: z.array(z.string().min(1)),
  renderEffects: z.array(gameRenderEffect).max(8).optional(),
  hudEffectOrder: z.enum(["beforeEffects", "afterEffects"]).optional(),
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
  sprites: z.array(z.object({ entityId: z.string(), assetId: z.string(), x: finite, y: finite, previousX: finite, previousY: finite, rotation: finite, previousRotation: finite.optional(), scaleX: positive, scaleY: positive, previousScaleX: positive.optional(), previousScaleY: positive.optional(), width: positive, height: positive, frame: frame.optional(), layer: z.number().int(), tint: z.string().optional(), previousTint: z.string().optional(), opacity: finite.min(0).max(1).optional(), previousOpacity: finite.min(0).max(1).optional(), blend: z.enum(["normal", "additive"]).optional(), sampling: z.enum(["nearest", "linear"]).optional(), unlit: z.boolean().optional() })),
  backgrounds: z.array(gameBackgroundLayer).optional(),
  lighting: gameScene.shape.lighting,
  tiles: z.array(z.object({ entityId: z.string(), assetId: z.string(), x: finite, y: finite, width: positive, height: positive, frame: frame.optional(), layer: z.number().int(), tint: z.string().optional(), opacity: finite.min(0).max(1).optional(), sampling: z.enum(["nearest", "linear"]).optional() })),
  hud: z.array(gameHudLabel)
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
  music: z.strictObject({ voiceId: z.string(), assetId: z.string(), startTick: z.number().int().nonnegative(), volume: finite.min(0).max(1), fadeInTicks: z.number().int().min(0).max(600), fadeOutTicks: z.number().int().min(0).max(600) }).nullable().default(null),
  spawnSequence: z.number().int().nonnegative().default(0),
  pendingEvents: z.array(gameEvent).default([]),
  activeContacts: z.array(z.strictObject({ entityId: z.string(), otherId: z.string(), sensor: z.boolean() })).default([]),
  scriptState: z.record(z.string(), z.json()).default({}),
  hud: z.array(gameHudLabel).default([]),
  entities: z.array(z.object({ id: z.string(), sourceId: z.string().optional(), spawnTick: z.number().int().nonnegative().optional(),
    rotation: finite.optional(), scaleX: positive.optional(), scaleY: positive.optional(), tint: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(), opacity: finite.min(0).max(1).optional(), x: finite, y: finite, previousX: finite, previousY: finite, velocityX: finite, velocityY: finite, active: z.boolean(), health: z.number().int().optional(), patrolOrigin: finite.optional(), patrolDirection: z.union([z.literal(-1), z.literal(1)]).optional() }))
});
export type GameSnapshot = z.infer<typeof gameSnapshot>;
