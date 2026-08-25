/**
 * The workflow DSL a CodeAct session authors graphs with.
 *
 * The `nodetool.graph()` builder this replaced took a node type as a string,
 * so every type and every input name was something the model invented and
 * nothing checked until the graph was validated — or, worse, until it ran. The
 * DSL pack ships one generated function per node type, with that node's real
 * inputs, so a type the catalog does not have has no export to import and the
 * action fails before any code runs.
 *
 * The pack is guest code like any other, so it reaches an action only through
 * the session allowlist. That is what this module wires: a belt that can save,
 * validate and run a workflow gets the pack added to its allowlist, provided
 * the catalog actually serves it. A machine without the pack installed gets
 * neither the specifier nor the prompt section that names it.
 */

import type { SandboxModuleCatalog } from "@nodetool-ai/runtime";

/** The pack's root specifier: `workflow()` plus every namespace under one name. */
export const GRAPH_DSL_PACKAGE = "@nodetool-ai/sandbox-dsl";

/**
 * The belt tools a graph-authoring session needs. Building a graph nothing can
 * check or save is not authoring, so all three must be present — the same rule
 * `nodetool.graph()` was gated by.
 */
export const GRAPH_DSL_TOOLS = [
  "create_workflow",
  "validate_workflow",
  "run_workflow"
] as const;

/** Whether a belt can author, check and run a workflow. */
export function hasGraphDslTools(toolNames: Iterable<string>): boolean {
  const names = new Set(toolNames);
  return GRAPH_DSL_TOOLS.every((tool) => names.has(tool));
}

/** Whether a catalog serves the DSL pack — i.e. whether it is installed here. */
export function catalogServesGraphDsl(
  catalog: SandboxModuleCatalog | null | undefined
): boolean {
  return (catalog?.summaries() ?? []).some(
    (summary) => summary.specifier === GRAPH_DSL_PACKAGE
  );
}

/**
 * The session allowlist with the DSL pack added when this session can use it.
 * Returns the allowlist unchanged when the belt cannot author graphs or the
 * pack is not installed, so no prompt ever advertises an import that fails.
 */
export function withGraphDslPackage(
  allowed: readonly string[],
  toolNames: Iterable<string>,
  catalog: SandboxModuleCatalog | null | undefined
): string[] {
  if (allowed.includes(GRAPH_DSL_PACKAGE)) return [...allowed];
  if (!hasGraphDslTools(toolNames)) return [...allowed];
  if (!catalogServesGraphDsl(catalog)) return [...allowed];
  return [...allowed, GRAPH_DSL_PACKAGE];
}

/**
 * The prompt section for authoring a graph. Rendered only for a session that
 * has both the tools and the pack — {@link withGraphDslPackage} decides that,
 * and the caller passes the answer in.
 */
export const GRAPH_DSL_PROMPT_SECTION = `# Authoring a workflow graph

Build graphs with \`${GRAPH_DSL_PACKAGE}\`: one generated function per node
type, taking that node's real inputs. Import the namespaces you need, wire
handles, and \`workflow(...terminals)\` returns \`{nodes, edges}\`.

\`\`\`js
import { workflow } from "${GRAPH_DSL_PACKAGE}";
import { stringInput } from "${GRAPH_DSL_PACKAGE}/nodetool.input";
import { concat } from "${GRAPH_DSL_PACKAGE}/nodetool.text";
import { output } from "${GRAPH_DSL_PACKAGE}/nodetool.output";

const name = stringInput({ name: "name" });
const line = concat({ a: name.output(), b: ", welcome aboard!" });
const graph = workflow(output({ name: "greeting", value: line.output() }));

const check = await nodetool.workflows.validate(graph);  // before spending
const saved = await nodetool.workflows.create("Greeter", graph);
const run = await nodetool.workflows.run(saved.id, { name: "Ada" });
\`\`\`

The three verbs are also importable —
\`import { validate_workflow, run_workflow, debug_workflow } from
"@nodetool-ai/sandbox-nodetool/workflows"\` — wherever this session mounts the
capability modules. Both forms reach one implementation past one gate.

- \`ref.output()\` is the default output slot, \`ref.output("mask")\` names one.
  A handle passed as an input value wires the edge.
- Only nodes reachable from the terminals you pass ship, and \`workflow()\`
  clears the registry — one graph per call.
- A node type the catalog does not have has no export, so the import fails
  before the action runs. Find the real one with \`nodetool.nodes.search()\`,
  then import its namespace.
- A \`*_model\` property left unset fails validation: assign
  \`(await nodetool.models.pick(task)).ref\` — the typed
  \`{type, provider, id, name}\` value, not a bare model id.
- Authoring and saving a graph does not run it. A user who asked for results
  gets them from \`nodetool.workflows.run(saved.id, params)\`; a workflow id on
  its own answers a question they did not ask.
- \`nodetool.workflows.debug(id, params)\` reports per-node status when a run
  fails and the graph looks right. It answers \`{workflow_id, run, job,
  workflow}\`: read \`run.status\`, \`run.outputs\` (keyed by output name; each
  name holds an array of emitted values) and \`run.verdict.issues\`.`;
