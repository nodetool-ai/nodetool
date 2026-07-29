/**
 * ToolSearch — load deferred tool schemas on demand.
 *
 * Mirrors the Claude Code / Claude Agent SDK `ToolSearch` tool exactly so a
 * single system prompt describes both paths:
 *
 *  - On a provider that runs its own agent loop with native tool search
 *    (the Claude Agent SDK), the SDK defers tool schemas and exposes its own
 *    built-in `ToolSearch`; we do NOT register this tool there.
 *  - On every other provider, the harness keeps a small resident toolbelt,
 *    defers the long tail (announced by name in a `<system-reminder>`), and
 *    registers THIS tool so the model can pull schemas in with the same query
 *    grammar and the same `<functions>` result format.
 *
 * Query grammar (identical to Claude Code):
 *   - `select:Name1,Name2`  — fetch these exact tools by name.
 *   - `keyword words`        — keyword search over names + descriptions,
 *                              best `max_results` matches.
 *   - `+substr words`        — require `substr` in the tool name, rank by the
 *                              remaining terms.
 */

import type { JsonSchema, ProcessingContext } from "@nodetool-ai/runtime";
import { Tool } from "./base-tool.js";

/** A deferred tool the model can load: name, description, and full schema. */
export interface ToolSearchEntry {
  name: string;
  description?: string;
  parameters?: JsonSchema | Record<string, unknown>;
}

export const TOOL_SEARCH_DESCRIPTION =
  "Fetches full schema definitions for deferred tools so they can be called. " +
  "Deferred tools appear by name in <system-reminder> messages. Until fetched, " +
  "only the name is known — there is no parameter schema, so the tool cannot be " +
  "invoked. This tool takes a query, matches it against the deferred tool list, " +
  "and returns the matched tools' complete JSONSchema definitions inside a " +
  "<functions> block. Once a tool's schema appears in that result, it is " +
  "callable exactly like any tool defined up front.\n\n" +
  "Query forms:\n" +
  '- "select:Read,Edit,Grep" — fetch these exact tools by name\n' +
  '- "notebook jupyter" — keyword search, up to max_results best matches\n' +
  '- "+slack send" — require "slack" in the name, rank by remaining terms';

const TOOL_SEARCH_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    query: {
      type: "string",
      description:
        'Query to find deferred tools. Use "select:<tool_name>" for direct ' +
        "selection, or keywords to search."
    },
    max_results: {
      type: "number",
      description: "Maximum number of results to return (default: 5)",
      default: 5
    }
  },
  required: ["query"]
} as JsonSchema;

/**
 * Rank `catalog` against `query` per the Claude Code grammar and return the
 * matching entries (at most `maxResults`, except `select:` which returns all
 * named tools in the requested order).
 */
export function searchTools(
  catalog: readonly ToolSearchEntry[],
  query: string,
  maxResults = 5
): ToolSearchEntry[] {
  const q = (query ?? "").trim();
  if (!q) return [];

  // `select:` — exact names, returned in the order requested.
  if (q.toLowerCase().startsWith("select:")) {
    const byName = new Map(catalog.map((e) => [e.name, e]));
    const seen = new Set<string>();
    const out: ToolSearchEntry[] = [];
    for (const name of q.slice("select:".length).split(",")) {
      const trimmed = name.trim();
      const entry = byName.get(trimmed);
      if (entry && !seen.has(trimmed)) {
        seen.add(trimmed);
        out.push(entry);
      }
    }
    return out;
  }

  // `+substr` — first token (sans `+`) must appear in the tool name.
  let requiredNameSubstr: string | undefined;
  let terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (q.startsWith("+") && terms.length > 0) {
    requiredNameSubstr = terms[0].slice(1);
    terms = terms.slice(1);
  }

  const scored: Array<{ entry: ToolSearchEntry; score: number }> = [];
  for (const entry of catalog) {
    const nameLower = entry.name.toLowerCase();
    if (requiredNameSubstr && !nameLower.includes(requiredNameSubstr)) continue;
    const descLower = (entry.description ?? "").toLowerCase();
    let score = requiredNameSubstr ? 1 : 0;
    for (const term of terms) {
      if (nameLower.includes(term)) score += 3;
      if (descLower.includes(term)) score += 1;
    }
    // A bare `+substr` with no extra terms still surfaces every name match.
    if (score > 0 || terms.length === 0) scored.push({ entry, score });
  }
  scored.sort(
    (a, b) => b.score - a.score || a.entry.name.localeCompare(b.entry.name)
  );
  return scored.slice(0, Math.max(0, maxResults)).map((s) => s.entry);
}

/** Render matched tools as the `<functions>` block the model expects. */
export function formatToolSearchResult(entries: ToolSearchEntry[]): string {
  if (entries.length === 0) {
    return "No matching tools found. Try different keywords or a select: query.";
  }
  const lines = entries.map(
    (e) =>
      `<function>${JSON.stringify({
        description: e.description ?? "",
        name: e.name,
        parameters: e.parameters ?? { type: "object", properties: {} }
      })}</function>`
  );
  return `<functions>\n${lines.join("\n")}\n</functions>`;
}

/**
 * The `<system-reminder>` that announces deferred tools by name. The model
 * loads any it needs via {@link ToolSearchTool} before calling them.
 */
export function formatDeferredToolsReminder(
  catalog: readonly ToolSearchEntry[]
): string {
  if (catalog.length === 0) return "";
  const names = catalog.map((e) => e.name).join(", ");
  return (
    "<system-reminder>\n" +
    "The following tools are available but their schemas are NOT loaded — " +
    "calling them directly will fail. Use ToolSearch to load a tool's schema " +
    'before calling it (e.g. ToolSearch with query "select:<name>", or ' +
    "keywords to discover relevant tools):\n" +
    names +
    "\n</system-reminder>"
  );
}

/**
 * The `ToolSearch` tool. Constructed with the deferred-tool `catalog` and an
 * `onReveal` callback the harness uses to make the matched tools callable
 * (e.g. by appending their schemas to the live tool list).
 */
export class ToolSearchTool extends Tool {
  readonly name = "ToolSearch";
  readonly description = TOOL_SEARCH_DESCRIPTION;
  protected readonly jsonSchema = TOOL_SEARCH_SCHEMA;

  constructor(
    private readonly catalog: readonly ToolSearchEntry[],
    private readonly onReveal: (entries: ToolSearchEntry[]) => void
  ) {
    super();
  }

  async process(
    _context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const query = typeof params["query"] === "string" ? params["query"] : "";
    const maxResults =
      typeof params["max_results"] === "number" ? params["max_results"] : 5;
    const matches = searchTools(this.catalog, query, maxResults);
    if (matches.length > 0) this.onReveal(matches);
    return formatToolSearchResult(matches);
  }

  userMessage(params: Record<string, unknown>): string {
    const q = typeof params["query"] === "string" ? params["query"] : "";
    return `Searching tools: ${q}`;
  }
}
