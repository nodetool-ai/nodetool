import { z } from "zod";
import { gameEntityPropertyValue, gameEntityProps, gameEntityTags } from "../game-entity-metadata.js";
import type { GameStepTimings } from "../game-step.js";
import { gameInteractionActor3DComponent } from "./components/interaction-actor.js";
import { finite, positive, id, tick, color, layerBits } from "./components/common.js";
import { gameVector3, gameQuaternion3D, gameTransform3D } from "./components/transform.js";
import { gameNonSpatialBehavior } from "./components/behaviors.js";
import { gamePrimitive3D } from "./components/primitive.js";
import { gameModel3D } from "./components/model.js";
import { gameBody3D } from "./components/body.js";
import { gameCollider3D } from "./components/collider.js";
import { gameCharacter3D } from "./components/character.js";
import { gameCameraProjection3D, gameCamera3D } from "./components/camera.js";
import { gameLight3D } from "./components/light.js";
import { gameAnimator3D } from "./components/animator.js";
import { gameEnvironment3D } from "./components/environment.js";
import { gameAssetBinding3D } from "./components/assets.js";
import { gameAuthoring } from "../game-authoring.js";
import { gameAudioSettings } from "../game2d/components/audio.js";
import { gameDocument, gameEntity, gameEvent, gameHudLabel, gameScene, gameSnapshot } from "../game.js";

const diagnosticPath = z.array(z.union([z.string(), z.number(), z.symbol().transform((value) => value.toString())]));

const entityComponents = {
  transform3d: gameTransform3D, primitive: gamePrimitive3D.optional(), model: gameModel3D.optional(),
  body3d: gameBody3D.optional(), collider3d: gameCollider3D.optional(), character3d: gameCharacter3D.optional(),
  camera3d: gameCamera3D.optional(), light3d: gameLight3D.optional(), animator3d: gameAnimator3D.optional(),
  interactionActor: gameInteractionActor3DComponent,
  audioSource: gameEntity.shape.audioSource
};

export const gameEntity3D = z.strictObject({
  id, name: z.string().default(""), parentId: id.optional(), templateOnly: z.boolean().default(false),
  tags: gameEntityTags.optional(), props: gameEntityProps.optional(),
  ...entityComponents,
  behaviors: z.array(gameNonSpatialBehavior).max(64).default([])
});

export type GameEntity3D = z.infer<typeof gameEntity3D>;

const sceneFields = {
  gravity: gameVector3.default({ x: 0, y: -9.81, z: 0 }),
  environment: gameEnvironment3D.default({ background: "#202838", ambient: { color: "#ffffff", intensity: 0.5 }, shadows: { enabled: true, mapSize: 1024, extent: 30 } }),
  music: gameScene.shape.music,
  entities: z.array(gameEntity3D).max(4096)
};

export const gameScene3D = z.strictObject({
  id, name: id, activeCameraId: id,
  ...sceneFields,
});

export type GameScene3D = z.infer<typeof gameScene3D>;

export const gamePrefab3D = z.strictObject({
  rootId: id, entities: z.array(gameEntity3D).min(1).max(256),
  externalAssets: z.array(id).max(256).default([]), externalScenes: z.array(id).max(64).default([])
});

export type GamePrefab3D = z.infer<typeof gamePrefab3D>;

export const gamePresentation3D = z.strictObject({ aspectRatio: positive, hudWidth: positive, hudHeight: positive });

export const gameDocument3D = z.strictObject({
  authoring: gameAuthoring.optional(),
  schemaVersion: z.literal(3), engineVersion: z.literal("2"), dimension: z.literal("3d"),
  id, revision: id, entrySceneId: id, tickRate: z.literal(60), presentation: gamePresentation3D,
  inputActions: z.array(id).max(64), inputAxes: z.array(id).max(16).default(["moveX", "moveZ"]),
  collisionLayers: z.array(id).max(16).optional(), assets: z.record(id, gameAssetBinding3D),
  prefabs: z.record(id, gamePrefab3D).default({}), scenes: z.array(gameScene3D).min(1).max(64),
  audio: gameAudioSettings.optional()
});

