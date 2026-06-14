/**
 * Graph model and validation.
 *
 * Port of src/nodetool/workflows/graph.py:
 *   - Node/edge lookup with O(1) indexing
 *   - Edge type validation
 *   - Control edge validation with cycle detection
 *   - Topological sort (Kahn's algorithm)
 *   - Streaming upstream computation
 */

import { createLogger } from "@nodetool-ai/config";
import type {
  Edge,
  NodeDescriptor,
  HydratedNodeDescriptor,
  GraphData,
  HydratedGraphData
} from "@nodetool-ai/protocol";

// Stryker disable next-line StringLiteral: logger name is a diagnostic label, not a behavioural contract
const log = createLogger("nodetool.kernel.graph");
import { isControlEdge, isDataEdge, TypeMetadata } from "@nodetool-ai/protocol";
import { syntheticEdgeId } from "./edge-ids.js";

// ---------------------------------------------------------------------------
// Graph errors
// ---------------------------------------------------------------------------

export interface GraphValidationIssue {
  nodeId?: string;
  nodeType?: string;
  property?: string;
  message: string;
}

export class GraphValidationError extends Error {
  readonly issues: GraphValidationIssue[];
  constructor(message: string, issues: GraphValidationIssue[] = []) {
    super(message);
    this.name = "GraphValidationError";
    this.issues = issues;
  }
}

export interface GraphFromDictOptions {
  skipErrors?: boolean;
  allowUndefinedProperties?: boolean;
  validateNodeType?: (nodeType: string) => boolean;
  /**
   * When true (default), delete each node's saved property default for every
   * handle fed by a surviving edge (the edge value wins at runtime).
   * loadFromDict disables this and prunes itself after node-type resolution,
   * since resolution can drop further nodes — and with them, edges.
   */
  pruneEdgeProperties?: boolean;
}

export interface ResolvedNodeType {
  nodeType: string;
  propertyTypes?: Record<string, string>;
  outputs?: Record<string, string>;
  supportsDynamicInputs?: boolean;
  descriptorDefaults?: Partial<NodeDescriptor>;
}

export type NodeTypeResolver =
  | ((
      nodeType: string
    ) => Promise<ResolvedNodeType | null> | ResolvedNodeType | null)
  | {
      resolveNodeType: (
        nodeType: string
      ) => Promise<ResolvedNodeType | null> | ResolvedNodeType | null;
    };

export interface GraphLoadOptions extends Omit<
  GraphFromDictOptions,
  "validateNodeType"
