import { gameScriptCommand } from "./scripts.js";
import { gameScriptSchemaDeclaration } from "./script-declarations.js";

/** Monaco declarations for the native game function-expression contract. */
export const GAME_SCRIPT_TYPES = `
${gameScriptSchemaDeclaration("GameScriptCommand", gameScriptCommand)}

type JSONValue = string | number | boolean | null | JSONValue[] | { [key: string]: JSONValue };
type GameScriptInput = {
  tick: number;
  pressed: readonly string[];
  justPressed: readonly string[];
  events: readonly unknown[];
  entity: { id: string; x: number; y: number; velocityX: number; velocityY: number;
    tags: readonly string[]; props: Readonly<Record<string, JSONValue>>; rotation: number; active: boolean;
    touching: { down: boolean; up: boolean; left: boolean; right: boolean } };
  world: readonly { id: string; source: string; x: number; y: number; tags: readonly string[]; props: Readonly<Record<string, JSONValue>>; rotation: number; active: boolean }[];
  state: unknown;
  random: () => number;
};

type GameScriptResult = { state: unknown; commands: GameScriptCommand[] };
type GameScript = (input: GameScriptInput) => GameScriptResult;
`;