export type GameDocument3D = z.infer<typeof gameDocument3D>;

export const anyGameDocument = z.union([gameDocument, gameDocument3D]);

export type AnyGameDocument = z.infer<typeof anyGameDocument>;

export const gameDiagnostic = z.strictObject({ code: id, path: z.array(z.union([z.string(), z.number().int()])), message: id });

export type GameDiagnostic = z.infer<typeof gameDiagnostic>;

export type ParseGameDocumentResult = { readonly ok: true; readonly document: AnyGameDocument } |
  { readonly ok: false; readonly diagnostics: readonly GameDiagnostic[] };

export function parseGameDocument(value: unknown): ParseGameDocumentResult {
  const version = z.object({ schemaVersion: z.unknown(), engineVersion: z.unknown() }).safeParse(value);
  if (!version.success) {
    return { ok: false, diagnostics: [{ code: "invalid_document", path: [], message: "Game document must include schemaVersion and engineVersion" }] };
  }
  const schemaVersion = version.data.schemaVersion;
  if (schemaVersion !== 1 && schemaVersion !== 2 && schemaVersion !== 3 && schemaVersion !== 4) {
    return { ok: false, diagnostics: [{ code: "unsupported_schema_version", path: ["schemaVersion"], message: `Unsupported game schema version ${String(schemaVersion)}` }] };
  }
  const engineVersion = schemaVersion === 4 ? "3" : schemaVersion === 3 ? "2" : "1";
  if (version.data.engineVersion !== engineVersion) {
    return { ok: false, diagnostics: [{ code: "unsupported_engine_version", path: ["engineVersion"], message: `Schema ${schemaVersion} requires engine version ${engineVersion}` }] };
  }
  const parsed = (schemaVersion === 3 ? gameDocument3D : gameDocument).safeParse(value);
  if (!parsed.success) {
    return { ok: false, diagnostics: parsed.error.issues.map((issue) => ({ code: "invalid_schema", path: diagnosticPath.parse(issue.path), message: issue.message })) };
  }
  return { ok: true, document: parsed.data };
}

export const gameInputFrame3D = z.strictObject({
  pressed: z.array(id).max(64), justPressed: z.array(id).max(64).default([]),
  axes: z.record(id, finite.min(-1).max(1)).default({}), look: z.strictObject({ x: finite, y: finite }).default({ x: 0, y: 0 })
});

export type GameInputFrame3D = z.infer<typeof gameInputFrame3D>;

export const gameEvent3D = z.union([
  z.strictObject({ kind: z.literal("contact"), sceneId: id, entityId: id, otherId: id,
    phase: z.enum(["enter", "stay", "exit"]), sensor: z.boolean(), normal: gameVector3 }),
  ...gameEvent.options.slice(1)
]);

export type GameEvent3D = z.infer<typeof gameEvent3D>;

export const gameAnimationState3D = z.strictObject({
  clipId: id, startTick: tick, playbackRate: finite.min(0).max(8), loop: z.boolean(), transitionTicks: tick.max(600).optional(),
  previousClipId: id.optional(), previousStartTick: tick.optional()
});

export type GameAnimationState3D = z.infer<typeof gameAnimationState3D>;

export const gameRenderFrame3D = z.strictObject({
  dimension: z.literal("3d"), gameId: id, sceneId: id, tick, presentation: gamePresentation3D,
  camera: z.strictObject({ entityId: id, transform: gameTransform3D, previousTransform: gameTransform3D.optional(), projection: gameCameraProjection3D }),
  entities: z.array(z.strictObject({ entityId: id, transform: gameTransform3D, previousTransform: gameTransform3D,
    primitive: gamePrimitive3D.optional(), model: gameModel3D.optional(), animation: gameAnimationState3D.optional(), opacity: finite.min(0).max(1).optional() })),
  lights: z.array(z.strictObject({ entityId: id, transform: gameTransform3D, light: gameLight3D })),
  environment: gameEnvironment3D, hud: z.array(gameHudLabel), fonts: z.record(id, gameAssetBinding3D.options[3]).optional()
});

export type GameRenderFrame3D = z.infer<typeof gameRenderFrame3D>;

