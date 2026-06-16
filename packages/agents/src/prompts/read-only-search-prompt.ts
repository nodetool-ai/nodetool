/**
 * Prompt module for the read-only `run_search` subtask tool.
 *
 * A `run_search` call spins up a depth-bounded child agent loop restricted to
 * a strictly read-only toolset (read_file, glob, grep, list_directory,
 * memory_read). This module supplies:
 *
 * - {@link READ_ONLY_SEARCH_DESCRIPTION} — the tool's user/LLM-facing
 *   description string.
 * - {@link buildReadOnlySearchPrompt} — the adapted exploration prompt handed
 *   to the child loop, parameterized by the caller's `query` and a `breadth`
 *   hint that selects how wide the sweep should be.
 *
 * The text is intentionally vendor-neutral: it speaks of "this assistant" /
 * "the search" and names no product, vendor, or model.
 */

/** How wide the read-only search should sweep. */
export type SearchBreadth = "medium" | "very thorough";

/**
 * Tool description for `run_search`. Neutral wording — no vendor or product
 * names. Surfaced to the model so it knows when to delegate a fan-out search.
 */
export const READ_ONLY_SEARCH_DESCRIPTION = [
  "Run a read-only search across the workspace and report back conclusions,",
  "not raw file dumps. Use this when answering a question requires fanning out",
  "across many files or directories to locate where something lives or how it",
  "is wired. A focused child loop runs with read-only tools only (read_file,",
  "glob, grep, list_directory, memory_read); it cannot edit, create, delete,",
  "or run anything, and it cannot spawn further work. It reads excerpts rather",
  "than whole files, so it is for locating code, not for reviewing or auditing",
  "it. Provide a precise `query`. Set `breadth` to \"medium\" for a targeted",
  "look across a few likely locations, or \"very thorough\" for a systematic",
  "sweep across many locations and naming variants. The result is a short",
  "report: the relevant file:line locations plus a concise summary of what was",
  "found."
].join(" ");

const BREADTH_PARAGRAPH: Readonly<Record<SearchBreadth, string>> = {
  medium:
    "Aim for a targeted search: check the few most likely locations and the " +
    "obvious naming variants. Stop once you have confidently located the " +
    "answer; you do not need to enumerate every occurrence.",
  "very thorough":
    "Aim for a systematic sweep: search across all plausible locations and a " +
    "wide range of naming conventions and synonyms. Cross-check related areas " +
    "and keep going until you are confident you have found every relevant " +
    "location, not just the first one."
};

/**
 * Build the adapted exploration prompt for a read-only search loop. The
 * returned text is used as the child {@link import("../types.js").Step}'s
 * `instructions`, so it lands in the prose template's objective slot.
 *
 * @param query   The caller's search request, embedded verbatim.
 * @param breadth Selects the breadth paragraph; defaults to "medium".
 */
export function buildReadOnlySearchPrompt(
  query: string,
  breadth: SearchBreadth
): string {
  const breadthParagraph =
    BREADTH_PARAGRAPH[breadth] ?? BREADTH_PARAGRAPH.medium;
  return [
    "# Role",
    "You are a read-only search specialist. Your job is to locate where things",
    "live in this workspace and report concise, accurate conclusions — never to",
    "change anything.",
    "",
    "# Search request",
    query,
    "",
    "# Hard constraints",
    "- You are running in strictly read-only mode. You may ONLY use: read_file,",
    "  glob, grep, list_directory, and memory_read.",
    "- You must NOT create, modify, move, or delete files, and you must NOT",
    "  execute code or commands. No tool that changes state is available to you;",
    "  do not ask for one.",
    "- You cannot delegate or spawn additional work. Complete the search",
    "  yourself with the tools you have.",
    "- You read excerpts, not entire files. Treat your view of any file as",
    "  partial. This means you can say where something is, but you must not",
    "  claim a file is fully reviewed, audited, or free of other occurrences.",
    "",
    "# How to search",
    "- Start broad with glob/list_directory to map the relevant areas, then",
    "  narrow with grep for the specific symbols, strings, or patterns in the",
    "  request.",
    "- Issue independent read-only tool calls together in one turn whenever they",
    "  don't depend on each other — parallel lookups are faster than serial",
    "  ones.",
    "- Try several naming variants for a concept (camelCase, snake_case,",
    "  kebab-case, abbreviations, and likely synonyms) before concluding",
    "  something is absent.",
    "- Open the most promising matches with read_file to confirm context and",
    "  capture exact line numbers. Confirm before you report; do not guess line",
    "  numbers.",
    "- If memory_read may hold relevant prior findings for this query, consult",
    "  it.",
    "",
    "# Breadth",
    breadthParagraph,
    "",
    "# Reporting",
    "- Do not call any tool in your final turn — your final assistant message",
    "  (with no tool calls) is the report and ends the search.",
    "- Report conclusions, not file contents. Do NOT paste whole files.",
    "- Lead with the concrete locations as `path:line` (or",
    "  `path:startLine-endLine`) entries, each with a one-line note on why it is",
    "  relevant.",
    "- Follow with a concise summary (a few sentences) answering the request and",
    "  explaining how the pieces connect.",
    "- If you found nothing, say so plainly and list the patterns and locations",
    "  you checked so the caller knows the search was real.",
    "- State uncertainty honestly. If a result is partial or you could not",
    "  confirm something, say which part is unverified."
  ].join("\n");
}
