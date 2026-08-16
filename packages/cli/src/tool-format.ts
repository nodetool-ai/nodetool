/**
 * Compact, Claude-Code-style formatting for the builtin "basic" tools
 * (read/write/edit/list/glob/grep) and CodeAct's `execute_code`. For these,
 * the chat UI shows a friendly verb, a tight one-line parameter summary,
 * and a `⎿` result line derived from the tool's structured output — e.g.
 *
 *   ● Read(src/app.tsx)
 *     ⎿  Read 47 lines
 *
 *   ● Run  Rendering product images from CSV
 *       const listed = await nodetool.workflows.list();
 *     ⎿  { count: 3 }  ·  1 tool call
 *
 * Every other tool keeps the generic `name(key: value)` + raw preview render.
 */

const EXECUTE_CODE_TOOL_NAME = "execute_code";

/** Map from canonical builtin tool name → the verb shown in the UI. */
const FRIENDLY_NAMES: Record<string, string> = {
  read_file: "Read",
  write_file: "Write",
  edit_file: "Edit",
  list_directory: "List",
  glob: "Search",
  grep: "Grep",
};

/** True when the tool gets the compact Claude-Code-style treatment. */
export function isBasicTool(name: string): boolean {
  return name in FRIENDLY_NAMES;
}

/** True when the tool is CodeAct's `execute_code` action. */
export function isCodeAction(name: string): boolean {
  return name === EXECUTE_CODE_TOOL_NAME;
}

/** True when the result should go through {@link formatToolResult}. */
export function isFormattedTool(name: string): boolean {
  return isBasicTool(name) || isCodeAction(name);
}

/** Friendly verb for a formatted tool, or the raw name otherwise. */
export function friendlyToolName(name: string): string {
  if (isCodeAction(name)) return "Run";
  return FRIENDLY_NAMES[name] ?? name;
}

