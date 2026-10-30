import { gunzipSync } from "node:zlib";
import { loadPackageAssetBytes, loadPackageAssetJson } from "@nodetool-ai/config";
import type { CatalogNode, CatalogPack, NodeCatalogIndex } from "./types.js";

let catalogIndex: NodeCatalogIndex | undefined;
let catalogNodes: readonly CatalogNode[] | undefined;

export function readCatalogIndex(): NodeCatalogIndex {
  catalogIndex ??= loadPackageAssetJson<NodeCatalogIndex>(
    { pkg: "@nodetool-ai/pack-core", path: "index.json" },
    import.meta.url
  );
  return catalogIndex;
}

export function readCatalogNodes(): readonly CatalogNode[] {
  if (!catalogNodes) {
    const bytes = loadPackageAssetBytes(
      { pkg: "@nodetool-ai/pack-core", path: "nodes.ndjson.gz" },
      import.meta.url
    );
    // This registered build asset is generated and checked by check:node-catalog.
    catalogNodes = gunzipSync(bytes).toString("utf8").trimEnd().split("\n").map(
      (line): CatalogNode => JSON.parse(line)
    );
  }
  return catalogNodes;
}

export function packForNodeType(nodeType: string): CatalogPack | undefined {
  const index = readCatalogIndex();
  const owner = index.owners[nodeType];
  return owner === undefined ? undefined : index.packs.find((pack) => pack.id === owner);
}
