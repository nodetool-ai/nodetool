import type { CatalogPack } from "./types.js";
import { readCatalogIndex } from "./catalog-data.js";
import { createMissingPackError } from "./errors.js";

function packSpecifier(pack: CatalogPack, specifier?: string): string {
  if (specifier === undefined) {
    return pack.npm.name;
  }
  const target = specifier.startsWith("@") ? specifier : `${pack.npm.name}/${specifier}`;
  const names = [pack.npm.name, ...pack.provides];
  if (names.some((name) => target === name || target.startsWith(`${name}/`))) {
    const parts = target.split("/");
    if (parts.some((part) => part === "." || part === ".." || part.includes("\\") || part.includes("?") || part.includes("#") || part.includes(":") || part === "")) {
      throw new Error(`Invalid specifier for pack ${pack.id}: ${specifier}`);
    }
    return target;
  }
  throw new Error(`Pack ${pack.id} does not provide ${specifier}`);
}

/** Import only the requested catalog pack, without substituting a runtime root. */
export async function importPack<T extends object = object>(
  packId: string,
  specifier?: string
): Promise<T> {
  const pack = readCatalogIndex().packs.find((entry) => entry.id === packId);
  if (!pack) {
    throw new Error(`Unknown node pack: ${packId}`);
  }
  const target = packSpecifier(pack, specifier);
  let resolved: string;
  try {
    resolved = import.meta.resolve(target);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ERR_MODULE_NOT_FOUND") {
      throw createMissingPackError(pack.id);
    }
    throw error;
  }
  // Resolution has established package presence. Initialization failures,
  // including a missing transitive dependency, must keep their original error.
  const module: T = await import(resolved);
  return module;
}
