/**
 * Shared helpers for the `nodetool deploy` CLI command group.
 *
 * Provides factories for DeploymentManager / AdminHTTPClient / APIUserManager,
 * prompt utilities, output formatters, and stubs used by `deploy add`.
 */

import { createInterface } from "node:readline";
import { spawnSync } from "node:child_process";

import {
  AdminHTTPClient,
  APIUserManager,
  DeploymentManager,
  StateManager,
  WorkflowSyncer,
  dockerDeploymentGetServerUrl,
  gcpDeploymentGetServerUrl,
  runPodDeploymentGetServerUrl,
  loadDeploymentConfig,
  GCPDeployer,
  RunPodDeployer,
  FlyDeployer,
  RailwayDeployer,
  HuggingFaceDeployer,
  DockerDeployer,
  DockerDeploymentSchema,
  FlyDeploymentSchema,
  HuggingFaceDeploymentSchema,
  RailwayDeploymentSchema,
  RunPodDeploymentSchema,
  type AnyDeployment,
  type Deployer,
  type DeployerFactory,
  type DeploymentConfig,
  type DeploymentType,
  type DockerDeployment,
  type FlyDeployment,
  type GCPDeployment,
  type HuggingFaceDeployment,
  type RailwayDeployment,
  type RunPodDeployment,
  type SyncerAssetStorage,
  type WorkflowSyncerDeps,
  type AssetInfo
} from "@nodetool/deploy";
import { Asset, Workflow } from "@nodetool/models";
import { FileStorageAdapter } from "@nodetool/runtime";
import { getDefaultAssetsPath } from "@nodetool/config";

// ---------------------------------------------------------------------------
// Output helpers (duplicated from nodetool.ts so the CLI root stays simple)
// ---------------------------------------------------------------------------

/** Print a table to stdout. Missing values render as empty. */
export function printTable(
  rows: Record<string, unknown>[],
  columns?: string[]
): void {
  if (rows.length === 0) {
    console.log("(no results)");
    return;
  }
  const cols = columns ?? Object.keys(rows[0]!);
  const widths = cols.map((c) =>
    Math.max(c.length, ...rows.map((r) => String(r[c] ?? "").length))
  );
  const sep = widths.map((w) => "─".repeat(w + 2)).join("┼");
  const header = cols.map((c, i) => ` ${c.padEnd(widths[i]!)} `).join("│");
  console.log(header);
  console.log(sep);
  for (const row of rows) {
    console.log(
      cols
        .map((c, i) => ` ${String(row[c] ?? "").padEnd(widths[i]!)} `)
        .join("│")
    );
  }
}

export function asJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

export function printKv(rows: Record<string, unknown>): void {
  const list = Object.entries(rows).map(([key, value]) => ({
    key,
    value: String(value ?? "")
  }));
  printTable(list, ["key", "value"]);
}

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
      adaptDocker(new DockerDeployer(name, deployment as DockerDeployment, state)),
    runpod: (name, deployment, state) =>
      adaptRunPod(new RunPodDeployer(name, deployment as RunPodDeployment, state)),
    gcp: (name, deployment, state) =>
      adaptGCP(new GCPDeployer(name, deployment as GCPDeployment, state)),
    fly: (name, deployment, state) =>
      adaptFly(new FlyDeployer(name, deployment as FlyDeployment, state)),
    railway: (name, deployment, state) =>
      adaptRailway(
        new RailwayDeployer(name, deployment as RailwayDeployment, state)
      ),
    huggingface: (name, deployment, state) =>
      adaptHuggingFace(
        new HuggingFaceDeployer(
          name,
          deployment as HuggingFaceDeployment,
          state
        )
      )
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

function adaptRunPod(d: RunPodDeployer): Deployer {
  return {
    plan: () => d.plan() as unknown as Promise<Record<string, unknown>>,
    apply: (opts) =>
      d.apply(opts?.dryRun ?? false) as unknown as Promise<
        Record<string, unknown>
      >,
    status: () => d.status() as unknown as Promise<Record<string, unknown>>,
    logs: async () => {
      // RunPod serverless doesn't provide log access
      try {
        d.logs();
      } catch (e) {
        return `${String(e)}\n`;
      }
      return "";
    },
    destroy: () => d.destroy() as unknown as Promise<Record<string, unknown>>
  };
}

function adaptGCP(d: GCPDeployer): Deployer {
  return {
    plan: () => d.plan(),
    apply: (opts) => d.apply(opts?.dryRun ?? false),
    status: () => d.status(),
    logs: (opts) => d.logs(opts?.service, opts?.follow ?? false, opts?.tail ?? 100),
    destroy: () => d.destroy()
  };
}

function adaptFly(d: FlyDeployer): Deployer {
  return {
    plan: () => d.plan() as unknown as Promise<Record<string, unknown>>,
    apply: (opts) =>
      d.apply({ dryRun: opts?.dryRun }) as unknown as Promise<
        Record<string, unknown>
      >,
    status: () => d.status() as unknown as Promise<Record<string, unknown>>,
    logs: (opts) => d.logs({ follow: opts?.follow, tail: opts?.tail }),
    destroy: () => d.destroy() as unknown as Promise<Record<string, unknown>>
  };
}

