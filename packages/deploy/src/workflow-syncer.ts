/**
 * WorkflowSyncer — syncs workflows, assets, and required models
 * to a remote NodeTool instance via the AdminHTTPClient.
 */

import type { AdminHTTPClient } from "./admin-client.js";
import { extractModels } from "./sync.js";

/** Minimal asset representation for syncing. */
export interface AssetInfo {
  id: string;
  user_id: string;
  name: string;
  content_type: string;
  parent_id?: string | null;
  workflow_id?: string | null;
  metadata?: Record<string, unknown> | null;
  file_name?: string | null;
  has_thumbnail?: boolean;
  thumb_file_name?: string | null;
}

/** Storage interface for downloading asset data. */
export interface SyncerAssetStorage {
  download(key: string): Promise<Uint8Array>;
}

/** Functions the caller must supply so WorkflowSyncer can resolve local data. */
export interface WorkflowSyncerDeps {
  /** Retrieve a workflow by ID and return it as a serialisable dict. */
  getWorkflowData(workflowId: string): Promise<Record<string, unknown> | null>;

  /** Retrieve local asset metadata by ID. */
  getAsset(assetId: string): Promise<AssetInfo | null>;

  /** Get the local asset storage instance. */
  getSyncerAssetStorage(): SyncerAssetStorage;
}

export class WorkflowSyncer {
  private client: AdminHTTPClient;
  private deps: WorkflowSyncerDeps;

  constructor(client: AdminHTTPClient, deps: WorkflowSyncerDeps) {
    this.client = client;
    this.deps = deps;
  }

  /**
   * Sync a workflow, its assets, and required models to the remote instance.
   *
   * @returns true if sync was successful, false otherwise.
   */
  async syncWorkflow(workflowId: string): Promise<boolean> {
    try {
      const workflowData = await this.deps.getWorkflowData(workflowId);
      if (!workflowData) {
        console.error(`Workflow not found locally: ${workflowId}`);
        return false;
      }

      // Sync assets first
      const syncedAssets = await this.extractAndSyncAssets(workflowData);
      if (syncedAssets > 0) {
        console.log(`Synced ${syncedAssets} asset(s)`);
      }

      // Download models required by the workflow
      const syncedModels = await this.extractAndDownloadModels(workflowData);
      if (syncedModels > 0) {
        console.log(`Downloaded ${syncedModels} model(s)`);
      }

      // Sync workflow
      await this.client.updateWorkflow(workflowId, workflowData);
      return true;
    } catch (e) {
      console.error(`Failed to sync workflow: ${e}`);
      return false;
    }
  }

  /**
   * Extract model references from workflow and download them on remote.
   */
  private async extractAndDownloadModels(
    workflowData: Record<string, unknown>
  ): Promise<number> {
    const models = extractModels(
      workflowData as Parameters<typeof extractModels>[0]
    );

    if (models.length === 0) {
      return 0;
    }

    console.log(`Found ${models.length} model(s) to download`);

    let downloadedCount = 0;

    for (const model of models) {
      try {
        const modelType = model.type ?? "";

        // Handle HuggingFace models
        if (modelType.startsWith("hf.")) {
          const repoId = model.repo_id;
          if (!repoId) {
            console.error("  Error: repo_id is required for HF models");
            continue;
          }
          console.log(`  Downloading HF model: ${repoId}`);

          let lastStatus: string | undefined;
          for await (const progress of this.client.downloadHuggingfaceModel({
            repoId,
            filePath: model.path ?? undefined,
            ignorePatterns: model.ignore_patterns ?? undefined,
            allowPatterns: model.allow_patterns ?? undefined
          })) {
            lastStatus = progress["status"] as string | undefined;
            if (lastStatus === "downloading") {
              const fileName = (progress["file"] as string) ?? "";
              const percent = (progress["percent"] as number) ?? 0;
              process.stdout.write(`    ${fileName}: ${percent.toFixed(1)}%\r`);
            } else if (lastStatus === "complete") {
              console.log(`    Downloaded ${repoId}`);
            }
          }

          if (lastStatus !== "complete") {
            console.log(`    Downloaded ${repoId}`);
          }
          downloadedCount++;
        }
        // Handle Ollama models
        else if (
          modelType === "language_model" &&
          model.provider === "ollama"
        ) {
          const modelId = model.id;
          if (!modelId) {
            console.error("  Error: model id is required for Ollama models");
            continue;
          }
          console.log(`  Downloading Ollama model: ${modelId}`);

          let lastStatus: string | undefined;
          for await (const progress of this.client.downloadOllamaModel(
            modelId
          )) {
            lastStatus = progress["status"] as string | undefined;
            if (lastStatus && lastStatus !== "success") {
              process.stdout.write(`    ${lastStatus}\r`);
            } else if (lastStatus === "success") {
              console.log(`    Downloaded ${modelId}`);
            }
          }

          if (lastStatus !== "success") {
            console.log(`    Downloaded ${modelId}`);
          }
          downloadedCount++;
        }
      } catch (e) {
        console.error(`    Failed to download model: ${e}`);
      }
    }

    return downloadedCount;
  }

