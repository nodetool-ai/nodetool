import { gameTransform2D } from "./game2d/components/transform.js";
import { gameBody2dComponent } from "./game2d/components/body2d.js";
import { gameCollider2dComponent } from "./game2d/components/collider2d.js";
import { gameSpriteComponent } from "./game2d/components/sprite.js";
import { gameAnimatorComponent } from "./game2d/components/animator.js";
import { gameTilemapComponent } from "./game2d/components/tilemap.js";
import { gameCamera2dComponent } from "./game2d/components/camera2d.js";
import { gameLightingComponent } from "./game2d/components/lighting.js";
import { gameLight2dComponent } from "./game2d/components/light2d.js";
import { gameBackgroundLayer } from "./game2d/components/background.js";
import { z } from "zod";
import { gameUiScriptCommand } from "./game-ui.js";
import { gameCamera3D, gameCameraProjection3D } from "./game3d/components/camera.js";
import { gameAnimator3D } from "./game3d/components/animator.js";
import { gameEmitParticlesCommand } from "./game-particles.js";
import { nativeGameEnvironment3D, nativeGameLight3D, nativeGameMaterial3D, nativeGameDecal3D, nativeGameParticles, nativeGameUiTree, nativeGameUiFrame, nativeGamePresentation, nativeGameParticleSample } from "./native-game-presentation.js";
export * from "./native-game-presentation.js";
import { nativeSaveCommand, nativeLoadCommand, nativeSaveRequest, nativeSaveLoadedFrame } from "./native-game-saves.js";
export * from "./native-game-saves.js";

