/**
 * GraphBuilder -- stateful in-memory graph accumulator for the graph planner.
 *
 * The planner LLM calls add_node / add_edge tools which mutate a shared
 * GraphBuilder instance. Once the LLM calls finish_graph, the builder
 * validates and produces a GraphData object for WorkflowRunner.
 */

import type { NodeDescriptor, Edge, GraphData } from "@nodetool/protocol";

/** The virtual node type used for LLM-driven agent steps. */
export const AGENT_STEP_NODE_TYPE = "nodetool.agents.AgentStep";

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
    if (!id || typeof id !== "string") {
      errors.push("Node id must be a non-empty string.");
      return errors;
    }
    if (!type || typeof type !== "string") {
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
