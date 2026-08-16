/**
 * Static workflow-graph validation.
 *
 * Checks a graph against the node registry WITHOUT executing it: unknown node
 * types, duplicate ids, missing required / unselected-model properties, dangling
 * edges, unknown edge handles, mis-spelled dynamic slot types, Code node bodies
 * (syntax, inputs, outputs), and (best-effort) edge type mismatches. Catches the
 * breakage that would otherwise only surface after a full workflow run.
 *
 * Takes a {@link GraphValidationRegistry} (the slice of NodeRegistry it needs)
 * so it can be unit-tested with a fake and reused by the CLI and agent tools.
 */
import type { DynamicSlotMeta } from "@nodetool-ai/protocol";
import {
  getProcessSandboxModuleCatalog,
  type SandboxModuleCatalog
} from "@nodetool-ai/runtime";
import {
  inferredCodeInputNames,
  inferredCodeOutputNames
} from "./code-analysis.js";
import { isJsCodeNodeType, validateCodeNodeBody } from "./code-node-validation.js";
import {
  jsScriptPortMismatches,
  readJsScriptLink,
  type JsScriptLink,
  type JsScriptLinkLookup
} from "./js-script-link.js";
import { parseSandboxModuleDeclarations } from "./sandbox-module-declarations.js";
import type { NodeMetadata } from "./metadata.js";
import { portTypeAliases } from "./port-types.js";
import {
  type TypeMetaLike,
  slotTypeToString,
  typeMetaToString,
  typesIncompatible,
  valueIncompatibleWithType
} from "./type-compat.js";
import type { NodePropertyValidationIssue } from "./validation.js";

/** A node in either kernel (`properties`) or ReactFlow (`data`) shape. */
export interface GraphValidationNode {
  id?: unknown;
  type?: unknown;
  properties?: Record<string, unknown>;
  data?: Record<string, unknown>;
  /** Inline values of dynamic input slots. */
  dynamic_properties?: Record<string, unknown>;
  /** Typed declarations for dynamic input slots (undeclared slot = `any`). */
  dynamic_inputs?: Record<string, DynamicSlotMeta>;
  /** Typed declarations of dynamic output slots (`{ name: TypeMetadata }`). */
  dynamic_outputs?: unknown;
}

export interface GraphValidationEdge {
  id?: unknown;
  source?: unknown;
  sourceHandle?: unknown;
  source_handle?: unknown;
  target?: unknown;
  targetHandle?: unknown;
  target_handle?: unknown;
  /** `"control"` marks an edge the kernel excludes from data-flow analysis. */
  edge_type?: unknown;
  /** ReactFlow edge kind — `"control"` there too. */
  type?: unknown;
  data?: Record<string, unknown>;
}

export interface GraphValidationInput {
  nodes?: GraphValidationNode[];
  edges?: GraphValidationEdge[];
}

/**
 * `info` is below the `--warnings-as-errors` ratchet: it reports something
 * worth knowing about a graph that is not a defect. An untyped dynamic slot
 * is the motivating case — every workflow saved before typed slots has one
 * per dynamic edge, and none of them are broken.
 */
export type GraphValidationSeverity = "error" | "warning" | "info";

export interface GraphValidationIssue {
  severity: GraphValidationSeverity;
  /**
   * Stable category: "unknown_node" | "missing_id" | "duplicate_id" |
   * "property" | "dangling_edge" | "unknown_handle" | "missing_handle" |
   * "cycle" | "type_mismatch" | "fan_in" | "untyped_dynamic_slot" |
   * "dynamic_type_mismatch" | "unknown_provider" | "missing_provider" |
   * "unknown_model" | "slot_type_alias" | "invalid_graph", plus the `code_*`
   * categories a Code node body produces (see {@link validateCodeNodeBody}).
   *
   * - "invalid_graph" (error): `nodes` or `edges` is not an array, so that half
   *   of the graph cannot be read at all.
   * - "missing_id" (error): a node with no id — unaddressable by any edge.
   * - "missing_handle" (error): an edge whose endpoints both exist but which
   *   names no source/target handle, so the kernel cannot route it.
   * - "cycle" (error): a self-loop, or a cycle in the data subgraph the
   *   kernel's correlation analysis requires to be a DAG.
   * - "untyped_dynamic_slot" (info): an edge targets a dynamic input that
   *   carries no `dynamic_inputs` declaration, so its type cannot be checked.
   *   Legacy graphs produce one per dynamic edge; never an error, and below
   *   the warnings-as-errors ratchet.
   * - "dynamic_type_mismatch" (warning): an inline `dynamic_properties` value
   *   does not match its slot's declared type.
   * - "missing_provider" (error): a model reference carries an id but no
   *   provider, so nothing can route it. See
   *   {@link collectModelSelectionIssues} for this and its two siblings.
   * - "type_mismatch": a warning for declared properties (best-effort), an
   *   error when the target is a *declared* dynamic slot whose type the source
   *   output cannot satisfy.
   */
  code: string;
  nodeId?: string;
  nodeType?: string;
  edgeId?: string;
  message: string;
}

export interface GraphValidationReport {
  ok: boolean;
  nodeCount: number;
  edgeCount: number;
  counts: { errors: number; warnings: number; info: number };
  issues: GraphValidationIssue[];
}

