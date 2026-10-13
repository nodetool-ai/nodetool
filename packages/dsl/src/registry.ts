/**
 * Registry and executor resolution shared by the graph DSL and native flow API.
 */
import { createMissingPackError, registerAvailablePacks } from "@nodetool-ai/node-catalog";
import { NodeRegistry } from "@nodetool-ai/node-sdk";
import {
  resolvePythonNodeExecutor,
  type NodeExecutor,
  type PythonBridgeBase
} from "@nodetool-ai/runtime";
import type { NodeDescriptor } from "@nodetool-ai/protocol";

let builtinRegistryPromise: Promise<NodeRegistry> | null = null;

/** Build the resolvable legacy DSL packs once, retaining missing-pack metadata. */
export function buildBuiltinRegistry(): Promise<NodeRegistry> {
  builtinRegistryPromise ??= loadBuiltinRegistry();
  return builtinRegistryPromise;
}

async function loadBuiltinRegistry(): Promise<NodeRegistry> {
  const builtinRegistry = new NodeRegistry();
  await registerAvailablePacks(builtinRegistry, {
    includeOptionalPacks: true,
    excludedPackIds: ["fal", "kie", "topaz", "atlascloud", "higgsfield", "together", "replicate"]
  });
  return builtinRegistry;
}

/**
 * Types handled by the TS registry never require a Python worker. Catalog
 * types are refused by the executor resolver rather than sent to Python.
 */
export function createHasTsExecutor(
  registry: NodeRegistry | undefined,
  builtinRegistry: NodeRegistry
): (nodeType: string) => boolean {
  return (nodeType: string): boolean =>
    Boolean(registry?.has(nodeType)) ||
    NodeRegistry.global.has(nodeType) ||
    builtinRegistry.has(nodeType) ||
    registry?.availability(nodeType) === "catalog" ||
    NodeRegistry.global.availability(nodeType) === "catalog" ||
    builtinRegistry.availability(nodeType) === "catalog";
}

export interface ExecutorResolverOptions {
  /** Custom node registry, consulted before the global and builtin ones. */
  registry?: NodeRegistry | undefined;
}

/**
 * The resolution chain: caller override → `NodeRegistry.global` → builtin packs
 * → the Python bridge. Unknown types throw.
 */
export function createExecutorResolver(
  opts: ExecutorResolverOptions | undefined,
  builtinRegistry: NodeRegistry,
  bridge: PythonBridgeBase | null
): (node: NodeDescriptor) => NodeExecutor {
  return (node: NodeDescriptor): NodeExecutor => {
    if (opts?.registry?.has(node.type)) {
      return opts.registry.resolve(node);
    }
    if (NodeRegistry.global.has(node.type)) {
      return NodeRegistry.global.resolve(node);
    }
    if (builtinRegistry.has(node.type)) {
      return builtinRegistry.resolve(node);
    }
    for (const registry of [opts?.registry, NodeRegistry.global, builtinRegistry]) {
      const entry = registry?.catalogEntry(node.type);
      if (entry && registry?.availability(node.type) === "catalog") {
        throw createMissingPackError(entry.pack, [node.type]);
      }
    }
    const py = resolvePythonNodeExecutor(bridge, node);
    if (py) return py;
    throw new Error(`Unknown node type: ${node.type}`);
  };
}
