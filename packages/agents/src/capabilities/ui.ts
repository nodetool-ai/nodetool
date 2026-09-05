/**
 * The `ui` capability module — the eight workflow-document tools.
 *
 * These were one class, `WorkflowDocumentTool` (`../tools/mcp-tools.ts`),
 * constructed once per name over an optional `NodeRegistry`. The registry is a
 * field on the run now, and each name is its own capability, so the registry
 * owns eight entries instead of one class with a name argument.
 *
 * They are the odd namespace: a `ui_*` tool is a schema, not a host function.
 * A renderer holds the live, possibly unsaved graph, so a host that has one
 * routes the call there — the chat runner prefers the client whose manifest
 * declares the tool (`websocket-client-session.ts`), and the MCP mount asks its
 * frontend bridge first (`mcp-agent-tools.ts`). What lives here is the
 * *headless fallback* those two fall back to: read the stored workflow, apply
 * the document op, and write the graph back under the same optimistic-
 * concurrency check the PUT route performs.
 *
 * A run that carries a {@link CapabilityRun.client} routes there instead, so a
 * host that mounts one gets the renderer on every path rather than only on the
 * one that remembered to ask. No host mounts a client today.
 *
 * Wire names, descriptions, schemas and categories are unchanged. Each
 * capability's identity is a Zod schema (`uiToolSchemas`), so `inputSchema` is
 * derived with `zodToJsonSchema` and the validation `Tool.execute` used to run
 * before `process()` moves inside the implementation, returning the same
 * `invalid_tool_arguments` envelope. The deprecated `WorkflowDocumentTool`
 * subclass keeps the Zod schema on `schema` and runs the unvalidated core, so
 * the class path validates exactly once, where it always did.
 *
 * Design: docs/tool-class-retirement-design.md § "`ui_*` capabilities: in the
 * pack surface, outside its implementation".
 */

import { z, type ZodType } from "zod";
import { parseWithTypeCoercion, zodToJsonSchema } from "@nodetool-ai/runtime";
import type { Workflow as WorkflowRow } from "@nodetool-ai/models";
import type { NodeMetadata } from "@nodetool-ai/node-sdk";
import {
  applyWorkflowDocumentTool,
  WORKFLOW_DOCUMENT_TOOL_NAMES,
  type WorkflowDocumentToolName
} from "@nodetool-ai/node-sdk";
import { graph as workflowGraphSchema } from "@nodetool-ai/protocol/api-schemas/workflows.js";
import { userIdOf, workflowRecord } from "../tools/mcp-tool-support.js";
import {
  workflowDocumentSchema,
  workflowDocumentSpec
} from "./ui.specs.js";
import type {
  CapabilityExport,
  CapabilityImpl,
  CapabilityModule
} from "./types.js";
import { isRecord, isString } from "../utils/type-guards.js";

/**
 * Apply one document op to the stored workflow. The unvalidated core: the
 * class path has already parsed the arguments, and {@link withZodValidation}
 * parses them for everyone else.
 */
function documentCore(name: WorkflowDocumentToolName): CapabilityImpl {
  return async (run, params) => {
    const client = run.client;
    if (client) return client.execute(name, params);

    const { Workflow } = await import("@nodetool-ai/models");
    const workflowId =
      isString(params["workflow_id"])
        ? params["workflow_id"]
        : run.context.workflowId;
    if (!workflowId) {
      return {
        error: "workflow_id_required",
        message: "workflow_id is required when no workflow is active."
      };
    }

    const userId = userIdOf(run.context);
    const stored = await Workflow.find(userId, workflowId);
    if (!stored) return { error: `Workflow ${workflowId} was not found.` };
    const workflow = workflowRecord(stored);
    const parsedGraph = workflowGraphSchema.safeParse(workflow["graph"]);
    if (!parsedGraph.success) {
      return { error: "Workflow has an invalid graph" };
    }

    const metadataByType = new Map<string, NodeMetadata>();
    const loadMetadata = async (nodeType: string): Promise<void> => {
      const local = run.nodeRegistry?.resolveMetadata(nodeType);
      if (local) metadataByType.set(nodeType, local);
    };

    if (name === "ui_add_node" && isString(params["type"])) {
      await loadMetadata(params["type"]);
    } else if (name === "ui_connect_nodes") {
      const sourceId = String(params["source_node_id"]);
      const targetId = String(params["target_node_id"]);
      const source = parsedGraph.data.nodes.find(
        (node) => node.id === sourceId
      );
      const target = parsedGraph.data.nodes.find(
        (node) => node.id === targetId
      );
      await Promise.all(
        [source?.type, target?.type]
          .filter((type): type is string => typeof type === "string")
          .map(loadMetadata)
      );
    }

    const applied = applyWorkflowDocumentTool(parsedGraph.data, name, params, {
      workflowId,
      resolveMetadata: (nodeType) => metadataByType.get(nodeType)
    });
    if (!applied.changed) return applied.result;

    // The same optimistic-concurrency write the PUT route performs: the read
    // above pinned `updated_at`, so a concurrent editor's save is a conflict
    // rather than a silent clobber.
    const persisted = await Workflow.updateFieldsIfUnchanged(
      workflowId,
      stored.updated_at,
      { graph: applied.graph },
      // The tool name rides on the write so an open editor can attribute the
      // external change to the nodes it touched (per merge unit).
      { ops: [{ tool: name, input: params }] }
    );
    if (!persisted) {
      return {
        error:
          "Workflow was modified since last read (optimistic concurrency " +
          "conflict) — re-read it and retry."
      };
    }
    return {
      ...applied.result,
      updated_at: persisted.updated_at,
      etag: persisted.getEtag()
    };
  };
}

const SPEC_BY_NAME = new Map<WorkflowDocumentToolName, CapabilityExport>();

for (const name of WORKFLOW_DOCUMENT_TOOL_NAMES) {
  SPEC_BY_NAME.set(name, {
    spec: workflowDocumentSpec(name),
    impl: documentCore(name)
  });
}

/** One document capability, spec plus validated implementation. */
export function workflowDocumentCapability(
  name: WorkflowDocumentToolName
): CapabilityExport {
  const entry = SPEC_BY_NAME.get(name);
  if (!entry) {
    throw new Error(`no workflow document capability named "${name}"`);
  }
  return entry;
}

/** Every document capability, in the order the tool names are declared. */
export const UI_CAPABILITIES: readonly CapabilityExport[] =
  WORKFLOW_DOCUMENT_TOOL_NAMES.map((name) => workflowDocumentCapability(name));

export const module: CapabilityModule = {
  module: "ui",
  exports: UI_CAPABILITIES
};
