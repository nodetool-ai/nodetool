import { gameScriptCommand3D, type GameDocument3D, type GameEvent3D, type GameInputFrame3D, type GameQueryResult3D, type GameScriptCommand3D, type GameVector3 } from "@nodetool-ai/protocol";
import { prepareIsolatedGameScripts, type IsolatedScriptCall, type IsolatedScriptRunner } from "./scripts.js";

export interface GameScriptCall3D extends IsolatedScriptCall {
  readonly position: GameVector3;
  readonly velocity: GameVector3;
  readonly grounded: boolean;
  readonly tags: readonly string[];
  readonly props: NonNullable<GameDocument3D["scenes"][number]["entities"][number]["props"]>;
  readonly rotation: GameDocument3D["scenes"][number]["entities"][number]["transform3d"]["rotation"];
  readonly active: boolean;
}

export interface GameScriptInput3D extends GameInputFrame3D {
  readonly tick: number;
  readonly events: readonly GameEvent3D[];
  readonly camera: { readonly yaw: number; readonly pitch: number };
  readonly queries: readonly GameQueryResult3D[];
  readonly world: readonly { readonly id: string; readonly source: string; readonly position: GameVector3; readonly velocity: GameVector3; readonly grounded: boolean; readonly tags: readonly string[]; readonly props: GameScriptCall3D["props"]; readonly rotation: GameScriptCall3D["rotation"]; readonly active: boolean }[];
}

export type GameScriptRunner3D = IsolatedScriptRunner<GameScriptCall3D, GameScriptInput3D, GameScriptCommand3D>;

export function prepareGameScripts3D(document: GameDocument3D): Promise<GameScriptRunner3D> {
  return prepareIsolatedGameScripts<GameScriptCall3D, GameScriptInput3D, GameScriptCommand3D>(document, gameScriptCommand3D, `{
    contractVersion: 3, tick: data.input.tick, pressed: data.input.pressed, justPressed: data.input.justPressed,
    axes: data.input.axes, look: data.input.look, camera: data.input.camera, events: data.input.events,
    queries: data.input.queries, world: data.input.world, state: data.call.state, random: __gameRandom,
    entity: { id: data.call.entityId, source: data.call.source, position: data.call.position,
      velocity: data.call.velocity, grounded: data.call.grounded,
      tags: data.call.tags, props: data.call.props, rotation: data.call.rotation, active: data.call.active }
  }`);
}