export const NATIVE_GAME_ENGINE = "native-cpp-1";
export const NATIVE_GAME_SCHEMA_VERSION = 4;
export const nativeGameId = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,127}$/);
export const nativeGameJson = z.json();
const props = z.record(z.string().max(128), nativeGameJson).default({});
export const nativeGameVector = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);
export const nativeGameTransform = z.strictObject({
  position: nativeGameVector.default([0, 0, 0]),
  rotation: z.tuple([z.number().finite(), z.number().finite(), z.number().finite(), z.number().finite()]).default([0, 0, 0, 1]),
  scale: nativeGameVector.default([1, 1, 1])
});
export const nativeGameBody = z.strictObject({
  type: z.enum(["static", "dynamic", "kinematic"]),
  mass: z.number().finite().positive().max(1_000_000).default(1),
  velocity: nativeGameVector.default([0, 0, 0])
});
const positiveDimension = z.number().finite().positive().max(10_000);
export const nativeGameCollider = z.union([
  z.strictObject({
    shape: z.enum(["box", "sphere", "capsule"]),
    halfExtents: z.tuple([positiveDimension, positiveDimension, positiveDimension]).default([0.5, 0.5, 0.5]),
    radius: positiveDimension.default(0.5),
    halfHeight: positiveDimension.default(0.5),
    sensor: z.boolean().default(false),
    layer: z.number().int().min(0).max(15).default(0),
    mask: z.number().int().min(0).max(65_535).default(65_535)
  }),
  z.strictObject({
    shape: z.literal("mesh"),
    vertices: z.array(nativeGameVector).min(3).max(100_000),
    indices: z.array(z.number().int().min(0).max(99_999)).min(3).max(300_000),
    sensor: z.boolean().default(false),
    layer: z.number().int().min(0).max(15).default(0),
    mask: z.number().int().min(0).max(65_535).default(65_535)
  })
]);
export const nativeGameCharacter = z.strictObject({
  speed: z.number().finite().min(0).max(1_000).default(5),
  jumpSpeed: z.number().finite().min(0).max(1_000).default(6),
  maxSlopeDegrees: z.number().finite().min(0).max(89).default(45),
  stepHeight: z.number().finite().min(0).max(10).default(0.3)
});
export const nativeGameGameplay = z.strictObject({
  health: z.number().finite().min(0).max(1_000_000).default(100),
  scoreValue: z.number().finite().min(-1_000_000).max(1_000_000).default(0),
  collectible: z.boolean().default(false),
  lifetimeTicks: z.number().int().min(1).max(1_000_000).optional()
});
const color = z.tuple([z.number().min(0).max(1), z.number().min(0).max(1), z.number().min(0).max(1), z.number().min(0).max(1)]);
export const nativeGameVisual = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("primitive"), shape: z.enum(["box", "sphere", "capsule"]), color: color.default([0.7, 0.7, 0.7, 1]), size: nativeGameVector.default([1, 1, 1]), material: nativeGameMaterial3D.optional(), castShadow: z.boolean().optional(), receiveShadow: z.boolean().optional() }),
  z.strictObject({ kind: z.literal("model"), assetId: nativeGameId, cameraRelative: z.boolean().optional(), castShadow: z.boolean().optional(), receiveShadow: z.boolean().optional() })
]);
export const nativeGameCamera3D = gameCamera3D.extend({ projection: gameCameraProjection3D.options[0].extend({near:z.number().finite().positive().max(1_000_000).default(.1),far:z.number().finite().positive().max(1_000_000_000).default(1000)}), behavior: z.strictObject({kind:z.literal("fixed")}).default({kind:"fixed"}) });
export const nativeGameAnimator3D = gameAnimator3D.omit({graph:true,transitionTicks:true}).extend({ clips: z.record(z.string().min(1).max(64),z.string().regex(/^clip:(0|[1-9][0-9]{0,3})$/)), initialClip: z.string().min(1).max(64) });
export const nativeGame3dVisualOverride = z.strictObject({ rotation: z.tuple([z.number().finite(),z.number().finite(),z.number().finite(),z.number().finite()]) });
const cameraPlanes = { near: z.number().finite().positive().max(1_000_000).optional(), far: z.number().finite().positive().max(1_000_000_000).optional() };
export const nativeGameFixedCamera = z.strictObject({
  position: nativeGameVector.default([6, 5, 8]), target: nativeGameVector.default([0, 0, 0]),
  fov: z.number().finite().min(1).max(179).default(60), up: nativeGameVector.optional(), ...cameraPlanes
}).refine(camera => (camera.near ?? 0.05) < (camera.far ?? 10000), "Camera far plane must exceed near plane");
export const nativeGameFirstPersonCamera = z.strictObject({
  kind: z.literal("firstPerson"), targetId: nativeGameId,
  offset: nativeGameVector.default([0, 0.65, 0]),
  yaw: z.number().finite().min(-1_000_000).max(1_000_000).default(0),
  pitch: z.number().finite().min(-1.55).max(1.55).default(0),
  sensitivity: z.number().finite().min(0).max(1).default(0.002),
  minPitch: z.number().finite().min(-1.55).max(1.55).default(-1.3),
  maxPitch: z.number().finite().min(-1.55).max(1.55).default(1.3),
  fov: z.number().finite().min(1).max(179).default(78),
  near: z.number().finite().positive().max(1_000_000).default(0.03),
  far: z.number().finite().positive().max(1_000_000_000).default(160)
}).refine(camera => camera.near < camera.far && camera.minPitch <= camera.pitch && camera.pitch <= camera.maxPitch, "Invalid first-person camera bounds");
export const nativeGameCamera = z.union([nativeGameFixedCamera, nativeGameFirstPersonCamera]);
export const nativeGameScriptCamera = nativeGameFixedCamera.safeExtend({
  yaw: z.number().finite(), pitch: z.number().finite(), forward: nativeGameVector
});
const hudBounds = z.tuple([z.number().min(0).max(1), z.number().min(0).max(1), z.number().min(0).max(1), z.number().min(0).max(1)]);
export const nativeGameHudWidget = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("text"), id: nativeGameId, bounds: hudBounds, text: z.string().max(4096) }),
  z.strictObject({ kind: z.literal("button"), id: nativeGameId, bounds: hudBounds, text: z.string().max(256), action: nativeGameId })
]);
export const nativeGameBehavior = z.strictObject({
  id: nativeGameId,
  scriptId: nativeGameId,
  props,
  maxCommands: z.number().int().min(1).max(1024).default(128),
  maxTickMs: z.number().finite().positive().max(20).default(20),
  maxStateBytes: z.number().int().min(1).max(1_048_576).default(65_536),
  maxTimers: z.number().int().min(0).max(128).default(32)
});
export const nativeGamePrefabOverride = z.strictObject({
  entityId: nativeGameId,
  name: z.string().max(256).optional(),
  transform: nativeGameTransform.optional(),
  props: z.record(z.string().max(128), nativeGameJson).optional(),
  behaviors: z.array(nativeGameBehavior).max(128).optional(),
  assetIds: z.array(nativeGameId).max(128).optional()
});
export const nativeGameEntity = z.strictObject({
  id: nativeGameId,
  name: z.string().max(256).default("Entity"),
  parentId: nativeGameId.optional(),
  prefabId: nativeGameId.optional(),
  prefabOverrides: z.array(nativeGamePrefabOverride).max(10_000).default([]),
  body: nativeGameBody.optional(),
  collider: nativeGameCollider.optional(),
  character: nativeGameCharacter.optional(),
  gameplay: nativeGameGameplay.optional(),
  visual: nativeGameVisual.optional(),
  camera3d: nativeGameCamera3D.optional(), animator3d: nativeGameAnimator3D.optional(),
  light3d: nativeGameLight3D.optional(), decal3d: nativeGameDecal3D.optional(), particles: nativeGameParticles.optional(),
  transform: nativeGameTransform.default({ position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] }),
  props,
  assetIds: z.array(nativeGameId).max(128).default([]),
  behaviors: z.array(nativeGameBehavior).max(128).default([])
});
const target = { entityId: nativeGameId.optional() };
export const nativeGameScriptCommand = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("spawn"), entity: nativeGameEntity }),
  z.strictObject({ kind: z.literal("despawn"), ...target }),
  z.strictObject({ kind: z.literal("setPosition"), ...target, position: nativeGameVector }),
  z.strictObject({ kind: z.literal("setVelocity"), ...target, velocity: nativeGameVector }),
  z.strictObject({ kind: z.literal("applyImpulse"), ...target, impulse: nativeGameVector }),
  z.strictObject({ kind: z.literal("move"), ...target, direction: nativeGameVector, jump: z.boolean().optional() }),
  z.strictObject({ kind: z.literal("emit"), name: nativeGameId, data: nativeGameJson.optional(), ...target }),
  z.strictObject({ kind: z.literal("query"), queryId: nativeGameId, origin: nativeGameVector, direction: nativeGameVector, maxDistance: z.number().finite().positive().max(1_000_000) }),
  z.strictObject({ kind: z.literal("score"), amount: z.number().finite().min(-1_000_000).max(1_000_000) }),
  z.strictObject({ kind: z.literal("health"), ...target, amount: z.number().finite().min(-1_000_000).max(1_000_000) }),
  z.strictObject({ kind: z.literal("transition"), sceneId: nativeGameId }),
  z.strictObject({ kind: z.literal("audio"), id: nativeGameId.optional(), assetId: nativeGameId, ...target, volume: z.number().finite().min(0).max(1).default(1), loop: z.boolean().default(false), bus: nativeGameId.default("sfx"), music: z.boolean().default(false), position: nativeGameVector.optional() }),
  z.strictObject({ kind: z.literal("stopAudio"), voiceId: nativeGameId }),
  z.strictObject({ kind: z.literal("particles"), ...target, count: z.number().int().min(1).max(4096), position: nativeGameVector.optional() }),
  nativeSaveCommand, nativeLoadCommand, gameUiScriptCommand, gameEmitParticlesCommand.extend(target), z.strictObject({ kind: z.literal("setVisual"), ...target, rotation: nativeGame3dVisualOverride.shape.rotation })
]);
export type NativeGameScriptCommand = z.infer<typeof nativeGameScriptCommand>;
export const nativeGameScene = z.strictObject({
  id: nativeGameId,
  name: z.string().max(256).default("Scene"),
  environment: nativeGameEnvironment3D.optional(), activeCameraId: nativeGameId.optional(),
  entities: z.array(nativeGameEntity).max(100_000).default([])
});
export const nativeGamePrefab = z.strictObject({
  id: nativeGameId,
  name: z.string().max(256).default("Prefab"),
  entities: z.array(nativeGameEntity).min(1).max(10_000)
});
export const nativeGameScript = z.strictObject({
  id: nativeGameId,
  source: z.string().max(1_048_576),
  stateVersion: z.number().int().min(1).max(1_000_000).default(1)
});
export const nativeGameAsset = z.strictObject({
  id: nativeGameId,
  kind: z.enum(["model", "image", "audio", "font", "collider", "buffer"]),
  digest: z.string().regex(/^[a-f0-9]{64}$/),
  path: z.string().min(1).max(4096),
  size: z.number().int().min(0).max(2_147_483_647),
  dependencies: z.array(nativeGameId).max(1024).default([]),
  importSettings: z.strictObject({
    maxVertices: z.number().int().min(1).max(1_000_000).default(100_000),
    maxIndices: z.number().int().min(1).max(3_000_000).default(300_000),
    maxNodes: z.number().int().min(1).max(10_000).default(1_000)
  }).optional()
});
export const nativeGameInputAction = z.strictObject({
  id: nativeGameId,
  bindings: z.array(z.string().min(1).max(128)).max(32).default([])
});
export const nativeGame3dDocument = z.strictObject({
  schemaVersion: z.literal(NATIVE_GAME_SCHEMA_VERSION),
  engine: z.literal(NATIVE_GAME_ENGINE),
  dimension: z.literal("3d"),
  id: nativeGameId,
  title: z.string().min(1).max(256),
  revision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(0),
  initialSceneId: nativeGameId,
  scenes: z.array(nativeGameScene).min(1).max(1024),
  prefabs: z.array(nativeGamePrefab).max(10_000).default([]),
  scripts: z.array(nativeGameScript).max(10_000).default([]),
  assets: z.array(nativeGameAsset).max(100_000).default([]),
  inputActions: z.array(nativeGameInputAction).max(256).default([]),
  camera: nativeGameCamera.optional(),
  presentation: nativeGamePresentation.optional(), ui: nativeGameUiTree.optional(),
  hud: z.array(nativeGameHudWidget).max(256).default([])
});
export type NativeGame3dDocument = z.infer<typeof nativeGame3dDocument>;
/** Native 2D uses world units, Y-up, radians, and world units per second. */
export const NATIVE_GAME_2D_SCHEMA_VERSION = 5;
export const nativeGame2dVector = z.strictObject({ x: z.number().finite(), y: z.number().finite() });
export const nativeGame2dTransform = gameTransform2D.extend({ x: z.number().finite().default(0), y: z.number().finite().default(0) });
export const nativeGame2dPrefabOverride = nativeGamePrefabOverride.extend({ transform: nativeGame2dTransform.optional() });
export const nativeGame2dEntity = z.strictObject({
  id: nativeGameId,
  name: z.string().max(256).default("Entity"),
  parentId: nativeGameId.optional(),
  prefabId: nativeGameId.optional(),
  prefabOverrides: z.array(nativeGame2dPrefabOverride).max(10_000).default([]),
  transform: nativeGame2dTransform.default({ x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 }),
  body2d: gameBody2dComponent,
  collider2d: gameCollider2dComponent,
  sprite: gameSpriteComponent,
  animator: gameAnimatorComponent,
  tilemap: gameTilemapComponent,
  camera2d: gameCamera2dComponent,
  light2d: gameLight2dComponent,
  gameplay: nativeGameGameplay.optional(),
  props,
  assetIds: z.array(nativeGameId).max(128).default([]),
  behaviors: z.array(nativeGameBehavior).max(128).default([])
});
export const nativeGame2dScene = nativeGameScene.omit({ environment: true, activeCameraId: true }).extend({
  entities: z.array(nativeGame2dEntity).max(20_000).default([]),
  gravity: nativeGame2dVector.optional(),
  lighting: gameLightingComponent,
  backgrounds: z.array(gameBackgroundLayer).max(128).optional()
});
export const nativeGame2dPrefab = nativeGamePrefab.extend({ entities: z.array(nativeGame2dEntity).min(1).max(10_000) });
export const nativeGame2dAsset = nativeGameAsset.extend({
  sampling: z.enum(["nearest", "linear"]).optional(),
  pivot: z.strictObject({ x: z.number().finite().min(0).max(1), y: z.number().finite().min(0).max(1) }).optional(),
  trim: z.strictObject({ sourceWidth: z.number().int().positive(), sourceHeight: z.number().int().positive(), x: z.number().int().nonnegative(), y: z.number().int().nonnegative() }).optional(),
});
export const nativeGame2dDocument = nativeGame3dDocument.omit({ camera: true, presentation: true, ui: true }).extend({
  schemaVersion: z.literal(NATIVE_GAME_2D_SCHEMA_VERSION),
  dimension: z.literal("2d"),
  scenes: z.array(nativeGame2dScene).min(1).max(1024),
  prefabs: z.array(nativeGame2dPrefab).max(10_000).default([]),
  gravity: nativeGame2dVector.default({ x: 0, y: -9.81 }),
  healthEntityId: nativeGameId.optional(),
  assets: z.array(nativeGame2dAsset).max(100_000).default([]),
  camera2d: gameCamera2dComponent,
  lighting: gameLightingComponent,
  backgrounds: z.array(gameBackgroundLayer).max(128).default([])
});
export type NativeGame2dDocument = z.infer<typeof nativeGame2dDocument>;
export type NativeGame2dEntity = z.infer<typeof nativeGame2dEntity>;
export const nativeGameDocument = z.discriminatedUnion("dimension", [nativeGame3dDocument, nativeGame2dDocument]);
export type NativeGameDocument = z.infer<typeof nativeGameDocument>;
export type NativeGameEntity = z.infer<typeof nativeGameEntity>;
export const nativeGameOperation = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("addScene"), scene: nativeGameScene }),
  z.strictObject({ kind: z.literal("removeScene"), sceneId: nativeGameId }),
  z.strictObject({ kind: z.literal("addEntity"), sceneId: nativeGameId, entity: nativeGameEntity }),
  z.strictObject({ kind: z.literal("updateEntity"), sceneId: nativeGameId, entity: nativeGameEntity }),
  z.strictObject({ kind: z.literal("removeEntity"), sceneId: nativeGameId, entityId: nativeGameId }),
  z.strictObject({ kind: z.literal("cloneEntity"), sceneId: nativeGameId, entityId: nativeGameId, newId: nativeGameId }),
  z.strictObject({ kind: z.literal("addPrefab"), prefab: nativeGamePrefab }),
  z.strictObject({ kind: z.literal("removePrefab"), prefabId: nativeGameId }),
  z.strictObject({ kind: z.literal("setScript"), script: nativeGameScript }),
  z.strictObject({ kind: z.literal("removeScript"), scriptId: nativeGameId }),
  z.strictObject({ kind: z.literal("setAsset"), asset: nativeGameAsset }),
  z.strictObject({ kind: z.literal("removeAsset"), assetId: nativeGameId }),
  z.strictObject({ kind: z.literal("setInputActions"), inputActions: z.array(nativeGameInputAction).max(256) }),
  z.strictObject({ kind: z.literal("setTitle"), title: z.string().min(1).max(256) }),
  z.strictObject({ kind: z.literal("replaceDocument"), document: nativeGame3dDocument })
]);
export const nativeGameTransaction = z.strictObject({
  requestId: nativeGameId,
  expectedRevision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  operations: z.array(nativeGameOperation).min(1).max(1024)
});
export type NativeGameTransaction = z.infer<typeof nativeGameTransaction>;
export type NativeGameOperation = z.infer<typeof nativeGameOperation>;
export const nativeGame2dVisualOverride = gameSpriteComponent.unwrap().pick({ frame: true, tint: true, opacity: true, flipX: true }).extend({
  rotation: z.number().finite().optional(),
  scaleX: z.number().finite().positive().optional(),
  scaleY: z.number().finite().positive().optional()
});
export const nativeGame2dScriptCommand = z.discriminatedUnion("kind", [
  nativeGameScriptCommand.options[1],nativeGameScriptCommand.options[6],nativeGameScriptCommand.options[8],nativeGameScriptCommand.options[9],nativeGameScriptCommand.options[10],nativeGameScriptCommand.options[12],
  z.strictObject({ kind: z.literal("spawn"), entity: nativeGame2dEntity }),
  z.strictObject({ kind: z.literal("playAnimation"), ...target, clip: nativeGameId }),
  z.strictObject({ kind: z.literal("setVisual"), ...target, visual: nativeGame2dVisualOverride }),
  z.strictObject({ kind: z.literal("setPosition"), ...target, position: nativeGame2dVector }),
  z.strictObject({ kind: z.literal("setVelocity"), ...target, velocity: nativeGame2dVector }),
  z.strictObject({ kind: z.literal("move"), ...target, direction: nativeGame2dVector }),
  z.strictObject({ kind: z.literal("query"), queryId: nativeGameId, origin: nativeGame2dVector, direction: nativeGame2dVector, maxDistance: z.number().finite().positive().max(1_000_000) }),
  z.strictObject({ kind: z.literal("audio"), id: nativeGameId.optional(), assetId: nativeGameId, ...target, volume: z.number().finite().min(0).max(1).default(1), loop: z.boolean().default(false), bus: nativeGameId.default("sfx"), music: z.boolean().default(false), position: nativeGame2dVector.optional() }),
  z.strictObject({ kind: z.literal("particles"), ...target, count: z.number().int().min(1).max(4096), position: nativeGame2dVector.optional() }),
  nativeSaveCommand, nativeLoadCommand
]);
export function nativeGameScriptCommandForDimension(dimension: "2d" | "3d"): typeof nativeGame2dScriptCommand | typeof nativeGameScriptCommand {
  return dimension === "2d" ? nativeGame2dScriptCommand : nativeGameScriptCommand;
}
export type NativeGame2dScriptCommand = z.infer<typeof nativeGame2dScriptCommand>;
export const nativeGame2dOperation = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("setAsset"), asset: nativeGame2dAsset }),
  nativeGameOperation.options[1],nativeGameOperation.options[4],nativeGameOperation.options[5],nativeGameOperation.options[7],nativeGameOperation.options[8],nativeGameOperation.options[9],nativeGameOperation.options[11],nativeGameOperation.options[12],nativeGameOperation.options[13],
  z.strictObject({ kind: z.literal("addScene"), scene: nativeGame2dScene }),
  z.strictObject({ kind: z.literal("addEntity"), sceneId: nativeGameId, entity: nativeGame2dEntity }),
  z.strictObject({ kind: z.literal("updateEntity"), sceneId: nativeGameId, entity: nativeGame2dEntity }),
  z.strictObject({ kind: z.literal("addPrefab"), prefab: nativeGame2dPrefab }),
  z.strictObject({ kind: z.literal("replaceDocument"), document: nativeGame2dDocument })
]);
export const nativeGame2dTransaction = nativeGameTransaction.extend({ operations: z.array(nativeGame2dOperation).min(1).max(1024) });
export type NativeGame2dTransaction = z.infer<typeof nativeGame2dTransaction>;
export type NativeGame2dOperation = z.infer<typeof nativeGame2dOperation>;
/** Select before parsing so bare entities receive defaults for the owning document. */
export function nativeGameTransactionForDimension(dimension: "2d" | "3d"): typeof nativeGame2dTransaction | typeof nativeGameTransaction {
  return dimension === "2d" ? nativeGame2dTransaction : nativeGameTransaction;
}
export function nativeGame2dTransactionJsonSchema(): z.core.JSONSchema.JSONSchema { return exportNativeSchema(nativeGame2dTransaction); }
export function nativeGame2dScriptCommandJsonSchema(): z.core.JSONSchema.JSONSchema { return exportNativeSchema(nativeGame2dScriptCommand); }
export function exportNativeSchema(schema: z.ZodType): z.core.JSONSchema.JSONSchema {
  return z.toJSONSchema(schema, {
    target: "draft-2020-12",
    override: ({ zodSchema, jsonSchema }) => {
      // Zod emits prefixItems without the fixed tuple bounds. All native tuples are fixed-size.
      if (zodSchema instanceof z.ZodTuple && Array.isArray(jsonSchema.prefixItems)) {
        jsonSchema.minItems = jsonSchema.prefixItems.length;
        jsonSchema.maxItems = jsonSchema.prefixItems.length;
        jsonSchema.items = false;
      }
    }
  });
}
export function nativeGameDocumentJsonSchema(): z.core.JSONSchema.JSONSchema {
  return exportNativeSchema(nativeGameDocument);
}
export function nativeGameTransactionJsonSchema(): z.core.JSONSchema.JSONSchema {
  return exportNativeSchema(nativeGameTransaction);
}

