import { z } from "zod";
import { gameAssetBinding, gameBehavior, gameDocument, gameEntity, gameEvent, gameHudLabel, gameScene, gameSnapshot } from "./game.js";

const finite = z.number().finite();
const positive = finite.positive();
const id = z.string().min(1);
const tick = z.number().int().nonnegative();
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const diagnosticPath = z.array(z.union([z.string(), z.number(), z.symbol().transform((value) => value.toString())]));
const layerBits = z.number().int().min(0).max(0xffff);
export const gameVector3 = z.strictObject({ x: finite, y: finite, z: finite });
export type GameVector3 = z.infer<typeof gameVector3>;
export const gameQuaternion3D = z.tuple([finite, finite, finite, finite]).refine(
  (value) => Math.abs(value.reduce((sum, component) => sum + component * component, 0) - 1) <= 0.00001,
  "Quaternion must be normalized"
);
export type GameQuaternion3D = z.infer<typeof gameQuaternion3D>;
export const gameTransform3D = z.strictObject({
  position: gameVector3.default({ x: 0, y: 0, z: 0 }),
  rotation: gameQuaternion3D.default([0, 0, 0, 1]),
  scale: z.strictObject({ x: positive, y: positive, z: positive }).default({ x: 1, y: 1, z: 1 })
});
export type GameTransform3D = z.infer<typeof gameTransform3D>;

