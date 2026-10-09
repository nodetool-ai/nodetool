import type {
  GameDocument,
  GameEntity,
  GameEvent,
  GameParticleEmission,
  GameHudLabel,
  GameInputFrame,
  GameRenderFrame,
  GameScene,
  GameSnapshot
} from "@nodetool-ai/protocol";
import type { GameplayQueues } from "../gameplay/lifecycle.js";
import type { GameScriptCall, GameScriptRunner, GameScriptStats } from "../scripts.js";
import type { GameStepResult } from "../session.js";
import type { EntityState, ContactPair, WorldTransform, QueuedSpawn } from "./state2d.js";
export interface GameSystemContext2D {
  input: GameInputFrame;
  pressed: Set<string>;
  states: EntityState[];
  scene: GameScene;
  scriptCalls: GameScriptCall[];
  scriptState: GameSnapshot["scriptState"];
  tick: number;
  previousEvents: GameEvent[];
  queues: GameplayQueues<QueuedSpawn>;
  readonly scriptRunner: GameScriptRunner | undefined;
  rngState: number;
  readonly document: GameDocument;
  readonly isSpawnedId: (entityId: string) => boolean;
  hud: Map<string, GameHudLabel>;
  emit: (event: GameEvent) => void;
  scriptStats: GameScriptStats | undefined;
  events: GameEvent[];
  observations: Map<string, ContactPair>;
  activeContacts: Map<string, ContactPair>;
  score: number;
  won: boolean;
  sceneId: string;
  queuedDespawns: Set<string>;
  queuedSpawns: QueuedSpawn[];
  failed: boolean;
  spawnSequence: number;
  readonly initialState: (entity: GameEntity, world: WorldTransform, spawnTick?: number) => EntityState;
  music: GameSnapshot["music"];
  readonly initialSceneStates: (scene: GameScene, spawnTick?: number) => EntityState[];
  presentationEvents: (GameEvent | GameParticleEmission)[];
  result: GameStepResult | undefined;
  readonly frameFor: (
    document: GameDocument,
    scene: GameScene,
    states: readonly EntityState[],
    tick: number,
    score: number,
    won: boolean,
    hud: ReadonlyMap<string, GameHudLabel>
  ) => GameRenderFrame;
}
