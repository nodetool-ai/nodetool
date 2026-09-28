import { gameQueryResult3D, gameScriptCommand3D } from "@nodetool-ai/protocol";
import { gameScriptSchemaDeclaration } from "./script-declarations.js";

export const GAME_SCRIPT_TYPES_3D = `
type Vector3 = { x: number; y: number; z: number };
type Quaternion3D = [number, number, number, number];
${gameScriptSchemaDeclaration("GameScriptCommand3D", gameScriptCommand3D)}
${gameScriptSchemaDeclaration("GameQueryResult3D", gameQueryResult3D)}

type GameScriptWorldEntity3D = { id: string; source: string; position: Vector3; velocity: Vector3; grounded: boolean };
type GameScriptInput3D = {
  contractVersion: 3; tick: number; pressed: readonly string[]; justPressed: readonly string[];
  axes: Readonly<Record<string, number>>; look: { x: number; y: number }; camera: { yaw: number; pitch: number };
  events: readonly unknown[];
  queries: readonly GameQueryResult3D[];
  entity: GameScriptWorldEntity3D; world: readonly GameScriptWorldEntity3D[]; state: unknown; random: () => number;
};
type GameScriptResult3D = { state: unknown; commands: GameScriptCommand3D[] };
type GameScript3D = (input: GameScriptInput3D) => GameScriptResult3D;
`;