export function nativeGameScriptCommandJsonSchema(): z.core.JSONSchema.JSONSchema {
  return exportNativeSchema(nativeGameScriptCommand);
}

const runtimeTick = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const runtimeEntityFields = { grounded: z.boolean().optional(), runtimeAge: runtimeTick.optional(), spawnTick: runtimeTick.optional() };
export type NativeFrameEntity3D = z.infer<typeof nativeFrameEntity3D>;
export type NativeFrameEntity2D = z.infer<typeof nativeFrameEntity2D>;
export const nativeFrameEntity3D = nativeGameEntity.extend({ ...runtimeEntityFields, velocity: nativeGameVector.optional(), visualOverride: nativeGame3dVisualOverride.optional(), visual: z.discriminatedUnion("kind", [nativeGameVisual.options[0],nativeGameVisual.options[1].extend({animation:z.number().int().min(0).max(9999).optional(),animationTime:z.number().finite().nonnegative().optional(),animationLoop:z.boolean().optional()})]).optional() });
export const nativeFrameEntity2D = nativeGame2dEntity.extend({ ...runtimeEntityFields, velocity: nativeGame2dVector.optional(), touching: z.strictObject({ up: z.boolean(), down: z.boolean(), left: z.boolean(), right: z.boolean() }).optional(), animation: nativeGameId.optional(), animationTick: runtimeTick.optional(), visualOverride: nativeGame2dVisualOverride.optional() });
export const nativeGameEvent = z.union([
  z.strictObject({ a: nativeGameId, b: nativeGameId, sensor: z.boolean(), phase: z.enum(["enter", "stay", "exit"]), normalX: z.number().finite().optional(), normalY: z.number().finite().optional() }),
  z.strictObject({ kind: z.literal("emit"), name: nativeGameId, data: nativeGameJson.optional(), entityId: nativeGameId.optional() }),
  z.strictObject({ kind: z.literal("collected"), entityId: nativeGameId }),
  z.strictObject({ kind: z.literal("sceneEnter"), sceneId: nativeGameId })
]);
export type NativeGameEvent = z.infer<typeof nativeGameEvent>;
const outputIdentity = { generation: runtimeTick, tick: runtimeTick, id: z.string().max(256), entityId: nativeGameId.optional() };
const presentationPosition = z.union([nativeGameVector, nativeGame2dVector]);
export const nativePresentationEvent = z.union([
  z.strictObject({ ...outputIdentity, presentationType: z.literal("emitter"), kind: z.literal("particles"), emitter: z.string().min(1).max(64).optional(), count: z.number().int().min(1).max(1024).optional() }),
  z.strictObject({ ...outputIdentity, presentationType: z.literal("audio"), kind: z.literal("play"), assetId: nativeGameId, volume: z.number().finite().min(0).max(1), loop: z.boolean(), bus: nativeGameId, music: z.boolean(), position: presentationPosition.optional(), startTick: runtimeTick.optional() }),
  z.strictObject({ ...outputIdentity, presentationType: z.literal("audio"), kind: z.literal("stop"), voiceId: nativeGameId }),
  z.strictObject({ ...outputIdentity, presentationType: z.literal("particles"), kind: z.literal("emit"), count: z.number().int().min(1).max(4096), position: presentationPosition.optional() })
]);
export type NativePresentationEvent = z.infer<typeof nativePresentationEvent>;
const queryResult = z.strictObject({ queryId: nativeGameId, ownerId: nativeGameId, hit: z.boolean(), entityId: nativeGameId.optional(), fraction: z.number().finite().min(0).max(1).optional(), position: presentationPosition.optional(), normal: nativeGameVector.optional() });
const frameBase = {
  tick: runtimeTick, generation: runtimeTick, sceneId: nativeGameId,
  events: z.array(nativeGameEvent).max(4096), presentationEvents: z.array(nativePresentationEvent).max(8192),
  hostRequests: z.array(nativeSaveRequest).max(4), queryResults: z.array(queryResult).max(8192),
  music: z.array(nativePresentationEvent).max(128), score: z.number().finite(), health: z.number().finite(),
  logs: z.array(z.strictObject({ entityId: nativeGameId, behaviorId: nativeGameId, tick: runtimeTick, message: z.string().max(65536) })).max(256),
  hud: z.array(nativeGameHudWidget).max(256)
};
export const nativeFrameBase = z.strictObject(frameBase);
export type NativeFrameBase = z.infer<typeof nativeFrameBase>;
export const nativeFrame2D = z.strictObject({ ...frameBase, dimension: z.literal("2d"), authoredOrder: z.record(nativeGameId, runtimeTick), worldTransforms: z.record(nativeGameId, nativeGame2dTransform), entities: z.array(nativeFrameEntity2D).max(20_000), camera: gameCamera2dComponent.unwrap().extend({ x: z.number().finite(), y: z.number().finite() }), lighting: gameLightingComponent.unwrap().or(z.strictObject({})), backgrounds: z.array(gameBackgroundLayer).max(128) });
export const nativeFrame3D = z.strictObject({ ...frameBase, dimension: z.literal("3d"), environment: nativeGameEnvironment3D.optional(), presentation: nativeGamePresentation.optional(), ui: nativeGameUiFrame.optional(), particles: z.array(nativeGameParticleSample).max(8192).default([]), authoredOrder: z.record(nativeGameId, runtimeTick).default({}), worldTransforms: z.record(nativeGameId,nativeGameTransform).default({}), entities: z.array(nativeFrameEntity3D).max(20_000), camera: nativeGameFixedCamera.or(z.strictObject({})), lighting: z.strictObject({}), backgrounds: z.array(gameBackgroundLayer).max(0) });
export const nativeFrame = z.discriminatedUnion("dimension", [nativeFrame2D, nativeFrame3D]);
export type NativeFrame2D = z.infer<typeof nativeFrame2D>;
export type NativeFrame3D = z.infer<typeof nativeFrame3D>;
export type NativeFrame = z.infer<typeof nativeFrame>;
export const nativeRuntimeInput = z.record(z.string(), nativeGameJson).superRefine((input, context) => {
  if (new TextEncoder().encode(JSON.stringify(input)).byteLength > 65536) { context.addIssue({ code: "custom", message: "Input exceeds 65536 bytes" }); }
  if (input.loaded !== undefined && !nativeSaveLoadedFrame.safeParse(input.loaded).success) { context.addIssue({ code: "custom", message: "Invalid loaded save results" }); }
  if (input.look !== undefined && !z.strictObject({ x: z.number().finite().min(-1_000_000).max(1_000_000), y: z.number().finite().min(-1_000_000).max(1_000_000) }).safeParse(input.look).success) { context.addIssue({ code: "custom", message: "Invalid look input" }); }
});
const matrix16 = z.tuple([z.number().finite(), z.number().finite(), z.number().finite(), z.number().finite(), z.number().finite(), z.number().finite(), z.number().finite(), z.number().finite(), z.number().finite(), z.number().finite(), z.number().finite(), z.number().finite(), z.number().finite(), z.number().finite(), z.number().finite(), z.number().finite()]);
const nativeTextureSampler = z.strictObject({ wrapS: z.union([z.literal(33071),z.literal(33648),z.literal(10497)]).default(10497), wrapT: z.union([z.literal(33071),z.literal(33648),z.literal(10497)]).default(10497), magFilter: z.union([z.literal(9728),z.literal(9729)]).default(9729), minFilter: z.union([z.literal(9728),z.literal(9729),z.literal(9984),z.literal(9985),z.literal(9986),z.literal(9987)]).default(9987) });
const vector4 = z.tuple([z.number().finite(), z.number().finite(), z.number().finite(), z.number().finite()]);
export const NATIVE_PREPARED_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
/** Encoded PNG/JPEG bytes within one declared, verified manifest asset. */
export const nativePreparedImageSource = z.strictObject({
  assetId: nativeGameId,
  offset: z.number().int().min(0).max(NATIVE_PREPARED_IMAGE_MAX_BYTES - 1),
  length: z.number().int().min(1).max(NATIVE_PREPARED_IMAGE_MAX_BYTES),
  digest: z.string().regex(/^[a-f0-9]{64}$/)
}).refine(source => source.offset + source.length <= NATIVE_PREPARED_IMAGE_MAX_BYTES,
  { message: "Prepared image range exceeds the 8 MiB asset bound", path: ["length"] });
