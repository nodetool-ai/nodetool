import type {
  GameCameraState3D,
  GameDocument3D,
  GameEntity3D,
  GameEvent3D,
  GameHudLabel,
  GameInputFrame3D,
  GameParticleEmission,
  GameQueryResult3D,
  GameRenderFrame3D,
  GameScene3D,
  GameScriptCommand3D,
  GameSnapshot3D,
  GameStepResult3D,
  GameTransform3D,
  GameVector3
} from "@nodetool-ai/protocol";
import type { GameplayQueues } from "../gameplay/lifecycle.js";
import type { GameScriptStats } from "../scripts.js";
import type { GameScriptCall3D, GameScriptRunner3D } from "../scripts3d.js";
import type { Contact3D, EntityState3D } from "../spatial3d/state.js";
import type { PreparedCollider3D, SpatialStep3D, SpatialWorld3D, prepareRapier3D } from "../spatial3d/world.js";
export type Spawn3D =
  | Extract<
      GameScriptCommand3D,
      {
        kind: "spawn";
      }
    >
  | {
      readonly prefabId: string;
    };
/** Session-owned state and tick-local work shared by the ordered systems. */
export interface GameSystemContext3D {
  readonly document: GameDocument3D;
  input: GameInputFrame3D;
  scene: GameScene3D;
  states: EntityState3D[];
  camera: GameCameraState3D;
  cameraEntity: EntityState3D;
  previousCamera: GameTransform3D;
  tick: number;
  rngState: number;
  score: number;
  won: boolean;
  spawnSequence: number;
  scriptState: GameSnapshot3D["scriptState"];
  previousEvents: GameEvent3D[];
  queries: GameQueryResult3D[];
  hud: Map<string, GameHudLabel>;
  instances: GameSnapshot3D["prefabInstances"];
  music: GameSnapshot3D["music"];
  activeContacts: Map<string, Contact3D>;
  spatial: SpatialWorld3D;
  presentationEvents: (GameEvent3D | GameParticleEmission)[];
  readonly runner: GameScriptRunner3D | undefined;
  readonly rapier: Awaited<ReturnType<typeof prepareRapier3D>>;
  readonly prepared: ReadonlyMap<string, PreparedCollider3D>;
  queues: GameplayQueues<Spawn3D>;
  intents: Map<
    string,
    {
      movement: GameVector3;
      jump: boolean;
    }
  >;
  posed: Set<string>;
  spatialQueries: {
    entityId: string;
    command: Extract<
      GameScriptCommand3D,
      {
        kind: "rayQuery" | "shapeQuery";
      }
    >;
  }[];
  calls: GameScriptCall3D[];
  events: GameEvent3D[];
  emit: (event: GameEvent3D) => void;
  scriptStats: GameScriptStats | undefined;
  spatialStep: SpatialStep3D | undefined;
  contacts: Contact3D[];
  result:
    | (GameStepResult3D & {
        scriptStats?: GameScriptStats;
      })
    | undefined;
  currentScene(): GameScene3D;
  currentCameraEntity(): EntityState3D;
  currentSpatial(): SpatialWorld3D;
  frame(): GameRenderFrame3D;
  initialState3D(definition: GameEntity3D, spawnTick: number): EntityState3D;
  remapDefinition3D(definition: GameEntity3D, mapping: Readonly<Record<string, string>>): GameEntity3D;
  sceneStates3D(scene: GameScene3D, spawnTick: number): EntityState3D[];
}
