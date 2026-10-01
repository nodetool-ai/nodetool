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
  type NodeMetadata,
  type NodePackAvailabilityDiagnostic,
  type LoadedPackResult
} from "@nodetool-ai/node-sdk";
import type { PythonNodeMetadata } from "@nodetool-ai/runtime";
import {
  BUILTIN_NODE_PACKS,
  CLOUD_PROFILE_ENV,
  NODE_ENV_VAR,
  isCloudProfileActive
} from "@nodetool-ai/protocol";
import { setPackSnapshot } from "./pack-snapshot.js";
import { refreshSandboxCatalog } from "./sandbox-catalog.js";
import {
  registerBuiltinPacks,
  setBuiltinPackEnabled,
  applyBuiltinNodePolicy,
  builtinPackUnavailableReason
} from "@nodetool-ai/base-nodes/builtin-packs";

interface BootstrapLogger {
  info: (msg: string) => void;
  warn: (msg: string) => void;
}

interface BootstrapRegistryOptions {
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
  return isCloudProfileActive(
    process.env[CLOUD_PROFILE_ENV],
    process.env[NODE_ENV_VAR]
  );
}

interface RegisterBuiltInNodesOptions {
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

export function getUnavailableBuiltinPackDiagnostics(): NodePackAvailabilityDiagnostic[] {
  const overrides = isCloudProfile() ? undefined : readBuiltinPackOverrides();
  return BUILTIN_NODE_PACKS.flatMap((pack) => {
    const reason = builtinPackUnavailableReason(pack, {
      enabledOverrides: overrides,
      cloudProfile: isCloudProfile(),
      production: isProduction()
    });
    return reason ? [{ id: pack.id, name: pack.name, reason }] : [];
  });
}

interface PythonBridgeMetadataMergeResult {
  total: number;
  bridgeOnly: number;
  alreadyKnown: number;
}

/**
 * Merge metadata discovered from the live Python worker into the shared
 * registry. Metadata already supplied by a package JSON file or a registered
 * TypeScript class remains authoritative; the bridge only fills genuine gaps.
 *
 * Keeping this operation centralized ensures REST, tRPC, WebSocket discovery,
 * and workflow-interface derivation all observe the same hybrid registry.
 */
export function mergePythonBridgeMetadata(
  registry: NodeRegistry,
  metadata: readonly PythonNodeMetadata[]
): PythonBridgeMetadataMergeResult {
  let bridgeOnly = 0;
  let alreadyKnown = 0;

  for (const nodeMeta of metadata) {
    if (!nodeMeta.node_type) continue;
    if (registry.getMetadata(nodeMeta.node_type)) {
      alreadyKnown++;
      continue;
    }

    bridgeOnly++;
    registry.loadMetadata(
      nodeMeta.node_type,
      {
        // SAFETY: the Python wire's property/output type metadata omits
        // `type_args`, which the registry's `TypeMetadata` declares required;
        // filling it in here would change what the registry stores.
        ...(nodeMeta as unknown as NodeMetadata),
        namespace: nodeMeta.node_type.split(".").slice(0, -1).join("."),
        layout: "default",
        recommended_models: nodeMeta.recommended_models ?? [],
        required_settings: nodeMeta.required_settings ?? [],
        // Python worker still emits `is_dynamic` on the bridge wire; normalize it
        // to the current registry contract.
        supports_dynamic_inputs: nodeMeta.is_dynamic ?? false,
        is_streaming_input: nodeMeta.is_streaming_input ?? false,
        is_streaming_output: nodeMeta.is_streaming_output ?? false,
        supports_dynamic_outputs: false
      },
      { source: "python-bridge" }
    );
  }

  return {
    total: metadata.length,
    bridgeOnly,
    alreadyKnown
  };
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
    (isCloudProfile() ? undefined : readBuiltinPackOverrides());
  registerBuiltinPacks(
    registry,
    {
      enabledOverrides: overrides,
      cloudProfile: options.enabledOverrides === undefined && isCloudProfile(),
      production: isProduction()
    },
    (pack, reason) => {
      if (reason === "disabled by built-in pack configuration") {
        options.log?.info(`Skipped built-in node pack ${pack.id} (disabled)`);
      }
    }
  );
}

/**
 * Apply a built-in pack toggle to a live registry so the change takes effect
 * without a server restart. Enabling re-runs the registrar (idempotent —
 * `register` is last-write-wins); disabling unregisters exactly the node
 * types attributed to that pack during registration, so packs sharing a namespace prefix
 * with other packs are untouched.
 */
export function applyBuiltinPackEnabled(
  registry: NodeRegistry,
  id: string,
  enabled: boolean
): void {
  setBuiltinPackEnabled(registry, id, enabled);
}

/** Drop optional node types that aren't available in cloud/production builds. */
export function applyProductionNodePolicy(
  registry: NodeRegistry,
  log?: BootstrapLogger
): void {
  applyBuiltinNodePolicy(registry, { production: isProduction() }, (nodeType) =>
    log?.info(`Unregistered ${nodeType} in production`)
  );
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
  applyBuiltinNodePolicy(
    registry,
    { cloudProfile: isCloudProfile() },
    (nodeType) => log?.info(`Cloud profile: dropped ${nodeType}`)
  );
}

function logPackResult(result: LoadedPackResult, log?: BootstrapLogger): void {
  const { pack } = result;
  const id = `${pack.name}@${pack.version ?? "?"}`;
  if (result.status === "loaded") {
    log?.info(`Loaded node pack ${id} (${result.registered.length} node(s))`);
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
    const loadOptions: Parameters<typeof loadInstalledPacks>[1] = {
      onResult: (result) => logPackResult(result, options.log)
    };
    if (options.packSearchPaths) {
      loadOptions.searchPaths = options.packSearchPaths;
    }
    const results = await loadInstalledPacks(registry, loadOptions);
    setPackSnapshot(results);
    await refreshSandboxCatalog(options.packSearchPaths);
  }
  applyProductionNodePolicy(registry, options.log);
  applyCloudNodePolicy(registry, options.log);
  return registry;
}

// Re-export so existing callers don't have to switch import paths.
export { getPackSnapshot, reloadPacks } from "./pack-snapshot.js";
export {
  getSandboxCatalog,
  getSandboxCatalogDiagnostics,
  refreshSandboxCatalog
} from "./sandbox-catalog.js";
