/**
 * Registry and executor resolution shared by the graph DSL (`run()`) and the
 * native flow API. One builtin-pack list, two consumers.
 */
import { NodeRegistry } from "@nodetool-ai/node-sdk";
import {
  resolvePythonNodeExecutor,
  type NodeExecutor,
  type PythonBridgeBase
} from "@nodetool-ai/runtime";
import type { NodeDescriptor } from "@nodetool-ai/protocol";

let builtinRegistryPromise: Promise<NodeRegistry> | null = null;

/**
 * The registry of node packs shipped with the DSL. Built once per process:
 * `run()` used to rebuild it per call, and the flow API calls this per node
 * call, where re-importing six packages would dominate the cost of the call.
 *
 * Every pack except `base-nodes` is optional — an environment that cannot load
 * one (missing native dependency, platform-specific pack) keeps the rest.
 */
export function buildBuiltinRegistry(): Promise<NodeRegistry> {
  builtinRegistryPromise ??= loadBuiltinRegistry();
  return builtinRegistryPromise;
}

async function loadBuiltinRegistry(): Promise<NodeRegistry> {
  const builtinRegistry = new NodeRegistry();
  const { registerBaseNodes } = await import("@nodetool-ai/base-nodes");
  registerBaseNodes(builtinRegistry);
  try {
    const { registerElevenLabsNodes } = await import(
      "@nodetool-ai/elevenlabs-nodes"
    );
    registerElevenLabsNodes(builtinRegistry);
  } catch {
    // Some environments do not have the ElevenLabs node package in a runnable state.
  }
  try {
    const { registerMinimaxNodes } = await import("@nodetool-ai/minimax-nodes");
    registerMinimaxNodes(builtinRegistry);
  } catch {
    // Some environments do not have the MiniMax node package in a runnable state.
  }
  try {
    const { registerTransformersJsNodes } = await import(
      "@nodetool-ai/transformers-js-nodes"
    );
    registerTransformersJsNodes(builtinRegistry);
  } catch {
    // Some environments do not have the Transformers.js node package in a runnable state.
  }
  try {
    const { registerHuggingFaceNodes } = await import(
      "@nodetool-ai/huggingface-nodes"
    );
    registerHuggingFaceNodes(builtinRegistry);
  } catch {
    // Some environments do not have the Hugging Face node package in a runnable state.
  }
  try {
    const { registerReveNodes } = await import("@nodetool-ai/reve-nodes");
    registerReveNodes(builtinRegistry);
  } catch {
    // Some environments do not have the Reve node package in a runnable state.
  }
  return builtinRegistry;
}

/**
 * Can any in-process TS registry resolve this node type? A `false` answer makes
 * the type a Python candidate, which is what decides whether a worker bridge is
 * worth connecting.
 */
export function createHasTsExecutor(
  registry: NodeRegistry | undefined,
  builtinRegistry: NodeRegistry
): (nodeType: string) => boolean {
  return (nodeType: string): boolean =>
    Boolean(registry?.has(nodeType)) ||
    NodeRegistry.global.has(nodeType) ||
    builtinRegistry.has(nodeType);
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
    const py = resolvePythonNodeExecutor(bridge, node);
    if (py) return py;
    throw new Error(`Unknown node type: ${node.type}`);
  };
}
