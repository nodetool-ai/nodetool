/**
 * Row phrasing for the tool-call timeline.
 *
 * A row reads as a sentence about what happened — "Opened page nodetool.ai",
 * "Ran 2 searches" — not as a tool identifier. The verb comes from the tool's
 * category; the detail is its most distinctive argument (a URL, a path, a
 * query), rendered in mono so it stands apart from the prose.
 */

import type { ToolCall } from "../../../stores/ApiTypes";
import { formatToolName } from "../../../utils/formatUtils";
import { isObjectLike, isString } from "../../../utils/typePredicates";

/** What a tool does, as far as the row phrasing is concerned. */
type ToolPhraseKind =
  | "plan"
  | "search"
  | "page"
  | "read"
  | "write"
  | "run"
  | "generic";

/**
 * Keywords are matched against whole name segments, not substrings: `cat`
 * inside `frobnicate` is not a file read, and the first bucket that matches
 * any segment wins.
 */
const KINDS: Array<{ words: readonly string[]; kind: ToolPhraseKind }> = [
  { words: ["plan"], kind: "plan" },
  { words: ["search", "grep", "glob", "lookup", "query"], kind: "search" },
  {
    words: ["browser", "crawl", "scrape", "fetch", "http", "url", "download", "visit"],
    kind: "page"
  },
  {
    words: ["write", "edit", "save", "update", "create", "delete", "upload"],
    kind: "write"
  },
  { words: ["read", "open", "cat", "list"], kind: "read" },
  { words: ["run", "exec", "execute", "bash", "shell", "command", "script"], kind: "run" }
];

/** Name segments, splitting on snake_case, camelCase and MCP's `__`. */
function nameSegments(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((segment) => segment.length > 0);
}

export function toolPhraseKind(name: string | null | undefined): ToolPhraseKind {
  if (!name) {
    return "generic";
  }
  const segments = new Set(nameSegments(name));
  for (const { words, kind } of KINDS) {
    if (words.some((word) => segments.has(word))) {
      return kind;
    }
  }
  return "generic";
}

/** Argument keys that identify *which* thing a call acted on. */
const DETAIL_KEYS = [
  "url",
  "uri",
  "path",
  "file",
  "filename",
  "target",
  "query",
  "q",
  "objective"
] as const;

/** A single row's label plus the mono-rendered thing it acted on. */
interface ToolRowPhrase {
  label: string;
  detail: string | null;
}

/**
 * The distinctive value a call acted on: a URL, a path, or a query. `"short"`
 * cuts a URL back to its hostname, for the one-line preview under a counted
 * row where several of them share the line. Null when the arguments carry
 * nothing worth reading.
 */
export function toolCallDetail(
  call: ToolCall,
  mode: "full" | "short" = "full"
): string | null {
  const args = call.args;
  if (!isObjectLike(args)) {
    return null;
  }
  for (const key of DETAIL_KEYS) {
    const raw = args[key];
    if (!isString(raw)) {
      continue;
    }
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      continue;
    }
    if (key !== "url" && key !== "uri") {
      return trimmed;
    }
    return mode === "short" ? urlHost(trimmed) : compactUrl(trimmed);
  }
  return null;
}

/** Argument keys that name a location rather than free text. */
const LOCATION_KEYS = ["url", "uri", "path", "file", "filename"] as const;

/** Whether a call's detail identifies a location rather than free text. */
function hasLocationDetail(call: ToolCall): boolean {
  const args = call.args;
  if (!isObjectLike(args)) {
    return false;
  }
  return LOCATION_KEYS.some((key) => {
    const raw = args[key];
    return isString(raw) && raw.trim().length > 0;
  });
}

function urlHost(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return value;
  }
}

function compactUrl(value: string): string {
  try {
    const url = new URL(value);
    const path = url.pathname === "/" ? "" : url.pathname;
    return `${url.hostname.replace(/^www\./, "")}${path}${url.search}`;
  } catch {
    return value;
  }
}

/** How a run of same-tool calls renders: one row each, or one counted row. */
type RunDisplay = "list" | "count";

/** Above this, a run is always counted — a wall of rows is not a timeline. */
const MAX_LISTED_RUN = 4;

export function toolCallRunDisplay(
  name: string,
  calls: readonly ToolCall[]
): RunDisplay {
  if (calls.length > MAX_LISTED_RUN) {
    return "count";
  }
  const kind = toolPhraseKind(name);
  if (kind !== "page" && kind !== "read" && kind !== "write") {
    return "count";
  }
  return calls.every(hasLocationDetail) ? "list" : "count";
}

const plural = (count: number, word: string) => {
  if (count === 1) {
    return word;
  }
  return /(?:s|x|ch|sh)$/.test(word) ? `${word}es` : `${word}s`;
};

/** The label for a run collapsed to a single counted row. */
export function toolCallCountLabel(name: string, count: number): string {
  switch (toolPhraseKind(name)) {
    case "plan":
      return count === 1 ? "Wrote a plan" : `Wrote ${count} plans`;
    case "search":
      return `Ran ${count} ${plural(count, "search")}`;
    case "page":
      return `Opened ${count} ${plural(count, "page")}`;
    case "read":
      return `Read ${count} ${plural(count, "item")}`;
    case "write":
      return `Made ${count} ${plural(count, "edit")}`;
    case "run":
      return count === 1
        ? `Ran ${formatToolName(name)}`
        : `Ran ${formatToolName(name)} ${count} times`;
    default:
      return count === 1
        ? formatToolName(name)
        : `${formatToolName(name)} ${count} times`;
  }
}

/** The label and detail for one call's row. */
export function toolCallPhrase(call: ToolCall): ToolRowPhrase {
  const name = call.name ?? "";
  const detail = toolCallDetail(call);
  switch (toolPhraseKind(name)) {
    case "plan":
      return detail
        ? { label: "Planned", detail }
        : { label: "Wrote a plan", detail: null };
    case "search":
      return detail
        ? { label: "Searched", detail }
        : { label: "Ran 1 search", detail: null };
    case "page":
      return detail
        ? { label: "Opened page", detail }
        : { label: "Opened 1 page", detail: null };
    case "read":
      return { label: detail ? "Read" : formatToolName(name), detail };
    case "write":
      return { label: detail ? "Edited" : formatToolName(name), detail };
    default:
      // `run` and everything unrecognized: the tool's own name is the clearest
      // thing we can say, with whatever it acted on beside it.
      return { label: formatToolName(name), detail };
  }
}
