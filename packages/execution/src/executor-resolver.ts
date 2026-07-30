/**
 * The three-branch executor resolver: registry → Python bridge → throw.
 * Copy-pasted, before this package, in `packages/cli/src/nodetool.ts`,
 * `packages/cli/src/debug/server-runner.ts`, and
 * `packages/websocket/src/headless-job-runner.ts`. See the package README's
 * inventory table (row "Executor resolution").
 */
import type { NodeExecutor } from "@nodetool-ai/kernel";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import {
  resolvePythonNodeExecutor,
  type PythonBridgeBase
} from "@nodetool-ai/runtime";
import type { NodeDescriptor } from "@nodetool-ai/protocol";

export function createExecutorResolver(
  registry: NodeRegistry,
  bridge: PythonBridgeBase | null
): (node: NodeDescriptor) => NodeExecutor {
  return (node: NodeDescriptor): NodeExecutor => {
    if (registry.has(node.type)) {
      return registry.resolve(node);
    }
    const py = resolvePythonNodeExecutor(bridge, node);
    if (py) return py;
    throw new Error(`Unknown node type: ${node.type}`);
  };
}