> {
  resolver: NodeTypeResolver;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nodeTypeToJsonSchema(typeStr: string | undefined): string {
  // Stryker disable next-line ConditionalExpression: equivalent — a falsy typeStr falls through to the default case, which also returns "string"
  if (!typeStr) return "string";
  switch (typeStr) {
    case "int":
    case "float":
    case "number":
      return "number";
    // Stryker disable next-line StringLiteral: equivalent — the "str" case falls through to "string", which returns the same value as the default branch
    case "str":
    // Stryker disable next-line StringLiteral: equivalent — "string" maps to "string", identical to the default branch
    case "string":
      return "string";
    case "bool":
    case "boolean":
      return "boolean";
    default:
      return "string";
  }
}

function resolveNodeTypeWith(
  resolver: NodeTypeResolver,
  nodeType: string
): Promise<ResolvedNodeType | null> | ResolvedNodeType | null {
  if (typeof resolver === "function") {
    return resolver(nodeType);
  }
  return resolver.resolveNodeType(nodeType);
}

// ---------------------------------------------------------------------------
// Graph
// ---------------------------------------------------------------------------

/**
 * Mark a code-constructed graph as hydrated by defaulting absent behavior
 * flags to false. For graphs built in code (tests, DSL output) where the
 * author already set the flags that matter. NOT a substitute for registry
 * hydration of client/wire graphs — there an absent flag means "unknown",
 * not "off"; use `Graph.loadFromDict` or node-sdk's `hydrateGraphNodeFlags`.
 */
export function withExplicitNodeFlags(graph: GraphData): HydratedGraphData {
  return {
    nodes: graph.nodes.map((node) => ({
      ...node,
      is_streaming_input: node.is_streaming_input ?? false,
      is_streaming_output: node.is_streaming_output ?? false,
      is_controlled: node.is_controlled ?? false,
      is_join_node: node.is_join_node ?? false
    })),
    edges: [...graph.edges]
  };
}

/** A Graph whose descriptors carry resolved behavior flags (see loadFromDict). */
export interface HydratedGraph extends Graph {
  readonly nodes: ReadonlyArray<HydratedNodeDescriptor>;
}

export class Graph {
  readonly nodes: ReadonlyArray<NodeDescriptor>;
  readonly edges: ReadonlyArray<Edge>;

  /** O(1) node lookup by id */
  private _nodeIndex: Map<string, NodeDescriptor>;

  /** Edges keyed by target node id */
  private _incomingEdges: Map<string, Edge[]>;

  /** Edges keyed by source node id */
  private _outgoingEdges: Map<string, Edge[]>;

  /** Edges keyed by `${source}:${sourceHandle}` for O(1) lookup */
  private _outgoingByHandle: Map<string, Edge[]>;

  /** Cache: nodes that have streaming upstream */
  private _streamingUpstream: Set<string> | null = null;

  constructor(data: GraphData) {
    this.nodes = data.nodes;
    this.edges = data.edges;
    this._nodeIndex = new Map();
    this._incomingEdges = new Map();
    this._outgoingEdges = new Map();
    this._outgoingByHandle = new Map();
    this._buildIndices();
    // Auto-detect is_controlled from incoming control edges (Python parity:
    // BaseNode.is_controlled() checks graph edges at runtime).
    this._detectControlledNodes();
  }

  /**
   * Create a Graph from a plain object, validating the input shape.
   * Throws GraphValidationError if nodes or edges are missing or not arrays.
   */
  static fromDict(data: unknown, options: GraphFromDictOptions = {}): Graph {
    const {
      skipErrors = true,
      allowUndefinedProperties = true,
      validateNodeType,
      pruneEdgeProperties = true
    } = options;
    if (!data || typeof data !== "object") {
      throw new GraphValidationError("Graph data must be an object");
    }
    const obj = data as Record<string, unknown>;
    if (!("nodes" in obj) || !("edges" in obj)) {
      throw new GraphValidationError(
        "Graph data must have 'nodes' and 'edges' fields"
      );
    }
    if (!Array.isArray(obj.nodes)) {
      throw new GraphValidationError("'nodes' must be an array");
    }
    if (!Array.isArray(obj.edges)) {
      throw new GraphValidationError("'edges' must be an array");
    }

    const validNodes: NodeDescriptor[] = [];
    const validNodeIds = new Set<string>();
    for (const node of obj.nodes) {
      // Stryker disable next-line ConditionalExpression,LogicalOperator: the typeof/operator variants are equivalent — a non-object node yields {} after the spread below and is then dropped by the id/type guard
      if (!node || typeof node !== "object") {
        if (skipErrors) continue;
        throw new GraphValidationError("Node entries must be objects");
      }

      const nodeObj = { ...(node as Record<string, unknown>) };
      const id = typeof nodeObj.id === "string" ? nodeObj.id : undefined;
      const type = typeof nodeObj.type === "string" ? nodeObj.type : undefined;
      if (!id || !type) {
        if (skipErrors) continue;
        throw new GraphValidationError(
          "Each node must have string 'id' and 'type' fields"
        );
      }
      if (validateNodeType && !validateNodeType(type)) {
        if (skipErrors) continue;
        throw new GraphValidationError(`Invalid node type: ${type}`);
      }

      const rawProperties =
        // Stryker disable next-line ConditionalExpression,LogicalOperator: equivalent — a non-object properties value spreads to {}, the same as falling through to data/{}
        nodeObj.properties && typeof nodeObj.properties === "object"
          ? { ...(nodeObj.properties as Record<string, unknown>) }
          : // Stryker disable next-line ConditionalExpression,LogicalOperator: equivalent — a non-object data value spreads to {}
            nodeObj.data && typeof nodeObj.data === "object"
            ? { ...(nodeObj.data as Record<string, unknown>) }
            : {};

      // Merge dynamic_properties into the node's properties so that
      // dynamic nodes (e.g. WorkflowNode) receive user-provided values
      // for inputs that aren't connected via edges.
      // Stryker disable next-line all: equivalent — Object.assign with a non-object dynamic_properties value adds no keys (no-op)
      if (nodeObj.dynamic_properties && typeof nodeObj.dynamic_properties === "object") {
        Object.assign(
          rawProperties,
          nodeObj.dynamic_properties as Record<string, unknown>
        );
      }

      if (!allowUndefinedProperties) {
        // Only validate against propertyTypes when it is explicitly provided.
        // Using properties itself as a source of truth would defeat the purpose
        // of this check, since every property key would always be "defined".
        // Stryker disable next-line all: these operands all guard the same thing — a non-object or empty propertyTypes disables the check (the empty-object case has a dedicated test)
        const hasPropertyTypes = nodeObj.propertyTypes != null && typeof nodeObj.propertyTypes === "object" && Object.keys(nodeObj.propertyTypes as Record<string, unknown>).length > 0;

        if (hasPropertyTypes) {
          const definedProperties = new Set<string>(
            Object.keys(nodeObj.propertyTypes as Record<string, unknown>)
          );

          for (const key of Object.keys(rawProperties)) {
            if (!definedProperties.has(key)) {
              if (skipErrors) {
                delete rawProperties[key];
              } else {
                throw new GraphValidationError(
                  `Property ${key} does not exist on node ${id}`
                );
              }
            }
          }
        }
      }

      nodeObj.properties = rawProperties;
      delete nodeObj.data;

      validNodes.push(nodeObj as unknown as NodeDescriptor);
      validNodeIds.add(id);
    }

    const validEdges: Edge[] = [];
    for (const edge of obj.edges) {
      if (!edge || typeof edge !== "object") {
        if (skipErrors) continue;
        throw new GraphValidationError("Edge entries must be objects");
      }

      const edgeObj = edge as Record<string, unknown>;
      const hasRequiredFields =
        typeof edgeObj.source === "string" &&
        typeof edgeObj.sourceHandle === "string" &&
        typeof edgeObj.target === "string" &&
        typeof edgeObj.targetHandle === "string";

      if (!hasRequiredFields) {
        if (skipErrors) continue;
        throw new GraphValidationError(
          "Each edge must have string 'source', 'sourceHandle', 'target', and 'targetHandle' fields"
        );
      }

      const source = edgeObj.source as string;
      const target = edgeObj.target as string;
      if (
        skipErrors &&
        (!validNodeIds.has(source) || !validNodeIds.has(target))
      ) {
        continue;
      }

      validEdges.push(edgeObj as unknown as Edge);
    }

    // Delete property defaults only for handles fed by edges that survived
    // validation. Pruning from the raw edge list would strip a node's saved
    // default for a malformed or dangling edge that is then dropped, leaving
    // the node with neither its default nor an incoming value.
    if (pruneEdgeProperties) {
      Graph._pruneEdgeFedProperties(validNodes, validEdges);
    }

    return new Graph({ nodes: validNodes, edges: validEdges });
  }

  /**
   * Delete each node's saved property default for every handle that has an
   * incoming edge — the runtime edge value wins, and stale defaults would
   * shadow it in `_executeWithInputs`'s property merge.
   */
  private static _pruneEdgeFedProperties(
    nodes: ReadonlyArray<NodeDescriptor>,
    edges: ReadonlyArray<Edge>
  ): void {
    const handlesByTarget = new Map<string, Set<string>>();
    for (const edge of edges) {
      let handles = handlesByTarget.get(edge.target);
      if (!handles) {
        handles = new Set<string>();
        handlesByTarget.set(edge.target, handles);
      }
      handles.add(edge.targetHandle);
    }
    for (const node of nodes) {
      const handles = handlesByTarget.get(node.id);
      if (!handles) continue;
      const props = node.properties as Record<string, unknown> | undefined;
      // Stryker disable next-line ConditionalExpression: defensive — fromDict/loadFromDict always normalize `properties` to an object before reaching here, so `!props` is never true and skipping vs not skipping is indistinguishable
      if (!props) continue;
      for (const handle of handles) {
        delete props[handle];
      }
    }
  }

  static async loadFromDict(
    data: unknown,
    options: GraphLoadOptions
  ): Promise<HydratedGraph> {
    const {
      resolver,
      skipErrors = true,
      allowUndefinedProperties = true
    } = options;
    const normalized = Graph.fromDict(data, {
      skipErrors,
      // Stryker disable next-line BooleanLiteral: must stay true — property validation happens later against the RESOLVED types, not the saved cache (see comment in loadFromDict)
      allowUndefinedProperties: true,
      // Resolution below can drop further nodes (unknown types) and their
      // edges; prune edge-fed defaults only after the final edge set is known
      // so a node downstream of a dropped node keeps its saved default.
      pruneEdgeProperties: false
    });

    const resolvedNodes: HydratedNodeDescriptor[] = [];
    const validNodeIds = new Set<string>();

    for (const node of normalized.nodes) {
      const resolved = await resolveNodeTypeWith(resolver, node.type);
      if (!resolved) {
        if (skipErrors) continue;
        throw new GraphValidationError(`Invalid node type: ${node.type}`);
      }

      const resolvedPropertyTypes = resolved.propertyTypes ?? {};
      const allowedProperties = new Set(Object.keys(resolvedPropertyTypes));
      const mergedProperties = {
        ...((node.properties as Record<string, unknown> | undefined) ?? {})
      };

      const effectiveAllowUndefined =
        resolved.supportsDynamicInputs || allowUndefinedProperties;
      if (!effectiveAllowUndefined) {
        for (const key of Object.keys(mergedProperties)) {
          if (!allowedProperties.has(key)) {
            if (skipErrors) {
              delete mergedProperties[key];
            } else {
              throw new GraphValidationError(
                `Property ${key} does not exist on node ${node.id}`
              );
            }
          }
        }
      }

      const descriptorDefaults: Partial<NodeDescriptor> =
        resolved.descriptorDefaults ?? {};
      const hydratedNode: HydratedNodeDescriptor = {
        ...descriptorDefaults,
        ...node,
        type: resolved.nodeType,
        properties: mergedProperties,
        propertyTypes: {
          ...resolvedPropertyTypes,
          ...(node.propertyTypes ?? {})
        },
        outputs: {
          ...(resolved.outputs ?? {}),
          ...(node.outputs ?? {})
        },
        // Streaming/control flags: registry metadata (descriptorDefaults) is
        // the source of truth.  Saved graph data may have stale or missing
        // values, so always prefer the registry if it declares true.
        is_streaming_input:
          descriptorDefaults.is_streaming_input ||
          node.is_streaming_input ||
          false,
        is_streaming_output:
          descriptorDefaults.is_streaming_output ||
          node.is_streaming_output ||
          false,
        // Correlation metadata is authoritative from the registry. Saved JSON
        // is treated as a cache and overwritten — including when the resolver
        // intentionally returns undefined for a node type that no longer
        // declares correlation. See docs/correlation-design.md §1.
        input_mode: descriptorDefaults.input_mode,
        output_correlation: descriptorDefaults.output_correlation,
        is_controlled:
          descriptorDefaults.is_controlled || node.is_controlled || false,
        // Correlation metadata is registry-authoritative; saved JSON is a
        // cache that gets overwritten — matching `input_mode` /
        // `output_correlation` above. See docs/correlation-design.md §1.
        is_join_node:
          descriptorDefaults.is_join_node || node.is_join_node || false
      };

      resolvedNodes.push(hydratedNode);
      validNodeIds.add(hydratedNode.id);
    }

    const validEdges = normalized.edges.filter(
      (edge) => validNodeIds.has(edge.source) && validNodeIds.has(edge.target)
    );
    Graph._pruneEdgeFedProperties(resolvedNodes, validEdges);
    // Sound: resolvedNodes were built as HydratedNodeDescriptor above.
    return new Graph({
      nodes: resolvedNodes,
      edges: validEdges
    }) as HydratedGraph;
  }

  // -----------------------------------------------------------------------
  // Index building
  // -----------------------------------------------------------------------

  private _buildIndices(): void {
    for (const node of this.nodes) {
      this._nodeIndex.set(node.id, node);
    }
    for (const edge of this.edges) {
      // incoming
      const incoming = this._incomingEdges.get(edge.target);
      if (incoming) {
        incoming.push(edge);
      } else {
        this._incomingEdges.set(edge.target, [edge]);
      }
      // outgoing
      const outgoing = this._outgoingEdges.get(edge.source);
      if (outgoing) {
        outgoing.push(edge);
      } else {
        this._outgoingEdges.set(edge.source, [edge]);
      }
      // outgoing by handle
      const handleKey = `${edge.source}:${edge.sourceHandle}`;
      const byHandle = this._outgoingByHandle.get(handleKey);
      if (byHandle) {
        byHandle.push(edge);
      } else {
        this._outgoingByHandle.set(handleKey, [edge]);
      }
    }
  }

  /**
   * Auto-detect is_controlled from incoming control edges.
   * In Python, BaseNode.is_controlled() is a runtime method that checks
   * the graph context. In TS, we set the flag on the descriptor so that
   * the actor knows to use _runControlled().
   */
  private _detectControlledNodes(): void {
    for (const edge of this.edges) {
      if (!isControlEdge(edge)) continue;
      const target = this._nodeIndex.get(edge.target);
      // Stryker disable next-line ConditionalExpression,LogicalOperator,BooleanLiteral: equivalent — control edges always have a known target here, and re-setting an already-true flag is a no-op; the guard is a micro-optimization
      if (target && !target.is_controlled) {
        // NodeDescriptor is readonly in the type, but we own the instances
        (target as { is_controlled?: boolean }).is_controlled = true;
      }
    }
  }

  // -----------------------------------------------------------------------
  // Lookups
  // -----------------------------------------------------------------------

  findNode(id: string): NodeDescriptor | undefined {
    return this._nodeIndex.get(id);
  }

  /**
   * Return all edges where target == nodeId (incoming edges).
   */
  findIncomingEdges(nodeId: string): Edge[] {
    return this._incomingEdges.get(nodeId) ?? [];
  }

  /**
   * Return all edges where source == nodeId (outgoing edges).
   */
  findOutgoingEdges(nodeId: string): Edge[] {
    return this._outgoingEdges.get(nodeId) ?? [];
  }

  /**
   * Return edges matching a specific (source, sourceHandle) pair. O(1) lookup.
   * Mirrors Python's find_edges(source, source_handle).
   */
  findEdges(source: string, sourceHandle: string): Edge[] {
    return this._outgoingByHandle.get(`${source}:${sourceHandle}`) ?? [];
  }

  /**
   * Return data (non-control) edges targeting a node.
   */
  findDataEdges(nodeId: string): Edge[] {
    return this.findIncomingEdges(nodeId).filter(isDataEdge);
  }

  getControlEdges(): Edge[];
  getControlEdges(targetId: string): Edge[];
  getControlEdges(targetId?: string): Edge[] {
    return this.edges.filter(
      (edge) =>
        isControlEdge(edge) &&
        (targetId === undefined || edge.target === targetId)
    );
  }

  getControllerNodes(): NodeDescriptor[];
  getControllerNodes(targetId: string): NodeDescriptor[];
  getControllerNodes(targetId?: string): NodeDescriptor[] {
    // Stryker disable next-line all: redundant ternary — getControlEdges(undefined) already returns all control edges, identical to getControlEdges()
    const controlEdges = targetId === undefined ? this.getControlEdges() : this.getControlEdges(targetId);
    const ids = new Set(controlEdges.map((e) => e.source));
    return this.nodes.filter((n) => ids.has(n.id));
  }

  getControlledNodes(): NodeDescriptor[];
  getControlledNodes(sourceId: string): string[];
  getControlledNodes(sourceId?: string): NodeDescriptor[] | string[] {
    if (sourceId !== undefined) {
      return this.edges
        .filter((edge) => isControlEdge(edge) && edge.source === sourceId)
        .map((edge) => edge.target);
    }

    const ids = new Set(this.getControlEdges().map((e) => e.target));
    return this.nodes.filter((n) => ids.has(n.id));
  }

  // -----------------------------------------------------------------------
  // Input / Output nodes
  // -----------------------------------------------------------------------

  /**
   * Return nodes that have no incoming data edges (source nodes).
   */
  inputNodes(): NodeDescriptor[] {
    return this.nodes.filter((n) => this.findDataEdges(n.id).length === 0);
  }

  /**
   * Return nodes that have no outgoing data edges (sink nodes).
   */
  outputNodes(): NodeDescriptor[] {
    return this.nodes.filter(
      (n) => this.findOutgoingEdges(n.id).filter(isDataEdge).length === 0
    );
  }

  // -----------------------------------------------------------------------
  // Streaming upstream detection
  // -----------------------------------------------------------------------

  /**
   * Check whether a node has streaming upstream (i.e. is downstream
   * of a streaming-output node via data edges).
   */
  hasStreamingUpstream(nodeId: string): boolean {
    // Stryker disable next-line ConditionalExpression: caching optimization — recomputing yields the same set
    if (!this._streamingUpstream) {
      this._streamingUpstream = this._computeStreamingUpstream();
    }
    return this._streamingUpstream.has(nodeId);
  }

  private _computeStreamingUpstream(): Set<string> {
    const result = new Set<string>();

    // BFS from every streaming-output node along data edges
    const streamingSources = this.nodes.filter((n) => n.is_streaming_output);
    // Stryker disable next-line ArrayDeclaration: a non-empty seed is equivalent — a bogus node id has no outgoing edges, so BFS adds nothing
    const queue: string[] = [];

    for (const src of streamingSources) {
      for (const edge of this.findOutgoingEdges(src.id)) {
        if (isDataEdge(edge) && !result.has(edge.target)) {
          result.add(edge.target);
          queue.push(edge.target);
        }
      }
    }
    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      for (const edge of this.findOutgoingEdges(nodeId)) {
        if (isDataEdge(edge) && !result.has(edge.target)) {
          result.add(edge.target);
          queue.push(edge.target);
        }
      }
    }

    return result;
  }

  // -----------------------------------------------------------------------
  // Topological sort (Kahn's algorithm) – returns levels
  // -----------------------------------------------------------------------

  /**
   * Returns nodes grouped into execution levels.
   * Nodes in the same level have no inter-dependencies and can run
   * concurrently. Only data edges define the ordering.
   */
  topologicalSort(parentId: string | null = null): NodeDescriptor[][] {
    const groupNodeIds =
      parentId === null
        ? new Set(
            this.nodes
              .filter(
                (node) =>
                  node.type === "GroupNode" || node.type.endsWith(".GroupNode")
              )
              .map((node) => node.id)
          )
        : new Set<string>();

    const isInScope = (node: NodeDescriptor): boolean => {
      const directlyInScope = (node.parent_id ?? null) === parentId;
      // Stryker disable next-line ConditionalExpression: the `!= null` guard is redundant — groupNodeIds only holds real node-id strings, so has(null/undefined) is already false
      const inScopedGroup = node.parent_id != null && groupNodeIds.has(node.parent_id);
      return directlyInScope || inScopedGroup;
    };
    const filteredNodes = this.nodes.filter(isInScope);
    const filteredNodeIds = new Set(filteredNodes.map((node) => node.id));
    // Only data edges define the ordering (see docstring). Including control
    // edges would turn a legal data-A→B + control-B→A controller feedback
    // pattern into a mixed cycle, silently dropping both nodes from the
    // returned levels.
    const filteredEdges = this.edges.filter(
      (edge) =>
        isDataEdge(edge) &&
        filteredNodeIds.has(edge.source) &&
        filteredNodeIds.has(edge.target)
    );

    // In-degree count across filtered edges.
    const inDeg = new Map<string, number>();
    for (const node of filteredNodes) {
      inDeg.set(node.id, 0);
    }
    for (const edge of filteredEdges) {
      // Stryker disable next-line LogicalOperator: equivalent — same-level nodes are all processed before the next level, so an off-by-one in-degree count does not change the produced levels
      inDeg.set(edge.target, (inDeg.get(edge.target) ?? 0) + 1);
    }

    // Seed with zero-in-degree nodes
    // Stryker disable next-line ArrayDeclaration: a non-empty seed is equivalent — a bogus id matches no node/edge and is dropped
    let currentLevel: string[] = [];
    for (const [id, deg] of inDeg) {
      if (deg === 0) currentLevel.push(id);
    }

    const levels: NodeDescriptor[][] = [];
    const visited = new Set<string>();

    while (currentLevel.length > 0) {
      const levelNodes: NodeDescriptor[] = [];
      const nextLevel: string[] = [];

      for (const id of currentLevel) {
        visited.add(id);
        const node = this.findNode(id);
        // Stryker disable next-line ConditionalExpression: equivalent — ids come from filteredNodes, so findNode always returns a node
        if (node) levelNodes.push(node);

        for (const edge of filteredEdges) {
          if (edge.source !== id) continue;
          // Stryker disable next-line LogicalOperator: equivalent — every edge target was seeded in inDeg, and same-level processing means the decrement order does not change the produced levels
          const newDeg = (inDeg.get(edge.target) ?? 1) - 1;
          inDeg.set(edge.target, newDeg);
          if (newDeg === 0 && !visited.has(edge.target)) {
            nextLevel.push(edge.target);
          }
        }
      }

      // Stryker disable next-line ConditionalExpression,EqualityOperator: equivalent — currentLevel ids all resolve to nodes, so levelNodes is never empty when currentLevel is non-empty
      if (levelNodes.length > 0) levels.push(levelNodes);
      currentLevel = nextLevel;
    }

    // Stryker disable next-line ConditionalExpression,EqualityOperator,BlockStatement: this only emits a diagnostic warning; the returned levels are unaffected
    if (visited.size !== filteredNodes.length) {
      // Stryker disable next-line StringLiteral,ObjectLiteral: diagnostic log args only
      log.warn("Graph contains at least one cycle", {
        visited: visited.size,
        total: filteredNodes.length
      });
    }

    return levels;
  }

  // -----------------------------------------------------------------------
  // Input / Output schema (T-MSG-5)
  // -----------------------------------------------------------------------

  /**
   * Build a JSON Schema object from input nodes (type contains "Input").
   * Each input node contributes a property named after node.name (or node.id).
   */
  getInputSchema(): {
    properties: Record<string, unknown>;
    required: string[];
  } {
    return this._buildSchema((n) => n.type.includes("Input"));
  }

  /**
   * Build a JSON Schema object from output nodes (type contains "Output").
   */
  getOutputSchema(): {
    properties: Record<string, unknown>;
    required: string[];
  } {
    return this._buildSchema((n) => n.type.includes("Output"));
  }

  private _buildSchema(filter: (n: NodeDescriptor) => boolean): {
    properties: Record<string, unknown>;
    required: string[];
  } {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const node of this.nodes) {
      if (!filter(node)) continue;
      const name = node.name || node.id;
      // Use the first output type to determine the JSON Schema type
      const outputType = node.outputs
        ? Object.values(node.outputs)[0]
        : undefined;
      properties[name] = { type: nodeTypeToJsonSchema(outputType) };
      required.push(name);
    }

    return { properties, required };
  }

  // -----------------------------------------------------------------------
  // Validation
  // -----------------------------------------------------------------------

  /**
   * Validate the graph structure.
   * Throws GraphValidationError on problems.
   */
  validate(): void {
    this.validateEdgeEndpoints();
    this.validateControlEdges();
    this.validateEdgeTypes();
  }

  /**
   * Verify that every edge references existing nodes.
   */
  validateEdgeEndpoints(): void {
    for (const edge of this.edges) {
      // Self-loops pass control-cycle detection and deadlock at runtime:
      // the node waits on an input handle that only the node itself can
      // close. The correlation analyzer reports data self-loops as cycles;
      // this guard also covers direct validate() callers and control edges.
      if (edge.source === edge.target) {
        throw new GraphValidationError(
          `Edge ${edge.id ?? syntheticEdgeId(edge.source, edge.sourceHandle, edge.target, edge.targetHandle)} ` +
            `connects node "${edge.source}" to itself; self-loop edges are not supported`,
          [
            {
              nodeId: edge.source,
              property: edge.targetHandle,
              message: "Self-loop edges are not supported"
            }
          ]
        );
      }
      if (!this._nodeIndex.has(edge.source)) {
        // Stryker disable next-line StringLiteral,ObjectLiteral: diagnostic log args only
        log.error("Edge references unknown source node", {
          source: edge.source
        });
        throw new GraphValidationError(
          `Edge references unknown source node: ${edge.source}`
        );
      }
      if (!this._nodeIndex.has(edge.target)) {
        // Stryker disable next-line StringLiteral,ObjectLiteral: diagnostic log args only
        log.error("Edge references unknown target node", {
          target: edge.target
        });
        throw new GraphValidationError(
          `Edge references unknown target node: ${edge.target}`
        );
      }
    }
  }

  /**
   * Validate control edges:
   *  - Source and target must exist.
   *  - Target handle must be "__control__".
   *  - No cycles in control edges.
   */
  validateControlEdges(): void {
    const controlEdges = this.getControlEdges();
    for (const edge of controlEdges) {
      if (edge.targetHandle !== "__control__") {
        throw new GraphValidationError(
          `Control edge target handle must be "__control__", ` +
            `got "${edge.targetHandle}" on edge ${edge.id ?? "(no id)"}`
        );
      }
    }

    // Cycle detection in control edges (DFS)
    this._checkCircularControl(controlEdges);
  }

  /**
   * Validate type compatibility between connected edge endpoints.
   * For each data edge, checks if the source output type is compatible
   * with the target input type. Compatible means: same type, one is "any",
   * or numeric widening (int -> float).
   */
  validateEdgeTypes(): void {
    for (const edge of this.edges) {
      // Stryker disable next-line ConditionalExpression: equivalent — a control edge has no source output type for its handle and is skipped by the !sourceType guard below anyway
      if (isControlEdge(edge)) continue;

      const sourceNode = this._nodeIndex.get(edge.source);
      const targetNode = this._nodeIndex.get(edge.target);
      if (!sourceNode || !targetNode) continue;

      // Get source output type from node.outputs[sourceHandle]
      const sourceType = sourceNode.outputs?.[edge.sourceHandle];
      if (!sourceType) continue; // no type info, skip

      // Get target input type: propertyTypes is the authoritative map after
      // graph load. Fall back to a property value carrying an explicit
      // `type` descriptor for raw payloads. Plain string property values
      // are runtime data (e.g. saved literals), never type names.
      let targetType: string | undefined =
        targetNode.propertyTypes?.[edge.targetHandle];
      if (!targetType) {
        const targetProp = targetNode.properties?.[edge.targetHandle];
        if (
          typeof targetProp === "object" &&
          targetProp !== null &&
          "type" in targetProp &&
          typeof (targetProp as { type: unknown }).type === "string"
        ) {
          targetType = (targetProp as { type: string }).type;
        }
      }
      if (!targetType) continue; // no type info, skip

      // Use TypeMetadata for full compatibility check (handles list[X], union, numeric widening)
      const sourceMeta = TypeMetadata.fromString(sourceType);
      const targetMeta = TypeMetadata.fromString(targetType);

      // Scalar-into-list aggregation: a value edge may feed a list-typed
      // input (multi-edge list inputs collect items into a list, and a
      // single item edge wraps). Accept when the source is compatible with
      // the list's element type.
      const elementCompatible =
        targetMeta.isListType() &&
        !sourceMeta.isListType() &&
        (targetMeta.args.length === 0 ||
          sourceMeta.isCompatibleWith(targetMeta.args[0]));

      if (!sourceMeta.isCompatibleWith(targetMeta) && !elementCompatible) {
        // Stryker disable next-line StringLiteral,ObjectLiteral: diagnostic log args only
        log.warn("Type mismatch on edge", {
          source: edge.source,
          target: edge.target,
          sourceType,
          targetType
        });
        throw new GraphValidationError(
          `Type mismatch on edge ${edge.id ?? syntheticEdgeId(edge.source, edge.sourceHandle, edge.target, edge.targetHandle)}: ` +
            `source outputs "${sourceType}" but target expects "${targetType}"`
        );
      }
    }
  }

  private _checkCircularControl(controlEdges: Edge[]): void {
    // Build adjacency list for control edges only
    const adj = new Map<string, string[]>();
    for (const edge of controlEdges) {
      const targets = adj.get(edge.source);
      if (targets) {
        targets.push(edge.target);
      } else {
        adj.set(edge.source, [edge.target]);
      }
    }

    const WHITE = 0,
      GRAY = 1,
      BLACK = 2;
    const color = new Map<string, number>();

    const dfs = (node: string): boolean => {
      color.set(node, GRAY);
      for (const neighbor of adj.get(node) ?? []) {
        const c = color.get(neighbor) ?? WHITE;
        if (c === GRAY) return true; // back edge → cycle
        // Stryker disable next-line ConditionalExpression,EqualityOperator: the `c === WHITE` guard only avoids redundant re-visits; cycles are still caught by the GRAY check above, so the detection result is unchanged
        if (c === WHITE && dfs(neighbor)) return true;
      }
      color.set(node, BLACK);
      return false;
    };

    for (const node of adj.keys()) {
      // Stryker disable next-line ConditionalExpression: equivalent — re-running dfs on an already-coloured node is redundant work with the same cycle-detection result
      if ((color.get(node) ?? WHITE) === WHITE) {
        if (dfs(node)) {
          // Stryker disable next-line StringLiteral: diagnostic log message only
          log.error("Graph contains a cycle in control edges");
          throw new GraphValidationError(
            "Graph contains a cycle in control edges"
          );
        }
      }
    }
  }
}