export const gameEntityState3D = z.strictObject({
  id, sourceId: id.optional(), prefabId: id.optional(), instanceId: id.optional(), parentId: id.optional(), spawnTick: tick,
  transform: gameTransform3D, previousTransform: gameTransform3D, velocity: gameVector3, angularVelocity: gameVector3,
  active: z.boolean(), props: gameEntityProps.optional(), health: z.number().int().optional(), grounded: z.boolean().default(false),
  controller: z.strictObject({ coyoteRemaining: tick, jumpBufferRemaining: tick, verticalVelocity: finite, supportId: id.optional() }).optional(),
  animation: gameAnimationState3D.optional(), localTransform: gameTransform3D.optional(), opacity: finite.min(0).max(1).optional()
});

export type GameEntityState3D = z.infer<typeof gameEntityState3D>;

export const gameCameraState3D = z.strictObject({ entityId: id, yaw: finite.describe("Simulated camera yaw in radians."),
  pitch: finite.describe("Simulated camera pitch in radians."), transform: gameTransform3D, targetId: id.optional() });

export type GameCameraState3D = z.infer<typeof gameCameraState3D>;

export const gameNonSpatialScriptCommand = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("playAnimation"), clip: id }),
  z.strictObject({ kind: z.literal("hud"), id: id.max(64), text: z.string().max(256), x: finite, y: finite,
    size: positive.max(256).optional(), color: color.optional(), align: z.enum(["left", "center", "right"]).optional(), fontId: id.optional() }),
  z.strictObject({ kind: z.literal("emit"), event: id.max(128) }),
  z.strictObject({ kind: z.literal("despawn"), entityId: id }),
  z.strictObject({ kind: z.literal("sceneTransition"), sceneId: id }),
  z.strictObject({ kind: z.literal("setProp"), key: z.string().min(1).max(128), value: gameEntityPropertyValue }).superRefine((command, context) => {
    const parsed = gameEntityProps.safeParse({ [command.key]: command.value });
    if (!parsed.success) {
      context.addIssue({ code: "custom", message: "Invalid entity property value" });
    }
  }),
  z.strictObject({ kind: z.literal("removeProp"), key: z.string().min(1).max(128).refine((key) => !["__proto__", "constructor", "prototype"].includes(key)) })
]);

export type GameNonSpatialScriptCommand = z.infer<typeof gameNonSpatialScriptCommand>;

export const gameQueryShape3D = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("box"), halfExtents: z.strictObject({ x: positive.max(1000), y: positive.max(1000), z: positive.max(1000) }) }),
  z.strictObject({ kind: z.literal("sphere"), radius: positive.max(1000) }),
  z.strictObject({ kind: z.literal("capsule"), radius: positive.max(1000), halfHeight: positive.max(1000) })
]);

export type GameQueryShape3D = z.infer<typeof gameQueryShape3D>;

export const gameScriptCommand3D = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("characterIntent"), movement: gameVector3, jump: z.boolean().default(false) }),
  z.strictObject({ kind: z.literal("setVelocity"), velocity: gameVector3 }),
  z.strictObject({ kind: z.literal("impulse"), impulse: gameVector3 }),
  z.strictObject({ kind: z.literal("teleport"), position: gameVector3, rotation: gameQuaternion3D.optional(), resetVelocity: z.boolean().default(true) }),
  z.strictObject({ kind: z.literal("setKinematicPose"), position: gameVector3, rotation: gameQuaternion3D.optional() }),
  z.strictObject({ kind: z.literal("setVisual"), rotation: gameQuaternion3D.optional(), scale: gameTransform3D.shape.scale.optional(), opacity: finite.min(0).max(1).optional() }),
  ...gameNonSpatialScriptCommand.options,
  z.strictObject({ kind: z.literal("spawn"), prefabId: id, position: gameVector3.optional(), rotation: gameQuaternion3D.optional(), velocity: gameVector3.optional() }),
  z.strictObject({ kind: z.literal("rayQuery"), queryId: id.max(64), origin: gameVector3, direction: gameVector3, maxDistance: positive.max(10000), mask: layerBits.default(0xffff) }),
  z.strictObject({ kind: z.literal("shapeQuery"), queryId: id.max(64), shape: gameQueryShape3D,
    position: gameVector3, rotation: gameQuaternion3D.default([0, 0, 0, 1]), mask: layerBits.default(0xffff),
    includeSensors: z.boolean().default(false), maximumResults: z.number().int().min(1).max(32).default(16) })
]);