export type NativePreparedImageSource = z.infer<typeof nativePreparedImageSource>;
export const nativePreparedImage = z.strictObject({ mimeType: z.enum(["image/png", "image/jpeg"]), source: nativePreparedImageSource });
export type NativePreparedImage = z.infer<typeof nativePreparedImage>;
export const nativePreparedModel = z.strictObject({
  meshes: z.array(z.array(z.strictObject({ vertices: z.array(z.strictObject({ position: nativeGameVector, normal: nativeGameVector, uv: z.tuple([z.number().finite(), z.number().finite()]), joints: vector4, weights: vector4 })).max(50_000), indices: z.array(z.number().int().nonnegative()).max(150_000), material: z.number().int() }))),
  materials: z.array(z.strictObject({ color: vector4, metallic: z.number().finite(), roughness: z.number().finite(), image: z.number().int(), doubleSided: z.boolean(), emissive: z.tuple([z.number().finite().min(0).max(1), z.number().finite().min(0).max(1), z.number().finite().min(0).max(1)]).default([0,0,0]), normalImage: z.number().int().min(-1).default(-1), normalScale: z.number().finite().min(-1000).max(1000).default(1), alphaMode: z.enum(["OPAQUE","MASK","BLEND"]).default("OPAQUE"), alphaCutoff: z.number().finite().min(0).max(1).default(0.5), baseColorSampler: nativeTextureSampler.default({wrapS:10497,wrapT:10497,magFilter:9729,minFilter:9987}), normalSampler: nativeTextureSampler.default({wrapS:10497,wrapT:10497,magFilter:9729,minFilter:9987}) })),
  images: z.array(nativePreparedImage),
  nodes: z.array(z.strictObject({ local: matrix16, children: z.array(z.number().int().nonnegative()), mesh: z.number().int(), skin: z.number().int() })).max(1000),
  roots: z.array(z.number().int().nonnegative()).max(1000),
  skins: z.array(z.strictObject({ joints: z.array(z.number().int().nonnegative()), inverseBind: z.array(matrix16) })),
  animations: z.array(z.strictObject({ name: z.string(), duration: z.number().finite(), channels: z.array(z.strictObject({ node: z.number().int().nonnegative(), path: z.string(), interpolation: z.string(), times: z.array(z.number().finite()), values: z.array(vector4) })) })),
  source: nativeGameJson
});
export type NativePreparedModel = z.infer<typeof nativePreparedModel>;
const runtimeOperation = z.custom<z.input<typeof nativeGameOperation> | z.input<typeof nativeGame2dOperation>>((value) => nativeGameOperation.safeParse(value).success || nativeGame2dOperation.safeParse(value).success, "Invalid native document operation").transform((value) => structuredClone(value));
const runtimeEnvelope = { protocolVersion: z.literal(1), requestId: nativeGameId };
const runtimeSession = { ...runtimeEnvelope, sessionId: nativeGameId };
export const nativeRuntimeSnapshot = z.looseObject({
  restoreScope: z.literal("same-session"),
  authentication: z.string(),
  build: z.string()
}).catchall(nativeGameJson);
export const nativeRuntimeRequest = z.discriminatedUnion("operation", [
  z.strictObject({ ...runtimeEnvelope, operation: z.literal("hello") }),
  z.strictObject({ ...runtimeSession, operation: z.literal("prepareModel"), manifest: z.array(nativeGameAsset).max(100_000), id: nativeGameId }),
  z.strictObject({ ...runtimeEnvelope, operation: z.literal("validate"), document: nativeGameDocument }),
  z.strictObject({ ...runtimeSession, operation: z.literal("open"), document: nativeGameDocument }),
  z.strictObject({ ...runtimeSession, operation: z.literal("start"), seed: z.number().int().min(0).max(0xffff_ffff).optional() }),
  z.strictObject({ ...runtimeSession, operation: z.literal("step"), input: nativeRuntimeInput.optional() }),
  z.strictObject({ ...runtimeSession, operation: z.literal("restore"), snapshot: nativeRuntimeSnapshot }),
  z.strictObject({ ...runtimeSession, operation: z.literal("reload"), document: nativeGameDocument.optional() }),
  z.strictObject({ ...runtimeSession, operation: z.literal("transaction"), expectedRevision: runtimeTick, operations: z.array(runtimeOperation).min(1).max(1024) }),
  ...(["undo", "redo"] as const).map((operation) => z.strictObject({ ...runtimeSession, operation: z.literal(operation), expectedRevision: runtimeTick })),
  ...(["inspect", "frame", "snapshot", "close"] as const).map((operation) => z.strictObject({ ...runtimeSession, operation: z.literal(operation) }))
]);
export type NativeRuntimeRequest = z.infer<typeof nativeRuntimeRequest>;
export const nativeRuntimeCapabilities = z.strictObject({ engine: z.literal(NATIVE_GAME_ENGINE), build: z.string(), schemaVersion: z.literal(4), schemaVersions: z.array(z.union([z.literal(4),z.literal(5)])), dimensions: z.array(z.enum(["2d", "3d"])), protocolVersion: z.literal(1), snapshotRestoreScope: z.literal("same-session"), maxFrameBytes: z.number().int().positive(), capabilities: z.array(z.string()) });
export const nativeRuntimeResult = z.union([nativePreparedModel, nativeFrame, nativeRuntimeCapabilities, nativeRuntimeSnapshot, z.strictObject({ document: nativeGameDocument, revision: runtimeTick.optional(), sessionRestarted: z.boolean().optional(), operations: z.array(z.json()).optional(), inverseOperations: z.array(z.json()).optional() }), z.strictObject({ closed: z.literal(true) })]);
export const nativeRuntimeResponse = z.discriminatedUnion("status", [
  z.strictObject({ ...runtimeEnvelope, status: z.literal("ok"), result: nativeRuntimeResult }),
  z.strictObject({ ...runtimeEnvelope, status: z.literal("error"), error: z.strictObject({ code: z.string().max(256), message: z.string().max(65536), path: z.string().max(4096), details: nativeGameJson.optional(), currentRevision: runtimeTick.optional() }) })
]);
export type NativeRuntimeResponse = z.infer<typeof nativeRuntimeResponse>;

/** Metadata describes operations structurally. Live request parsing preserves defaults for the owning document. */
export function nativeRuntimeRequestJsonSchema(): z.core.JSONSchema.JSONSchema {
  return exportNativeSchema(z.union(nativeRuntimeRequest.options.map((schema) => schema.shape.operation.value === "transaction"
    ? schema.extend({ operations: z.array(z.union([nativeGameOperation, nativeGame2dOperation])).min(1).max(1024) })
    : schema)));
}
export function nativeRuntimeResponseJsonSchema(): z.core.JSONSchema.JSONSchema { return exportNativeSchema(nativeRuntimeResponse); }
