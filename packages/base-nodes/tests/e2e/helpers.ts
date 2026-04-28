import { WorkflowRunner } from "@nodetool-ai/kernel";
import { NodeRegistry } from "@nodetool-ai/node-sdk";
import type { NodeDescriptor, Edge } from "@nodetool-ai/protocol";
import { registerBaseNodes } from "../../src/index.js";
import { ProcessingContext } from "@nodetool-ai/runtime";

export type { NodeDescriptor, Edge };

export function makeRegistry(): NodeRegistry {
  const registry = new NodeRegistry();
  registerBaseNodes(registry);
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
