import { describe, it, expect } from "vitest";
import { NodeRegistry, hydrateGraphNodeFlags } from "../src/registry.js";
import { BaseNode } from "../src/base-node.js";
import { prop } from "../src/decorators.js";

/**
 * A streaming-output node that declares its streaming purely structurally (it
 * overrides genProcess and declares iteration correlation). This mirrors the
 * control nodes (ForEach, Collection, RepeatCount). hydrateGraphNodeFlags must
 * recognise it as streaming, otherwise the kernel actor runs a one-shot
 * process() and the node emits nothing downstream.
 */
class InferredStreamingNode extends BaseNode {
  static readonly nodeType = "test.InferredStreaming";
  static readonly title = "Inferred Streaming";
  static readonly description = "";
  static readonly outputCorrelation = {
    output: { kind: "iteration" as const, source: "__execution__", group: "items" }
  };

  @prop({ type: "list[any]", default: [] })
  declare items: unknown[];

  async process() {
    return {};
  }

  async *genProcess(): AsyncGenerator<Record<string, unknown>> {
    for (const [index, item] of (this.items ?? []).entries()) {
      yield { output: item, index };
    }
  }
}

describe("hydrateGraphNodeFlags", () => {
  it("stamps is_streaming_output for a node that infers streaming via genProcess/correlation", () => {
    const registry = new NodeRegistry();
    registry.register(InferredStreamingNode);

    const hydrated = hydrateGraphNodeFlags(
      {
        nodes: [
          { id: "n1", type: "test.InferredStreaming", properties: { items: [] } }
        ],
        edges: []
      } as never,
      registry
    );

    expect(hydrated.nodes[0].is_streaming_output).toBe(true);
  });

  it("stamps is_streaming_output for a class-less (Python) node from loaded metadata", () => {
    // Python nodes have no registered TS class — getClass() returns undefined
    // and their is_streaming_output lives only in metadata loaded from the
    // worker. hydrateGraphNodeFlags must fall back to resolveMetadata, else a
    // streaming Python node read from a saved graph silently runs one-shot.
    const registry = new NodeRegistry();
    registry.loadMetadata("python.pkg.StreamingPyNode", {
      node_type: "python.pkg.StreamingPyNode",
      title: "Streaming Py Node",
      description: "",
      namespace: "python.pkg",
      properties: [],
      outputs: [{ name: "output", type: { type: "any" } }],
      is_streaming_output: true
    } as never);

    const hydrated = hydrateGraphNodeFlags(
      {
        nodes: [
          { id: "n1", type: "python.pkg.StreamingPyNode", properties: {} }
        ],
        edges: []
      } as never,
      registry
    );

    expect(hydrated.nodes[0].is_streaming_output).toBe(true);
  });

  it("corrects a stale saved true when the registered class declares false", () => {
    // A node type that migrated away from streaming: the class statics say
    // false, but a workflow saved before the migration still carries
    // is_streaming_input: true. The registry must win (?? precedence), or the
    // kernel actor keeps picking run() for a node that no longer streams.
    class BufferedNode extends BaseNode {
      static readonly nodeType = "test.MigratedBuffered";
      static readonly title = "Migrated Buffered";
      static readonly description = "";

      async process() {
        return {};
      }
    }
    const registry = new NodeRegistry();
    registry.register(BufferedNode);

    const hydrated = hydrateGraphNodeFlags(
      {
        nodes: [
          {
            id: "n1",
            type: "test.MigratedBuffered",
            properties: {},
            is_streaming_input: true,
            is_streaming_output: true,
            is_controlled: true,
            is_join_node: true
          }
        ],
        edges: []
      } as never,
      registry
    );

    expect(hydrated.nodes[0].is_streaming_input).toBe(false);
    expect(hydrated.nodes[0].is_streaming_output).toBe(false);
    expect(hydrated.nodes[0].is_controlled).toBe(false);
    expect(hydrated.nodes[0].is_join_node).toBe(false);
  });

  it("keeps saved flags for node types the registry does not know", () => {
    const registry = new NodeRegistry();
    const hydrated = hydrateGraphNodeFlags(
      {
        nodes: [
          {
            id: "n1",
            type: "unknown.pkg.Node",
            properties: {},
            is_streaming_input: true
          }
        ],
        edges: []
      } as never,
      registry
    );

    expect(hydrated.nodes[0].is_streaming_input).toBe(true);
  });
});