/** The slice of NodeRegistry the validator needs (kept narrow for testing). */
export interface GraphValidationRegistry {
  has(nodeType: string): boolean;
  getMetadata(nodeType: string): NodeMetadata | undefined;
  validateNode(
    descriptor: {
      id: string;
      type: string;
      properties?: Record<string, unknown>;
      dynamic_inputs?: Record<string, DynamicSlotMeta>;
      dynamic_properties?: Record<string, unknown>;
    },
    connectedHandles?: ReadonlySet<string>
  ): NodePropertyValidationIssue[];
  /**
   * Provider ids the runtime can actually construct. Optional: a caller that
   * cannot reach the provider registry (the browser) omits it and the
   * provider check is skipped rather than guessing.
   */
  listProviderIds?(): readonly string[];
  /**
   * Model ids `provider` is known to offer, or undefined when they cannot be
   * enumerated without a network call. Undefined means "cannot tell", never
   * "no such model" — a provider whose catalog is only reachable online must
   * not have its models reported as absent. Optional for the same reason
   * {@link listProviderIds} is: a caller that cannot reach the provider
   * registry omits it and the check is skipped rather than guessed at.
   */
  listModelIds?(
    provider: string,
    modelType: string
  ): readonly string[] | undefined;
}

/**
 * Editor-only base nodes that carry no executable class — the graph loader
 * prunes them before a run, so they must not be flagged as "unknown". Their
 * short names; matched against the `nodetool.workflows.base_node.*` namespace.
 */
const EDITOR_ONLY_NODE_NAMES: ReadonlySet<string> = new Set([
  "Comment",
  "Group",
  "Reroute"
]);

export function isEditorOnlyType(nodeType: string): boolean {
  const dot = nodeType.lastIndexOf(".");
  const name = dot >= 0 ? nodeType.slice(dot + 1) : nodeType;
  return (
    nodeType.includes(".workflows.base_node.") &&
    EDITOR_ONLY_NODE_NAMES.has(name)
  );
}

/** Handles like `__control__` / `__output__` are framework-internal, not props. */
function isReservedHandle(handle: string): boolean {
  return handle.startsWith("__") && handle.endsWith("__");
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

/**
 * `nodes` / `edges` as the arrays their types promise. The graph is parsed from
 * untrusted JSON on every entry point — a file, a stored row, an LLM's inline
 * graph — so a member that is a number or an object reaches here and has to be
 * reported rather than thrown at `.map`. Absent stays absent: an empty half of
 * a graph is what the other checks already read it as.
 */
function graphMembers<T>(
  value: unknown,
  field: "nodes" | "edges",
  issues: GraphValidationIssue[]
): T[] {
  if (value == null) return [];
  if (Array.isArray(value)) return value as T[];
  issues.push({
    severity: "error",
    code: "invalid_graph",
    message: `graph.${field} must be an array, not ${
      typeof value === "object" ? "an object" : `a ${typeof value}`
    }`
  });
  return [];
}

/**
 * Typed dynamic slot declarations of a node, from either graph shape: the
 * kernel/runner node carries `dynamic_inputs` at the top level, a ReactFlow
 * node carries it inside `data`.
 */
function readDynamicInputs(
  node: GraphValidationNode
): Record<string, DynamicSlotMeta> {
  const own = asRecord(node.dynamic_inputs);
  if (own) return own as Record<string, DynamicSlotMeta>;
  const fromData = asRecord(node.data?.dynamic_inputs);
  return (fromData ?? {}) as Record<string, DynamicSlotMeta>;
}

/** Inline dynamic slot values, from either graph shape. */
function readDynamicProperties(
  node: GraphValidationNode
): Record<string, unknown> {
  return (
    asRecord(node.dynamic_properties) ??
    asRecord(node.data?.dynamic_properties) ??
    {}
  );
}

/** Typed dynamic output declarations, from either graph shape. */
function readDynamicOutputs(
  node: GraphValidationNode
): Record<string, unknown> {
  return (
    asRecord(node.dynamic_outputs) ?? asRecord(node.data?.dynamic_outputs) ?? {}
  );
}

/**
 * The declared properties of a node, from either graph shape.
 *
 * The editor's `NodeData` nests the props bag under `data.properties` (the same
 * wrapper `readDynamicInputs` and friends unwrap). Reading `data` itself as the
 * bag made every editor-exported node look like it was missing every required
 * property. `data` is still the fallback for older/hand-written shapes that
 * flattened the props onto it.
 */
function readProperties(node: GraphValidationNode): Record<string, unknown> {
  return (
    asRecord(node.properties) ??
    asRecord(node.data?.properties) ??
    asRecord(node.data) ??
    {}
  );
}

interface NormEdge {
  id: string;
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
  /** Control edges carry no data; the kernel's analyses skip them. */
  isControl: boolean;
}

/**
 * A control edge is spelled `edge_type: "control"` in the kernel/runner shape
 * and `type: "control"` / `data.edge_type: "control"` in the ReactFlow shape.
 */
function isControlEdge(raw: GraphValidationEdge): boolean {
  return (
    raw.edge_type === "control" ||
    raw.type === "control" ||
    raw.data?.edge_type === "control"
  );
}

function normalizeEdge(raw: GraphValidationEdge, index: number): NormEdge {
  return {
    id: typeof raw.id === "string" ? raw.id : `edge-${index}`,
    source: String(raw.source ?? ""),
    sourceHandle: String(raw.sourceHandle ?? raw.source_handle ?? ""),
    target: String(raw.target ?? ""),
    targetHandle: String(raw.targetHandle ?? raw.target_handle ?? ""),
    isControl: isControlEdge(raw)
  };
}

/**
 * True for a model-reference value: a tagged object whose `type` ends in
 * `_model` (`image_model`, `asr_model`, `tts_model`, `language_model`, …).
 * Keying on that suffix avoids reacting to any unrelated object that happens
 * to carry a `provider` field.
 */
function isModelRef(value: unknown): value is Record<string, unknown> {
  // Null first, matching `asRecord` above: `typeof null === "object"`, so the
  // check is load-bearing — without it `value.type` below throws on null.
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const kind = (value as Record<string, unknown>).type;
  return typeof kind === "string" && kind.endsWith("_model");
}

/** A model reference found in a node's property bag, with where it was found. */
interface ModelRefSite {
  /** Property path, e.g. `model`, `models[0]`, `config.model`. */
  path: string;
  ref: Record<string, unknown>;
}

/**
 * How deep the property walk goes looking for model refs. A node's props are a
 * shallow bag by convention; the depth exists for the shapes that nest one —
 * a list of models, or a model inside a settings object — not to crawl payloads.
 */
const MODEL_REF_MAX_DEPTH = 4;

/**
 * Every model reference reachable from `value`.
 *
 * Checking only top-level property values missed the ones the type system
 * allows anywhere: a `list[image_model]` property, or a model nested in a
 * config object. Those fail exactly like a top-level one does — once the node
 * runs — so they are worth the same check.
 */
function collectModelRefs(
  value: unknown,
  path: string,
  out: ModelRefSite[],
  depth = 0
): void {
  if (depth > MODEL_REF_MAX_DEPTH) return;
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      collectModelRefs(item, `${path}[${index}]`, out, depth + 1)
    );
    return;
  }
  if (value === null || typeof value !== "object") return;
  if (isModelRef(value)) {
    out.push({ path, ref: value });
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    collectModelRefs(child, path ? `${path}.${key}` : key, out, depth + 1);
  }
}

