import { gameScriptCommand } from "./scripts.js";
import { gameScriptSchemaDeclaration, gameScriptWorldDeclaration } from "./script-declarations.js";

/** Monaco declarations for the native game function-expression contract. */
export const GAME_SCRIPT_TYPES = `
${gameScriptSchemaDeclaration("GameScriptCommand", gameScriptCommand)}

type GameScriptInput = {
  tick: number;
  pressed: readonly string[];
  justPressed: readonly string[];
  events: readonly unknown[];
  entity: { id: string; x: number; y: number; velocityX: number; velocityY: number;
    touching: { down: boolean; up: boolean; left: boolean; right: boolean } };
  world: readonly { id: string; source: string; x: number; y: number }[];
  state: unknown;
  random: () => number;
};

type GameScriptResult = { state: unknown; commands: GameScriptCommand[] };
type GameScript = (input: GameScriptInput) => GameScriptResult;
`;

/** Global world queries available during a script call. */
export const GAME_SCRIPT_WORLD_TYPES = gameScriptWorldDeclaration(
  "{ id: string; source: string; x: number; y: number; velocityX: number; velocityY: number; grounded: boolean }"
);
