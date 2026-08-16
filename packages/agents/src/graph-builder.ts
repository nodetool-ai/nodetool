/**
 * GraphBuilder -- stateful in-memory graph accumulator for the graph planner.
 *
 * The planner LLM calls add_node / add_edge tools which mutate a shared
 * GraphBuilder instance. Once the LLM calls finish_graph, the builder
 * validates and produces a GraphData object for WorkflowRunner.
 */

import type {
  NodeDescriptor,
  Edge,
  GraphData,
  DynamicSlotMeta
} from "@nodetool-ai/protocol";
import { isNonEmptyString, isString } from "./utils/type-guards.js";

/** The node type used for LLM-driven steps in planned graphs. */
export const AGENT_NODE_TYPE = "nodetool.agents.Agent";

/** The value a `dynamic_outputs` entry carries: the slot's type. */
export type DynamicOutputType = NonNullable<
  NodeDescriptor["dynamic_outputs"]
>[string];

export class GraphBuilder {
  private readonly _nodes = new Map<string, NodeDescriptor>();
  private readonly _edges: Edge[] = [];
  private _built = false;

  /** All node IDs currently in the graph. */
  get nodeIds(): ReadonlySet<string> {
    return new Set(this._nodes.keys());
  }

  /** Number of nodes in the graph. */
  get nodeCount(): number {
    return this._nodes.size;
  }

  /** Number of edges in the graph. */
  get edgeCount(): number {
    return this._edges.length;
  }

  /** Check whether a node ID is already registered. */
  hasNode(id: string): boolean {
    return this._nodes.has(id);
  }

  /** Get a node descriptor by ID. */
  getNode(id: string): NodeDescriptor | undefined {
    return this._nodes.get(id);
  }

  /**
   * Add a node to the graph.
   * Returns an array of validation errors (empty = success).
   */
  addNode(
    id: string,
    type: string,
    properties?: Record<string, unknown>,
    name?: string
  ): string[] {
    const errors: string[] = [];
    if (this._built) {
      errors.push("Graph has already been finalized.");
      return errors;
    }
    if (!id || !isString(id)) {
      errors.push("Node id must be a non-empty string.");
      return errors;
    }
    if (!type || !isString(type)) {
      errors.push("Node type must be a non-empty string.");
      return errors;
    }
    if (this._nodes.has(id)) {
      errors.push(`Duplicate node id: '${id}'.`);
      return errors;
    }

    const descriptor: NodeDescriptor = {
      id,
      type,
      name: name ?? id,
      properties: properties ?? {}
    };

    this._nodes.set(id, descriptor);
    return errors;
  }

  /**
   * Declare a typed dynamic input slot on a node.
   *
   * Dynamic nodes accept input handles that aren't in their static metadata.
   * Declaring the slot records the type the handle carries, so the validator
   * and the runner can check it like any other input. An existing declaration
   * is never overwritten — the first one wins, and a slot already declared by
   * the node's own schema stays authoritative.
   *
   * Returns an array of validation errors (empty = success).
   */
  declareDynamicInput(
    nodeId: string,
    name: string,
    meta: DynamicSlotMeta
  ): string[] {
    if (this._built) {
      return ["Graph has already been finalized."];
    }
    const node = this._nodes.get(nodeId);
    if (!node) {
      return [`Node '${nodeId}' does not exist.`];
    }
    if (!name) {
      return ["Dynamic input name must be a non-empty string."];
    }
    const slots = node.dynamic_inputs ?? {};
    if (slots[name]) return [];
    node.dynamic_inputs = { ...slots, [name]: meta };
    return [];
  }

  /**
   * Declare a dynamic output slot on a node.
   *
   * Dynamic nodes emit output handles that aren't in their static metadata.
   * A handle nothing declares is invisible to the validator, so a body that
   * returns it reads as returning something nothing downstream can consume.
   * Declaring it records the handle, so an edge off it validates like any
   * other output. An existing declaration is never overwritten — the first one
   * wins.
   *
   * The slot value is the type itself, not a `DynamicSlotMeta` wrapper: that
   * is the shape `NodeDescriptor.dynamic_outputs` carries.
   *
   * Returns an array of validation errors (empty = success).
   */
  declareDynamicOutput(
    nodeId: string,
    name: string,
    type: DynamicOutputType
  ): string[] {
    if (this._built) {
      return ["Graph has already been finalized."];
    }
    const node = this._nodes.get(nodeId);
    if (!node) {
      return [`Node '${nodeId}' does not exist.`];
    }
    if (!name) {
      return ["Dynamic output name must be a non-empty string."];
    }
    const slots = node.dynamic_outputs ?? {};
    if (slots[name]) return [];
    node.dynamic_outputs = { ...slots, [name]: type };
    return [];
  }