/**
 * Provider id of a model reference, or undefined when it names none. A blank
 * provider is left to {@link collectModelSelectionIssues}, which reports it
 * only when an id is present — an entirely empty ref is an unselected model,
 * which the registry's own property check already covers.
 */
function modelProviderOf(ref: Record<string, unknown>): string | undefined {
  const provider = ref.provider;
  if (typeof provider !== "string" || provider === "") return undefined;
  return provider;
}

/**
 * Self-loops and cycles — both fatal at run time, neither visible before it.
 *
 * `Graph.validateEdgeEndpoints` (kernel) rejects a self-loop on *any* edge:
 * the node waits on an input only its own completion can close, so the run
 * hangs. `analyzeCorrelation` requires the **data** subgraph to be a DAG, and
 * its topological sort skips control edges — so cycles are looked for over
 * data edges only, matching the kernel exactly.
 *
 * Kahn's algorithm, iterative: a deep graph must not blow the stack.
 */
function detectCycles(
  byId: ReadonlyMap<string, GraphValidationNode>,
  normEdges: readonly NormEdge[]
): GraphValidationIssue[] {
  const issues: GraphValidationIssue[] = [];
  const selfLooped = new Set<string>();
  for (const e of normEdges) {
    if (e.source !== e.target || !byId.has(e.source)) continue;
    if (selfLooped.has(e.source)) continue;
    selfLooped.add(e.source);
    issues.push({
      severity: "error",
      code: "cycle",
      nodeId: e.source,
      nodeType: String(byId.get(e.source)?.type ?? ""),
      edgeId: e.id,
      message: `Node "${e.source}" is connected to itself by edge "${e.id}"; self-loop edges are not supported and deadlock the run`
    });
  }

  const incoming = new Map<string, number>();
  const outgoing = new Map<string, string[]>();
  for (const id of byId.keys()) {
    incoming.set(id, 0);
    outgoing.set(id, []);
  }
  for (const e of normEdges) {
    if (e.isControl) continue;
    if (e.source === e.target) continue;
    if (!byId.has(e.source) || !byId.has(e.target)) continue;
    outgoing.get(e.source)!.push(e.target);
    incoming.set(e.target, (incoming.get(e.target) ?? 0) + 1);
  }

  const queue: string[] = [];
  for (const [id, count] of incoming) {
    if (count === 0) queue.push(id);
  }
  let ordered = 0;
  // Index instead of shift(): shift() on a large array is O(n) per call.
  for (let head = 0; head < queue.length; head++) {
    ordered++;
    for (const target of outgoing.get(queue[head]) ?? []) {
      const next = (incoming.get(target) ?? 0) - 1;
      incoming.set(target, next);
      if (next === 0) queue.push(target);
    }
  }

  if (ordered < byId.size) {
    const seen = new Set(queue);
    const remaining = [...byId.keys()].filter((id) => !seen.has(id));
    issues.push({
      severity: "error",
      code: "cycle",
      nodeId: remaining[0],
      nodeType: String(byId.get(remaining[0])?.type ?? ""),
      message: `Cycle detected in graph; the kernel's correlation analysis requires a DAG. Involved nodes: ${remaining.join(", ")}`
    });
  }

  return issues;
}