  /**
   * Extract asset references from workflow and sync them to remote.
   */
  private async extractAndSyncAssets(
    workflowData: Record<string, unknown>
  ): Promise<number> {
    const assetIds = new Set<string>();

    const graph = workflowData["graph"] as
      | { nodes?: Array<Record<string, unknown>> }
      | undefined;
    const nodes = graph?.nodes ?? [];

    for (const node of nodes) {
      const nodeType = (node["type"] as string) ?? "";
      if (nodeType.startsWith("nodetool.constant.")) {
        const data = node["data"] as Record<string, unknown> | undefined;
        const value = data?.["value"];
        if (value && typeof value === "object" && !Array.isArray(value)) {
          const assetId = (value as Record<string, unknown>)["asset_id"];
          if (typeof assetId === "string" && assetId) {
            assetIds.add(assetId);
          }
        }
      }
    }

    if (assetIds.size === 0) {
      return 0;
    }

    console.log(`Found ${assetIds.size} asset(s) to sync`);

    const storage = this.deps.getSyncerAssetStorage();
    let syncedCount = 0;

    for (const assetId of assetIds) {
      try {
        const asset = await this.deps.getAsset(assetId);
        if (!asset) {
          console.warn(`  Asset ${assetId} not found locally, skipping`);
          continue;
        }

        console.log(`  Syncing asset: ${asset.name}`);

        // Check if asset already exists on remote
        try {
          await this.client.getAsset(assetId);
          console.log("    Asset already exists on remote, skipping");
          syncedCount++;
          continue;
        } catch {
          // Asset doesn't exist, continue with sync
        }

        // Create asset metadata on remote (preserve asset ID)
        await this.client.createAsset({
          id: asset.id,
          userId: asset.user_id,
          name: asset.name,
          contentType: asset.content_type,
          parentId: asset.parent_id ?? undefined,
          workflowId: asset.workflow_id ?? undefined,
          metadata: asset.metadata ?? undefined
        });

        // Upload asset file if it's not a folder
        if (asset.content_type !== "folder" && asset.file_name) {
          const fileData = await storage.download(asset.file_name);
          await this.client.uploadAssetFile(asset.file_name, fileData);

          // Upload thumbnail if exists
          if (asset.has_thumbnail && asset.thumb_file_name) {
            const thumbData = await storage.download(asset.thumb_file_name);
            await this.client.uploadAssetFile(asset.thumb_file_name, thumbData);
          }
        }

        console.log(`    Synced ${asset.name}`);
        syncedCount++;
      } catch (e) {
        console.error(`    Failed to sync asset ${assetId}: ${e}`);
      }
    }

    return syncedCount;
  }
}
