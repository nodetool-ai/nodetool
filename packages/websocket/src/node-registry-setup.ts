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
  readDisabledBuiltinPacks,
  type LoadedPackResult
} from "@nodetool-ai/node-sdk";
import { BUILTIN_NODE_PACKS } from "@nodetool-ai/protocol";
import { setPackSnapshot } from "./pack-snapshot.js";
import { registerBaseNodes } from "@nodetool-ai/base-nodes";
import { registerElevenLabsNodes } from "@nodetool-ai/elevenlabs-nodes";
import { registerMinimaxNodes } from "@nodetool-ai/minimax-nodes";
import { registerTransformersJsNodes } from "@nodetool-ai/transformers-js-nodes";
import { registerFalNodes } from "@nodetool-ai/fal-nodes";
import { registerKieNodes } from "@nodetool-ai/kie-nodes";
import { registerTopazNodes } from "@nodetool-ai/topaz-nodes";
import { registerReveNodes } from "@nodetool-ai/reve-nodes";
import { registerAtlasCloudNodes } from "@nodetool-ai/atlascloud-nodes";
import { registerTogetherNodes } from "@nodetool-ai/together-nodes";
import { registerReplicateNodes } from "@nodetool-ai/replicate-nodes";
import { registerHuggingFaceNodes } from "@nodetool-ai/huggingface-nodes";

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

/**
 * Registrar for each catalog entry in {@link BUILTIN_NODE_PACKS}. Keyed by the
 * stable pack id; a missing key would mean the catalog and this map drifted.
 */
const BUILTIN_PACK_REGISTRARS: Record<string, (registry: NodeRegistry) => void> =
  {
    base: registerBaseNodes,
    elevenlabs: registerElevenLabsNodes,
    minimax: registerMinimaxNodes,
    "transformers-js": registerTransformersJsNodes,
    fal: registerFalNodes,
    kie: registerKieNodes,
    topaz: registerTopazNodes,
    reve: registerReveNodes,
    atlascloud: registerAtlasCloudNodes,
    together: registerTogetherNodes,
    replicate: registerReplicateNodes,
    huggingface: registerHuggingFaceNodes
  };

export interface RegisterBuiltInNodesOptions {
  /**
   * Built-in pack ids to skip. If omitted, read from the packs config file
   * (`~/.config/nodetool/packs.json`, key `disabledBuiltins`) where the
   * Electron package manager persists the user's choices.
   */
  disabledPacks?: string[];
  log?: BootstrapLogger;
}

/** Register all first-party node packs into `registry` (synchronous). */
export function registerBuiltInNodes(
  registry: NodeRegistry,
  options: RegisterBuiltInNodesOptions = {}
): void {
  const disabled = new Set(options.disabledPacks ?? readDisabledBuiltinPacks());
  for (const pack of BUILTIN_NODE_PACKS) {
    if (!pack.required && disabled.has(pack.id)) {
      options.log?.info(`Skipped built-in node pack ${pack.id} (disabled)`);
      continue;
    }
    // Transformers.js pulls in ONNX Runtime, which isn't available in
    // cloud/production builds.
    if (pack.id === "transformers-js" && isProduction()) continue;
    const register = BUILTIN_PACK_REGISTRARS[pack.id];
    if (!register) {
      throw new Error(`No registrar for built-in node pack "${pack.id}"`);
    }
    register(registry);
  }
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
  registerBuiltInNodes(registry, options.log ? { log: options.log } : {});
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
