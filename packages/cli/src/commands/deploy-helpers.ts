/**
 * Shared helpers for the `nodetool deploy` CLI command group.
 *
 * Provides factories for DeploymentManager / AdminHTTPClient / APIUserManager,
 * prompt utilities, output formatters, and stubs used by `deploy add`.
 */

import { spawnSync } from "node:child_process";

import {
  AdminHTTPClient,
  APIUserManager,
  DeploymentManager,
  StateManager,
  WorkflowSyncer,
  dockerDeploymentGetServerUrl,
  loadDeploymentConfig,
  DockerDeployer,
  DockerDeploymentSchema,
  type AnyDeployment,
  type Deployer,
  type DeployerFactory,
  type DeploymentConfig,
  type DeploymentType,
  type DockerDeployment,
  type SyncerAssetStorage,
  type WorkflowSyncerDeps,
  type AssetInfo
} from "@nodetool-ai/deploy";
import { Asset, Workflow } from "@nodetool-ai/models";
import { FileStorageAdapter } from "@nodetool-ai/runtime";
import { getDefaultAssetsPath } from "@nodetool-ai/config";

// Pure output + prompt helpers live in ./output.js so lightweight command
// modules can import them without pulling in the heavy deploy stack above.
// Re-exported here for the existing callers that import them from this module.
import { promptHidden } from "./output.js";
export {
  printTable,
  asJson,
  printKv,
  promptLine,
  promptHidden,
  confirm
} from "./output.js";

// ---------------------------------------------------------------------------
// Config / manager factories
// ---------------------------------------------------------------------------

export async function loadConfigOrExit(): Promise<DeploymentConfig> {
  try {
    return await loadDeploymentConfig();
  } catch (err) {
    console.error(String(err));
    process.exit(1);
  }
}

export function getDeploymentOrExit(
  config: DeploymentConfig,
  name: string
): AnyDeployment {
  const deployment = config.deployments[name];
  if (!deployment) {
    console.error(
      `Deployment '${name}' not found. Run 'nodetool deploy list' to see configured deployments.`
    );
    process.exit(1);
  }
  return deployment;
}

/** Deployer factory map — wraps concrete deployers into the Deployer interface. */
export function defaultDeployerFactories(): Record<string, DeployerFactory> {
  return {
    docker: (name, deployment, state) =>
      adaptDocker(new DockerDeployer(name, deployment as DockerDeployment, state))
  };
}

function adaptDocker(d: DockerDeployer): Deployer {
  return {
    plan: () => d.plan() as unknown as Promise<Record<string, unknown>>,
    apply: (opts) =>
      d.apply({ dryRun: opts?.dryRun }) as unknown as Promise<
        Record<string, unknown>
      >,
    status: () => d.status() as unknown as Promise<Record<string, unknown>>,
    logs: (opts) =>
      d.logs({
        service: opts?.service,
        follow: opts?.follow,
        tail: opts?.tail
      }),
    destroy: () => d.destroy() as unknown as Promise<Record<string, unknown>>
  };
}

export async function getManager(): Promise<DeploymentManager> {
  const config = await loadConfigOrExit();
  const state = new StateManager();
  return new DeploymentManager(config, state, defaultDeployerFactories());
}

// ---------------------------------------------------------------------------
// Server URL resolution
// ---------------------------------------------------------------------------

export function resolveServerUrl(
  deployment: AnyDeployment
): string | undefined {
  switch (deployment.type) {
    case "docker":
      return dockerDeploymentGetServerUrl(deployment);
  }
}

function requireServerUrl(deployment: AnyDeployment, name: string): string {
  const url = resolveServerUrl(deployment);
  if (!url) {
    console.error(
      `Deployment '${name}' has no server URL yet (run 'nodetool deploy apply ${name}' first).`
    );
    process.exit(1);
  }
  return url;
}

// ---------------------------------------------------------------------------
// Admin auth token resolution
// ---------------------------------------------------------------------------

export async function resolveAdminToken(opts?: {
  token?: string;
}): Promise<string> {
  if (opts?.token) return opts.token;
  const envToken = process.env["NODETOOL_ADMIN_TOKEN"];
  if (envToken) return envToken;
  if (!process.stdin.isTTY) {
    console.error(
      "Admin token required. Provide --token or set NODETOOL_ADMIN_TOKEN."
    );
    process.exit(1);
  }
  return promptHidden("Enter admin bearer token: ");
}

export async function getAdminClient(
  deployment: AnyDeployment,
  deploymentName: string,
  opts?: { token?: string }
): Promise<AdminHTTPClient> {
  const serverUrl = requireServerUrl(deployment, deploymentName);
  const token = await resolveAdminToken(opts);
  return new AdminHTTPClient({ baseUrl: serverUrl, authToken: token });
}

