/**
 * The NodeTool tools that mirror a Claude Agent SDK built-in.
 *
 * Two rules follow from that mirroring, and this module is the one place both
 * read:
 *
 * 1. **Top level, not CodeAct.** Every provider gets these as ordinary tool
 *    definitions instead of finding them behind `execute_code`. They are the
 *    shapes every frontier model is trained on, so a tool call costs less than
 *    a sandbox round trip that only forwards one.
 * 2. **The built-in wins on the Claude Agent SDK.** That provider runs the
 *    SDK's own agent loop, which already ships `Read`/`Write`/`Grep`/… . A
 *    NodeTool copy next to the built-in is a second surface for one capability,
 *    so {@link SDK_NATIVE_TOOL_REPLACEMENTS} names the ones the built-in
 *    replaces outright and the provider drops them from its MCP toolset.
 */

/**
 * Tools lifted out of the CodeAct sandbox and offered top level, for every
 * provider. Membership is decided by "the Claude Agent SDK has a built-in for
 * this", not by how often the tool is used.
 */
export const CORE_TOOL_NAMES: ReadonlySet<string> = new Set([
  // Read / Write / Edit / Glob / Grep.
  "read_file",
  "write_file",
  "edit_file",
  "list_directory",
  "glob",
  "grep",
  // WebSearch / WebFetch.
  "web_search",
  "browser",
  "http_request",
  "download_file",
  // TodoWrite.
  "todo_write",
  // Task.
  "run_subtask"
]);

/**
 * NodeTool tool name → the Claude Agent SDK built-in that replaces it. Only
 * true replacements are listed. Three members of {@link CORE_TOOL_NAMES} are
 * deliberately absent:
 *
 * - `list_directory` — `Glob` matches a pattern; it does not list a directory.
 * - `browser` / `http_request` / `download_file` — `WebFetch` is a prompted GET
 *   that writes nothing, so it covers none of the three in full.
 * - `run_subtask` — `Task` spawns an SDK agent holding SDK tools. The child
 *   would lose the NodeTool toolbelt the parent passed it.
 */
export const SDK_NATIVE_TOOL_REPLACEMENTS: ReadonlyMap<string, string> = new Map(
  [
    ["read_file", "Read"],
    ["write_file", "Write"],
    ["edit_file", "Edit"],
    ["glob", "Glob"],
    ["grep", "Grep"],
    ["web_search", "WebSearch"],
    ["todo_write", "TodoWrite"]
  ]
);

/**
 * The replacements that resolve paths. NodeTool's versions are contained to the
 * run's workspace directory; the SDK's built-ins resolve against the session
 * `cwd`. Substituting one for the other is only equivalent when that `cwd` is
 * the workspace, so a caller that passes no workspace directory keeps the
 * NodeTool tools.
 */
export const SDK_NATIVE_WORKSPACE_SCOPED: ReadonlySet<string> = new Set([
  "read_file",
  "write_file",
  "edit_file",
  "glob",
  "grep"
]);

/**
 * The SDK built-ins that replace a NodeTool tool for this call.
 *
 * @param toolNames Tool names the caller offered.
 * @param workspaceDir The session `cwd`. Without it the path-scoped
 *   replacements are skipped — see {@link SDK_NATIVE_WORKSPACE_SCOPED}.
 */
export function sdkNativeReplacements(
  toolNames: Iterable<string>,
  workspaceDir?: string
): Set<string> {
  const replaced = new Set<string>();
  for (const name of toolNames) {
    if (!SDK_NATIVE_TOOL_REPLACEMENTS.has(name)) continue;
    if (!workspaceDir && SDK_NATIVE_WORKSPACE_SCOPED.has(name)) continue;
    replaced.add(name);
  }
  return replaced;
}