/**
 * Model id of a model reference. A blank id is an unselected model, which the
 * registry's own property check already reports.
 */
function modelIdOf(ref: Record<string, unknown>): string | undefined {
  const id = ref.id;
  if (typeof id !== "string" || id === "") return undefined;
  return id;
}

/**
 * The `_model` type tag of a model reference. Which catalog an id has to appear
 * in depends on it: a provider's ASR ids and its image ids are separate lists,
 * and only some are knowable offline.
 */
function modelKindOf(ref: Record<string, unknown>): string {
  return String(ref.type);
}

/**
 * The few known ids closest to `id`, to turn "not a model" into a fix. Manifest
 * ids are long and slash-separated (`fal-ai/ltx-2/image-to-video/fast`), so a
 * shared prefix locates a near-miss far better than edit distance over the
 * whole string; ties break toward the closest length.
 */
function nearestModelIds(
  id: string,
  known: readonly string[],
  limit = 3
): string[] {
  const needle = id.toLowerCase();
  const prefixLen = (candidate: string): number => {
    const other = candidate.toLowerCase();
    let i = 0;
    while (i < needle.length && i < other.length && needle[i] === other[i]) i++;
    return i;
  };
  return [...known]
    .map((candidate) => ({ candidate, score: prefixLen(candidate) }))
    // A single shared character is noise, not a suggestion.
    .filter((entry) => entry.score >= 3)
    .sort(
      (a, b) =>
        b.score - a.score ||
        Math.abs(a.candidate.length - id.length) -
          Math.abs(b.candidate.length - id.length) ||
        a.candidate.localeCompare(b.candidate)
    )
    .slice(0, limit)
    .map((entry) => entry.candidate);
}


/** The slice of the registry {@link collectModelSelectionIssues} needs. */
export type ModelSelectionRegistry = Pick<
  GraphValidationRegistry,
  "listProviderIds" | "listModelIds"
>;

/**
 * Every provider/model id in `graph` that the runtime cannot honour.
 *
 * Split out of {@link validateGraph} so a caller that wants only this — a run
 * preflight, an agent about to save a graph — pays for a property walk instead
 * of a full graph validation, and so all of them report the same thing. The
 * checks stay in `validateGraph` too; this is the same code, not a second
 * opinion.
 *
 * Both checks fail toward silence. An empty provider list means the registry
 * could not be reached, not that zero providers exist; an undefined model list
 * means the catalog is only knowable online. Neither is evidence of a bad id.
 */
export function collectModelSelectionIssues(
  graph: GraphValidationInput,
  registry: ModelSelectionRegistry
): GraphValidationIssue[] {
  const providerIds = registry.listProviderIds?.();
  const knownProviders =
    providerIds && providerIds.length > 0 ? new Set(providerIds) : null;
  if (!knownProviders) return [];

  const issues: GraphValidationIssue[] = [];
  for (const node of graph.nodes ?? []) {
    const nodeId = String(node.id ?? "");
    const nodeType = String(node.type ?? "");
    const sites: ModelRefSite[] = [];
    for (const [propName, value] of Object.entries(readProperties(node))) {
      collectModelRefs(value, propName, sites);
    }
    for (const [propName, value] of Object.entries(
      readDynamicProperties(node)
    )) {
      collectModelRefs(value, propName, sites);
    }

    for (const { path, ref } of sites) {
      const modelId = modelIdOf(ref);
      const provider = modelProviderOf(ref);

      if (provider === undefined) {
        // No provider and no id is an unselected model — the registry's own
        // property check reports that one. An id without a provider is
        // different: it names a model nothing can route to.
        if (modelId !== undefined) {
          issues.push({
            severity: "error",
            code: "missing_provider",
            nodeId,
            nodeType,
            message:
              `Property "${path}" selects model "${modelId}" but names no ` +
              "provider; the runtime cannot resolve a model id on its own"
          });
        }
        continue;
      }

      if (!knownProviders.has(provider)) {
        issues.push({
          severity: "error",
          code: "unknown_provider",
          nodeId,
          nodeType,
          message:
            `Property "${path}" selects provider "${provider}", which is ` +
            `not registered. Known providers: ${[...knownProviders]
              .sort()
              .join(", ")}`
        });
        continue;
      }

      // The provider is real; the id it names may still not be. A model id is
      // only checkable where the catalog is known offline — undefined from the
      // registry means unknown, so nothing is reported.
      if (modelId === undefined) continue;
      const knownModels = registry.listModelIds?.(provider, modelKindOf(ref));
      if (!knownModels || knownModels.length === 0) continue;
      if (knownModels.includes(modelId)) continue;
      const suggestions = nearestModelIds(modelId, knownModels);
      issues.push({
        severity: "error",
        code: "unknown_model",
        nodeId,
        nodeType,
        message:
          `Property "${path}" selects model "${modelId}", which provider ` +
          `"${provider}" does not offer.` +
          (suggestions.length > 0
            ? ` Did you mean: ${suggestions.join(", ")}?`
            : "")
      });
    }
  }
  return issues;
}

