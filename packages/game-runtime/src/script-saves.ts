import { gameLoadCommand, gameSaveCommand, MAX_GAME_SAVE_REQUESTS_PER_TICK, type GameSaveData, type GameSaveScope } from "@nodetool-ai/protocol";
import { z } from "zod";

/**
 * A save or load a script asked for during a tick. The host performs it after the tick, outside the simulation.
 * Requests never enter snapshots, events or replay state. A load's result reaches scripts on a later input frame.
 */
export type GameSaveRequest =
  | { readonly kind: "save"; readonly tick: number; readonly entityId: string; readonly scope: GameSaveScope; readonly slot: string;
    readonly data: GameSaveData; readonly snapshot: boolean }
  | { readonly kind: "load"; readonly tick: number; readonly entityId: string; readonly scope: GameSaveScope; readonly slot: string };

/** Collects one tick's save and load commands, at most `MAX_GAME_SAVE_REQUESTS_PER_TICK` across all calls. */
export class GameScriptSaveCollector {
  private readonly requests: GameSaveRequest[] = [];

  constructor(private readonly tick: number) {}

  /**
   * Removes save and load commands from a call's raw output commands and records them in order.
   * Returns the input array unchanged when it holds neither.
   */
  collect(entityId: string, commands: unknown): unknown {
    if (!Array.isArray(commands) || !commands.some(isSaveCommand)) { return commands; }
    const rest: unknown[] = [];
    for (const [index, command] of commands.entries()) {
      if (!isSaveCommand(command)) { rest.push(command); continue; }
      if (this.requests.length >= MAX_GAME_SAVE_REQUESTS_PER_TICK) {
        throw new Error(`Save and load commands exceed ${MAX_GAME_SAVE_REQUESTS_PER_TICK} per tick`);
      }
      const kind = (command as { kind: "save" | "load" }).kind;
      if (kind === "save") {
        const parsed = gameSaveCommand.safeParse(command);
        if (!parsed.success) { throw new Error(`Invalid save command at index ${index}: ${z.prettifyError(parsed.error)}`); }
        const { slot, data, scope = "progress", snapshot = false } = parsed.data;
        if (scope === "settings" && snapshot) { throw new Error(`Invalid save command at index ${index}: settings saves cannot store a snapshot`); }
        this.requests.push({ kind, tick: this.tick, entityId, scope, slot, data, snapshot });
      } else {
        const parsed = gameLoadCommand.safeParse(command);
        if (!parsed.success) { throw new Error(`Invalid load command at index ${index}: ${z.prettifyError(parsed.error)}`); }
        this.requests.push({ kind, tick: this.tick, entityId, scope: parsed.data.scope ?? "progress", slot: parsed.data.slot });
      }
    }
    return rest;
  }

  entries(): readonly GameSaveRequest[] {
    return this.requests;
  }
}

function isSaveCommand(command: unknown): boolean {
  if (typeof command !== "object" || command === null) { return false; }
  const kind = (command as { kind?: unknown }).kind;
  return kind === "save" || kind === "load";
}
