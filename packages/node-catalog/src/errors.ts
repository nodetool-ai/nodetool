import { readCatalogIndex } from "./catalog-data.js";

export interface MissingPackDetails {
  readonly error: "missing_pack";
  readonly packs: readonly {
    readonly id: string;
    readonly npm: string;
    readonly version: string;
    readonly installBytes: number;
    readonly requires: readonly string[];
  }[];
  readonly runtimeLibraries: readonly string[];
  readonly nodeTypes: readonly string[];
  readonly install: {
    readonly supported: false;
    readonly reason: "Pack installs are not available in this version.";
    readonly command: null;
  };
  readonly restartRequired: false;
}

export class MissingPackError extends Error {
  override readonly name = "MissingPackError";
  readonly details: MissingPackDetails;

  constructor(details: MissingPackDetails) {
    super(`Node pack ${details.packs.map((pack) => pack.id).join(", ")} is not installed. ${details.install.reason}`);
    this.details = details;
  }
}

export function createMissingPackError(
  packId: string,
  nodeTypes: readonly string[] = []
): MissingPackError {
  const index = readCatalogIndex();
  const byId = new Map(index.packs.map((pack) => [pack.id, pack]));
  const pending = [packId];
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
    install: {
      supported: false,
      reason: "Pack installs are not available in this version.",
      command: null
    },
    restartRequired: false
  });
}
