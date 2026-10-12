import { z } from "zod";

/** Script log lines kept per tick. Later lines in the same tick collapse into one overflow line. */
export const GAME_SCRIPT_LOG_LIMIT = 32;
/** Characters kept from one log message. Longer messages are truncated, never rejected. */
export const GAME_SCRIPT_LOG_MESSAGE_LIMIT = 1000;

/**
 * A script command that writes a line to the editor console. It never reaches the simulation: the runner
 * removes it from the call's commands, so it does not count against `maxCommands` or enter snapshots or replay state.
 */
export const gameScriptLogCommand = z.strictObject({
  kind: z.literal("log"),
  message: z.string(),
  level: z.enum(["log", "warning", "error"]).optional()
});

export type GameScriptLogCommand = z.infer<typeof gameScriptLogCommand>;

/** A log line from one script call. Log lines are presentation data. */
export interface GameScriptLogEntry {
  readonly tick: number;
  readonly entityId: string;
  readonly level: NonNullable<GameScriptLogCommand["level"]>;
  readonly message: string;
}

/** Collects one tick's log lines with the per-tick and per-message limits applied. */
export class GameScriptLogCollector {
  private readonly lines: GameScriptLogEntry[] = [];
  private dropped = 0;

  constructor(private readonly tick: number) {}

  /**
   * Removes log commands from a call's raw output commands and records them. Other commands keep their order.
   * Returns the input array unchanged when it holds no log command.
   */
  collect(entityId: string, commands: unknown): unknown {
    if (!Array.isArray(commands) || !commands.some(isLogCommand)) { return commands; }
    const rest: unknown[] = [];
    for (const [index, command] of commands.entries()) {
      if (!isLogCommand(command)) { rest.push(command); continue; }
      const parsed = gameScriptLogCommand.safeParse(command);
      if (!parsed.success) { throw new Error(`Invalid log command at index ${index}: ${z.prettifyError(parsed.error)}`); }
      if (this.lines.length >= GAME_SCRIPT_LOG_LIMIT) { this.dropped += 1; continue; }
      const { message, level = "log" } = parsed.data;
      this.lines.push({ tick: this.tick, entityId, level,
        message: message.length > GAME_SCRIPT_LOG_MESSAGE_LIMIT ? `${message.slice(0, GAME_SCRIPT_LOG_MESSAGE_LIMIT)}…` : message });
    }
    return rest;
  }

  entries(): readonly GameScriptLogEntry[] {
    if (this.dropped === 0) { return this.lines; }
    const last = this.lines[this.lines.length - 1];
    return [...this.lines, { tick: this.tick, entityId: last.entityId, level: "warning",
      message: `${this.dropped} more script log lines dropped at tick ${this.tick} (limit ${GAME_SCRIPT_LOG_LIMIT} per tick)` }];
  }
}

function isLogCommand(command: unknown): boolean {
  return typeof command === "object" && command !== null && (command as { kind?: unknown }).kind === "log";
}
