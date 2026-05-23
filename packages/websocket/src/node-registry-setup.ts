/**
 * Centralized node-registry bootstrap.
 *
 * Every server entrypoint (WebSocket, MCP, HTTP, test UI) builds its node
 * registry through these helpers so the set of registered nodes — built-ins,
 * third-party packs, and the production policy — stays identical across them.
 * Previously each entrypoint registered its own subset, which caused nodes to
 * be "present in serve but missing in MCP".
 */

import {
  NodeRegistry,
  loadInstalledPacks,
  type LoadedPackResult
} from "@nodetool-ai/node-sdk";
import { setPackSnapshot } from "./pack-snapshot.js";
import { registerBaseNodes } from "@nodetool-ai/base-nodes";
import { registerElevenLabsNodes } from "@nodetool-ai/elevenlabs-nodes";
import { registerTransformersJsNodes } from "@nodetool-ai/transformers-js-nodes";
import { registerFalNodes } from "@nodetool-ai/fal-nodes";
import { registerKieNodes } from "@nodetool-ai/kie-nodes";
import { registerReplicateNodes } from "@nodetool-ai/replicate-nodes";

/** Node-type prefixes that require on-demand npm packages; dropped in production. */
const PRODUCTION_SKIPPED_PREFIXES = [
  "lib.tensorflow.",
  "transformers.",
  "vector."
];

interface BootstrapLogger {
  info: (msg: string) => void;
  warn: (msg: string) => void;
}

export interface BootstrapRegistryOptions {
  /** Roots scanned for Python package metadata. */
  metadataRoots?: string[];
  metadataMaxDepth?: number;
  /** Discover and register installed third-party packs. Default: `true`. */
  loadPacks?: boolean;
  /** Override the `node_modules` dirs scanned for packs (mainly for tests). */
  packSearchPaths?: string[];
  log?: BootstrapLogger;
}

function isProduction(): boolean {
  return process.env["NODETOOL_ENV"] === "production";
}

/** Register all first-party node packs into `registry` (synchronous). */
export function registerBuiltInNodes(registry: NodeRegistry): void {
  registerBaseNodes(registry);
  registerElevenLabsNodes(registry);
  if (!isProduction()) {
    registerTransformersJsNodes(registry);
  }
  registerFalNodes(registry);
  registerKieNodes(registry);
  registerReplicateNodes(registry);
}

/** Drop optional node types that aren't available in cloud/production builds. */
export function applyProductionNodePolicy(
  registry: NodeRegistry,
  log?: BootstrapLogger
): void {
  if (!isProduction()) return;
  for (const nodeType of registry.list()) {
    if (PRODUCTION_SKIPPED_PREFIXES.some((p) => nodeType.startsWith(p))) {
      if (registry.unregister(nodeType)) {
        log?.info(`Unregistered ${nodeType} in production`);
      }
    }
  }
}

function logPackResult(result: LoadedPackResult, log?: BootstrapLogger): void {
  const { pack } = result;
  const id = `${pack.name}@${pack.version ?? "?"}`;
  if (result.status === "loaded") {
    log?.info(
      `Loaded node pack ${id} (${result.registered.length} node(s))`
    );
    for (const skipped of result.skippedNodes) {
      log?.warn(
        `Pack ${pack.name}: skipped node ${skipped.nodeType} (${skipped.reason})`
      );
    }
  } else if (result.status === "skipped") {
    log?.info(`Skipped node pack ${id}: ${result.reason}`);
  } else {
    log?.warn(`Failed to load node pack ${id}: ${result.error?.message}`);
  }
}

/**
 * Build a fully-populated {@link NodeRegistry}: Python metadata, built-in packs,
 * trusted third-party packs, and the production policy applied.
 */
export async function bootstrapNodeRegistry(
  options: BootstrapRegistryOptions = {}
): Promise<NodeRegistry> {
  const registry = new NodeRegistry();
  registry.loadPythonMetadata({
    roots: options.metadataRoots,
    maxDepth: options.metadataMaxDepth ?? 8
  });
  registerBuiltInNodes(registry);
  if (options.loadPacks !== false) {
    const results = await loadInstalledPacks(registry, {
      ...(options.packSearchPaths
        ? { searchPaths: options.packSearchPaths }
        : {}),
      onResult: (result) => logPackResult(result, options.log)
    });
    setPackSnapshot(results);
  }
  applyProductionNodePolicy(registry, options.log);
  return registry;
}

// Re-export so existing callers don't have to switch import paths.
export { getPackSnapshot, reloadPacks } from "./pack-snapshot.js";
