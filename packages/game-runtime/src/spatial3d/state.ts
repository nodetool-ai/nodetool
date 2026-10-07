import type { GameEntity3D, GameTransform3D, GameVector3 } from "@nodetool-ai/protocol";

export interface ControllerState3D {
  grounded: boolean;
  coyoteRemaining: number;
  jumpBufferRemaining: number;
  verticalVelocity: number;
  supportId?: string;
}

export interface EntityState3D {
  readonly definition: GameEntity3D;
  readonly definitionId: string;
  readonly instanceId?: string;
  readonly sourceId?: string;
  readonly prefabId?: string;
  spawnTick: number;
  active: boolean;
  props?: GameEntity3D["props"];
  health?: number;
  transform: GameTransform3D;
  localTransform: GameTransform3D;
  previousTransform: GameTransform3D;
  velocity: GameVector3;
  controller?: ControllerState3D;
  angularVelocity: GameVector3;
  animation?: import("@nodetool-ai/protocol").GameAnimationState3D;
  opacity?: number;
}

export interface Contact3D {
  readonly entityId: string;
  readonly otherId: string;
  readonly sensor: boolean;
  readonly normal: GameVector3;
  readonly time: number;
}

export function pairKey3D(a: string, b: string): string {
  return a < b ? JSON.stringify([a, b]) : JSON.stringify([b, a]);
}
