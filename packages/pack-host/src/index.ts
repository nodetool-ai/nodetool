import { BUILTIN_NODE_PACKS, type BuiltinNodePack } from "@nodetool-ai/protocol";
import { builtinPackUnavailableReason, isCallable, type BuiltinPackPolicy, type NodeRegistry } from "@nodetool-ai/node-sdk";
import {
  catalogPackIdsForBuiltin,
  importPack,
  readCatalogNodes,
  readCatalogIndex,
  registerAvailablePacks,
  registerCatalogPack,
  setBundledPackModules
} from "@nodetool-ai/node-catalog";
import { configureFeatures, type FeatureHost, type FeatureDescriptor } from "@nodetool-ai/server-features";
import { z } from "zod";

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

let hostSource: PackSource | undefined;

/** Share the host's source with headless services that create their own registry. */
export function setDefaultPackSource(source: PackSource): void {
  hostSource = source;
  if (source.modules) {
    setBundledPackModules(source.modules);
  }
}

export interface CatalogPackSourceOptions {
  readonly configuredPackIds?: readonly string[];
  readonly registerProviders?: (policy: BuiltinPackPolicy) => void | Promise<void>;
}

/** Standalone servers load resolvable packs. Bundled servers inject their source. */
export function createCatalogPackSource(options: CatalogPackSourceOptions = {}): PackSource {
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
    registerProviders: async (policy): Promise<void> => { await options.registerProviders?.(policy); }
  };
}

/** Retained public name for hosts that request the default source. */
export function loadBundledPackSource(fallback: () => PackSource = createCatalogPackSource): Promise<PackSource> {
  return Promise.resolve(hostSource ?? fallback());
}
