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
import type { NodeMetadata } from "./metadata.js";
import type { NodePropertyValidationIssue } from "./validation.js";

/** A node in either kernel (`properties`) or ReactFlow (`data`) shape. */
export interface GraphValidationNode {
  id?: unknown;
  type?: unknown;
  properties?: Record<string, unknown>;
  data?: Record<string, unknown>;
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
}

export interface GraphValidationInput {
  nodes?: GraphValidationNode[];
  edges?: GraphValidationEdge[];
}

export type GraphValidationSeverity = "error" | "warning";

export interface GraphValidationIssue {
  severity: GraphValidationSeverity;
  /** Stable category: "unknown_node" | "duplicate_id" | "property" | "dangling_edge" | "unknown_handle" | "type_mismatch" | "fan_in". */
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
  counts: { errors: number; warnings: number };
  issues: GraphValidationIssue[];
}

/** The slice of NodeRegistry the validator needs (kept narrow for testing). */
export interface GraphValidationRegistry {
  has(nodeType: string): boolean;
  getMetadata(nodeType: string): NodeMetadata | undefined;
  validateNode(
    descriptor: { id: string; type: string; properties?: Record<string, unknown> },
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

type TypeMeta = NodeMetadata["properties"][number]["type"];

function typeMetaToString(tm: TypeMeta | undefined): string {
  if (!tm) return "";
  const args = (tm.type_args ?? []).map(typeMetaToString).filter(Boolean);
  return args.length > 0 ? `${tm.type}[${args.join(", ")}]` : tm.type;
}

/** Handles like `__control__` / `__output__` are framework-internal, not props. */
function isReservedHandle(handle: string): boolean {
  return handle.startsWith("__") && handle.endsWith("__");
}

/**
 * Conservative type compatibility: only flag a mismatch when both sides are
 * known, concrete scalars that clearly differ. `any`/`object`/`union`/empty and
 * any generic container (type_args) are treated as compatible to avoid false
 * positives — this check only ever warns, it never blocks.
 */
function typesIncompatible(sourceType: string, targetType: string): boolean {
  if (!sourceType || !targetType) return false;
  if (sourceType === targetType) return false;
  const permissive = new Set(["any", "object", "union", "list", "dict"]);
  const base = (t: string): string => {
    const i = t.indexOf("[");
    return i >= 0 ? t.slice(0, i) : t;
  };
  const s = base(sourceType);
  const t = base(targetType);
  if (permissive.has(s) || permissive.has(t)) return false;
  if (s !== sourceType || t !== targetType) return false; // generic container — skip
  const numeric = new Set(["int", "float"]);
  if (numeric.has(s) && numeric.has(t)) return false;
  return s !== t;
}

interface NormEdge {
  id: string;
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
}

function normalizeEdge(raw: GraphValidationEdge, index: number): NormEdge {
  return {
    id: typeof raw.id === "string" ? raw.id : `edge-${index}`,
    source: String(raw.source ?? ""),
    sourceHandle: String(raw.sourceHandle ?? raw.source_handle ?? ""),
    target: String(raw.target ?? ""),
    targetHandle: String(raw.targetHandle ?? raw.target_handle ?? "")
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
        properties: node.properties ?? node.data ?? {}
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
    const typeStr = typeMetaToString(propType);
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
      const supportsDynamicOut =
        sourceNode.dynamic_outputs != null &&
        typeof sourceNode.dynamic_outputs === "object";
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
      }
    }

    if (typesIncompatible(sourceType, targetType)) {
      issues.push({
        severity: "warning",
        code: "type_mismatch",
        edgeId: e.id,
        message: `Edge "${e.id}" connects ${String(sourceNode.type)}.${e.sourceHandle} (${sourceType}) → ${String(targetNode.type)}.${e.targetHandle} (${targetType}) — types may be incompatible`
      });
    }
  }

  const errors = issues.filter((i) => i.severity === "error").length;
  const warnings = issues.length - errors;
  return {
    ok: errors === 0,
    nodeCount: nodes.length,
    edgeCount: edges.length,
    counts: { errors, warnings },
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
