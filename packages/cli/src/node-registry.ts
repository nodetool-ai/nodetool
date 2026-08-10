/**
 * Builds a NodeRegistry populated with every TypeScript node pack the CLI
 * ships. Shared by the debug, validate, and single-node-run harnesses so they
 * all resolve node types against the same set.
 *
 * Python-only node packs (huggingface worker nodes, mlx, etc.) are not
 * registered here — they have no TS class and are resolved lazily through the
 * Python bridge at execution time. Static tools (validate) therefore treat
 * unknown types as "not in the local TS registry".
 */
import {
  NodeRegistry,
  discoverSandboxCatalog
} from "@nodetool-ai/node-sdk";
import { setProcessSandboxModuleCatalog } from "@nodetool-ai/runtime";
import { registerBaseNodes } from "@nodetool-ai/base-nodes";
import { registerElevenLabsNodes } from "@nodetool-ai/elevenlabs-nodes";
import { registerMinimaxNodes } from "@nodetool-ai/minimax-nodes";
import { registerTransformersJsNodes } from "@nodetool-ai/transformers-js-nodes";
import { registerFalNodes } from "@nodetool-ai/fal-nodes";
import { registerReplicateNodes } from "@nodetool-ai/replicate-nodes";
import { registerReveNodes } from "@nodetool-ai/reve-nodes";
import { registerHuggingFaceNodes } from "@nodetool-ai/huggingface-nodes";

/**
 * Discover installed sandbox packs and make the catalog this process's default,
 * so the CLI's validation and execution harnesses resolve sandbox modules
 * through the same instance the server uses. Discovery executes no pack code.
 * A failure leaves the CLI without a catalog rather than without a registry.
 */
export function installSandboxCatalog(): void {
  try {
    setProcessSandboxModuleCatalog(discoverSandboxCatalog().catalog);
  } catch (error) {
    console.warn(
      `Sandbox module catalog unavailable: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

export function buildFullRegistry(): NodeRegistry {
  installSandboxCatalog();
  const registry = new NodeRegistry();
  registerBaseNodes(registry);
  registerElevenLabsNodes(registry);
  registerMinimaxNodes(registry);
  registerTransformersJsNodes(registry);
  registerFalNodes(registry);
  registerReplicateNodes(registry);
  registerReveNodes(registry);
  registerHuggingFaceNodes(registry);
  return registry;
}