// Reuse exactly the nonspatial behavior schemas accepted by legacy revisions.
export const gameNonSpatialBehavior = z.discriminatedUnion("kind", [
  gameBehavior.options[2], gameBehavior.options[3], gameBehavior.options[4], gameBehavior.options[5],
  gameBehavior.options[6], gameBehavior.options[7], gameBehavior.options[8], gameBehavior.options[9]
]);
export type GameNonSpatialBehavior = z.infer<typeof gameNonSpatialBehavior>;
export const gameBehavior3D = gameNonSpatialBehavior;
export type GameBehavior3D = GameNonSpatialBehavior;
export const gameMaterial3D = z.strictObject({
  color: color.default("#ffffff"), metalness: finite.min(0).max(1).default(0),
  roughness: finite.min(0).max(1).default(0.8), opacity: finite.min(0).max(1).default(1),
  emissive: color.optional(), alphaMode: z.enum(["opaque", "mask", "blend"]).default("opaque"),
  alphaCutoff: finite.min(0).max(1).default(0.5)
});
export const gamePrimitive3D = z.strictObject({
  kind: z.enum(["box", "sphere", "capsule", "plane"]),
  dimensions: z.strictObject({ x: positive, y: positive, z: positive }),
  material: gameMaterial3D.default({ color: "#ffffff", metalness: 0, roughness: 0.8, opacity: 1, alphaMode: "opaque", alphaCutoff: 0.5 }),
  castShadow: z.boolean().default(true), receiveShadow: z.boolean().default(true)
});
export type GamePrimitive3D = z.infer<typeof gamePrimitive3D>;
export const gameModel3D = z.strictObject({
  assetId: id, nodeId: id.optional(), castShadow: z.boolean().default(true), receiveShadow: z.boolean().default(true),
  material: gameMaterial3D.partial().optional()
});
export type GameModel3D = z.infer<typeof gameModel3D>;
const bodySettings = {
  velocity: gameVector3.default({ x: 0, y: 0, z: 0 }),
  angularVelocity: gameVector3.default({ x: 0, y: 0, z: 0 }),
  gravityScale: finite.default(1), linearDamping: finite.min(0).default(0),
  angularDamping: finite.min(0).default(0), ccd: z.boolean().default(false)
};
export const gameBody3D = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("static"), ...bodySettings }),
  z.strictObject({ type: z.literal("kinematic"), ...bodySettings }),
  z.strictObject({ type: z.literal("dynamic"), ...bodySettings, mass: positive.default(1) })
]);
export type GameBody3D = z.infer<typeof gameBody3D>;
const colliderSettings = {
  offset: gameVector3.default({ x: 0, y: 0, z: 0 }), rotation: gameQuaternion3D.default([0, 0, 0, 1]),
  sensor: z.boolean().default(false), category: layerBits.default(1), mask: layerBits.default(0xffff),
  friction: finite.min(0).max(4).default(0.5), restitution: finite.min(0).max(1).default(0)
};
export const gameCollider3D = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("box"), halfExtents: z.strictObject({ x: positive, y: positive, z: positive }), ...colliderSettings }),
  z.strictObject({ kind: z.literal("sphere"), radius: positive, ...colliderSettings }),
  z.strictObject({ kind: z.literal("capsule"), radius: positive, halfHeight: positive, ...colliderSettings }),
  z.strictObject({ kind: z.literal("convexHull"), assetId: id, ...colliderSettings }),
  z.strictObject({ kind: z.literal("triangleMesh"), assetId: id, ...colliderSettings })
]);
export type GameCollider3D = z.infer<typeof gameCollider3D>;
export const gameCharacter3D = z.strictObject({
  speed: positive.default(5), acceleration: positive.default(30), jumpSpeed: positive.default(6),
  slopeLimit: finite.min(0).max(89).default(45), stepHeight: finite.min(0).default(0.3),
  groundSnap: finite.min(0).default(0.2), coyoteTicks: tick.max(60).default(6),
  jumpBufferTicks: tick.max(60).default(6), moveXAxis: id.default("moveX"), moveZAxis: id.default("moveZ"),
  jumpAction: id.default("jump")
});
export type GameCharacter3D = z.infer<typeof gameCharacter3D>;
export const gameCameraProjection3D = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("perspective"), fov: positive.max(179).default(60), near: positive.default(0.1), far: positive.default(1000) }),
  z.strictObject({ kind: z.literal("orthographic"), size: positive.default(10), near: positive.default(0.1), far: positive.default(1000) })
]);
export const gameCamera3D = z.strictObject({
  projection: gameCameraProjection3D,
  behavior: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("fixed") }),
    z.strictObject({ kind: z.literal("follow"), targetId: id, offset: gameVector3.default({ x: 0, y: 2, z: 5 }),
      lookAtOffset: gameVector3.default({ x: 0, y: 1, z: 0 }), yaw: finite.default(0).describe("Initial follow-camera yaw in degrees."),
      pitch: finite.default(0).describe("Initial follow-camera pitch in degrees."),
      minPitch: finite.min(-89).max(89).default(-60).describe("Minimum follow-camera pitch in degrees."),
      maxPitch: finite.min(-89).max(89).default(60).describe("Maximum follow-camera pitch in degrees."),
      sensitivity: positive.default(0.002), collisionRadius: positive.default(0.2) })
  ]).default({ kind: "fixed" })
});
export type GameCamera3D = z.infer<typeof gameCamera3D>;
export const gameLight3D = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("directional"), color, intensity: finite.min(0).max(100), castShadow: z.boolean().default(false) }),
  z.strictObject({ kind: z.literal("point"), color, intensity: finite.min(0).max(100), range: positive, decay: finite.min(0).max(4).default(2) }),
  z.strictObject({ kind: z.literal("spot"), color, intensity: finite.min(0).max(100), range: positive,
    angle: positive.max(Math.PI / 2), penumbra: finite.min(0).max(1).default(0), decay: finite.min(0).max(4).default(2) })
]);
export type GameLight3D = z.infer<typeof gameLight3D>;
export const gameAnimator3D = z.strictObject({
  clips: z.record(id, id), initialClip: id.optional(), playbackRate: finite.min(0).max(8).default(1),
  loop: z.boolean().default(true), transitionTicks: tick.max(600).default(6)
});
export const gameEntity3D = z.strictObject({
  id, name: z.string().default(""), parentId: id.optional(), templateOnly: z.boolean().default(false),
  transform3d: gameTransform3D, primitive: gamePrimitive3D.optional(), model: gameModel3D.optional(),
  body3d: gameBody3D.optional(), collider3d: gameCollider3D.optional(), character3d: gameCharacter3D.optional(),
  camera3d: gameCamera3D.optional(), light3d: gameLight3D.optional(), animator3d: gameAnimator3D.optional(),
  interactionActor: z.strictObject({ collects: z.boolean().default(false), activatesTriggers: z.boolean().default(false) }).optional(),
  audioSource: gameEntity.shape.audioSource,
  behaviors: z.array(gameNonSpatialBehavior).max(64).default([])
});
export type GameEntity3D = z.infer<typeof gameEntity3D>;
export const gameEnvironment3D = z.strictObject({
  background: color.default("#202838"), ambient: z.strictObject({ color, intensity: finite.min(0).max(4) }).default({ color: "#ffffff", intensity: 0.5 }),
  fog: z.strictObject({ color, near: finite.min(0), far: positive }).optional(),
  shadows: z.strictObject({ enabled: z.boolean(), mapSize: z.union([z.literal(512), z.literal(1024), z.literal(2048)]), extent: positive }).default({ enabled: true, mapSize: 1024, extent: 30 })
});
export type GameEnvironment3D = z.infer<typeof gameEnvironment3D>;
export const gameScene3D = z.strictObject({
  id, name: id, activeCameraId: id, gravity: gameVector3.default({ x: 0, y: -9.81, z: 0 }),
  environment: gameEnvironment3D.default({ background: "#202838", ambient: { color: "#ffffff", intensity: 0.5 }, shadows: { enabled: true, mapSize: 1024, extent: 30 } }),
  music: gameScene.shape.music,
  entities: z.array(gameEntity3D).max(4096)
});
export type GameScene3D = z.infer<typeof gameScene3D>;
const bounds = z.strictObject({ min: gameVector3, max: gameVector3 });
export const gameModelImportSettings3D = z.strictObject({
  scale: positive, forward: z.enum(["-z", "+z", "+x", "-x"]), origin: z.enum(["preserve", "ground", "centerGround"])
});
export type GameModelImportSettings3D = z.infer<typeof gameModelImportSettings3D>;
const assetIdentity = { assetId: id, digest: id, required: z.boolean().default(true), provenance: z.string().optional() };
export const gameAssetBinding3D = z.discriminatedUnion("mediaKind", [
  z.strictObject({ mediaKind: z.literal("model"), ...assetIdentity, format: z.literal("glb").default("glb"),
    preparationVersion: id.default("1"), bounds, nodeIds: z.array(id).max(4096), clipIds: z.array(id).max(256),
    geometryBytes: tick, textureBytes: tick, triangles: tick, supportedExtensions: z.array(id).default([]),
    importSettings: gameModelImportSettings3D.optional(), sourceDigest: id.optional(), sourceAssetId: id.optional() }),
  z.strictObject({ mediaKind: z.literal("collider"), ...assetIdentity, preparationVersion: id.default("1"),
    shape: z.enum(["convexHull", "triangleMesh"]), bounds, vertices: tick, triangles: tick }),
  z.strictObject({ mediaKind: z.literal("audio"), ...assetIdentity }),
  z.strictObject({ mediaKind: z.literal("font"), ...assetIdentity, fontFormat: z.enum(["ttf", "otf"]) })
]);
export type GameAssetBinding3D = z.infer<typeof gameAssetBinding3D>;
export const anyGameAssetBinding = z.union([gameAssetBinding, gameAssetBinding3D]);
export type AnyGameAssetBinding = z.infer<typeof anyGameAssetBinding>;
export const gamePreparedCollider3D = z.strictObject({
  vertices: z.array(finite).min(9).max(750_000), indices: z.array(z.number().int().nonnegative()).max(750_000).optional()
}).superRefine((geometry, context) => {
  if (geometry.vertices.length % 3 !== 0) { context.addIssue({ code: "custom", path: ["vertices"], message: "Vertices must be complete XYZ triples" }); }
  if (geometry.indices && (geometry.indices.length % 3 !== 0 || geometry.indices.some((index) => index >= geometry.vertices.length / 3))) {
    context.addIssue({ code: "custom", path: ["indices"], message: "Triangle indices must be complete triples within vertex bounds" });
  }
});
export type GamePreparedCollider3D = z.infer<typeof gamePreparedCollider3D>;

