/**
 * The native flow surface for a CodeAct session: call a registry node as a
 * typed async function and write the control flow in plain JavaScript.
 *
 * The graph DSL authors an artifact — a workflow the editor can open and the
 * server can run. The flow pack is for a turn that just wants values: no
 * graph, no edges, `await` is the edge and `Promise.all` is the fan-out.
 * Each call bridges through the `flow` capability module, so it passes the
 * same per-call permission gate every capability call does.
 *
 * The pack is guest code like any other, so it reaches an action only
 * through the session allowlist. This module adds it when the catalog
 * actually serves the pack — never when it is missing, so no prompt
 * advertises an import that fails.
 */

import type { SandboxModuleCatalog } from "@nodetool-ai/runtime";

/** The pack's root specifier: one generated module per node namespace. */
export const FLOW_PACKAGE = "@nodetool-ai/sandbox-flow";

/** Whether a catalog serves the flow pack — i.e. whether it is installed. */
export function catalogServesFlow(
  catalog: SandboxModuleCatalog | null | undefined
): boolean {
  return (catalog?.summaries() ?? []).some(
    (summary) => summary.specifier === FLOW_PACKAGE
  );
}

/**
 * The session allowlist with the flow pack added when this machine installed
 * it. Leaves the list unchanged when the pack is absent or already allowed.
 */
export function withFlowPackage(
  allowed: readonly string[],
  catalog: SandboxModuleCatalog | null | undefined
): string[] {
  if (allowed.includes(FLOW_PACKAGE)) {
    return [...allowed];
  }
  if (!catalogServesFlow(catalog)) {
    return [...allowed];
  }
  return [...allowed, FLOW_PACKAGE];
}

/**
 * The prompt section for calling nodes directly. Render only when the pack
 * is on the allowlist — {@link withFlowPackage} decides that.
 */
export const FLOW_PROMPT_SECTION = `# Calling nodes directly (native flow)

Run a node as a typed async function with \`${FLOW_PACKAGE}\`: one generated
function per node type, taking that node's real inputs and resolving to its
outputs record. Use it when you want the node's value in this action —
branches, loops, retries, and fan-out are plain JavaScript. When the result
must be a saved, editable workflow, author a graph instead.

\`\`\`js
import "@nodetool-ai/sandbox-nodetool/flow"; // mounts the bridge — required
import { concat } from "${FLOW_PACKAGE}/nodetool.text";

const joined = await concat({ a: "hi ", b: "there" });   // {output: "hi there"}
const many = await Promise.all(items.map((b) => concat({ a: "» ", b })));
\`\`\`

- The bare capability import must appear in the body — without it every flow
  call fails saying the bridge is not mounted.
- A streaming-output node also carries \`.stream(inputs)\`, an async iterable
  of partial outputs; early \`break\` closes the stream and runs node cleanup.
- Errors reject the call — \`try\`/\`catch\` is the supervisor. Stream-typed
  inputs accept plain arrays.
- A node type the catalog does not have has no export, so the import fails
  before the action runs. Find the real one with \`nodetool.nodes.search()\`,
  then import its namespace.`;
