import { z } from "zod";
import {
  BUILTIN_NODE_PACKS
} from "@nodetool-ai/protocol";
import { builtinPackUnavailableReason, isCallable, type BuiltinPackPolicy, type NodeRegistry } from "@nodetool-ai/node-sdk";
import { readCatalogIndex, readCatalogNodes } from "./catalog-data.js";
import { importPack } from "./import-pack.js";
import { MissingPackError } from "./errors.js";
import type { CatalogNode, CatalogPack } from "./types.js";

// Standalone library callers retain the legacy base policy. Hosts constrain imports through their inventory.
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
  return builtinPackUnavailableReason(legacy, policy) === undefined;
}

/** Map a legacy bundled-pack id to the catalog's split domain ids. */
export function catalogPackIdsForBuiltin(id: string): readonly string[] {
  if (!BUILTIN_NODE_PACKS.some((pack) => pack.id === id)) {
    throw new Error(`Unknown built-in node pack: ${id}`);
  }
  return id === "base" ? BASE_DOMAINS : [id];
}

async function registerPackClass(registry: NodeRegistry, pack: CatalogPack): Promise<boolean> {
  let module: object;
  try {
    module = await importPack(pack.id);
  } catch (error) {
    if (!(error instanceof MissingPackError)) {
      throw error;
    }
    return false;
  }
  const registrar = z.object({ [pack.registrar]: registrarSchema }).parse(module)[pack.registrar];
  registry.registerPackage(pack.id, registrar);
  return true;
}

/** Register one catalog pack, retaining its metadata when the package is absent. */
export async function registerCatalogPack(registry: NodeRegistry, packId: string): Promise<void> {
  const index = readCatalogIndex();
  const pack = index.packs.find((entry) => entry.id === packId);
  if (!pack) {
    throw new Error(`Unknown node pack: ${packId}`);
  }
  if (!(await registerPackClass(registry, pack))) {
    registry.loadCatalog(readCatalogNodes().filter((node) => node.pack === packId), index.packs);
  }
}

/** Register admitted packs and preserve catalog metadata for missing enabled packs. */
export async function registerAvailablePacks(
  registry: NodeRegistry,
  policy: BuiltinPackPolicy = {}
): Promise<void> {
  const index = readCatalogIndex();
  const missing = new Set<string>();
  const order = BUILTIN_NODE_PACKS.flatMap((pack) => catalogPackIdsForBuiltin(pack.id));
  const byId = new Map(index.packs.map((pack) => [pack.id, pack]));
  for (const id of order) {
    const pack = byId.get(id);
    if (!pack) {
      throw new Error(`Catalog is missing pack ${id}`);
    }
    if (!enabled(pack, policy)) {
      continue;
    }
    if (!(await registerPackClass(registry, pack))) {
      missing.add(pack.id);
    }
  }
  if (missing.size > 0) {
    const entries: CatalogNode[] = readCatalogNodes().filter((node) => missing.has(node.pack));
    registry.loadCatalog(entries, index.packs);
  }
}
