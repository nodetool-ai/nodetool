/**
 * Run preflight — the checks that must refuse a graph *before* anything is
 * paid for.
 *
 * A graph that names a provider this runtime does not have, or a model that
 * provider does not offer, or a credential nobody stored, fails at the node
 * that needs it — after the upstream half of the graph has already run and
 * billed. Both checks front-run that failure, and both live here (rather than
 * in the run service) so `ExecutionSession` can call them without importing
 * the models database.
 *
 * Both fail toward silence: an empty provider registry means the registry
 * could not be reached, and an unregistered provider id is left to the
 * model-selection check rather than guessed at.
 */
import { rewriteBypassedNodes } from "@nodetool-ai/kernel";
import { isDataEdge, type NodeDescriptor } from "@nodetool-ai/protocol";
import {
  collectModelProviders,
  collectModelSelectionIssues
} from "@nodetool-ai/node-sdk";
import {
  getProviderSecretKey,
  isProviderConfigured,
  listOfflineModelIds,
  listRegisteredProviderIds
} from "@nodetool-ai/runtime";
import { normalizeGraph } from "./normalize-graph.js";
import { isRecord } from "./predicates.js";

/** Provider/model catalogs the preflight checks a graph's selections against. */
export interface RunModelCatalogs {
  listProviderIds: () => readonly string[];
  listModelIds: (
    provider: string,
    modelType: string
  ) => readonly string[] | undefined;
}

/** The catalogs of the process-wide provider registry. */
export const RUNTIME_CATALOGS: RunModelCatalogs = {
  listProviderIds: () => listRegisteredProviderIds(),
  listModelIds: (provider, modelType) =>
    listOfflineModelIds(provider, modelType)
};

/** Model selections in a graph that no configured provider can honour. */
export function modelSelectionErrors(
  graph: { nodes?: unknown },
  catalogs: RunModelCatalogs = RUNTIME_CATALOGS
): string[] {
  const nodes = graph.nodes;
  if (!Array.isArray(nodes)) return [];
  return collectModelSelectionIssues({ nodes: nodes as never[] }, catalogs)
    .filter((issue) => issue.severity === "error")
    .map(
      (issue) => `Node "${issue.nodeId}" (${issue.nodeType}): ${issue.message}`
    );
}

/** The part of a node registry the unset-model check reads. */
export interface NodeModelValidator {
  validateNode: (
    descriptor: NodeDescriptor,
    connectedHandles: ReadonlySet<string>
  ) => ReadonlyArray<{ code?: string; message: string }>;
}

/**
 * Model properties a graph leaves unselected, one message each.
 *
 * A workflow may be saved with a generator whose model is not picked yet (a
 * board that plans generations), so this is where an unpicked model is
 * refused: before the run, instead of at the node after everything upstream
 * of it ran and billed. A property fed by a data edge is supplied at run time,
 * and a bypassed node never runs, so neither is reported.
 */
export function unsetModelErrors(
  graph: { nodes?: unknown; edges?: unknown },
  registry: NodeModelValidator
): string[] {
  const nodes = graph.nodes;
  if (!Array.isArray(nodes)) return [];
  const effectiveGraph = rewriteBypassedNodes(
    normalizeGraph({
      nodes: nodes.filter(isRecord),
      edges: Array.isArray(graph.edges) ? graph.edges.filter(isRecord) : []
    })
  );
  const connected = new Map<string, Set<string>>();
  for (const edge of effectiveGraph.edges) {
    if (!isDataEdge(edge)) continue;
    const handles = connected.get(edge.target) ?? new Set<string>();
    handles.add(edge.targetHandle);
    connected.set(edge.target, handles);
  }
  const errors: string[] = [];
  for (const node of effectiveGraph.nodes) {
    const issues = registry.validateNode(
      node,
      connected.get(node.id) ?? new Set<string>()
    );
    for (const issue of issues) {
      if (issue.code !== "unset_model") continue;
      errors.push(`Node "${node.id}" (${node.type}): ${issue.message}`);
    }
  }
  return errors;
}

/** How the preflight resolves a credential — the way the coming run will. */
export interface CredentialResolver {
  resolveSecret: (
    key: string
  ) => Promise<string | null | undefined> | string | null | undefined;
}

/**
 * Providers a graph selects whose required credentials this runtime cannot
 * resolve, one message each.
 *
 * The provider registry knows exactly which kwargs are load-bearing (an empty
 * declaration means "resolve from store, then env"), and a provider built
 * without one throws the `*_API_KEY is required` error mid-run that this check
 * exists to front-run. Unregistered ids are skipped: the model-selection check
 * already reports those as errors, and guessing at an unknown provider's
 * credentials would be noise.
 */
