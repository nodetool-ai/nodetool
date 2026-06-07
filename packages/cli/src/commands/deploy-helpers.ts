/**
 * Shared helpers for the `nodetool deploy` CLI command group.
 *
 * Provides factories for DeploymentManager / AdminHTTPClient / APIUserManager,
 * prompt utilities, output formatters, and stubs used by `deploy add`.
 */

import { createInterface } from "node:readline";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
  type DeploymentContext,
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
} from "@nodetool-ai/deploy";
import { Asset, Workflow, getSecret, initDb } from "@nodetool-ai/models";
import { FileStorageAdapter } from "@nodetool-ai/runtime";
import { getDefaultAssetsPath, getDefaultDbPath } from "@nodetool-ai/config";
import { initMasterKey } from "@nodetool-ai/security";

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

/**
 * Deployer factory map — wraps concrete deployers into the Deployer interface.
 *
 * Each factory receives the per-operation `ctx` as the LAST argument (matching
 * {@link DeployerFactory}) and passes it as the last constructor argument to the
 * concrete deployer, so the user's decrypted credentials and scratch dir reach
 * the leaf exec calls. For the single-user CLI the manager threads one ctx built
 * at the boundary (see {@link buildSingleUserContext}).
 */
export function defaultDeployerFactories(): Record<string, DeployerFactory> {
  return {
    docker: (name, deployment, state, ctx) =>
      adaptDocker(
        new DockerDeployer(name, deployment as DockerDeployment, state, ctx)
      ),
    runpod: (name, deployment, state, ctx) =>
      adaptRunPod(
        new RunPodDeployer(name, deployment as RunPodDeployment, state, ctx)
      ),
    gcp: (name, deployment, state, ctx) =>
      adaptGCP(new GCPDeployer(name, deployment as GCPDeployment, state, ctx)),
    fly: (name, deployment, state, ctx) =>
      adaptFly(new FlyDeployer(name, deployment as FlyDeployment, state, ctx)),
    railway: (name, deployment, state, ctx) =>
      adaptRailway(
        new RailwayDeployer(name, deployment as RailwayDeployment, state, ctx)
      ),
    huggingface: (name, deployment, state, ctx) =>
      adaptHuggingFace(
        new HuggingFaceDeployer(
          name,
          deployment as HuggingFaceDeployment,
          state,
          ctx
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
    apply: (opts) => d.apply({ dryRun: opts?.dryRun }),
    status: () => d.status(),
    logs: (opts) =>
      d.logs({ service: opts?.service, follow: opts?.follow, tail: opts?.tail }),
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

/**
 * Secret env-var names the single-user CLI lifts from `process.env` into the
 * deployment context. This mirrors the keys declared in the deploy package's
 * PROVIDER_SECRET_KEYS (plus the SSH password/key the self-hosted deployer
 * reads from ctx.credentials). Reading `process.env` to POPULATE a ctx is
 * allowed ONLY at this single-user CLI boundary — the multi-user server path
 * sources these from the per-user Secret store instead and never touches env.
 *
 * No `process.env` WRITES happen here; we only copy values into ctx.credentials.
 */
const SINGLE_USER_CREDENTIAL_ENV_KEYS = [
  "RUNPOD_API_KEY",
  "DOCKER_USERNAME",
  "DOCKER_PASSWORD",
  "HF_TOKEN",
  "HUGGING_FACE_HUB_TOKEN",
  "GCP_SERVICE_ACCOUNT_KEY",
  "FLY_API_TOKEN",
  "RAILWAY_API_TOKEN",
  "RAILWAY_TOKEN",
  "SSH_PRIVATE_KEY",
  "SSH_PASSWORD"
] as const;

/**
 * Build the single-user CLI {@link DeploymentContext} once, at the CLI
 * boundary:
 *
 *   - userId is the fixed local user ({@link LOCAL_USER_ID}).
 *   - credentials are lifted from `process.env` (allowed here only) for the
 *     keys the deployers may need; absent keys are simply omitted, so the
 *     deployers' explicitly-gated single-user fallbacks (deployment.ssh.key_path,
 *     deployment.ssh.password, deployment.docker.username) still apply.
 *   - scratchDir is an mkdtemp dir under the OS temp dir, removed on process
 *     exit. The CLI runs one command per process, so process-exit cleanup is
 *     the natural `finally` for the single-shot lifecycle.
 */
function buildSingleUserContext(): DeploymentContext {
  const credentials: Record<string, string> = {};
  for (const key of SINGLE_USER_CREDENTIAL_ENV_KEYS) {
    const value = process.env[key];
    if (value !== undefined && value !== "") {
      credentials[key] = value;
    }
  }

  const scratchDir = mkdtempSync(join(tmpdir(), "nodetool-deploy-cli-"));
  const cleanup = (): void => {
    rmSync(scratchDir, { recursive: true, force: true });
  };
  process.once("exit", cleanup);

  return { userId: LOCAL_USER_ID, credentials, scratchDir };
}

let secretStoreReady = false;

/**
 * Open the local SQLite DB and unlock the master key so per-user secrets can be
 * decrypted. Idempotent — safe to call from any deploy command that needs the
 * secret store.
 */
async function ensureSecretStore(): Promise<void> {
  if (secretStoreReady) return;
  initDb(getDefaultDbPath());
  try {
    await initMasterKey();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(
      `Could not unlock the secret store: ${msg}\n` +
        `Tip: set SECRETS_MASTER_KEY or grant keychain access.\n`
    );
  }
  secretStoreReady = true;
}

/**
 * Build a {@link DeploymentContext} whose credentials come from the per-user
 * Secret store (DB) instead of `process.env`. Used by the `--user` flag to
 * exercise the multi-user credential path: each known credential key is
 * resolved via `getSecret(key, userId)`; absent keys are omitted so the
 * deployers' config-supplied fallbacks still apply.
 */
export async function buildUserContext(
  userId: string
): Promise<DeploymentContext> {
  await ensureSecretStore();
  const credentials: Record<string, string> = {};
  for (const key of SINGLE_USER_CREDENTIAL_ENV_KEYS) {
    const value = await getSecret(key, userId);
    if (value !== null && value !== "") {
      credentials[key] = value;
    }
  }

  const scratchDir = mkdtempSync(join(tmpdir(), "nodetool-deploy-cli-"));
  process.once("exit", () => {
    rmSync(scratchDir, { recursive: true, force: true });
  });

  return { userId, credentials, scratchDir };
}

/**
 * Build a {@link DeploymentManager} for the deployment.yaml config.
 *
 * Without `userId`, credentials are lifted from `process.env` (single-user CLI
 * default). With `userId`, credentials are resolved from that user's Secret
 * store (DB), so `nodetool deploy apply <name> --user <id>` tests the per-user
 * credential path with the same deployment definitions.
 */
export async function getManager(opts?: {
  userId?: string;
}): Promise<DeploymentManager> {
  const config = await loadConfigOrExit();
  const state = new StateManager();
  const ctx = opts?.userId
    ? await buildUserContext(opts.userId)
    : buildSingleUserContext();
  return new DeploymentManager(config, state, defaultDeployerFactories(), ctx);
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
