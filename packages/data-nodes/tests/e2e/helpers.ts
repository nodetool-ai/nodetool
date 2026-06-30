import { WorkflowRunner } from "@nodetool-ai/kernel";
import { NodeRegistry } from "@nodetool-ai/node-sdk";
import type { NodeDescriptor, Edge } from "@nodetool-ai/protocol";
import { DATA_NODES, LIB_RSS_NODES } from "@nodetool-ai/data-nodes";
import { CONSTANT_NODES } from "@nodetool-ai/core-nodes/nodes/constant";
import { OUTPUT_NODES } from "@nodetool-ai/audio-nodes/nodes/output";
import { ProcessingContext } from "@nodetool-ai/runtime";

export type { NodeDescriptor, Edge };

/**
 * Register only the node groups these tests actually reference in the graphs
 * they construct (data-nodes' own classes, plus `ConstantStringNode` from
 * core-nodes and `OutputNode` from audio-nodes). This intentionally avoids
 * importing `@nodetool-ai/base-nodes` — its `dist/index.js` re-exports
 * subpaths of every leaf nodes-package (text-nodes, image-nodes, …), and a
 * concurrent `text-nodes:build` mid-test can wipe those subpath files before
 * Node finishes resolving them, racing the test to a "Cannot find package"
 * error. Keeping the registry minimal keeps the import surface inside the
 * packages turbo's `^build` already orders ahead of this test.
 */
export function makeRegistry(): NodeRegistry {
  const registry = new NodeRegistry();
  for (const nodeClass of [
    ...DATA_NODES,
    ...LIB_RSS_NODES,
    ...CONSTANT_NODES,
    ...OUTPUT_NODES
  ]) {
    registry.register(nodeClass);
  }
  return registry;
}

export function makeRunner(registry: NodeRegistry): WorkflowRunner {
  return new WorkflowRunner("test-job", {
    resolveExecutor: (node) => {
      if (!registry.has(node.type)) {
        return {
          async process(inputs: Record<string, unknown>) {
            return inputs;
          }
        };
      }
      return registry.resolve(node);
    }
  });
}

export function makeRunnerWithContext(
  registry: NodeRegistry,
  workspaceDir: string
): WorkflowRunner {
  const context = new ProcessingContext({ workspaceDir });
  return new WorkflowRunner("test-job", {
    resolveExecutor: (node) => {
      if (!registry.has(node.type)) {
        return {
          async process(inputs: Record<string, unknown>) {
            return inputs;
          }
        };
      }
      return registry.resolve(node);
    },
    executionContext: context
  });
}

export const inp = (id: string, name: string): NodeDescriptor => ({
  id,
  type: "test.Input",
  name
});

export const nd = (
  id: string,
  type: string,
  extra?: Partial<NodeDescriptor>
): NodeDescriptor => ({ id, type, ...extra });

export const de = (s: string, sh: string, t: string, th: string): Edge => ({
  source: s,
  sourceHandle: sh,
  target: t,
  targetHandle: th
});