  /**
   * Remove a node and every edge attached to it.
   * Returns an array of validation errors (empty = success).
   */
  removeNode(id: string): string[] {
    if (this._built) {
      return ["Graph has already been finalized."];
    }
    if (!this._nodes.has(id)) {
      return [`Node '${id}' does not exist.`];
    }
    this._nodes.delete(id);
    for (let i = this._edges.length - 1; i >= 0; i--) {
      const e = this._edges[i];
      if (e.source === id || e.target === id) {
        this._edges.splice(i, 1);
      }
    }
    return [];
  }

  /**
   * Remove one edge identified by its full endpoint tuple.
   * Returns an array of validation errors (empty = success).
   */
  removeEdge(
    source: string,
    sourceHandle: string,
    target: string,
    targetHandle: string
  ): string[] {
    if (this._built) {
      return ["Graph has already been finalized."];
    }
    const index = this._edges.findIndex(
      (e) =>
        e.source === source &&
        e.sourceHandle === sourceHandle &&
        e.target === target &&
        e.targetHandle === targetHandle
    );
    if (index < 0) {
      return [
        `Edge ${source}.${sourceHandle} → ${target}.${targetHandle} does not exist.`
      ];
    }
    this._edges.splice(index, 1);
    return [];
  }

  /**
   * Copy of the current (possibly incomplete) graph. Used for pre-build
   * validation and for showing the model what it has built so far.
   */
  snapshot(): GraphData {
    return {
      nodes: [...this._nodes.values()].map((n) => ({ ...n })),
      edges: this._edges.map((e) => ({ ...e }))
    };
  }

  /**
   * Human/LLM-readable one-line-per-item summary of the current graph.
   * Injected into retry prompts so the model knows the builder state persists
   * across attempts.
   */
  describe(): string {
    if (this._nodes.size === 0) return "(empty graph — no nodes yet)";
    const nodeLines = [...this._nodes.values()].map(
      (n) => `- node ${n.id} (${n.type})`
    );
    const edgeLines = this._edges.map(
      (e) =>
        `- edge ${e.source}.${e.sourceHandle} → ${e.target}.${e.targetHandle}`
    );
    return [
      "Nodes:",
      ...nodeLines,
      "Edges:",
      ...(edgeLines.length > 0 ? edgeLines : ["- (none)"])
    ].join("\n");
  }

  /**
   * Add an edge connecting two nodes.
   * Returns an array of validation errors (empty = success).
   */
  addEdge(
    source: string,
    sourceHandle: string,
    target: string,
    targetHandle: string
  ): string[] {
    const errors: string[] = [];
    if (this._built) {
      errors.push("Graph has already been finalized.");
      return errors;
    }
    if (!this._nodes.has(source)) {
      errors.push(`Source node '${source}' does not exist.`);
    }
    if (!this._nodes.has(target)) {
      errors.push(`Target node '${target}' does not exist.`);
    }
    if (!sourceHandle) {
      errors.push("sourceHandle must be a non-empty string.");
    }
    if (!targetHandle) {
      errors.push("targetHandle must be a non-empty string.");
    }
    if (source === target) {
      errors.push("Self-loops are not allowed.");
    }
    if (errors.length > 0) return errors;

    // Reject an edge that would introduce a cycle: if `source` is already
    // reachable from `target`, adding source→target closes a loop
    // (target→…→source→target). Caught here so the model gets an actionable
    // error at the moment it adds the edge, not only at finish_graph.
    if (this.isReachable(target, source)) {
      errors.push(
        `Edge ${source}.${sourceHandle} → ${target}.${targetHandle} would create a cycle: '${source}' is already reachable from '${target}'.`
      );
      return errors;
    }

    // Check for duplicate edge
    const isDuplicate = this._edges.some(
      (e) =>
        e.source === source &&
        e.sourceHandle === sourceHandle &&
        e.target === target &&
        e.targetHandle === targetHandle
    );
    if (isDuplicate) {
      errors.push(
        `Duplicate edge: ${source}.${sourceHandle} → ${target}.${targetHandle}`
      );
      return errors;
    }

    this._edges.push({ source, sourceHandle, target, targetHandle });
    return errors;
  }

