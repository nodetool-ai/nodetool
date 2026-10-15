import { BUILTIN_NODE_PACKS, type BuiltinNodePack } from "@nodetool-ai/protocol";
import { builtinPackUnavailableReason, type BuiltinPackPolicy, type NodeRegistry } from "@nodetool-ai/node-sdk";
import {
  catalogPackIdsForBuiltin,
  importPack,
  MissingPackError,
  readCatalogNodes,
  registerAvailablePacks,
  registerCatalogPack
} from "@nodetool-ai/node-catalog";
import { createLogger } from "@nodetool-ai/config";
import * as agentsModule from "@nodetool-ai/agents";

export interface PackSource {
  readonly register: (
    registry: NodeRegistry,
    policy: BuiltinPackPolicy,
    onSkipped?: (pack: BuiltinNodePack, reason: string) => void
  ) => void | Promise<void>;
  readonly setEnabled: (
    registry: NodeRegistry,
    id: string,
    enabled: boolean
  ) => void | Promise<void>;
  readonly unavailableReason: (
    pack: BuiltinNodePack,
    policy: BuiltinPackPolicy
  ) => string | undefined;
  readonly registerProviders: (policy: BuiltinPackPolicy) => void | Promise<void>;
}

const log = createLogger("nodetool.websocket.pack-source");
let catalogSource: PackSource | undefined;
let hostSource: PackSource | undefined;

/** Share the host's source with headless services that create their own registry. */
export function setDefaultPackSource(source: PackSource): void {
  hostSource = source;
}

async function optionalPack<T extends object>(id: string, specifier?: string): Promise<T | undefined> {
  try {
    return await importPack<T>(id, specifier);
  } catch (error) {
    if (!(error instanceof MissingPackError)) {
      throw error;
    }
    log.info("Optional node pack is unavailable", { ...error.details, message: error.message });
    return undefined;
  }
}

/** Standalone servers load resolvable packs. Bundled servers inject their source. */
export function createCatalogPackSource(): PackSource {
  const missing = new Set<string>();
  const refreshAvailability = (registry: NodeRegistry): void => {
    missing.clear();
    for (const entry of readCatalogNodes()) {
      if (registry.availability(entry.node_type) === "catalog") {
        missing.add(entry.pack);
      }
    }
  };
  return {
    register: async (registry, policy, onSkipped): Promise<void> => {
      for (const pack of BUILTIN_NODE_PACKS) {
        const reason = builtinPackUnavailableReason(pack, policy);
        if (reason) onSkipped?.(pack, reason);
      }
      await registerAvailablePacks(registry, policy);
      refreshAvailability(registry);
    },
    setEnabled: async (registry, id, enabled): Promise<void> => {
      const ids = new Set(catalogPackIdsForBuiltin(id));
      if (enabled) {
        for (const packId of ids) {
          await registerCatalogPack(registry, packId);
        }
      } else {
        for (const metadata of registry.listMetadata()) {
          const packageId = registry.getNodePackageId(metadata.node_type);
          if (packageId && ids.has(packageId)) {
            registry.unregister(metadata.node_type);
          }
        }
      }
      refreshAvailability(registry);
    },
    unavailableReason: (pack, policy): string | undefined =>
      builtinPackUnavailableReason(pack, policy) ??
      (catalogPackIdsForBuiltin(pack.id).some((id) => missing.has(id)) ? "node pack is not installed" : undefined),
    registerProviders: async (policy): Promise<void> => {
      const code = await optionalPack<typeof import("@nodetool-ai/code-nodes")>("code");
      code?.setCodeNodeAgentsModule(agentsModule);
      if (!policy.production) {
        const transformers = await optionalPack<typeof import("@nodetool-ai/transformers-js-provider")>("transformers-js", "@nodetool-ai/transformers-js-provider");
        transformers?.registerTransformersJsProvider();
        const whisper = await optionalPack<typeof import("@nodetool-ai/whisper-cpp")>("whisper-cpp");
        whisper?.registerWhisperCppProviders();
      }
    }
  };
}

/** Retained public name for hosts that request the default source. */
export function loadBundledPackSource(): Promise<PackSource> {
  if (hostSource) {
    return Promise.resolve(hostSource);
  }
  catalogSource ??= createCatalogPackSource();
  return Promise.resolve(catalogSource);
}
