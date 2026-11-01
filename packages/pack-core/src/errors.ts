import { readCatalogIndex } from "./catalog-data.js";
import type { NodeCatalogIndex } from "./types.js";

import { MissingPackError, type MissingPackInstall } from "@nodetool-ai/protocol";
import { currentPackInstall } from "./loader-context.js";
import { isRuntimeNpmPackageId } from "@nodetool-ai/protocol/runtime-npm-packages";
export { MissingPackError, type MissingPackDetails, type MissingPackInstall } from "@nodetool-ai/protocol";

export function createMissingPackError(
  packId: string | readonly string[],
  nodeTypes: readonly string[] = [],
  install: MissingPackInstall = currentPackInstall() ?? { supported: false, reason: "Pack installs are not available in this version.", command: null },
  catalog: NodeCatalogIndex = readCatalogIndex()
): MissingPackError {
  const index = catalog;
  const byId = new Map(index.packs.map((pack) => [pack.id, pack]));
  const pending = [packId].flat();
  const ids = new Set<string>();
  const runtimeLibraries = new Set<string>();
  for (let i = 0; i < pending.length; i++) {
    const id = pending[i];
    if (ids.has(id)) {
      continue;
    }
    const pack = byId.get(id);
    if (!pack) {
      throw new Error(`Unknown node catalog pack: ${id}`);
    }
    ids.add(id);
    pending.push(...pack.requires);
    for (const runtimeId of pack.runtimeLibraries) {
      runtimeLibraries.add(runtimeId);
    }
  }
  const commandIds = [...new Set([...ids].concat([...runtimeLibraries].filter(isRuntimeNpmPackageId)))].sort();
  const guidance: MissingPackInstall = install.supported && install.command === null
    ? { ...install, command: commandIds.length ? `nodetool packs add ${commandIds.join(" ")} --yes` : "nodetool packs doctor --installed" }
    : install;
  return new MissingPackError({
    error: "missing_pack",
    packs: [...ids].sort().map((id) => {
      const pack = byId.get(id);
      if (!pack) {
        throw new Error(`Unknown node catalog pack: ${id}`);
      }
      return {
        id: pack.id,
        npm: pack.npm.name,
        version: pack.npm.version,
        installBytes: pack.installBytes,
        requires: pack.requires
      };
    }),
    runtimeLibraries: [...runtimeLibraries].sort(),
    nodeTypes: [...new Set(nodeTypes)].sort(),
    install: guidance,
    restartRequired: false
  });
}
