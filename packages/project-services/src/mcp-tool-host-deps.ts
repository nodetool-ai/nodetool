/**
 * The pieces the agent toolbelt cannot construct for itself.
 *
 * `getAllMcpTools` runs everything in-process now — workflows, jobs and assets
 * come from `@nodetool-ai/models`, runs from `@nodetool-ai/execution/service`.
 * Three things still live above `packages/agents` in the dependency order: the
 * shipped example workflows (JSON inside the installed node packages, found by
 * walking the metadata roots), the DSL exporter (`@nodetool-ai/dsl`), and the
 * catalog of constant assets shipped inside those packages. This module hands
 * them over.
 */

import { workflowToDsl } from "@nodetool-ai/dsl";
import { contextSecretAvailability } from "@nodetool-ai/agents";
import type {
  ExampleWorkflowCatalog,
  GetAllMcpToolsOptions
} from "@nodetool-ai/agents";
import { loadExampleGraph, defaultExamplePackageName } from "./example-workflows.js";
import {
  buildExampleWorkflows,
  type ExampleSourceOptions
} from "./example-catalog.js";
import { listPackageAssets } from "./package-assets.js";
import { deleteProjectForUser } from "./project-delete.js";
import type { WorkflowRuntimeEnvironment } from "./workflow-runtime-environment.js";

/** Where the host's examples, package assets and run environment come from. */
export interface McpToolHostOptions extends ExampleSourceOptions {
  packageAssetsRoots?: string[];
  /** The host's run environment, built once and shared with its other runs. */
  workflowEnvironment: () => Promise<WorkflowRuntimeEnvironment>;
  /** The host's project delete. Defaults to the delete with no live work to stop. */
  deleteProject?: GetAllMcpToolsOptions["deleteProject"];
}

/** Match the free-text filter `/api/workflows/examples/search` applies. */
function matchesQuery(workflow: unknown, query: string): boolean {
  const wf = workflow as Record<string, unknown>;
  const name = String(wf["name"] ?? "").toLowerCase();
  const description = String(wf["description"] ?? "").toLowerCase();
  const tags = (wf["tags"] as string[] | undefined) ?? [];
  return (
    name.includes(query) ||
    description.includes(query) ||
    tags.some((tag) => tag.toLowerCase().includes(query))
  );
}

export function createExampleWorkflowCatalog(
  options: ExampleSourceOptions = {}
): ExampleWorkflowCatalog {
  return {
    list: async ({ query, limit }) => {
      const all = buildExampleWorkflows(options);
      const needle = (query ?? "").toLowerCase().trim();
      const filtered = needle
        ? all.filter((workflow) => matchesQuery(workflow, needle))
        : all;
      return limit === undefined ? filtered : filtered.slice(0, limit);
    },
    // The name is agent input, and `loadExampleGraph` joins it onto the
    // examples directory as a path, so a separator would let `../` read any
    // JSON file this process can reach. No shipped example is named that way.
    get: async (packageName, exampleName) => {
      if (/[\\/]/.test(exampleName)) return null;
      return (
        loadExampleGraph(
          packageName || defaultExamplePackageName(options) || "nodetool-base",
          exampleName,
          options
        ) ?? null
      );
    }
  };
}

/**
 * The injection half of `getAllMcpTools({...})` — everything except the node
 * registry and the provider map, which each call site supplies itself.
 */
export function mcpToolHostDeps(
  options: McpToolHostOptions
): Pick<
  GetAllMcpToolsOptions,
  | "examples"
  | "exportDsl"
  | "listPackageAssets"
  | "deleteProject"
  | "workflowEnvironment"
  | "secretAvailability"
> {
  return {
    examples: createExampleWorkflowCatalog(options),
    // The host has a secret store, so `validate_workflow` can tell a
    // credential nobody set from one it simply could not look up.
    secretAvailability: contextSecretAvailability,
    exportDsl: (graph, opts) =>
      workflowToDsl(
        graph as Parameters<typeof workflowToDsl>[0],
        opts
      ),
    listPackageAssets: async ({ limit }) =>
      listPackageAssets(options, ...(limit === undefined ? [] : [{ limit }])),
    // The same delete the projects router runs, so stored bytes and live runs
    // go with the rows.
    deleteProject:
      options.deleteProject ??
      ((userId, projectId) => deleteProjectForUser(userId, projectId)),
    // The same lazy Python-aware runtime the HTTP run route uses — an
    // agent-run workflow must execute exactly like an HTTP-run one.
    workflowEnvironment: options.workflowEnvironment
  };
}
