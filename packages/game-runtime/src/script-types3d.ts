import { gameQueryResult3D, gameScriptCommand3D } from "@nodetool-ai/protocol";
import { gameScriptSchemaDeclaration, gameScriptWorldDeclaration } from "./script-declarations.js";

export const GAME_SCRIPT_TYPES_3D = `
type JSONValue = string | number | boolean | null | JSONValue[] | { [key: string]: JSONValue };
type Vector3 = { x: number; y: number; z: number };
type Quaternion3D = [number, number, number, number];
type GameScriptParamValue = number | boolean | string | { x: number; y: number; z?: number } | null;
${gameScriptSchemaDeclaration("GameScriptCommand3D", gameScriptCommand3D)}
${gameScriptSchemaDeclaration("GameQueryResult3D", gameQueryResult3D)}

type GameScriptWorldEntity3D = { id: string; source: string; position: Vector3; velocity: Vector3; grounded: boolean; tags: readonly string[]; props: Readonly<Record<string, JSONValue>>; rotation: Quaternion3D; active: boolean };
type GameScriptInput3D = {
  contractVersion: 3; tick: number; pressed: readonly string[]; justPressed: readonly string[];
  axes: Readonly<Record<string, number>>; look: { x: number; y: number }; camera: { yaw: number; pitch: number };
  events: readonly unknown[];
  queries: readonly GameQueryResult3D[];
  entity: GameScriptWorldEntity3D; world: readonly GameScriptWorldEntity3D[]; state: unknown; random: () => number;
  /** Present when the behavior declares params. Entity and asset params are IDs or null. */
  params?: Readonly<Record<string, GameScriptParamValue>>;
};
type GameScriptResult3D = { state: unknown; commands: GameScriptCommand3D[] };
type GameScript3D = (input: GameScriptInput3D) => GameScriptResult3D;
`;

/** Global world queries available during a script call. */
export const GAME_SCRIPT_WORLD_TYPES_3D = gameScriptWorldDeclaration(
  "{ id: string; source: string; position: Vector3; velocity: Vector3; grounded: boolean }"
);
