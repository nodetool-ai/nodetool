import type { GameEntity } from "@nodetool-ai/protocol";
import type { Box } from "../physics.js";
export interface EntityState {
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
export interface ContactPair {
  readonly entityId: string;
  readonly otherId: string;
  readonly sensor: boolean;
  readonly normalX: number;
  readonly normalY: number;
}
export interface Obstacle {
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
export interface ScriptVisual {
  flipX?: boolean;
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
  tint?: string;
  opacity?: number;
}
export interface WorldTransform {
  readonly x: number;
  readonly y: number;
  readonly rotation: number;
  readonly scaleX: number;
  readonly scaleY: number;
}
export interface QueuedSpawn {
  readonly prefabId: string;
  readonly x?: number;
  readonly y?: number;
  readonly velocityX?: number;
  readonly velocityY?: number;
}
