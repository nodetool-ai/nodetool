/**
 * The persistence a local (no-server) run gets: assets and timeline sequences,
 * against the same database `setupDb()` opens.
 *
 * Installed process-wide by each command that runs a graph, so every context
 * built downstream answers the same way. Wiring it per-entrance is what let
 * `nodetool debug` and `nodetool workflows run` disagree: a workflow that
 * saved an image ran under one and threw "ProcessingContext model interface
 * 'createAsset' is not configured" under the other.
 *
 * `createAsset` is the server's own implementation, imported rather than
 * rewritten — the local copy this replaced wrote no thumbnail and left
 * `parent_id` null, so a CLI-generated asset was invisible in every
 * folder-scoped listing in the UI.
 */

import type { ProcessingContextModelInterfaces } from "@nodetool-ai/runtime";
import { setDefaultModelInterfaces } from "@nodetool-ai/runtime";

export async function localModelInterfaces(): Promise<ProcessingContextModelInterfaces> {
  const {
    createAssetModelInterface,
    updateAssetBytesModelInterface,
    textDocumentModelInterfaces
  } = await import("@nodetool-ai/asset-services");
  // `createAsset` saves a file into the run's project folder. Loading the
  // folder service installs the resolver asset services reach it through.
  await import("@nodetool-ai/execution/service");
  // The CLI reads assets through adapters it builds over the asset folder.
  // This lets them find an asset whose bytes are a file in a project folder.
  const { installAssetFolderLookup } = await import(
    "@nodetool-ai/asset-services/external-asset-lookup"
  );
  installAssetFolderLookup();
  // Storyboards, the entity library and the game templates, from the same
  // module the server installs — a harness run has to write the rows a server
  // run writes, or it proves nothing about the server.
  const { documentModelInterfaces } = await import(
    "@nodetool-ai/document-services"
  );
  return {
    createAsset: createAssetModelInterface,
    updateAssetBytes: updateAssetBytesModelInterface,
    ...textDocumentModelInterfaces(),
    ...documentModelInterfaces(),
    getAssetInfo: async ({ userId, assetId }) => {
      const { Asset } = await import("@nodetool-ai/models");
      const asset = await Asset.find(userId, assetId);
      if (!asset) return null;
      return {
        id: asset.id,
        content_type: asset.content_type,
        name: asset.name,
        metadata: asset.metadata ?? null,
        workspace_path: asset.workspace_path ?? null
      };
    },
    convertDocumentToMarkdown: async (args) => {
      const { convertDocumentBytesToMarkdown } = await import(
        "@nodetool-ai/agents/text-document-transfer"
      );
      return convertDocumentBytesToMarkdown(args);
    }
  };
}

let installed: Promise<void> | null = null;

/** Install them as this process's default, once. */
export function installLocalModelInterfaces(): Promise<void> {
  if (!installed) {
    installed = localModelInterfaces().then((interfaces) => {
      setDefaultModelInterfaces(interfaces);
    });
  }
  return installed;
}
