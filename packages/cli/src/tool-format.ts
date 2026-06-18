/**
 * Compact, Claude-Code-style formatting for the builtin "basic" tools
 * (read/write/edit/list/glob/grep/run). For these, the chat UI shows a
 * friendly verb, a tight one-line parameter summary, and a `⎿` result line
 * derived from the tool's structured output — e.g.
 *
 *   ● Read(src/app.tsx)
 *     ⎿  Read 47 lines
 *
 * Every other tool keeps the generic `name(key: value)` + raw preview render.
 */

/** Map from canonical builtin tool name → the verb shown in the UI. */
const FRIENDLY_NAMES: Record<string, string> = {
  read_file: "Read",
  write_file: "Write",
  edit_file: "Edit",
  list_directory: "List",
  glob: "Search",
  grep: "Grep",
  run_code: "Run",
  js: "Run",
};

/** True when the tool gets the compact Claude-Code-style treatment. */
export function isBasicTool(name: string): boolean {
  return name in FRIENDLY_NAMES;
}

/** Friendly verb for a basic tool, or the raw name otherwise. */
export function friendlyToolName(name: string): string {
  return FRIENDLY_NAMES[name] ?? name;
}

function str(v: unknown): string {
  if (typeof v === "string") return v;
  if (v == null) return "";
  return String(v);
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
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

/** One-line fallback preview for an arbitrary result value. */
function genericPreview(result: unknown): string {
  const s = typeof result === "string" ? result : safeJson(result);
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
      if (typeof offset === "number" || typeof limit === "number") {
        const start = typeof offset === "number" ? offset : 1;
        const range =
          typeof limit === "number" ? `${start}-${start + limit - 1}` : `${start}+`;
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
    case "run_code":
    case "js":
      return truncate(firstLine(str(args.code).trim()), 50);
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
      if (typeof result === "string") {
        if (result.startsWith("Error:")) return firstLine(result);
        const body = result.split("\n\n[")[0];
        const n = body === "" ? 0 : body.split("\n").length;
        return `Read ${plural(n, "line", "lines")}`;
      }
      break;
    case "write_file":
      // Already a clean summary: "Created X" / "Updated X" / "Error: …".
      if (typeof result === "string") return firstLine(result);
      break;
    case "list_directory":
      if (typeof result === "string") {
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
          typeof result.replacements === "number" ? result.replacements : 1;
        return `Updated ${str(result.path)} (${plural(n, "edit", "edits")})`;
      }
      break;
    case "glob":
      if (isObj(result)) {
        if (result.success === false) return errorLine(result);
        const n =
          typeof result.match_count === "number" ? result.match_count : 0;
        return `Found ${plural(n, "file", "files")}${
          result.truncated ? " (truncated)" : ""
        }`;
      }
      break;
    case "grep":
      if (isObj(result)) {
        if (result.success === false) return errorLine(result);
        const n =
          typeof result.match_count === "number" ? result.match_count : 0;
        return `Found ${plural(n, "match", "matches")}${
          result.truncated ? " (truncated)" : ""
        }`;
      }
      break;
    case "run_code":
    case "js":
      if (isObj(result)) {
        if (result.exitCode === 0) {
          const out = str(result.stdout).trim();
          return out ? truncate(firstLine(out), 200) : "Ran (no output)";
        }
        const err = str(result.stderr).trim();
        return err
          ? truncate(`Error: ${firstLine(err)}`, 200)
          : `Exited with code ${str(result.exitCode)}`;
      }
      break;
  }
  return genericPreview(result);
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
