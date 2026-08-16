/**
 * runDslFile — dynamically import a TypeScript/JavaScript DSL file,
 * find all exported Workflow objects, and run each with run() from @nodetool-ai/dsl.
 *
 * Uses tsx/esm/api's tsImport() so TypeScript files can be loaded without
 * pre-compilation and without registering a global module loader.
 */

import { run as runWorkflow } from "@nodetool-ai/dsl";
import type { Workflow } from "@nodetool-ai/dsl";
import { tsImport } from "tsx/esm/api";
import { pathToFileURL } from "node:url";

export function isWorkflow(value: unknown): value is Workflow {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as Record<string, unknown>).nodes) &&
    Array.isArray((value as Record<string, unknown>).edges)
  );
}

/** Every exported `Workflow` in the file, keyed by export name. */
export async function loadDslWorkflows(
  filePath: string
): Promise<Record<string, Workflow>> {
  const moduleUrl = pathToFileURL(filePath).href;
  const mod = (await tsImport(moduleUrl, import.meta.url)) as Record<
    string,
    unknown
  >;

  const workflows: Record<string, Workflow> = {};
  for (const [name, value] of Object.entries(mod)) {
    if (isWorkflow(value)) workflows[name] = value;
  }

  if (Object.keys(workflows).length === 0) {
    throw new Error(`No Workflow exports found in ${filePath}`);
  }
  return workflows;
}

export async function runDslFile(
  filePath: string
): Promise<Record<string, Record<string, unknown>>> {
  const workflows = await loadDslWorkflows(filePath);
  const results: Record<string, Record<string, unknown>> = {};
  for (const [name, wf] of Object.entries(workflows)) {
    results[name] = await runWorkflow(wf);
  }
  return results;
}

/**
 * The graph shape `ExecutionSession` takes, from a DSL workflow. `run()` in
 * `@nodetool-ai/dsl` builds the same descriptors against its own
 * `WorkflowRunner`; supervision goes through the session facade instead
 * (docs/workflow-supervisor-design.md §7), so the mapping is needed here too.
 */
export function dslWorkflowToGraph(wf: Workflow) {
  return {
    nodes: wf.nodes.map((n) => ({
      id: n.id,
      type: n.type,
      properties: n.data,
      is_streaming_output: n.streaming,
      is_streaming_input: n.streamingInput
    })),
    edges: wf.edges.map((e) => ({
      source: e.source,
      sourceHandle: e.sourceHandle,
      target: e.target,
      targetHandle: e.targetHandle
    }))
  };
}