export interface GraphValidationOptions {
  /**
   * Catalog the Code nodes' `packages` declarations resolve against. Defaults
   * to the process-wide catalog the host installed; pass `null` to check the
   * graph without one (a browser client, a test).
   */
  sandboxModuleCatalog?: SandboxModuleCatalog | null;
  /**
   * Resolves a Code node's pinned `script` link. Validation is synchronous, so
   * a caller that can reach the script store prefetches every link
   * ({@link collectJsScriptLinks}) and passes a lookup over what it found.
   *
   * A link the lookup cannot answer for is a warning either way: the node runs
   * the body it copied at link time, so a script that moved or disappeared
   * costs freshness, not the run.
   */
  jsScriptLookup?: JsScriptLinkLookup | null;
}

/**
 * Every pinned script link a graph's Code nodes carry, deduplicated. A host
 * that wants the linked-script checks loads these first and hands
 * {@link validateGraph} a lookup over the result.
 */
export function collectJsScriptLinks(
  graph: GraphValidationInput
): JsScriptLink[] {
  const seen = new Map<string, JsScriptLink>();
  for (const node of graph.nodes ?? []) {
    if (!isJsCodeNodeType(String(node.type ?? ""))) continue;
    const link = readJsScriptLink(readProperties(node));
    if (!link) continue;
    seen.set(`${link.id}@${link.version}`, link);
  }
  return [...seen.values()];
}