export async function getUserManager(
  deployment: AnyDeployment,
  deploymentName: string,
  opts?: { token?: string }
): Promise<APIUserManager> {
  const serverUrl = requireServerUrl(deployment, deploymentName);
  const token = await resolveAdminToken(opts);
  return new APIUserManager(serverUrl, token);
}

// ---------------------------------------------------------------------------
// Deployment stubs (for `deploy add`)
// ---------------------------------------------------------------------------

export function buildStubDeployment(
  type: DeploymentType,
  name: string
): AnyDeployment {
  switch (type) {
    case "docker":
      return DockerDeploymentSchema.parse({
        type: "docker",
        host: "localhost",
        image: {
          name: "ghcr.io/nodetool-ai/nodetool",
          tag: "latest"
        },
        container: {
          name: `nodetool-${name}`,
          port: 8000
        }
      });
  }
}

// ---------------------------------------------------------------------------
// WorkflowSyncer deps
// ---------------------------------------------------------------------------

/** Local user ID used by the CLI — matches the rest of the TS stack. */
export const LOCAL_USER_ID = "1";

/** Build WorkflowSyncer deps backed by the local DB + FileStorage. */
export function makeSyncerDeps(): WorkflowSyncerDeps {
  const storageRoot = getDefaultAssetsPath();
  const adapter = new FileStorageAdapter(storageRoot);

  const storage: SyncerAssetStorage = {
    async download(key: string): Promise<Uint8Array> {
      const data = await adapter.retrieve(`/api/storage/${key}`);
      if (!data) {
        throw new Error(`Asset file not found in local storage: ${key}`);
      }
      return data;
    }
  };

  return {
    async getWorkflowData(id: string) {
      const wf = await Workflow.find(LOCAL_USER_ID, id);
      if (!wf) return null;
      return {
        id: wf.id,
        name: wf.name,
        description: wf.description,
        access: wf.access,
        graph: wf.graph,
        settings: wf.settings,
        updated_at: wf.updated_at,
        created_at: wf.created_at
      } as Record<string, unknown>;
    },
    async getAsset(id: string): Promise<AssetInfo | null> {
      const asset = await Asset.find(LOCAL_USER_ID, id);
      if (!asset) return null;
      const fileExt = contentTypeToExt(asset.content_type);
      const fileName = asset.isFolder ? null : `${asset.id}.${fileExt}`;
      const thumbFileName = asset.hasThumbnail ? `${asset.id}_thumb.jpg` : null;
      return {
        id: asset.id,
        user_id: asset.user_id,
        name: asset.name,
        content_type: asset.content_type,
        parent_id: asset.parent_id,
        workflow_id: asset.workflow_id,
        metadata: asset.metadata,
        file_name: fileName,
        has_thumbnail: asset.hasThumbnail,
        thumb_file_name: thumbFileName
      };
    },
    getSyncerAssetStorage() {
      return storage;
    }
  };
}

const CONTENT_TYPE_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/svg+xml": "svg",
  "image/webp": "webp",
  "image/tiff": "tiff",
  "image/bmp": "bmp",
  "text/plain": "txt",
  "text/csv": "csv",
  "text/html": "html",
  "application/json": "json",
  "application/pdf": "pdf",
  "application/zip": "zip",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/ogg": "ogg",
  "audio/aac": "aac",
  "audio/x-wav": "wav",
  "audio/x-flac": "flac",
  "audio/x-m4a": "m4a",
  "video/mp4": "mp4",
  "video/mpeg": "mpeg",
  "video/quicktime": "mov",
  "video/x-msvideo": "avi",
  "video/webm": "webm"
};

function contentTypeToExt(contentType: string): string {
  return CONTENT_TYPE_TO_EXT[contentType] ?? "bin";
}

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------

export function parseParamPairs(pairs: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const raw of pairs) {
    const eq = raw.indexOf("=");
    if (eq < 0) {
      throw new Error(`Invalid parameter '${raw}'. Expected key=value.`);
    }
    const key = raw.slice(0, eq);
    const value = raw.slice(eq + 1);
    try {
      result[key] = JSON.parse(value);
    } catch {
      result[key] = value;
    }
  }
  return result;
}

export function runEditor(filePath: string): number {
  const editor = process.env["VISUAL"] ?? process.env["EDITOR"] ?? "vi";
  const result = spawnSync(editor, [filePath], { stdio: "inherit" });
  if (result.error != null) {
    console.error(
      `Failed to launch editor '${editor}': ${result.error.message}`
    );
    return 1;
  }
  if (result.status === null) {
    console.error(
      `Editor '${editor}' did not exit with a valid status code (terminated by signal ${
        result.signal ?? "unknown"
      }).`
    );
    return 1;
  }
  return result.status;
}

// Re-export for downstream consumers who want the syncer class.
export { WorkflowSyncer };
