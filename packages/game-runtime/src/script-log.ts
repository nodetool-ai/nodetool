import { z } from "zod";

/** Script log lines kept per tick. Later lines in the same tick collapse into one overflow line. */
export const GAME_SCRIPT_LOG_LIMIT = 32;
/**
 * UTF-16 code units kept from one log message, cut back to a code-point boundary. Longer messages are truncated.
 * Log text still counts toward the 64 KiB output limit of a script call, which fails the call when exceeded.
 */
export const GAME_SCRIPT_LOG_MESSAGE_LIMIT = 1000;
/** UTF-16 code units allowed in a log tag. */
export const GAME_SCRIPT_LOG_TAG_LIMIT = 64;
/** Characters of JSON kept from one log line's `data`. */
export const GAME_SCRIPT_LOG_DATA_LIMIT = 4096;

/**
 * A script command that writes a line to the editor console. It never reaches the simulation: the runner
 * removes it from the call's commands, so it does not count against `maxCommands` or enter snapshots or replay state.
 */
export const gameScriptLogCommand = z.strictObject({
  kind: z.literal("log"),
  message: z.string(),
  level: z.enum(["log", "warning", "error"]).optional(),
  /** A short label that a test run can filter on, such as `GOLEM_TRUTH`. */
  tag: z.string().min(1).max(GAME_SCRIPT_LOG_TAG_LIMIT).optional(),
  /** JSON data for tools to read. Data longer than `GAME_SCRIPT_LOG_DATA_LIMIT` characters of JSON is dropped. */
  data: z.json().optional()
});

/**
 * A script command that checks a promise of the game in a test run. A test run fails the call when `ok` is false.
 * Play drops it. Like `log`, it never reaches the simulation, the command limit, snapshots or replay state.
 */
export const gameScriptAssertCommand = z.strictObject({
  kind: z.literal("assert"),
  ok: z.boolean(),
  message: z.string()
});

export type GameScriptAssertCommand = z.infer<typeof gameScriptAssertCommand>;

export type GameScriptLogCommand = z.infer<typeof gameScriptLogCommand>;

/** A log line from one script call. Log lines are presentation data. The overflow line names no entity. */
export interface GameScriptLogEntry {
  readonly tick: number;
  readonly entityId?: string;
  readonly level: NonNullable<GameScriptLogCommand["level"]>;
  readonly message: string;
  readonly tag?: string;
  readonly data?: z.core.util.JSONType;
}

/** Collects one tick's log lines with the per-tick and per-message limits applied. */
export class GameScriptLogCollector {
  private readonly lines: GameScriptLogEntry[] = [];
  private dropped = 0;

  /** `test` makes a failing `assert` command throw. Without it, `assert` commands are dropped. */
  constructor(private readonly tick: number, private readonly test = false) {}

  /**
   * Removes log and assert commands from a call's raw output commands and records the log lines. Other commands keep
   * their order. Returns the input array unchanged when it holds neither.
   */
  collect(entityId: string, commands: unknown): unknown {
    if (!Array.isArray(commands) || !commands.some(isConsoleCommand)) { return commands; }
    const rest: unknown[] = [];
    for (const [index, command] of commands.entries()) {
      if (!isConsoleCommand(command)) { rest.push(command); continue; }
      if (command.kind === "assert") {
        const assertion = gameScriptAssertCommand.safeParse(command);
        if (!assertion.success) { throw new Error(`Invalid assert command at index ${index}: ${z.prettifyError(assertion.error)}`); }
        if (this.test && !assertion.data.ok) { throw new Error(`Assertion failed: ${truncateLogMessage(assertion.data.message)}`); }
        continue;
      }
      const parsed = gameScriptLogCommand.safeParse(command);
      if (!parsed.success) { throw new Error(`Invalid log command at index ${index}: ${z.prettifyError(parsed.error)}`); }
      if (this.lines.length >= GAME_SCRIPT_LOG_LIMIT) { this.dropped += 1; continue; }
      const { message, level = "log", tag, data } = parsed.data;
      const line: { -readonly [Key in keyof GameScriptLogEntry]: GameScriptLogEntry[Key] } = { tick: this.tick, entityId, level, message: truncateLogMessage(message) };
      if (tag !== undefined) { line.tag = tag; }
      if (data !== undefined) {
        if (JSON.stringify(data).length <= GAME_SCRIPT_LOG_DATA_LIMIT) { line.data = data; }
        else { line.message = `${line.message} (data dropped: over ${GAME_SCRIPT_LOG_DATA_LIMIT} characters of JSON)`; }
      }
      this.lines.push(line);
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

function isConsoleCommand(command: unknown): command is { readonly kind: "log" | "assert" } {
  if (typeof command !== "object" || command === null) { return false; }
  const kind = (command as { kind?: unknown }).kind;
  return kind === "log" || kind === "assert";
}
