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
  readBuiltinPackOverrides,
  type LoadedPackResult
} from "@nodetool-ai/node-sdk";
import {
  BUILTIN_NODE_PACKS,
  resolveBuiltinPackEnabled,
  CLOUD_PROFILE_ENV,
  CLOUD_BUILTIN_PACK_IDS,
  isCloudProfileValue,
  isCloudNodeType
} from "@nodetool-ai/protocol";
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

/** True when the curated commercial cloud profile is active. */
function isCloudProfile(): boolean {
  return isCloudProfileValue(process.env[CLOUD_PROFILE_ENV]);
}

/**
 * Pack-enabled map for the cloud profile: only `base` (required), `fal`, and
 * `kie` load; every other provider pack is off so we don't register thousands
 * of out-of-scope nodes just to prune them.
 */
function cloudPackOverrides(): Record<string, boolean> {
  return Object.fromEntries(
    BUILTIN_NODE_PACKS.map((pack) => [
      pack.id,
      CLOUD_BUILTIN_PACK_IDS.includes(pack.id)
    ])
  );
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
   * Per-pack enabled overrides keyed by pack id. Packs absent from the map
   * keep their install default (`defaultEnabled` in the catalog — most packs
   * are opt-in). If omitted, read from the packs config file
   * (`~/.config/nodetool/packs.json`) where the Electron package manager
   * persists the user's choices.
   */
  enabledOverrides?: Record<string, boolean>;
  log?: BootstrapLogger;
}

/**
 * Register the enabled first-party node packs into `registry` (synchronous).
 * Required packs and packs enabled by default or by the user load; the rest
 * are skipped.
 */
export function registerBuiltInNodes(
  registry: NodeRegistry,
  options: RegisterBuiltInNodesOptions = {}
): void {
  const overrides =
    options.enabledOverrides ??
    (isCloudProfile() ? cloudPackOverrides() : readBuiltinPackOverrides());
  for (const pack of BUILTIN_NODE_PACKS) {
    if (!resolveBuiltinPackEnabled(pack, overrides[pack.id])) {
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

/**
 * Apply a built-in pack toggle to a live registry so the change takes effect
 * without a server restart. Enabling re-runs the registrar (idempotent —
 * `register` is last-write-wins); disabling unregisters exactly the node
 * types the pack's registrar produces, so packs sharing a namespace prefix
 * with other packs are untouched.
 */
export function applyBuiltinPackEnabled(
  registry: NodeRegistry,
  id: string,
  enabled: boolean
): void {
  const register = BUILTIN_PACK_REGISTRARS[id];
  if (!register) {
    throw new Error(`No registrar for built-in node pack "${id}"`);
  }
  if (enabled) {
    register(registry);
    return;
  }
  const packOnly = new NodeRegistry();
  register(packOnly);
  for (const nodeType of packOnly.list()) {
    registry.unregister(nodeType);
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

/**
 * Prune the registry down to the curated commercial-cloud surface when the
 * cloud profile (`NODETOOL_NODE_PROFILE=cloud`) is active. Drops every node
 * type outside {@link isCloudNodeType} — nerdy/automation namespaces,
 * out-of-scope provider packs, and the developer-flavored agents — leaving the
 * creative AI workspace set (text, image, audio, video, 3D, agents, Code).
 * A no-op when the profile is off, so OSS/local installs are unaffected.
 */
export function applyCloudNodePolicy(
  registry: NodeRegistry,
  log?: BootstrapLogger
): void {
  if (!isCloudProfile()) return;
  for (const nodeType of registry.list()) {
    if (!isCloudNodeType(nodeType)) {
      if (registry.unregister(nodeType)) {
        log?.info(`Cloud profile: dropped ${nodeType}`);
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
  applyCloudNodePolicy(registry, options.log);
  return registry;
}

// Re-export so existing callers don't have to switch import paths.
export { getPackSnapshot, reloadPacks } from "./pack-snapshot.js";
