import { z } from "zod";

/** Script log lines kept per tick. Later lines in the same tick collapse into one overflow line. */
export const GAME_SCRIPT_LOG_LIMIT = 32;
/**
 * UTF-16 code units kept from one log message, cut back to a code-point boundary. Longer messages are truncated.
 * Log text still counts toward the 64 KiB output limit of a script call, which fails the call when exceeded.
 */
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

/** A log line from one script call. Log lines are presentation data. The overflow line names no entity. */
export interface GameScriptLogEntry {
  readonly tick: number;
  readonly entityId?: string;
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
      this.lines.push({ tick: this.tick, entityId, level, message: truncateLogMessage(message) });
    }
    return rest;
  }

  /** Records a warning from the host, such as a skipped call. It shares the per-tick line limit with script lines. */
  warn(entityId: string | undefined, message: string): void {
    if (this.lines.length >= GAME_SCRIPT_LOG_LIMIT) { this.dropped += 1; return; }
    this.lines.push({ tick: this.tick, ...(entityId === undefined ? undefined : { entityId }), level: "warning", message });
  }

  entries(): readonly GameScriptLogEntry[] {
    if (this.dropped === 0) { return this.lines; }
    return [...this.lines, { tick: this.tick, level: "warning",
      message: `${this.dropped} more script log ${this.dropped === 1 ? "line" : "lines"} dropped at tick ${this.tick} (limit ${GAME_SCRIPT_LOG_LIMIT} per tick)` }];
  }
}

function truncateLogMessage(message: string): string {
  if (message.length <= GAME_SCRIPT_LOG_MESSAGE_LIMIT) { return message; }
  const last = message.charCodeAt(GAME_SCRIPT_LOG_MESSAGE_LIMIT - 1);
  // Never keep the high half of a surrogate pair without its low half.
  const end = last >= 0xd800 && last <= 0xdbff ? GAME_SCRIPT_LOG_MESSAGE_LIMIT - 1 : GAME_SCRIPT_LOG_MESSAGE_LIMIT;
  return `${message.slice(0, end)}…`;
}

const SCRIPT_LOGS = Symbol("gameScriptLogs");

/** Attaches the lines logged before a failure to the thrown error, unless it already carries some. */
export function withGameScriptLogs(error: unknown, logs: readonly GameScriptLogEntry[] | undefined): unknown {
  if (logs === undefined || logs.length === 0 || !(error instanceof Error) || SCRIPT_LOGS in error) { return error; }
  Object.defineProperty(error, SCRIPT_LOGS, { value: logs });
  return error;
}

/** The script log lines of a failed tick, logged before the failure. */
export function gameScriptLogsOf(error: unknown): readonly GameScriptLogEntry[] | undefined {
  return error instanceof Error && SCRIPT_LOGS in error ? (error as Error & { [SCRIPT_LOGS]: readonly GameScriptLogEntry[] })[SCRIPT_LOGS] : undefined;
}

function isLogCommand(command: unknown): boolean {
  return typeof command === "object" && command !== null && (command as { kind?: unknown }).kind === "log";
}