export type GameScriptCommand3D = z.infer<typeof gameScriptCommand3D>;

export const gameQueryResult3D = z.strictObject({ queryId: id, entityId: id.optional(), position: gameVector3.optional(), normal: gameVector3.optional(), distance: finite.min(0).optional(),
  hits: z.array(z.strictObject({ entityId: id, position: gameVector3 })).max(32).optional(), truncated: z.boolean().optional() });

export type GameQueryResult3D = z.infer<typeof gameQueryResult3D>;

export const gameSnapshot3D = z.strictObject({
  dimension: z.literal("3d"), schemaVersion: z.literal(3), engineVersion: z.literal("2"),
  gameRevision: id, contentDigest: id, physicsBuild: id, sceneId: id, tick, rngState: z.number().int().min(0).max(0xffffffff),
  score: tick, won: z.boolean(), spawnSequence: tick, scriptState: z.record(z.string(), z.json()),
  pendingEvents: z.array(gameEvent3D).max(512), pendingCommands: z.array(z.strictObject({ entityId: id, command: gameScriptCommand3D })).max(1024).default([]),
  queryResults: z.array(gameQueryResult3D).max(64).default([]), activeContacts: z.array(z.strictObject({ entityId: id, otherId: id, sensor: z.boolean() })),
  entities: z.array(gameEntityState3D).max(8192), camera: gameCameraState3D,
  hud: z.array(gameHudLabel), music: gameSnapshot.shape.music,
  prefabInstances: z.array(z.strictObject({ id, prefabId: id, rootId: id, mapping: z.record(id, id) })).max(1024).default([]),
  physics: z.strictObject({ encoding: z.literal("base64"), bytes: z.string(), bodies: z.record(id, finite.nonnegative()), colliders: z.record(id, finite.nonnegative()) })
});

export type GameSnapshot3D = z.infer<typeof gameSnapshot3D>;

export interface GameInspectionQuery3D { readonly entityId?: string; }

export interface GameInspection3D {
  readonly dimension: "3d";
  readonly tick: number;
  readonly sceneId: string;
  readonly score: number;
  readonly won: boolean;
  readonly entities: readonly GameEntityState3D[];
  readonly camera: z.infer<typeof gameCameraState3D>;
}

export interface GameStepResult3D {
  readonly timings?: GameStepTimings;
  readonly tick: number;
  readonly events: readonly GameEvent3D[];
  readonly frame: GameRenderFrame3D;
}

export { gameVector3, type GameVector3, gameQuaternion3D, type GameQuaternion3D, gameTransform3D, type GameTransform3D } from "./components/transform.js";

export { gameNonSpatialBehavior, type GameNonSpatialBehavior, gameBehavior3D, type GameBehavior3D } from "./components/behaviors.js";

export { gameMaterial3D } from "./components/material.js";

export { gamePrimitive3D, type GamePrimitive3D } from "./components/primitive.js";

export { gameModel3D, type GameModel3D } from "./components/model.js";

export { gameBody3D, type GameBody3D } from "./components/body.js";

export { gameCollider3D, type GameCollider3D } from "./components/collider.js";

export { gameCharacter3D, type GameCharacter3D } from "./components/character.js";

export { gameCameraProjection3D, gameCamera3D, type GameCamera3D } from "./components/camera.js";

export { gameLight3D, type GameLight3D } from "./components/light.js";

export { gameAnimator3D } from "./components/animator.js";

export { gameEnvironment3D, type GameEnvironment3D } from "./components/environment.js";

export { gameModelImportSettings3D, type GameModelImportSettings3D, gameAssetBinding3D, type GameAssetBinding3D, anyGameAssetBinding, type AnyGameAssetBinding } from "./components/assets.js";

export { gamePreparedCollider3D, type GamePreparedCollider3D } from "./components/collider-geometry.js";
