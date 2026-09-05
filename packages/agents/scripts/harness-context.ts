/**
 * Real ProcessingContext for the live harnesses — the same wiring the CLI
 * gives workflow runs: local DB (secrets + asset rows), the file asset store,
 * a temp workspace, and the createAsset model interface, so the sandbox's
 * asset surface (`assetToSandbox` / `sandboxToAsset` / `workspace.*`) works
 * exactly as it does in a chat codeact turn.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { ProcessingContext } from "@nodetool-ai/runtime";
import { FileStorageAdapter } from "@nodetool-ai/storage";
import { initDb, getSecret, Asset } from "@nodetool-ai/models";
import { getDefaultDbPath, getDefaultAssetsPath } from "@nodetool-ai/config";

const MIME_TO_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "video/mp4": "mp4",
  "application/pdf": "pdf",
  "application/zip": "zip",
  "text/plain": "txt",
  "text/html": "html"
};

export function createHarnessContext(): ProcessingContext {
  initDb(getDefaultDbPath());
  const assetStorage = new FileStorageAdapter(getDefaultAssetsPath());
  const workspaceDir = mkdtempSync(join(tmpdir(), "nodetool-harness-"));

  const context = new ProcessingContext({
    jobId: randomUUID(),
    workflowId: null,
    userId: "1",
    secretResolver: (key: string) => getSecret(key, "1"),
    storage: assetStorage,
    workspaceDir,
    workspaceStorage: new FileStorageAdapter(workspaceDir)
  });

  // Same local persistence the CLI wires for `nodetool run` — without it,
  // sandboxToAsset fails with "model interface 'createAsset' is not
  // configured".
  context.setModelInterfaces({
    createAsset: async (args) => {
      const asset = new Asset({
        user_id: args.userId,
        workflow_id: args.workflowId ?? null,
        node_id: args.nodeId ?? null,
        job_id: args.jobId ?? null,
        name: args.name,
        content_type: args.contentType,
        parent_id: args.parentId ?? null
      });
      if (args.content) {
        const ext = MIME_TO_EXT[args.contentType] ?? "bin";
        await assetStorage.store(
          `${asset.user_id}/${asset.id}.${ext}`,
          args.content,
          args.contentType
        );
        asset.size = args.content.length;
      }
      await asset.save();
      return asset;
    }
  });

  return context;
}