export async function unconfiguredProviderErrors(
  graph: { nodes?: unknown; edges?: unknown },
  resolver: CredentialResolver,
  providerIds: readonly string[] = listRegisteredProviderIds()
): Promise<string[]> {
  const nodes = graph.nodes;
  if (!Array.isArray(nodes)) return [];
  const graphNodes = nodes.filter(isRecord);
  const graphEdges = Array.isArray(graph.edges)
    ? graph.edges.filter(isRecord)
    : [];
  const effectiveGraph = rewriteBypassedNodes(
    normalizeGraph({ nodes: graphNodes, edges: graphEdges })
  );
  const known = new Set(providerIds);
  const errors: string[] = [];
  for (const provider of collectModelProviders({
    nodes: effectiveGraph.nodes,
    edges: effectiveGraph.edges
  })) {
    if (!known.has(provider)) continue;
    if (
      await isProviderConfigured(provider, (key) => resolver.resolveSecret(key))
    ) {
      continue;
    }
    const keyName = getProviderSecretKey(provider);
    errors.push(
      keyName
        ? `Provider "${provider}" needs "${keyName}", which is not set on ` +
            "this server. Store the secret " +
            `"${keyName}" for this user (Settings → Credentials), or switch ` +
            "the model to a provider you have configured."
        : `Provider "${provider}" is missing its required configuration ` +
            "(base URL or credential) on this server. Complete it in " +
            "Settings → Providers before running."
    );
  }
  return errors;
}

/**
 * How the preflight decides whether a provider a graph selects is configured.
 *
 * Defaults to {@link unconfiguredProviderErrors} over the process-wide
 * provider registry. A host whose providers are not in that registry (a
 * cassette, a fake, an in-process custom provider) supplies its own — together
 * with its own {@link RunModelCatalogs}, since the two checks read the same
 * registry.
 */
export type ProviderConfigurationChecker = (
  graph: { nodes?: unknown; edges?: unknown },
  resolver: CredentialResolver
) => Promise<readonly string[]> | readonly string[];

/** A checker over an explicit provider list, for a host with its own registry. */
export function providerConfigurationChecker(
  providerIds: readonly string[]
): ProviderConfigurationChecker {
  return (graph, resolver) =>
    unconfiguredProviderErrors(graph, resolver, providerIds);
}

export type PreflightIssueKind = "unset_model" | "model" | "credential";

/** One reason a run was refused before it started. */
export interface ExecutionPreflightIssue {
  kind: PreflightIssueKind;
  message: string;
}

const HEADINGS = {
  unset_model:
    "Workflow leaves model properties unselected. Pick a model on each before running:",
  model: "Workflow selects providers or models this runtime cannot honour:",
  credential: "Workflow selects providers whose credentials are not configured:"
} satisfies Record<PreflightIssueKind, string>;

/** The refusal text every host prints — one section per issue kind. */
export function formatPreflightDetail(
  issues: readonly ExecutionPreflightIssue[]
): string {
  const sections: string[] = [];
  for (const kind of ["unset_model", "model", "credential"] as const) {
    const messages = issues
      .filter((issue) => issue.kind === kind)
      .map((issue) => issue.message);
    if (messages.length > 0) {
      sections.push(`${HEADINGS[kind]}\n${messages.join("\n")}`);
    }
  }
  return sections.join("\n\n");
}

/**
 * The refusal contract shared by `ExecutionSession`, the run service, and the
 * CLI adapters: a typed error whose `issues` are machine-readable and whose
 * `message` is the text a host prints verbatim.
 */
export class ExecutionPreflightError extends Error {
  override readonly name = "ExecutionPreflightError";
  readonly issues: readonly ExecutionPreflightIssue[];

  constructor(issues: readonly ExecutionPreflightIssue[]) {
    super(formatPreflightDetail(issues));
    this.issues = issues;
  }
}

export function isExecutionPreflightError(
  value: unknown
): value is ExecutionPreflightError {
  return value instanceof ExecutionPreflightError;
}

export interface PreflightOptions {
  catalogs?: RunModelCatalogs;
  providerConfiguration?: ProviderConfigurationChecker;
  /** Resolves a credential the way the coming run will. */
  resolveSecret: CredentialResolver["resolveSecret"];
  /**
   * Node registry for the unset-model check. Without one, unpicked models are
   * left to the kernel's own node validation.
   */
  registry?: NodeModelValidator;
}

/**
 * Every reason to refuse `graph`, model selections first.
 *
 * A graph whose model selections are unset or unhonourable stops there: a
 * provider that is not registered has no credentials to check, so running the
 * second check would only add noise to a refusal that is already decided.
 */
export async function collectPreflightIssues(
  graph: { nodes?: unknown; edges?: unknown },
  options: PreflightOptions
): Promise<ExecutionPreflightIssue[]> {
  const unset = options.registry
    ? unsetModelErrors(graph, options.registry)
    : [];
  const models = modelSelectionErrors(graph, options.catalogs);
  if (unset.length > 0 || models.length > 0) {
    return [
      ...unset.map((message) => ({ kind: "unset_model" as const, message })),
      ...models.map((message) => ({ kind: "model" as const, message }))
    ];
  }
  const checker = options.providerConfiguration ?? unconfiguredProviderErrors;
  const credentials = await checker(graph, {
    resolveSecret: options.resolveSecret
  });
  return credentials.map((message) => ({ kind: "credential", message }));
}

/** {@link collectPreflightIssues}, as a refusal. */
export async function assertPreflight(
  graph: { nodes?: unknown; edges?: unknown },
  options: PreflightOptions
): Promise<void> {
  const issues = await collectPreflightIssues(graph, options);
  if (issues.length > 0) throw new ExecutionPreflightError(issues);
}
