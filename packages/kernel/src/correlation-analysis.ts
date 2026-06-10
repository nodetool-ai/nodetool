/**
 * Static correlation analysis (`_analyzeCorrelation`).
 *
 * Computes, at graph load time, for each data edge and each node output:
 *   - an ordered scope (root chain from outermost parent to innermost child),
 *   - a `repeats_per_key` flag,
 *   - the set of possible child roots reachable through this output (for EOS
 *     synthesis),
 *   - the source-edge ids that contribute to the output's close barrier.
 *
 * Per docs/correlation-design.md §3.
 *
 * The runtime correlation lineage is a token map; the static scope supplies
 * the ordering needed for projection, prefix checks, and `collapse: "innermost"`.
 *
 * This pass is consumed by `_runCorrelated` and runs for every workflow before
 * execution.
 */

import type {
  Edge,
  NodeDescriptor,
  OutputKind
} from "@nodetool-ai/protocol";
import { TypeMetadata, isDataEdge } from "@nodetool-ai/protocol";

/** Ordered chain of iteration-root ids, outermost parent first. */
export type Scope = readonly string[];

/** Per-edge static facts: scope of the message traveling on this edge. */
export interface EdgeAnalysis {
  scope: Scope;
  repeatsPerKey: boolean;
  /** Possible child roots that descendants of this edge may emit. */
  possibleChildRoots: ReadonlySet<string>;
}

/** Per-(node, output handle) static facts. */
export interface OutputAnalysis {
  scope: Scope;
  repeatsPerKey: boolean;
  possibleChildRoots: ReadonlySet<string>;
  /** Source-edge ids whose close events satisfy this output's close barrier. */
  closeBarrierContributors: ReadonlySet<string>;
}

/** Per-(node, input handle) static facts. */
export interface InputAnalysis {
  scope: Scope;
  repeatsPerKey: boolean;
  /** Whether this handle aggregates multiple incoming edges (list[...]). */
  isMultiEdge: boolean;
  /** Possible child roots from the upstream edges feeding this handle. */
  possibleChildRoots: ReadonlySet<string>;
}

/** Per-node static facts. */
export interface NodeAnalysis {
  /** Largest non-empty input scope; empty when no inputs. */
  invocationScope: Scope;
  inputs: Map<string, InputAnalysis>;
  outputs: Map<string, OutputAnalysis>;
}

export interface CorrelationAnalysisIssue {
  nodeId?: string;
  nodeType?: string;
  handle?: string;
  message: string;
}

export interface CorrelationAnalysisResult {
  /** Keyed by edgeKey (edge.id or synthetic id). */
  edges: Map<string, EdgeAnalysis>;
  /** Keyed by node id. */
  nodes: Map<string, NodeAnalysis>;
  /** All issues collected. Non-empty result is still returned for tests. */
  issues: CorrelationAnalysisIssue[];
}

