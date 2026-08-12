/**
 * The `ui` module's specs — data only, no implementation.
 *
 * Split out so a belt can be assembled synchronously: the registry's eager
 * spec table imports this file, never `ui.ts`, so nothing the implementations
 * pull in reaches the entry graph. `ui.ts` imports these back and attaches
 * each to its implementation, so there is one spec object behind both halves.
 *
 * A document tool's identity is a Zod schema (`uiToolSchemas`), so the specs
 * are derived here rather than written out: one `zodToJsonSchema` per name at
 * load, which is what `ui.ts` did before the split.
 */

import { z, type ZodType } from "zod";
import { zodToJsonSchema } from "@nodetool-ai/runtime";
import {
  WORKFLOW_DOCUMENT_TOOL_NAMES,
  type WorkflowDocumentToolName
} from "@nodetool-ai/node-sdk";
import { uiToolSchemas } from "@nodetool-ai/protocol";
import type { CapabilitySpec, PermissionCategory } from "./types.js";

/**
 * What each document tool costs. Reading the graph is a read; the seven
 * mutators rewrite a stored workflow, so they are `write` — the classes'
 * classification, carried over name for name.
 */
const UI_CATEGORIES: Readonly<
  Record<WorkflowDocumentToolName, PermissionCategory>
> = {
  ui_get_graph: "read",
  ui_add_node: "write",
  ui_connect_nodes: "write",
  ui_update_node_data: "write",
  ui_delete_node: "write",
  ui_delete_edge: "write",
  ui_move_node: "write",
  ui_set_node_title: "write"
};

/** The Zod schema one document tool validates its arguments against. */
export function workflowDocumentSchema(
  name: WorkflowDocumentToolName
): ZodType {
  return z.object(uiToolSchemas[name].parameters);
}

const SPEC_BY_NAME = new Map<WorkflowDocumentToolName, CapabilitySpec>(
  WORKFLOW_DOCUMENT_TOOL_NAMES.map((name) => {
    const zodSchema = workflowDocumentSchema(name);
    return [
      name,
      {
        name,
        description: uiToolSchemas[name].description,
        inputSchema: zodToJsonSchema(zodSchema),
        zodSchema,
        category: UI_CATEGORIES[name]
      }
    ];
  })
);

/** One document capability's spec. */
export function workflowDocumentSpec(
  name: WorkflowDocumentToolName
): CapabilitySpec {
  const spec = SPEC_BY_NAME.get(name);
  if (!spec) {
    throw new Error(`no workflow document capability named "${name}"`);
  }
  return spec;
}

/** Every spec this module declares, in the order the tool names are declared. */
export const uiSpecs: readonly CapabilitySpec[] =
  WORKFLOW_DOCUMENT_TOOL_NAMES.map(workflowDocumentSpec);
