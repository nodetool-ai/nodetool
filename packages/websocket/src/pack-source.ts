import { BUILTIN_NODE_PACKS, type BuiltinNodePack } from "@nodetool-ai/protocol";
import { builtinPackUnavailableReason, isCallable, type BuiltinPackPolicy, type NodeRegistry } from "@nodetool-ai/node-sdk";
import {
  catalogPackIdsForBuiltin,
  importPack,
  MissingPackError,
  readCatalogNodes,
  readCatalogIndex,
  registerAvailablePacks,
  registerCatalogPack,
  setBundledPackModules
} from "@nodetool-ai/node-catalog";
import { configureFeatures, type FeatureHost, type FeatureDescriptor } from "@nodetool-ai/server-features";
import { z } from "zod";
import { createLogger } from "@nodetool-ai/config";
import * as agentsModule from "@nodetool-ai/agents";

export interface PackSource {
  readonly explicitSelection?: boolean;
  readonly configuredFeatures?: () => readonly FeatureDescriptor[];
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
  /** Pack modules compiled into the host, by `importPack` target specifier. */
  readonly modules?: Readonly<Record<string, () => Promise<object>>>;
}

const log = createLogger("nodetool.websocket.pack-source");
let catalogSource: PackSource | undefined;
let hostSource: PackSource | undefined;

/** Share the host's source with headless services that create their own registry. */
export function setDefaultPackSource(source: PackSource): void {
  hostSource = source;
  if (source.modules) {
    setBundledPackModules(source.modules);
  }
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
export function createCatalogPackSource(options: { readonly configuredPackIds?: readonly string[] } = {}): PackSource {
  const configured = options.configuredPackIds;
  let features: FeatureHost | undefined;
  const descriptors = (): FeatureDescriptor[] => {
    const nodeTypes = new Map<string, string[]>();
    for (const node of readCatalogNodes()) {
      const types = nodeTypes.get(node.pack) ?? [];
      types.push(node.node_type);
      nodeTypes.set(node.pack, types);
    }
    return readCatalogIndex().packs.map((pack) => ({
      id: pack.id, apiVersion: 1, requires: pack.requires,
      capabilities: [`nodes:${pack.id}`], nodeTypes: nodeTypes.get(pack.id) ?? []
    }));
  };
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
    explicitSelection: configured !== undefined,
    configuredFeatures: () => features?.features ?? [],
    register: async (registry, policy, onSkipped): Promise<void> => {
      if (configured) {
        const catalog = descriptors();
        const packs = readCatalogIndex().packs;
        features = await configureFeatures(configured.map((id) => ({ id, load: async () => {
          const pack = packs.find((entry) => entry.id === id);
          const descriptor = catalog.find((entry) => entry.id === id);
          if (!pack || !descriptor) { throw new Error(`Unknown configured node pack: ${id}`); }
          const module = await importPack(id);
          const registrar = z.object({ [pack.registrar]: z.custom<(target: NodeRegistry) => void>(isCallable) }).parse(module)[pack.registrar];
          return { descriptor, activate: (target: NodeRegistry): void => { target.registerPackage(id, registrar); } };
        } })), registry, catalog);
        const selected = new Set(configured);
        registry.loadCatalog(readCatalogNodes().filter((node) => !selected.has(node.pack)), packs);
        refreshAvailability(registry);
        return;
      }
      for (const pack of BUILTIN_NODE_PACKS) {
        const reason = builtinPackUnavailableReason(pack, policy);
        if (reason) onSkipped?.(pack, reason);
      }
      await registerAvailablePacks(registry, policy);
      refreshAvailability(registry);
    },
    setEnabled: async (registry, id, enabled): Promise<void> => {
      const ids = new Set(catalogPackIdsForBuiltin(id));
      if (configured && enabled && [...ids].some((packId) => !configured.includes(packId))) {
        throw new Error(`Node pack ${id} is not in the administrator configuration`);
      }
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
      const code = configured && !configured.includes("code") ? undefined : await optionalPack<typeof import("@nodetool-ai/code-nodes")>("code");
      code?.setCodeNodeAgentsModule(agentsModule);
      if (!policy.production && (!configured || configured.includes("transformers-js"))) {
        const transformers = await optionalPack<typeof import("@nodetool-ai/transformers-js-provider")>("transformers-js", "@nodetool-ai/transformers-js-provider");
        transformers?.registerTransformersJsProvider();
      }
      if (!policy.production && (!configured || configured.includes("whisper-cpp"))) {
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