export function validateGraph(
  graph: GraphValidationInput,
  registry: GraphValidationRegistry,
  options: GraphValidationOptions = {}
): GraphValidationReport {
  const sandboxModuleCatalog =
    options.sandboxModuleCatalog !== undefined
      ? options.sandboxModuleCatalog
      : getProcessSandboxModuleCatalog();
  const issues: GraphValidationIssue[] = [];
  const nodes = graphMembers<GraphValidationNode>(graph.nodes, "nodes", issues);
  const edges = graphMembers<GraphValidationEdge>(graph.edges, "edges", issues);

  // ── Nodes: ids, types, properties ────────────────────────────────────────
  const byId = new Map<string, GraphValidationNode>();
  const seenIds = new Set<string>();
  for (const node of nodes) {
    const id = String(node.id ?? "");
    const type = String(node.type ?? "");
    if (!id) {
      // Nothing can address this node: no edge can name it, and the runner
      // keys every message by node id.
      issues.push({
        severity: "error",
        code: "missing_id",
        nodeType: type,
        message: `Node of type "${type || "(no type)"}" has no id`
      });
    }
    if (id && seenIds.has(id)) {
      issues.push({
        severity: "error",
        code: "duplicate_id",
        nodeId: id,
        nodeType: type,
        message: `Duplicate node id "${id}"`
      });
    } else if (id) {
      seenIds.add(id);
      byId.set(id, node);
    }
    if (!type) {
      issues.push({
        severity: "error",
        code: "unknown_node",
        nodeId: id,
        message: `Node "${id}" has no type`
      });
    } else if (!registry.has(type) && !isEditorOnlyType(type)) {
      issues.push({
        severity: "error",
        code: "unknown_node",
        nodeId: id,
        nodeType: type,
        message: `Unknown node type "${type}" (not in the registry; Python-only nodes are not validated statically)`
      });
    }
  }

  // Handles fed by an incoming edge get their value at runtime — don't flag
  // them as missing required properties.
  const connectedByNode = new Map<string, Set<string>>();
  // Source handles other nodes read — the output handles that have to exist.
  const consumedByNode = new Map<string, Set<string>>();
  const normEdges = edges.map(normalizeEdge);
  for (const e of normEdges) {
    if (e.target && e.targetHandle) {
      let set = connectedByNode.get(e.target);
      if (!set) {
        set = new Set<string>();
        connectedByNode.set(e.target, set);
      }
      set.add(e.targetHandle);
    }
    if (e.source && e.sourceHandle && !isReservedHandle(e.sourceHandle)) {
      let set = consumedByNode.get(e.source);
      if (!set) {
        set = new Set<string>();
        consumedByNode.set(e.source, set);
      }
      set.add(e.sourceHandle);
    }
  }

  // `byId` holds one node per id — a duplicate id is already an error, and
  // validating the shadowed copy's properties would report everything twice.
  for (const [id, node] of byId) {
    const type = String(node.type ?? "");
    if (!type || !registry.has(type)) continue;
    const propIssues = registry.validateNode(
      {
        id,
        type,
        properties: readProperties(node),
        // Without these the registry cannot reach validateDynamicSlots, so a
        // slot declared `required` is never checked.
        dynamic_inputs: readDynamicInputs(node),
        dynamic_properties: readDynamicProperties(node)
      },
      connectedByNode.get(id) ?? new Set<string>()
    );
    for (const pi of propIssues) {
      issues.push({
        severity: "error",
        code: "property",
        nodeId: id,
        nodeType: type,
        message: pi.message
      });
    }

    // ── Properties the node does not have. A misspelled name is dead data:
    // the value sits in the graph, the real property keeps its default, and
    // nothing reports it. A required property left unset is already an error
    // above, so what reaches here is an optional one silently ignored — a
    // warning, not a refusal. Nodes taking dynamic properties are exempt:
    // an undeclared name is the feature there.
    const meta = registry.getMetadata(type);
    if (meta && meta.supports_dynamic_inputs !== true) {
      const declaredNames = new Set(meta.properties.map((prop) => prop.name));
      const dynamic = readDynamicProperties(node);
      const unknown = Object.keys(readProperties(node)).filter(
        (name) =>
          !declaredNames.has(name) &&
          !isReservedHandle(name) &&
          dynamic[name] === undefined
      );
      if (unknown.length > 0) {
        const plural = unknown.length > 1;
        const named = unknown.map((name) => `"${name}"`).join(", ");
        const known = [...declaredNames].sort().join(", ");
        issues.push({
          severity: "warning",
          code: "unknown_property",
          nodeId: id,
          nodeType: type,
          message: `${named} ${plural ? "are" : "is"} not a property of ${type}, so ${plural ? "they are" : "it is"} ignored at run time.${known ? ` It takes: ${known}.` : ""}`
        });
      }
    }

    // ── Dynamic slot types: a JSON-Schema/TypeScript spelling of a type
    // NodeTool already has passes the transport schema, then silently refuses
    // to connect. Custom names stay legal — only known aliases are flagged.
    for (const [slotName, slot] of Object.entries(readDynamicInputs(node))) {
      for (const alias of portTypeAliases(slot?.type)) {
        issues.push({
          severity: "error",
          code: "slot_type_alias",
          nodeId: id,
          nodeType: type,
          message:
            `Dynamic input "${slotName}" is typed "${alias.used}", which is not a ` +
            `NodeTool type — use "${alias.canonical}". A handle typed with an unknown ` +
            "name will not connect."
        });
      }
    }
    for (const [slotName, slotType] of Object.entries(readDynamicOutputs(node))) {
      for (const alias of portTypeAliases(slotType)) {
        issues.push({
          severity: "error",
          code: "slot_type_alias",
          nodeId: id,
          nodeType: type,
          message:
            `Dynamic output "${slotName}" is typed "${alias.used}", which is not a ` +
            `NodeTool type — use "${alias.canonical}". A handle typed with an unknown ` +
            "name will not connect."
        });
      }
    }

    // ── Code nodes: the body is only checked by running it, and a run costs
    // the whole graph. Everything decidable from the graph is decided here.
    // A `code` handle fed by an edge carries a body nothing here can see.
    if (isJsCodeNodeType(type) && !connectedByNode.get(id)?.has("code")) {
      const props = readProperties(node);
      const connectedInputs = [...(connectedByNode.get(id) ?? [])].filter(
        (name) => !isReservedHandle(name)
      );
      const availableInputs = new Set<string>([
        ...Object.keys(readDynamicInputs(node)),
        ...Object.keys(readDynamicProperties(node)),
        ...connectedInputs
      ]);
      // A named `inputs.foo` / `stream("foo")` read is a handle. The editor
      // shows it; an agent can connect to it. Count it as declared so the
      // body is not rejected for a slot the code itself just created.
      for (const name of inferredCodeInputNames(String(props.code ?? ""))) {
        if (!isReservedHandle(name)) availableInputs.add(name);
      }

      // A linked node carries a *copy* of the pinned script's body, so the
      // body below is checked exactly like an inline one. What the link adds
      // is a freshness question: does the node's shape still match the script
      // it came from? Nothing here blocks a run, because a run no longer reads
      // the script row.
      const link = readJsScriptLink(props);
      if (link) {
        const lookup = options.jsScriptLookup;
        const resolved = lookup ? lookup(link) : undefined;
        if (!resolved) {
          issues.push({
            severity: "warning",
            code: lookup ? "js_script_missing" : "js_script_unverified",
            nodeId: id,
            nodeType: type,
            message:
              `Node "${id}" is linked to JS script ${link.id} v${link.version}, ` +
              (lookup
                ? "which no longer exists, so the link's freshness cannot be " +
                  "verified. The node runs the body it copied at link time."
                : "whose freshness cannot be verified here — no script store is " +
                  "available. The node runs the body it copied at link time.")
          });
        } else {
          // Compare the script to slots the node actually stores. Names the
          // body reads are implicit handles for the editor; they must not
          // hide a missing stored slot on a linked node.
          const nodeInputs = [
            ...Object.keys(readDynamicInputs(node)),
            ...Object.keys(readDynamicProperties(node)),
            ...connectedInputs
          ].filter((name) => !isReservedHandle(name));
          const nodeOutputs = Object.keys(readDynamicOutputs(node));
          for (const mismatch of jsScriptPortMismatches({
            scriptInputs: resolved.document.inputs.map((port) => port.name),
            scriptOutputs: resolved.document.outputs.map((port) => port.name),
            nodeInputs,
            nodeOutputs
          })) {
            issues.push({
              severity: "error",
              code: "js_script_ports",
              nodeId: id,
              nodeType: type,
              message: `Node "${id}": ${mismatch}.`
            });
          }
        }
      }

      const { declarations, invalid } = parseSandboxModuleDeclarations(
        props.packages
      );
      for (const entry of invalid) {
        issues.push({
          severity: "error",
          code: "code_module",
          nodeId: id,
          nodeType: type,
          message:
            `Node "${id}": the \`packages\` entry ${entry} is not a sandbox module ` +
            "declaration — each entry is a specifier, or an object with a `specifier`."
        });
      }
      for (const codeIssue of validateCodeNodeBody({
        code: props.code,
        availableInputs: [...availableInputs].filter(
          (name) => !isReservedHandle(name)
        ),
        connectedInputs,
        declaredOutputs: [
          ...new Set([
            ...Object.keys(readDynamicOutputs(node)),
            ...inferredCodeOutputNames(String(props.code ?? ""))
          ])
        ],
        connectedOutputs: [...(consumedByNode.get(id) ?? [])],
        declaredPackages: declarations,
        sandboxModuleCatalog
      })) {
        issues.push({
          severity: codeIssue.severity,
          code: codeIssue.code,
          nodeId: id,
          nodeType: type,
          message: `Node "${id}": ${codeIssue.message}`
        });
      }
    }

  }

  // A model property naming a provider the runtime cannot construct, or an id
  // that provider does not offer, fails only once the node runs — after the
  // rest of the graph has already been paid for. Both are right there in the
  // saved properties.
  issues.push(...collectModelSelectionIssues({ nodes: [...byId.values()] }, registry));

  // ── Fan-in: >1 edge into a handle is only legal when the handle's declared
  // type is a list. Mirrors the kernel's correlation-analysis rule so an
  // example that validates cannot die at run time on exactly this.
  const fanIn = new Map<string, number>();
  for (const e of normEdges) {
    // Control edges carry no data — `analyzeCorrelation` filters them out
    // before counting, so counting them here would invent errors.
    if (e.isControl) continue;
    if (!e.target || !e.targetHandle) continue;
    const key = `${e.target}\u0000${e.targetHandle}`;
    fanIn.set(key, (fanIn.get(key) ?? 0) + 1);
  }
  for (const [key, count] of fanIn) {
    if (count < 2) continue;
    const [targetId, handle] = key.split("\u0000");
    const node = byId.get(targetId);
    const type = String(node?.type ?? "");
    if (!type || !registry.has(type)) continue;
    const propType = registry
      .getMetadata(type)
      ?.properties?.find((prop) => prop.name === handle)?.type;
    // A dynamic slot is not a static property. The kernel merges declared slot
    // types into `propertyTypes` (Graph.loadFromDict), so a slot declared
    // `list[...]` is a legal fan-in target — resolve it the same way here.
    const typeStr =
      typeMetaToString(propType) ||
      slotTypeToString(node ? readDynamicInputs(node)[handle] : undefined);
    if (!(typeStr === "list" || typeStr.startsWith("list["))) {
      issues.push({
        severity: "error",
        code: "fan_in",
        nodeId: targetId,
        nodeType: type,
        message:
          `Handle "${handle}" on node "${targetId}" receives ${count} edges but its ` +
          `type "${typeStr || "unknown"}" is not a list; the kernel's correlation ` +
          `analysis rejects this at run time`
      });
    }
  }

  // ── Cycles: the kernel requires a DAG ────────────────────────────────────
  issues.push(...detectCycles(byId, normEdges));

  // ── Edges: endpoints, handles, type compatibility ────────────────────────
  for (const e of normEdges) {
    const sourceNode = byId.get(e.source);
    const targetNode = byId.get(e.target);
    if (!sourceNode) {
      issues.push({
        severity: "error",
        code: "dangling_edge",
        edgeId: e.id,
        message: `Edge "${e.id}" source node "${e.source}" does not exist`
      });
    }
    if (!targetNode) {
      issues.push({
        severity: "error",
        code: "dangling_edge",
        edgeId: e.id,
        message: `Edge "${e.id}" target node "${e.target}" does not exist`
      });
    }
    if (!sourceNode || !targetNode) continue;

    // Both endpoints exist but the edge names no handle: the kernel routes
    // messages by `${source}:${sourceHandle}`, so an empty handle matches
    // nothing and the edge silently carries no data. The handle checks below
    // are all gated on a non-empty handle, so without this the edge would
    // validate clean.
    if (!e.sourceHandle) {
      issues.push({
        severity: "error",
        code: "missing_handle",
        edgeId: e.id,
        nodeId: e.source,
        nodeType: String(sourceNode.type ?? ""),
        message: `Edge "${e.id}" names no source handle on node "${e.source}" — it cannot be routed`
      });
    }
    if (!e.targetHandle) {
      issues.push({
        severity: "error",
        code: "missing_handle",
        edgeId: e.id,
        nodeId: e.target,
        nodeType: String(targetNode.type ?? ""),
        message: `Edge "${e.id}" names no target handle on node "${e.target}" — it cannot be routed`
      });
    }

    const sourceMeta = registry.getMetadata(String(sourceNode.type ?? ""));
    const targetMeta = registry.getMetadata(String(targetNode.type ?? ""));

    let sourceType = "";
    let targetType = "";

    if (sourceMeta && e.sourceHandle && !isReservedHandle(e.sourceHandle)) {
      const out = sourceMeta.outputs.find((o) => o.name === e.sourceHandle);
      // Metadata, not instance state: `reactFlowNodeToGraphNode` writes
      // `dynamic_outputs: {}` on every node, so testing the instance field
      // disabled this check for nearly every saved graph. Mirrors the target
      // side's use of `supports_dynamic_inputs`.
      const supportsDynamicOut = sourceMeta.supports_dynamic_outputs === true;
      if (!out && !supportsDynamicOut) {
        issues.push({
          severity: "error",
          code: "unknown_handle",
          edgeId: e.id,
          nodeId: e.source,
          nodeType: String(sourceNode.type ?? ""),
          message: `Edge "${e.id}" references output "${e.sourceHandle}" not found on ${String(sourceNode.type)}`
        });
      } else if (out) {
        sourceType = typeMetaToString(out.type);
      } else {
        // Dynamic outputs: an empty map is a node that never declared any (the
        // ReactFlow → graph conversion writes `{}` on every node), so only a
        // populated one can say a handle is missing.
        const declaredOutputs = readDynamicOutputs(sourceNode);
        const names = Object.keys(declaredOutputs);
        const inferredOut = isJsCodeNodeType(String(sourceNode.type ?? ""))
          ? inferredCodeOutputNames(
              String(readProperties(sourceNode).code ?? "")
            )
          : [];
        const knownOut = new Set([...names, ...inferredOut]);
        if (names.length > 0 && !knownOut.has(e.sourceHandle)) {
          issues.push({
            severity: "error",
            code: "unknown_handle",
            edgeId: e.id,
            nodeId: e.source,
            nodeType: String(sourceNode.type ?? ""),
            message: `Edge "${e.id}" references output "${e.sourceHandle}" on ${String(sourceNode.type)}, which declares ${names.map((n) => `"${n}"`).join(", ")}`
          });
        } else {
          sourceType = typeMetaToString(
            declaredOutputs[e.sourceHandle] as TypeMetaLike | undefined
          );
        }
      }
    }

    // True when targetType came from a declared dynamic slot: the user asked
    // for that type explicitly, so a mismatch is an error, not a guess.
    let typedDynamicSlot = false;

    if (targetMeta && e.targetHandle && !isReservedHandle(e.targetHandle)) {
      const inp = targetMeta.properties.find((p) => p.name === e.targetHandle);
      const supportsDynamicIn = targetMeta.supports_dynamic_inputs === true;
      if (!inp && !supportsDynamicIn) {
        issues.push({
          severity: "error",
          code: "unknown_handle",
          edgeId: e.id,
          nodeId: e.target,
          nodeType: String(targetNode.type ?? ""),
          message: `Edge "${e.id}" targets input "${e.targetHandle}" not found on ${String(targetNode.type)}`
        });
      } else if (inp) {
        targetType = typeMetaToString(inp.type);
      } else {
        const slot = readDynamicInputs(targetNode)[e.targetHandle];
        const slotType = slotTypeToString(slot);
        if (slotType) {
          targetType = slotType;
          typedDynamicSlot = true;
        } else {
          issues.push({
            severity: "info",
            code: "untyped_dynamic_slot",
            edgeId: e.id,
            nodeId: e.target,
            nodeType: String(targetNode.type ?? ""),
            message: `Edge "${e.id}" targets dynamic input "${e.targetHandle}" on ${String(targetNode.type)}, which declares no type — the connection is not type-checked`
          });
        }
      }
    }

    if (typesIncompatible(sourceType, targetType)) {
      issues.push({
        severity: typedDynamicSlot ? "error" : "warning",
        code: "type_mismatch",
        edgeId: e.id,
        nodeId: e.target,
        nodeType: String(targetNode.type ?? ""),
        message: typedDynamicSlot
          ? `Edge "${e.id}" connects ${String(sourceNode.type)}.${e.sourceHandle} (${sourceType}) → dynamic input ${String(targetNode.type)}.${e.targetHandle}, declared as ${targetType}`
          : `Edge "${e.id}" connects ${String(sourceNode.type)}.${e.sourceHandle} (${sourceType}) → ${String(targetNode.type)}.${e.targetHandle} (${targetType}) — types may be incompatible`
      });
    }
  }

  // ── Inline dynamic values against their declared slot types ──────────────
  for (const node of nodes) {
    const slots = readDynamicInputs(node);
    const slotNames = Object.keys(slots);
    if (slotNames.length === 0) continue;
    const id = String(node.id ?? "");
    const values = readDynamicProperties(node);
    const connected = connectedByNode.get(id);
    for (const name of slotNames) {
      if (connected?.has(name)) continue;
      const typeStr = slotTypeToString(slots[name]);
      if (valueIncompatibleWithType(values[name], typeStr)) {
        issues.push({
          severity: "warning",
          code: "dynamic_type_mismatch",
          nodeId: id,
          nodeType: String(node.type ?? ""),
          message: `Dynamic input "${name}" on node "${id}" is declared as ${typeStr} but holds a ${typeof values[name]}`
        });
      }
    }
  }

  const errors = issues.filter((i) => i.severity === "error").length;
  const warnings = issues.filter((i) => i.severity === "warning").length;
  const info = issues.filter((i) => i.severity === "info").length;
  return {
    ok: errors === 0,
    nodeCount: nodes.length,
    edgeCount: edges.length,
    counts: { errors, warnings, info },
    issues
  };
}

/** One-line summary headline for human output. */
export function validationHeadline(report: GraphValidationReport): string {
  if (report.ok && report.counts.warnings === 0) {
    return `Workflow is valid — ${report.nodeCount} node(s), ${report.edgeCount} edge(s).`;
  }
  if (report.ok) {
    return `Workflow is valid with ${report.counts.warnings} warning(s).`;
  }
  return `Workflow has ${report.counts.errors} error(s)${report.counts.warnings ? ` and ${report.counts.warnings} warning(s)` : ""}.`;
}