  /**
   * Whether `to` is reachable from `from` following the current directed edges.
   * A node is trivially reachable from itself. Used by {@link addEdge} for a
   * cheap incremental cycle check.
   */
  private isReachable(from: string, to: string): boolean {
    if (from === to) return true;
    const visited = new Set<string>([from]);
    const stack = [from];
    while (stack.length > 0) {
      const current = stack.pop()!;
      for (const edge of this._edges) {
        if (edge.source !== current || visited.has(edge.target)) continue;
        if (edge.target === to) return true;
        visited.add(edge.target);
        stack.push(edge.target);
      }
    }
    return false;
  }

  /**
   * Validate the full graph: cycle detection, dangling edge references,
   * and at least one node.
   * Returns an array of errors (empty = valid).
   */
  validate(): string[] {
    const errors: string[] = [];

    if (this._nodes.size === 0) {
      errors.push("Graph must contain at least one node.");
      return errors;
    }

    // Check edge references
    for (const edge of this._edges) {
      if (!this._nodes.has(edge.source)) {
        errors.push(
          `Edge references non-existent source node '${edge.source}'.`
        );
      }
      if (!this._nodes.has(edge.target)) {
        errors.push(
          `Edge references non-existent target node '${edge.target}'.`
        );
      }
    }

    // An Agent node needs a prompt from somewhere: either a literal property
    // or an incoming edge on the `prompt` handle. `prompt` defaults to "" and
    // isn't schema-required, so validateGraph won't catch an empty one.
    for (const node of this._nodes.values()) {
      if (node.type !== AGENT_NODE_TYPE) continue;
      const literal = node.properties?.["prompt"];
      const hasLiteral = isNonEmptyString(literal);
      const hasEdge = this._edges.some(
        (e) => e.target === node.id && e.targetHandle === "prompt"
      );
      if (!hasLiteral && !hasEdge) {
        errors.push(
          `Agent node '${node.id}' needs a "prompt": set it as a property or wire an edge into its \`prompt\` handle.`
        );
      }
    }

    // Cycle detection via Kahn's algorithm
    const inDegree = new Map<string, number>();
    const adjList = new Map<string, string[]>();
    for (const id of this._nodes.keys()) {
      inDegree.set(id, 0);
      adjList.set(id, []);
    }
    for (const edge of this._edges) {
      if (adjList.has(edge.source) && inDegree.has(edge.target)) {
        adjList.get(edge.source)!.push(edge.target);
        inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
      }
    }

    const queue: string[] = [];
    for (const [id, deg] of inDegree) {
      if (deg === 0) queue.push(id);
    }
    let visited = 0;
    while (queue.length > 0) {
      const id = queue.shift()!;
      visited++;
      for (const neighbor of adjList.get(id) ?? []) {
        const newDeg = (inDegree.get(neighbor) ?? 1) - 1;
        inDegree.set(neighbor, newDeg);
        if (newDeg === 0) queue.push(neighbor);
      }
    }
    if (visited < this._nodes.size) {
      errors.push("Graph contains a cycle.");
    }

    return errors;
  }

  /**
   * Finalize and return the graph as GraphData.
   * Throws if validation fails.
   */
  build(): GraphData {
    const errors = this.validate();
    if (errors.length > 0) {
      throw new Error(
        `Graph validation failed:\n${errors.map((e) => `- ${e}`).join("\n")}`
      );
    }
    this._built = true;

    // Topological sort for deterministic node ordering
    const inDegree = new Map<string, number>();
    const adjList = new Map<string, string[]>();
    for (const id of this._nodes.keys()) {
      inDegree.set(id, 0);
      adjList.set(id, []);
    }
    for (const edge of this._edges) {
      adjList.get(edge.source)!.push(edge.target);
      inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
    }

    const queue: string[] = [];
    for (const [id, deg] of inDegree) {
      if (deg === 0) queue.push(id);
    }
    const sorted: string[] = [];
    while (queue.length > 0) {
      const id = queue.shift()!;
      sorted.push(id);
      for (const neighbor of adjList.get(id) ?? []) {
        const newDeg = (inDegree.get(neighbor) ?? 1) - 1;
        inDegree.set(neighbor, newDeg);
        if (newDeg === 0) queue.push(neighbor);
      }
    }

    const nodes = sorted.map((id) => this._nodes.get(id)!);
    const edges = [...this._edges];

    return { nodes, edges };
  }

  /** Reset the builder for reuse. */
  reset(): void {
    this._nodes.clear();
    this._edges.length = 0;
    this._built = false;
  }
}
