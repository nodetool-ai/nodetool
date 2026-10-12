import { gameLoadCommand, gameSaveCommand } from "@nodetool-ai/protocol";
import { z } from "zod";

import { gameScriptLogCommand } from "./script-log.js";
import { gameScriptCommand } from "./scripts.js";
import { gameScriptLifecycleDeclaration, gameScriptSchemaDeclaration, gameScriptWorldDeclaration } from "./script-declarations.js";

/** Monaco declarations for the native game function-expression contract. */
export const GAME_SCRIPT_TYPES = `
${gameScriptSchemaDeclaration("GameScriptCommand", z.union([gameScriptCommand, gameScriptLogCommand, gameSaveCommand, gameLoadCommand]))}

type JSONValue = string | number | boolean | null | JSONValue[] | { [key: string]: JSONValue };
type GameScriptParamValue = number | boolean | string | { x: number; y: number; z?: number } | null;
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
  /** Present when the behavior declares params. Entity and asset params are IDs or null. */
  params?: Readonly<Record<string, GameScriptParamValue>>;
  /** Finished \`load\` commands from earlier ticks. data is null for an empty slot. */
  loaded?: readonly { scope: "progress" | "settings"; slot: string; data: Record<string, JSONValue> | null }[];
};

type GameScriptResult = { state: unknown; commands: GameScriptCommand[] };
type GameScript = (input: GameScriptInput) => GameScriptResult;
`;

/** Global world queries available during a script call. */
export const GAME_SCRIPT_WORLD_TYPES = gameScriptWorldDeclaration(
  "{ id: string; source: string; x: number; y: number; velocityX: number; velocityY: number; grounded: boolean }"
);

/** Lifecycle-object scripts and timers, composed after the compatibility-pinned input types. */
export const GAME_SCRIPT_LIFECYCLE_TYPES = gameScriptLifecycleDeclaration("GameScriptHooks", "GameScriptInput", "GameScriptCommand");
