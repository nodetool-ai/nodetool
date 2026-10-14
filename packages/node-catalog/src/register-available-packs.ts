import { z } from "zod";
import {
  BUILTIN_NODE_PACKS,
  CLOUD_BUILTIN_PACK_IDS,
  resolveBuiltinPackEnabled
} from "@nodetool-ai/protocol";
import { isCallable, type BuiltinPackPolicy, type NodeRegistry } from "@nodetool-ai/node-sdk";
import { readCatalogIndex, readCatalogNodes } from "./catalog-data.js";
import { importPack } from "./import-pack.js";
import { MissingPackError } from "./errors.js";
import type { CatalogNode, CatalogPack } from "./types.js";

// The split domain packs inherit the required legacy base policy until A15.
const BASE_DOMAINS = ["core", "text", "llm", "code", "data", "document", "image", "audio", "video", "integration", "automation", "game", "blender", "manimgx"];
const registrarSchema = z.custom<(registry: NodeRegistry) => void>(isCallable);

function enabled(pack: CatalogPack, policy: BuiltinPackPolicy): boolean {
  if (BASE_DOMAINS.includes(pack.id)) {
    return true;
  }
  const legacy = BUILTIN_NODE_PACKS.find((entry) => entry.id === pack.id);
  if (!legacy) {
    throw new Error(`Catalog pack ${pack.id} has no bootstrap policy`);
  }
  const override = policy.cloudProfile ? CLOUD_BUILTIN_PACK_IDS.includes(legacy.id)
    : policy.enabledOverrides?.[legacy.id] ?? (policy.includeOptionalPacks ? true : undefined);
  return !(!legacy.required && policy.excludedPackIds?.includes(legacy.id)) &&
    resolveBuiltinPackEnabled(legacy, override) && !(policy.production && legacy.id === "transformers-js");
}

/** Register resolvable packs and preserve catalog metadata for missing enabled packs. */
export async function registerAvailablePacks(
  registry: NodeRegistry,
  policy: BuiltinPackPolicy = {}
): Promise<void> {
  const index = readCatalogIndex();
  const missing = new Set<string>();
  const order = BUILTIN_NODE_PACKS.flatMap((pack) => pack.id === "base" ? BASE_DOMAINS : [pack.id]);
  const byId = new Map(index.packs.map((pack) => [pack.id, pack]));
  for (const id of order) {
    const pack = byId.get(id);
    if (!pack) {
      throw new Error(`Catalog is missing pack ${id}`);
    }
    if (!enabled(pack, policy)) {
      continue;
    }
    let module: object;
    try {
      module = await importPack(pack.id);
    } catch (error) {
      if (!(error instanceof MissingPackError)) {
        throw error;
      }
      missing.add(pack.id);
      continue;
    }
    const registrar = z.object({ [pack.registrar]: registrarSchema }).parse(module)[pack.registrar];
    registry.registerPackage(pack.id, registrar);
  }
  if (missing.size > 0) {
    const entries: CatalogNode[] = readCatalogNodes().filter((node) => missing.has(node.pack));
    registry.loadCatalog(entries, index.packs);
  }
}