function str(v: unknown): string {
  if (isStr(v)) return v;
  if (v == null) return "";
  return String(v);
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function isStr(v: unknown): v is string {
  return typeof v === "string";
}

function isNum(v: unknown): v is number {
  return typeof v === "number";
}

function isBool(v: unknown): v is boolean {
  return typeof v === "boolean";
}

function firstLine(s: string): string {
  const i = s.indexOf("\n");
  return i === -1 ? s : s.slice(0, i);
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

/** Live status label: the action title for `execute_code`, else the verb. */
export function toolStatusLabel(
  name: string,
  args?: Record<string, unknown>
): string {
  if (isCodeAction(name)) {
    const title = str(args?.title).trim();
    return title || "Run";
  }
  return friendlyToolName(name);
}

/** One-line fallback preview for an arbitrary result value. */
function genericPreview(result: unknown): string {
  const s = isStr(result) ? result : safeJson(result);
  return truncate(firstLine(s), 200);
}

/**
 * The parenthesized header text for a basic tool — just the salient
 * argument(s), not the full `key: JSON` dump.
 */
export function formatToolParams(
  name: string,
  args?: Record<string, unknown>
): string {
  if (!args) return "";
  switch (name) {
    case "read_file": {
      const path = str(args.file_path);
      const offset = args.offset;
      const limit = args.limit;
      if (isNum(offset) || isNum(limit)) {
        const start = isNum(offset) ? offset : 1;
        const range = isNum(limit)
          ? `${start}-${start + limit - 1}`
          : `${start}+`;
        return `${path}, lines ${range}`;
      }
      return path;
    }
    case "write_file":
      return str(args.file_path);
    case "edit_file":
      return str(args.path);
    case "list_directory":
      return str(args.path) || ".";
    case "glob": {
      const pattern = str(args.pattern);
      const path = str(args.path);
      return path ? `${pattern} in ${path}` : pattern;
    }
    case "grep": {
      let s = `"${str(args.pattern)}"`;
      const include = str(args.include);
      const path = str(args.path);
      if (include) s += `, ${include}`;
      if (path) s += ` in ${path}`;
      return s;
    }
    case EXECUTE_CODE_TOOL_NAME:
      return str(args.title).trim();
    default:
      return Object.entries(args)
        .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
        .join(", ");
  }
}

/** Thousands-grouped count, e.g. 1234 → "1,234". */
function num(n: number): string {
  return n.toLocaleString("en-US");
}

function plural(n: number, one: string, many: string): string {
  return `${num(n)} ${n === 1 ? one : many}`;
}

function errorLine(result: Record<string, unknown>): string {
  return truncate(`Error: ${firstLine(str(result.error))}`, 200);
}

/**
 * The `⎿` summary line for a basic tool, derived from its structured result.
 * Falls back to a generic one-line preview for unexpected shapes (e.g. the
 * WebSocket path delivers results as pre-serialized strings).
 */
export function formatToolResult(
  name: string,
  _args: Record<string, unknown> | undefined,
  result: unknown
): string {
  switch (name) {
    case "read_file":
      if (isStr(result)) {
        if (result.startsWith("Error:")) return firstLine(result);
        const body = result.split("\n\n[")[0];
        const n = body === "" ? 0 : body.split("\n").length;
        return `Read ${plural(n, "line", "lines")}`;
      }
      break;
    case "write_file":
      // Already a clean summary: "Created X" / "Updated X" / "Error: …".
      if (isStr(result)) return firstLine(result);
      break;
    case "list_directory":
      if (isStr(result)) {
        if (result.startsWith("Error:")) return firstLine(result);
        if (result.startsWith("(empty)")) return "Empty directory";
        const n = result.split("\n").filter(Boolean).length;
        return `Listed ${plural(n, "item", "items")}`;
      }
      break;
    case "edit_file":
      if (isObj(result)) {
        if (result.success === false) return errorLine(result);
        if (result.created) return `Created ${str(result.path)}`;
        const n =
          isNum(result.replacements) ? result.replacements : 1;
        return `Updated ${str(result.path)} (${plural(n, "edit", "edits")})`;
      }
      break;
    case "glob":
      if (isObj(result)) {
        if (result.success === false) return errorLine(result);
        const n =
          isNum(result.match_count) ? result.match_count : 0;
        return `Found ${plural(n, "file", "files")}${
          result.truncated ? " (truncated)" : ""
        }`;
      }
      break;
    case "grep":
      if (isObj(result)) {
        if (result.success === false) return errorLine(result);
        const n =
          isNum(result.match_count) ? result.match_count : 0;
        return `Found ${plural(n, "match", "matches")}${
          result.truncated ? " (truncated)" : ""
        }`;
      }
      break;
    case EXECUTE_CODE_TOOL_NAME:
      return formatExecuteCodeResult(result);
  }
  return genericPreview(result);
}

function parseObservation(result: unknown): Record<string, unknown> | null {
  let value: unknown = result;
  if (isStr(result)) {
    const trimmed = result.trim();
    if (!trimmed.startsWith("{")) return null;
    try {
      value = JSON.parse(trimmed);
    } catch {
      return null;
    }
  }
  if (!isObj(value)) return null;
  if (
    isBool(value.ok) ||
    "error" in value ||
    "result" in value ||
    "toolCalls" in value ||
    "logs" in value
  ) {
    return value;
  }
  return null;
}

function compactValue(value: unknown): string {
  if (isStr(value)) return firstLine(value);
  if (isNum(value) || isBool(value)) {
    return String(value);
  }
  if (value == null) return String(value);
  return safeJson(value);
}

/** Observation envelope → one headline plus optional log lines. */
function formatExecuteCodeResult(result: unknown): string {
  const obs = parseObservation(result);
  if (!obs) return genericPreview(result);

  if (obs.ok === false || isStr(obs.error)) {
    const err = str(obs.error) || "failed";
    return truncate(`Error: ${firstLine(err)}`, 200);
  }

  const parts: string[] = [];
  if (obs.result !== undefined) {
    parts.push(truncate(compactValue(obs.result), 160));
  }
  if (isNum(obs.toolCalls) && obs.toolCalls > 0) {
    parts.push(plural(obs.toolCalls, "tool call", "tool calls"));
  }
  const logs = Array.isArray(obs.logs)
    ? obs.logs.filter(isStr)
    : [];
  if (logs.length > 0) {
    parts.push(plural(logs.length, "log", "logs"));
  }

  const lines = [parts.join("  ·  ") || "Done"];
  for (const log of logs.slice(0, 3)) {
    lines.push(truncate(firstLine(log), 160));
  }
  if (logs.length > 3) {
    const more = logs.length - 3;
    lines.push(`… +${more} more ${more === 1 ? "log" : "logs"}`);
  }
  return lines.join("\n");
}

const MAX_CODE_LINES = 12;

function dedentCode(code: string): string[] {
  const normalized = code.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.replace(/\t/g, "  ").split("\n");
  while (lines.length > 0 && lines[0].trim() === "") lines.shift();
  while (lines.length > 0 && lines[lines.length - 1].trim() === "") {
    lines.pop();
  }
  const indents = lines
    .filter((line) => line.trim().length > 0)
    .map((line) => line.match(/^ */)?.[0].length ?? 0);
  const pad = indents.length > 0 ? Math.min(...indents) : 0;
  return lines.map((line) => line.slice(pad));
}

/**
 * Dedented program lines for an `execute_code` call, or null when there is
 * no code to show. Caps long programs the way {@link formatToolDiff} does.
 */
export function formatToolCode(
  name: string,
  args?: Record<string, unknown>
): string[] | null {
  if (!args || !isCodeAction(name)) return null;
  const raw = str(args.code);
  if (!raw.trim()) return null;
  const lines = dedentCode(raw);
  if (lines.length === 0) return null;
  if (lines.length <= MAX_CODE_LINES) return lines;
  const shown = lines.slice(0, MAX_CODE_LINES);
  const more = lines.length - MAX_CODE_LINES;
  shown.push(`… +${more} more ${more === 1 ? "line" : "lines"}`);
  return shown;
}

// ---------------------------------------------------------------------------
// Edit diff — a compact red/green preview of what an `edit_file` changed,
// derived from the old_string/new_string args (available on both the direct
// and WebSocket paths). Claude-Code-style, but dependency-free.
// ---------------------------------------------------------------------------

export interface DiffLine {
  /** "-" removed, "+" added, " " a meta/context note. */
  sign: "-" | "+" | " ";
  text: string;
}

const MAX_DIFF_LINES = 8;

function cap(lines: DiffLine[]): DiffLine[] | null {
  if (lines.length === 0) return null;
  if (lines.length <= MAX_DIFF_LINES) return lines;
  const shown = lines.slice(0, MAX_DIFF_LINES);
  const more = lines.length - MAX_DIFF_LINES;
  shown.push({ sign: " ", text: `… +${more} more ${more === 1 ? "line" : "lines"}` });
  return shown;
}

/** Block diff with shared leading/trailing lines trimmed off. */
function diffBlock(oldStr: string, newStr: string): DiffLine[] | null {
  const oldLines = oldStr === "" ? [] : oldStr.split("\n");
  const newLines = newStr === "" ? [] : newStr.split("\n");

  let start = 0;
  while (
    start < oldLines.length &&
    start < newLines.length &&
    oldLines[start] === newLines[start]
  ) {
    start++;
  }
  let oEnd = oldLines.length;
  let nEnd = newLines.length;
  while (
    oEnd > start &&
    nEnd > start &&
    oldLines[oEnd - 1] === newLines[nEnd - 1]
  ) {
    oEnd--;
    nEnd--;
  }

  const lines: DiffLine[] = [];
  for (let i = start; i < oEnd; i++) lines.push({ sign: "-", text: oldLines[i] });
  for (let i = start; i < nEnd; i++) lines.push({ sign: "+", text: newLines[i] });
  return cap(lines);
}

/**
 * Lines for the colored diff shown below an edit's summary, or null when
 * there's nothing useful to render. Only `edit_file` is diffed — writes show
 * just their one-line summary.
 */
export function formatToolDiff(
  name: string,
  args?: Record<string, unknown>
): DiffLine[] | null {
  if (!args || name !== "edit_file") return null;
  return diffBlock(str(args.old_string), str(args.new_string));
}