function adaptRailway(d: RailwayDeployer): Deployer {
  return {
    plan: () => d.plan(),
    apply: (opts) =>
      d.apply({ dryRun: opts?.dryRun }) as unknown as Promise<
        Record<string, unknown>
      >,
    status: () => d.status(),
    logs: (opts) => d.logs({ follow: opts?.follow, tail: opts?.tail }),
    destroy: () => d.destroy() as unknown as Promise<Record<string, unknown>>
  };
}

function adaptHuggingFace(d: HuggingFaceDeployer): Deployer {
  return {
    plan: () => d.plan(),
    apply: (opts) =>
      d.apply({ dryRun: opts?.dryRun }) as unknown as Promise<
        Record<string, unknown>
      >,
    status: () => d.status(),
    logs: (opts) => d.logs({ follow: opts?.follow, tail: opts?.tail }),
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
    case "runpod":
      return runPodDeploymentGetServerUrl(deployment);
    case "gcp":
      return gcpDeploymentGetServerUrl(deployment);
    case "fly":
      return deployment.state.url ?? undefined;
    case "railway":
      return deployment.state.url ?? undefined;
    case "huggingface":
      return deployment.state.space_url ?? undefined;
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
// Prompts
// ---------------------------------------------------------------------------

/** Prompt for a line on stdin (echoes). TTY only — exits if non-TTY. */
export async function promptLine(
  message: string,
  opts?: { default?: string }
): Promise<string> {
  if (!process.stdin.isTTY) {
    console.error(`Missing value for interactive prompt: ${message}`);
    process.exit(1);
  }
  const rl = createInterface({
    input: process.stdin,
    output: process.stderr
  });
  return new Promise<string>((resolve) => {
    const suffix = opts?.default ? ` [${opts.default}]` : "";
    rl.question(`${message}${suffix}: `, (answer) => {
      rl.close();
      const trimmed = answer.trim();
      resolve(trimmed || (opts?.default ?? ""));
    });
  });
}

/** Prompt for hidden input (typed but not echoed). TTY only. */
export async function promptHidden(message: string): Promise<string> {
  if (!process.stdin.isTTY) {
    console.error(`Missing value for interactive prompt: ${message}`);
    process.exit(1);
  }
  process.stderr.write(message);
  return new Promise<string>((resolve) => {
    let value = "";
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    const onData = (data: string): void => {
      for (const ch of data) {
        if (ch === "\r" || ch === "\n") {
          stdin.setRawMode(wasRaw ?? false);
          stdin.pause();
          stdin.removeListener("data", onData);
          process.stderr.write("\n");
          resolve(value);
          return;
        }
        if (ch === "") {
          stdin.setRawMode(wasRaw ?? false);
          stdin.pause();
          process.exit(130);
        }
        if (ch === "" || ch === "\b") {
          value = value.slice(0, -1);
          continue;
        }
        value += ch;
      }
    };
    stdin.on("data", onData);
  });
}

/** Yes/no confirm. Non-TTY returns the `force` value (default: false). */
export async function confirm(
  message: string,
  opts?: { force?: boolean; default?: boolean }
): Promise<boolean> {
  if (opts?.force) return true;
  if (!process.stdin.isTTY) return false;
  const defaultYes = opts?.default ?? false;
  const hint = defaultYes ? "[Y/n]" : "[y/N]";
  const answer = await promptLine(`${message} ${hint}`);
  if (!answer) return defaultYes;
  return /^y(es)?$/i.test(answer);
}

// ---------------------------------------------------------------------------
// Deployment stubs (for `deploy add` on types without configure* helpers)
// ---------------------------------------------------------------------------

export function buildStubDeployment(
  type: DeploymentType,
  name: string
): AnyDeployment {
  switch (type) {
    case "fly":
      return FlyDeploymentSchema.parse({
        type: "fly",
        app: `nodetool-${name}`,
        image: "nodetool-image.yaml"
      });
    case "railway":
      return RailwayDeploymentSchema.parse({
        type: "railway",
        project: "your-project-id",
        service: `nodetool-${name}`,
        image: "nodetool-image.yaml"
      });
    case "huggingface":
      return HuggingFaceDeploymentSchema.parse({
        type: "huggingface",
        repo: `your-org/nodetool-${name}`,
        image: "nodetool-image.yaml"
      });
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
    case "runpod":
      return RunPodDeploymentSchema.parse({
        type: "runpod",
        image: {
          name: "your-dockerhub-user/nodetool",
          tag: "latest"
        }
      });
    case "gcp":
      throw new Error(
        "GCP deployments must be configured via interactive prompts — no stub available."
      );
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
  return result.status ?? 0;
}

// Re-export for downstream consumers who want the syncer class.
export { WorkflowSyncer };
