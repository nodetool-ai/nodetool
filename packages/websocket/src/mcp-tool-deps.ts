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
  getWorkflowRuntimeEnvironment,
  type HttpApiOptions
} from "./http-api.js";
import { listPackageAssets } from "./lib/package-assets.js";

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
  options: HttpApiOptions = {}
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
    get: async (packageName, exampleName) =>
      loadExampleGraph(
        packageName || defaultExamplePackageName(options) || "nodetool-base",
        exampleName,
        options
      ) ?? null
  };
}

/**
 * The injection half of `getAllMcpTools({...})` — everything except the node
 * registry and the provider map, which each call site supplies itself.
 */
export function mcpToolHostDeps(
  options: HttpApiOptions = {}
): Pick<
  GetAllMcpToolsOptions,
  | "examples"
  | "exportDsl"
  | "listPackageAssets"
  | "workflowEnvironment"
  | "secretAvailability"
> {
  return {
    examples: createExampleWorkflowCatalog(options),
    // This server has a secret store, so `validate_workflow` can tell a
    // credential nobody set from one it simply could not look up.
    secretAvailability: contextSecretAvailability,
    exportDsl: (graph, opts) =>
      workflowToDsl(
        graph as Parameters<typeof workflowToDsl>[0],
        opts
      ),
    listPackageAssets: async ({ limit }) =>
      listPackageAssets(options, ...(limit === undefined ? [] : [{ limit }])),
    // The same lazy Python-aware runtime the HTTP run route uses — an
    // agent-run workflow must execute exactly like an HTTP-run one.
    workflowEnvironment: () => getWorkflowRuntimeEnvironment(options)
  };
}
