import type { NodeCatalogEntry } from "@nodetool-ai/node-sdk";

export interface PinnedPackage {
  readonly name: string;
  readonly version: string;
  readonly integrity: string;
}

export interface InstallPackagePin extends PinnedPackage {
  /** The installed folder name when npm aliases a different registry package. */
  readonly installName?: string;
  readonly shared?: boolean;
  /** Fresh Linux production-tree estimate before allowlisted rebuilds. */
  readonly installBytes?: number;
}

export interface CatalogPack {
  readonly id: string;
  readonly kind: "core" | "node-pack";
  readonly npm: PinnedPackage;
  readonly registrar: string;
  readonly provides: readonly string[];
  readonly requires: readonly string[];
  readonly runtimeLibraries: readonly string[];
  readonly secrets: readonly string[];
  readonly scriptAllowlist: readonly PinnedPackage[];
  readonly installBytes: number;
  readonly nodeCount: number;
}

export interface NodeCatalogIndex {
  readonly schemaVersion: 1;
  readonly coreVersion: string;
  readonly installPins?: readonly InstallPackagePin[];
  readonly packs: readonly CatalogPack[];
  readonly owners: Readonly<Record<string, string>>;
}

export type CatalogNode = NodeCatalogEntry;
