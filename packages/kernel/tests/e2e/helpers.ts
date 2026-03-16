/**
 * Shared helpers for E2E workflow tests.
 */

import { WorkflowRunner } from "../../src/runner.js";
import { NodeRegistry } from "@nodetool/node-sdk";
import type { NodeDescriptor, Edge } from "@nodetool/protocol";
import {
  ALL_TEST_NODES,
  ALL_CONTROLLER_NODES,
} from "@nodetool/node-sdk";

// Re-export commonly used node classes so test files don't need a long import list
export {
  Add,
  Passthrough,
  Multiply,
  Constant,
  StringConcat,
  FormatText,
  ThresholdProcessor,
  ErrorNode,
  SlowNode,
  StreamingCounter,
  IntAccumulator,
  SimpleController,
  MultiTriggerController,
  StopEventController,
  StreamingInputProcessor,
  FullStreamingNode,
  ListSumProcessor,
  ConditionalErrorProcessor,
  SilentNode,
  IntInput,
  FloatInput,
  StringInput,
} from "@nodetool/node-sdk";

// ---------------------------------------------------------------------------
// Registry + runner factories
// ---------------------------------------------------------------------------

type NodeClass = (typeof ALL_TEST_NODES)[number] | (typeof ALL_CONTROLLER_NODES)[number];

export function makeRegistry(extra: NodeClass[] = []): NodeRegistry {
  const registry = new NodeRegistry();
  for (const nodeClass of [...ALL_TEST_NODES, ...ALL_CONTROLLER_NODES]) {
    registry.register(nodeClass);
  }
  for (const nodeClass of extra) {
    registry.register(nodeClass);
  }
  return registry;
}

export function makeRunner(registry: NodeRegistry): WorkflowRunner {
  return new WorkflowRunner("test-job", {
    resolveExecutor: (node) => {
      if (!registry.has(node.type)) {
        // Fallback: identity executor for unregistered types (e.g. test.Input)
        return { async process(inputs) { return inputs; } };
      }
      return registry.resolve(node);
    },
  });
}

// ---------------------------------------------------------------------------
// Node descriptor factories
// ---------------------------------------------------------------------------

/** External input node (dispatched via params). */
export function inp(id: string, name: string, props?: object): NodeDescriptor {
  return { id, type: "test.Input", name, properties: props as Record<string, unknown> | undefined };
}

/** Generic node descriptor with optional flags and properties. */
export function nd(
  id: string,
  type: string,
  flags?: Partial<NodeDescriptor>,
  props?: object
): NodeDescriptor {
  return {
    id,
    type,
    ...flags,
    properties: props as Record<string, unknown> | undefined,
  };
}

// ---------------------------------------------------------------------------
// Edge factories
// ---------------------------------------------------------------------------

/** Data edge (default). */
export function de(
  source: string,
  sh: string,
  target: string,
  th: string,
  id?: string
): Edge {
  return { id, source, sourceHandle: sh, target, targetHandle: th };
}

/** Control edge (edge_type: "control"). */
export function ce(source: string, target: string, id?: string): Edge {
  return {
    id,
    source,
    sourceHandle: "__control__",
    target,
    targetHandle: "__control__",
    edge_type: "control",
  };
}