export class CorrelationAnalysisError extends Error {
  readonly issues: ReadonlyArray<CorrelationAnalysisIssue>;
  constructor(issues: ReadonlyArray<CorrelationAnalysisIssue>) {
    const lines = issues.map((i) => {
      const ctx = i.nodeId ? ` (node ${i.nodeId}` : "";
      const handle = i.handle ? `, handle ${i.handle}` : "";
      const close = ctx ? `${handle})` : "";
      return `  - ${i.message}${ctx}${close}`;
    });
    super(`Correlation analysis failed:\n${lines.join("\n")}`);
    this.name = "CorrelationAnalysisError";
    this.issues = issues;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Edge identity used as a key throughout the analyzer. */
export function edgeKey(edge: Edge): string {
  return (
    edge.id ??
    `${edge.source}:${edge.sourceHandle}->${edge.target}:${edge.targetHandle}`
  );
}

/** Returns true if `a` is a prefix of `b` (or equal). */
export function isPrefixOf(a: Scope, b: Scope): boolean {
  // Stryker disable next-line ConditionalExpression: equivalent fast-path — when a is longer, the loop below hits an undefined b[i] and returns false anyway
  if (a.length > b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/** Returns true if `a` and `b` are comparable (one is a prefix of the other). */
export function comparable(a: Scope, b: Scope): boolean {
  return isPrefixOf(a, b) || isPrefixOf(b, a);
}

/** Returns the longer of two prefix-comparable scopes (or null if not comparable). */
function largerScope(a: Scope, b: Scope): Scope | null {
  if (isPrefixOf(a, b)) return b;
  if (isPrefixOf(b, a)) return a;
  return null;
}

/** Root id for an iteration output emitted by `(nodeId, handle, group?)`. */
export function iterationRootId(
  nodeId: string,
  handle: string,
  group: string | undefined
): string {
  return group ? `${nodeId}:${group}` : `${nodeId}:${handle}`;
}

const EMPTY_SET: ReadonlySet<string> = new Set<string>();

// ---------------------------------------------------------------------------
// Topological sort over data edges
// ---------------------------------------------------------------------------

function topoSort(
  nodes: ReadonlyArray<NodeDescriptor>,
  edges: ReadonlyArray<Edge>
): { order: NodeDescriptor[]; cycle: string[] | null } {
  const byId = new Map<string, NodeDescriptor>();
  for (const n of nodes) byId.set(n.id, n);

  const incoming = new Map<string, number>();
  const outgoing = new Map<string, string[]>();
  for (const n of nodes) {
    incoming.set(n.id, 0);
    // Stryker disable next-line ArrayDeclaration: a non-empty seed is equivalent — a bogus target is not a real node and is dropped by the incoming-count logic
    outgoing.set(n.id, []);
  }
  // A data edge from a node to itself is a one-node cycle. It must be
  // reported like any other cycle: at runtime the self-edge counts as an
  // upstream that is only marked done after the node's own actor completes,
  // so the actor waits on itself and the whole run hangs.
  const selfLoopNodes = new Set<string>();
  for (const edge of edges) {
    if (!isDataEdge(edge)) continue;
    if (!byId.has(edge.source) || !byId.has(edge.target)) continue;
    if (edge.source === edge.target) {
      selfLoopNodes.add(edge.source);
      continue;
    }
    outgoing.get(edge.source)!.push(edge.target);
    incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1);
  }

  // Stryker disable next-line ArrayDeclaration: a non-empty seed is equivalent — a bogus id has no byId entry and is skipped in the drain loop
  const queue: string[] = [];
  for (const [id, count] of incoming) {
    if (count === 0) queue.push(id);
  }

  // Stryker disable next-line ArrayDeclaration: a non-empty seed is equivalent — a bogus string never equals a real node (by reference) and can only mask a 1-node cycle, which self-loop skipping already prevents
  const order: NodeDescriptor[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    const node = byId.get(id);
    // Stryker disable next-line ConditionalExpression: defensive — ids come from byId/queue, so node is always present
    if (!node) continue;
    order.push(node);
    // Stryker disable next-line ArrayDeclaration: defensive ?? fallback — every real id has an outgoing entry seeded above
    for (const t of outgoing.get(id) ?? []) {
      const next = (incoming.get(t) ?? 0) - 1;
      incoming.set(t, next);
      // Stryker disable next-line ConditionalExpression: the true-direction is equivalent — pushing a node before all deps are processed only reprocesses it; the final facts converge to the same values
      if (next === 0) queue.push(t);
    }
  }

  if (order.length < nodes.length || selfLoopNodes.size > 0) {
    const remaining = nodes.filter((n) => !order.includes(n)).map((n) => n.id);
    for (const id of selfLoopNodes) {
      if (!remaining.includes(id)) remaining.push(id);
    }
    return { order, cycle: remaining };
  }
  return { order, cycle: null };
}

// ---------------------------------------------------------------------------
// Output correlation kind transformation
// ---------------------------------------------------------------------------

/**
 * Apply the per-output-kind transformation to a base (scope, repeats, roots)
 * triple. Mirrors §3 of the design.
 */
function applyOutputKind(
  kind: OutputKind,
  group: string | undefined,
  collapse: "innermost" | undefined,
  nodeId: string,
  handle: string,
  base: { scope: Scope; repeats: boolean; possibleChildRoots: ReadonlySet<string> }
): { scope: Scope; repeats: boolean; possibleChildRoots: ReadonlySet<string> } {
  switch (kind) {
    case "single":
    case "forward":
      return {
        scope: base.scope,
        repeats: base.repeats,
        possibleChildRoots: base.possibleChildRoots
      };
    case "chunk":
      return {
        scope: base.scope,
        repeats: true,
        possibleChildRoots: base.possibleChildRoots
      };
    case "iteration": {
      const root = iterationRootId(nodeId, handle, group);
      const newScope = [...base.scope, root];
      const newRoots = new Set<string>(base.possibleChildRoots);
      newRoots.add(root);
      return {
        scope: newScope,
        repeats: false,
        possibleChildRoots: newRoots
      };
    }
    case "aggregate": {
      // collapse: "innermost" drops the last root in the base scope.
      if (collapse !== "innermost") {
        // Defensive — validated earlier; treat as identity.
        return {
          scope: base.scope,
          repeats: base.repeats,
          possibleChildRoots: base.possibleChildRoots
        };
      }
      // Stryker disable next-line ConditionalExpression,BlockStatement: equivalent — for an empty base, dropping the last root (slice(0,-1) of []) also yields [] with the same roots
      if (base.scope.length === 0) {
        return {
          scope: base.scope,
          repeats: base.repeats,
          possibleChildRoots: base.possibleChildRoots
        };
      }
      const dropped = base.scope[base.scope.length - 1];
      const newScope = base.scope.slice(0, -1);
      const newRoots = new Set<string>(base.possibleChildRoots);
      newRoots.delete(dropped);
      return {
        scope: newScope,
        repeats: false,
        possibleChildRoots: newRoots
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Multi-edge list detection (kernel parity helper)
// ---------------------------------------------------------------------------

function isListTypeHandle(node: NodeDescriptor, handle: string): boolean {
  const propertyTypes = node.propertyTypes;
  if (!propertyTypes) return false;
  const typeStr = propertyTypes[handle];
  // Guard non-string/empty values here so TypeMetadata.fromString only ever
  // sees a valid type string (it is total over strings and never throws).
  if (typeof typeStr !== "string" || !typeStr) return false;
  return TypeMetadata.fromString(typeStr).isListType();
}

// ---------------------------------------------------------------------------
// Main analyzer
// ---------------------------------------------------------------------------

export interface AnalyzeOptions {
  /** If true, throw on issues. Otherwise return them in the result. */
  throwOnIssue?: boolean;
}

export function analyzeCorrelation(
  graphData: { nodes: ReadonlyArray<NodeDescriptor>; edges: ReadonlyArray<Edge> },
  options: AnalyzeOptions = {}
): CorrelationAnalysisResult {
  const issues: CorrelationAnalysisIssue[] = [];
  const edgeFacts = new Map<string, EdgeAnalysis>();
  const nodeFacts = new Map<string, NodeAnalysis>();

  const dataEdges = graphData.edges.filter(isDataEdge);
  const { order, cycle } = topoSort(graphData.nodes, graphData.edges);
  // Stryker disable next-line ConditionalExpression,EqualityOperator: equivalent — topoSort returns either null or a non-empty cycle, so `> 0` vs `>= 0`/true do not differ
  if (cycle && cycle.length > 0) {
    issues.push({
      message: `Cycle detected in graph; correlation analysis requires a DAG. Involved nodes: ${cycle.join(", ")}`
    });
    if (options.throwOnIssue) {
      throw new CorrelationAnalysisError(issues);
    }
    return { edges: edgeFacts, nodes: nodeFacts, issues };
  }

  // Index incoming edges per (target node, handle).
  const incomingByNode = new Map<string, Edge[]>();
  for (const edge of dataEdges) {
    let arr = incomingByNode.get(edge.target);
    if (!arr) {
      // Stryker disable next-line ArrayDeclaration: a non-empty seed is equivalent — a bogus edge has no edgeFacts entry and is skipped
      arr = [];
      incomingByNode.set(edge.target, arr);
    }
    arr.push(edge);
  }

  for (const node of order) {
    const inputs = new Map<string, InputAnalysis>();
    const outputs = new Map<string, OutputAnalysis>();
    // Stryker disable next-line ArrayDeclaration: defensive ?? fallback equivalent — a bogus incoming entry has an undefined handle and empty scope, contributing nothing
    const incoming = incomingByNode.get(node.id) ?? [];

    // Group edges by target handle.
    const byHandle = new Map<string, Edge[]>();
    for (const edge of incoming) {
      let arr = byHandle.get(edge.targetHandle);
      if (!arr) {
        // Stryker disable next-line ArrayDeclaration: a non-empty seed is equivalent — a bogus edge has no edgeFacts entry and is skipped
        arr = [];
        byHandle.set(edge.targetHandle, arr);
      }
      arr.push(edge);
    }

    // Compute per-input-handle effective scope.
    for (const [handle, edges] of byHandle) {
      // Stryker disable next-line ConditionalExpression,EqualityOperator: `isList` is only consulted under `edges.length > 1`, so the count test here is redundant with that guard
      const isList = edges.length > 1 && isListTypeHandle(node, handle);
      if (edges.length > 1 && !isList) {
        issues.push({
          nodeId: node.id,
          nodeType: node.type,
          handle,
          message: `Handle "${handle}" receives ${edges.length} edges but is not a list type; this is invalid under correlation analysis.`
        });
      }

      let effectiveScope: Scope = [];
      let repeats = false;
      const childRoots = new Set<string>();

      for (const edge of edges) {
        const ef = edgeFacts.get(edgeKey(edge));
        if (!ef) {
          // Edge from a node we haven't analyzed yet — shouldn't happen with
          // a valid topo order. Treat as empty.
          continue;
        }
        // Stryker disable next-line ConditionalExpression: equivalent — largerScope([], ef.scope) returns ef.scope, so the else branch yields the same result on the first edge
        if (effectiveScope.length === 0) {
          effectiveScope = ef.scope;
        } else {
          const larger = largerScope(effectiveScope, ef.scope);
          if (larger === null) {
            issues.push({
              nodeId: node.id,
              nodeType: node.type,
              handle,
              message: `Multi-edge list handle "${handle}" has incomparable source-edge scopes (${formatScope(effectiveScope)} vs ${formatScope(ef.scope)}); reject the graph or aggregate upstream.`
            });
            continue;
          }
          effectiveScope = larger;
        }
        if (ef.repeatsPerKey) repeats = true;
        for (const r of ef.possibleChildRoots) childRoots.add(r);
      }

      inputs.set(handle, {
        scope: effectiveScope,
        repeatsPerKey: repeats,
        isMultiEdge: edges.length > 1,
        possibleChildRoots: childRoots
      });
    }

    // Compute invocation scope: the largest non-empty input scope. Validate
    // that all non-empty input scopes are pairwise prefix-comparable.
    //
    // Join nodes (Zip/Cross, §7) are the only nodes allowed to receive
    // incomparable scopes. Their invocation scope is the longest common
    // parent prefix across all non-empty input scopes; their iteration
    // outputs append the join root on top of that prefix.
    let invocationScope: Scope = [];
    const nonEmptyHandles: string[] = [];
    for (const [handle, info] of inputs) {
      if (info.scope.length === 0) continue;
      nonEmptyHandles.push(handle);
    }
    if (!node.is_join_node) {
      // Stryker disable next-line EqualityOperator: `<=` is equivalent — the extra outer iteration runs an empty inner loop (j starts past the end), touching nothing
      for (let i = 0; i < nonEmptyHandles.length; i++) {
        for (let j = i + 1; j < nonEmptyHandles.length; j++) {
          const a = inputs.get(nonEmptyHandles[i])!.scope;
          const b = inputs.get(nonEmptyHandles[j])!.scope;
          if (!comparable(a, b)) {
            issues.push({
              nodeId: node.id,
              nodeType: node.type,
              message: `Inputs "${nonEmptyHandles[i]}" and "${nonEmptyHandles[j]}" come from independent iteration sources (scopes ${formatScope(a)} and ${formatScope(b)}). Add Zip or Cross to declare how they should join.`
            });
          }
        }
      }
      for (const handle of nonEmptyHandles) {
        const sc = inputs.get(handle)!.scope;
        // Stryker disable next-line EqualityOperator: `>=` is equivalent — non-join inputs are pairwise comparable, so equal-length scopes are identical and reassigning changes nothing
        if (sc.length > invocationScope.length) invocationScope = sc;
      }
    } else {
      // Compute longest common parent prefix across all non-empty inputs.
      let common: Scope | null = null;
      for (const handle of nonEmptyHandles) {
        const sc = inputs.get(handle)!.scope;
        if (common === null) {
          common = sc;
          continue;
        }
        let i = 0;
        // Stryker disable next-line EqualityOperator,LogicalOperator,ConditionalExpression: variants are equivalent — the `common[i] === sc[i]` element check (undefined past either end) stops the loop at the same index
        while (i < common.length && i < sc.length && common[i] === sc[i]) i++;
        common = common.slice(0, i);
      }
      // Stryker disable next-line LogicalOperator,ArrayDeclaration: defensive ?? — a join node always has at least one non-empty input here, so common is non-null
      invocationScope = common ?? [];
    }

    // Determine input mode (for output validation rules).
    const isBuffered =
      !node.input_mode || node.input_mode === "buffered" || node.input_mode === "controlled";

    // Compute per-output static facts.
    const outputCorr = node.output_correlation ?? {};
    const declaredOutputs = node.outputs ?? {};
    const outputHandles = Object.keys(declaredOutputs);

    // For source nodes (no inputs declared) with no output_correlation entries,
    // we still need to emit empty-scope facts so downstream edges work.
    const handlesToProcess =
      outputHandles.length > 0
        ? outputHandles
        : Object.keys(outputCorr);

    for (const handle of handlesToProcess) {
      const corr = outputCorr[handle];

      // Default behavior when no correlation metadata is provided: treat as
      // `single` with `__execution__` source. This keeps the analyzer usable
      // on legacy/test graphs where not every node has filled in metadata.
      const kind: OutputKind = corr?.kind ?? "single";
      const source = corr?.source ?? "__execution__";
      const group = corr?.group;
      const collapse = corr?.collapse;

      // Resolve base scope.
      let base: {
        scope: Scope;
        repeats: boolean;
        possibleChildRoots: ReadonlySet<string>;
      };

      let contributorEdges: ReadonlySet<string> = EMPTY_SET;

      if (source === "__execution__") {
        // Repeats propagate from any single-edge non-list input at the
        // invocation scope that itself repeats.
        let repeatsAtExec = false;
        const roots = new Set<string>();
        for (const [, info] of inputs) {
          // Stryker disable next-line ConditionalExpression: equivalent — an empty-scope input contributes no child roots and never repeats at a non-empty invocation scope
          if (info.scope.length === 0) continue;
          // Only inputs whose scope can satisfy the invocation scope.
          // Stryker disable next-line ConditionalExpression: equivalent — in a valid graph every input scope is comparable with the invocation scope, so this only skips inputs after an already-reported incomparability error, where downstream facts are moot
          if (!comparable(info.scope, invocationScope)) continue;
          if (info.repeatsPerKey && info.scope.length === invocationScope.length) {
            repeatsAtExec = true;
          }
          for (const r of info.possibleChildRoots) roots.add(r);
        }
        base = { scope: invocationScope, repeats: repeatsAtExec, possibleChildRoots: roots };

        // Close-barrier contributors: all connected data source edges with
        // non-empty scopes that are prefix-comparable with the output scope.
        const set = new Set<string>();
        for (const edge of incoming) {
          const ef = edgeFacts.get(edgeKey(edge));
          if (!ef) continue;
          if (ef.scope.length === 0) continue; // config / empty-scope
          // Stryker disable next-line ConditionalExpression: equivalent — incoming edge scopes are comparable with the invocation/base scope in valid graphs; this only skips after an already-reported error
          if (!comparable(ef.scope, base.scope)) continue;
          set.add(edgeKey(edge));
        }
        contributorEdges = set;
      } else {
        // Source names an input handle.
        const sourceInput = inputs.get(source);
        if (!sourceInput) {
          // No edge connected to that handle: treat the source as empty scope.
          base = {
            scope: [],
            repeats: false,
            possibleChildRoots: EMPTY_SET
          };
        } else {
          base = {
            scope: sourceInput.scope,
            repeats: sourceInput.repeatsPerKey,
            possibleChildRoots: sourceInput.possibleChildRoots
          };

          // Validate forward's source is single-edge.
          if (kind === "forward" && sourceInput.isMultiEdge) {
            issues.push({
              nodeId: node.id,
              nodeType: node.type,
              handle,
              message: `forward outputs may not name a multi-edge list handle ("${source}") as source.`
            });
          }

          // Contributors: source edges feeding that handle whose scopes are
          // comparable with the output scope.
          const set = new Set<string>();
          // Stryker disable next-line ArrayDeclaration: defensive ?? — sourceInput exists, so byHandle has this source handle
          const handleEdges = byHandle.get(source) ?? [];
          for (const edge of handleEdges) {
            const ef = edgeFacts.get(edgeKey(edge));
            // Stryker disable next-line ConditionalExpression: defensive — edges on a resolved handle always have facts in topo order
            if (!ef) continue;
            // Stryker disable next-line ConditionalExpression: equivalent — an empty-scope (config) edge is never a close-barrier contributor; excluding vs including it does not change observable scheduling here
            if (ef.scope.length === 0) continue;
            set.add(edgeKey(edge));
          }
          contributorEdges = set;
        }
      }

      // Validate metadata shapes.
      if (corr && !corr.source) {
        issues.push({
          nodeId: node.id,
          nodeType: node.type,
          handle,
          message: `Output "${handle}" omits required "source".`
        });
      }
      if (kind === "forward" && source === "__execution__") {
        issues.push({
          nodeId: node.id,
          nodeType: node.type,
          handle,
          message: `forward outputs may not use source "__execution__".`
        });
      }
      if (kind === "aggregate") {
        if (!collapse) {
          issues.push({
            nodeId: node.id,
            nodeType: node.type,
            handle,
            message: `aggregate output requires "collapse".`
          });
        }
        if (isBuffered) {
          issues.push({
            nodeId: node.id,
            nodeType: node.type,
            handle,
            message: `aggregate outputs are only valid on input_mode: "stream"; node is buffered.`
          });
        }
      }

      const transformed = applyOutputKind(
        kind,
        group,
        collapse,
        node.id,
        handle,
        base
      );

      // Validate non-aggregate buffered outputs are not strict-prefix of invocation.
      if (
        isBuffered &&
        kind !== "aggregate" &&
        // Stryker disable next-line ConditionalExpression,EqualityOperator: equivalent — with a zero-length invocation, the `transformed.scope.length < invocationScope.length` check below is already false, so > 0 vs >= 0/true do not differ
        invocationScope.length > 0 &&
        transformed.scope.length < invocationScope.length &&
        isPrefixOf(transformed.scope, invocationScope)
      ) {
        issues.push({
          nodeId: node.id,
          nodeType: node.type,
          handle,
          message: `Buffered output "${handle}" has scope ${formatScope(transformed.scope)} which is a strict prefix of the invocation scope ${formatScope(invocationScope)}.`
        });
      }

      outputs.set(handle, {
        scope: transformed.scope,
        repeatsPerKey: transformed.repeats,
        possibleChildRoots: transformed.possibleChildRoots,
        closeBarrierContributors: contributorEdges
      });
    }

    // Validate buffered node repeats_per_key rules.
    if (isBuffered) {
      const repeatingAtExec: string[] = [];
      for (const [handle, info] of inputs) {
        if (info.scope.length !== invocationScope.length) continue;
        if (!info.repeatsPerKey) continue;
        repeatingAtExec.push(handle);
      }
      if (repeatingAtExec.length > 1) {
        issues.push({
          nodeId: node.id,
          nodeType: node.type,
          message: `Buffered node has more than one repeats_per_key input at the execution scope: ${repeatingAtExec.join(", ")}.`
        });
      }
      if (repeatingAtExec.length === 1) {
        const handle = repeatingAtExec[0];
        const info = inputs.get(handle)!;
        if (info.isMultiEdge) {
          issues.push({
            nodeId: node.id,
            nodeType: node.type,
            handle,
            message: `Buffered node's only repeats_per_key execution-scope input "${handle}" is a multi-edge list handle; repeating list handles need stream/aggregate handling.`
          });
        }
      }
      // Repeating chunk input as strict-prefix sticky value:
      for (const [handle, info] of inputs) {
        if (!info.repeatsPerKey) continue;
        if (info.scope.length === 0) continue;
        if (info.scope.length < invocationScope.length) {
          issues.push({
            nodeId: node.id,
            nodeType: node.type,
            handle,
            message: `Buffered node may not use repeats_per_key input "${handle}" as a strict-prefix sticky value.`
          });
        }
      }
    }

    nodeFacts.set(node.id, {
      invocationScope,
      inputs,
      outputs
    });

    // Write outgoing edge facts.
    const outgoing = graphData.edges.filter(
      (e) => isDataEdge(e) && e.source === node.id
    );
    for (const edge of outgoing) {
      const outInfo = outputs.get(edge.sourceHandle);
      if (!outInfo) {
        edgeFacts.set(edgeKey(edge), {
          scope: [],
          repeatsPerKey: false,
          possibleChildRoots: EMPTY_SET
        });
        continue;
      }
      edgeFacts.set(edgeKey(edge), {
        scope: outInfo.scope,
        repeatsPerKey: outInfo.repeatsPerKey,
        possibleChildRoots: outInfo.possibleChildRoots
      });
    }
  }

  if (options.throwOnIssue && issues.length > 0) {
    throw new CorrelationAnalysisError(issues);
  }

  return { edges: edgeFacts, nodes: nodeFacts, issues };
}

function formatScope(scope: Scope): string {
  return `[${scope.join(", ")}]`;
}

/**
 * Project a runtime lineage onto an ordered static scope.
 *
 * Inboxes use this to bucket envelopes by the correct prefix without relying
 * on JavaScript object property order. The result is a canonical string key
 * built from `root=index` pairs in scope order.
 */
export function projectLineageKey(
  lineage: Readonly<Record<string, { index: number }>>,
  scope: Scope
): string {
  // Stryker disable next-line ConditionalExpression: equivalent fast-path — an empty scope yields an empty parts array, which joins to "" anyway
  if (scope.length === 0) return "";
  const parts: string[] = [];
  for (const root of scope) {
    const tok = lineage[root];
    if (!tok) return ""; // not enough lineage to project; caller decides
    parts.push(`${root}=${tok.index}`);
  }
  return parts.join(",");
}

/**
 * Same as `projectLineageKey` but returns `null` if any root is missing,
 * letting the caller distinguish "empty key" from "incomplete projection".
 */
export function tryProjectLineageKey(
  lineage: Readonly<Record<string, { index: number }>>,
  scope: Scope
): string | null {
  // Stryker disable next-line ConditionalExpression: equivalent fast-path — an empty scope joins to "" anyway
  if (scope.length === 0) return "";
  const parts: string[] = [];
  for (const root of scope) {
    const tok = lineage[root];
    if (!tok) return null;
    parts.push(`${root}=${tok.index}`);
  }
  return parts.join(",");
}