export const gamePrefab3D = z.strictObject({
  rootId: id, entities: z.array(gameEntity3D).min(1).max(256),
  externalAssets: z.array(id).max(256).default([]), externalScenes: z.array(id).max(64).default([])
});
export type GamePrefab3D = z.infer<typeof gamePrefab3D>;
export const gamePresentation3D = z.strictObject({ aspectRatio: positive, hudWidth: positive, hudHeight: positive });
export const gameDocument3D = z.strictObject({
  schemaVersion: z.literal(3), engineVersion: z.literal("2"), dimension: z.literal("3d"),
  id, revision: id, entrySceneId: id, tickRate: z.literal(60), presentation: gamePresentation3D,
  inputActions: z.array(id).max(64), inputAxes: z.array(id).max(16).default(["moveX", "moveZ"]),
  collisionLayers: z.array(id).max(16).optional(), assets: z.record(id, gameAssetBinding3D),
  prefabs: z.record(id, gamePrefab3D).default({}), scenes: z.array(gameScene3D).min(1).max(64)
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
  if (schemaVersion !== 1 && schemaVersion !== 2 && schemaVersion !== 3) {
    return { ok: false, diagnostics: [{ code: "unsupported_schema_version", path: ["schemaVersion"], message: `Unsupported game schema version ${String(schemaVersion)}` }] };
  }
  const engineVersion = schemaVersion === 3 ? "2" : "1";
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
  camera: z.strictObject({ entityId: id, transform: gameTransform3D, projection: gameCameraProjection3D }),
  entities: z.array(z.strictObject({ entityId: id, transform: gameTransform3D, previousTransform: gameTransform3D,
    primitive: gamePrimitive3D.optional(), model: gameModel3D.optional(), animation: gameAnimationState3D.optional(), opacity: finite.min(0).max(1).optional() })),
  lights: z.array(z.strictObject({ entityId: id, transform: gameTransform3D, light: gameLight3D })),
  environment: gameEnvironment3D, hud: z.array(gameHudLabel), fonts: z.record(id, gameAssetBinding3D.options[3]).optional()
});
export type GameRenderFrame3D = z.infer<typeof gameRenderFrame3D>;
export const gameEntityState3D = z.strictObject({
  id, sourceId: id.optional(), prefabId: id.optional(), instanceId: id.optional(), parentId: id.optional(), spawnTick: tick,
  transform: gameTransform3D, previousTransform: gameTransform3D, velocity: gameVector3, angularVelocity: gameVector3,
  active: z.boolean(), health: z.number().int().optional(), grounded: z.boolean().default(false),
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
  z.strictObject({ kind: z.literal("sceneTransition"), sceneId: id })
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
  readonly tick: number;
  readonly events: readonly GameEvent3D[];
  readonly frame: GameRenderFrame3D;
}
