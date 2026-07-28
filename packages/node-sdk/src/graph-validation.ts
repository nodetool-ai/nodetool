/**
 * Static workflow-graph validation.
 *
 * Checks a graph against the node registry WITHOUT executing it: unknown node
 * types, duplicate ids, missing required / unselected-model properties, dangling
 * edges, unknown edge handles, and (best-effort) edge type mismatches. Catches
 * the breakage that would otherwise only surface after a full workflow run.
 *
 * Takes a {@link GraphValidationRegistry} (the slice of NodeRegistry it needs)
 * so it can be unit-tested with a fake and reused by the CLI and agent tools.
 */
import type { DynamicSlotMeta } from "@nodetool-ai/protocol";
import type { NodeMetadata } from "./metadata.js";
import {
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
   * Stable category: "unknown_node" | "duplicate_id" | "property" |
   * "dangling_edge" | "unknown_handle" | "type_mismatch" | "fan_in" |
   * "untyped_dynamic_slot" | "dynamic_type_mismatch".
   *
   * - "untyped_dynamic_slot" (info): an edge targets a dynamic input that
   *   carries no `dynamic_inputs` declaration, so its type cannot be checked.
   *   Legacy graphs produce one per dynamic edge; never an error, and below
   *   the warnings-as-errors ratchet.
   * - "dynamic_type_mismatch" (warning): an inline `dynamic_properties` value
   *   does not match its slot's declared type.
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

export function validateGraph(
  graph: GraphValidationInput,
  registry: GraphValidationRegistry
): GraphValidationReport {
  const issues: GraphValidationIssue[] = [];
  const nodes = graph.nodes ?? [];
  const edges = graph.edges ?? [];

  // ── Nodes: ids, types, properties ────────────────────────────────────────
  const byId = new Map<string, GraphValidationNode>();
  const seenIds = new Set<string>();
  for (const node of nodes) {
    const id = String(node.id ?? "");
    const type = String(node.type ?? "");
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
  const normEdges = edges.map(normalizeEdge);
  for (const e of normEdges) {
    if (!e.target || !e.targetHandle) continue;
    let set = connectedByNode.get(e.target);
    if (!set) {
      set = new Set<string>();
      connectedByNode.set(e.target, set);
    }
    set.add(e.targetHandle);
  }

  for (const node of nodes) {
    const id = String(node.id ?? "");
    const type = String(node.type ?? "");
    if (!type || !registry.has(type)) continue;
    const propIssues = registry.validateNode(
      {
        id,
        type,
        properties: node.properties ?? node.data ?? {},
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
  }

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
