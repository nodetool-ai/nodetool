/**
 * Google Cloud Run API Module
 *
 * Provides a clean interface to Google Cloud Run API for managing
 * services and deployments. Handles authentication, request/response processing,
 * and error handling for all Cloud Run operations.
 *
 * Multi-tenant rule: NO ambient gcloud auth. Every `gcloud`/`docker` call runs
 * through a {@link GcpScope} — a per-operation scoped runner whose child env
 * carries `GOOGLE_APPLICATION_CREDENTIALS` (a scratch SA-key file written from
 * the user's `GCP_SERVICE_ACCOUNT_KEY` secret) and `CLOUDSDK_CONFIG`/
 * `DOCKER_CONFIG` pointing into the call's scratch dir. The host's ambient
 * gcloud account, host `~/.docker/config.json`, and host default-project are
 * NEVER consulted in the multi-user path.
 *
 * Ported from nodetool.deploy.google_cloud_run_api (Python).
 */

import type { ScopedRunner } from "./deployment-context.js";
import type { DockerAuth } from "./docker.js";

// ---------------------------------------------------------------------------
// GCP scope — the per-operation auth/exec envelope threaded into every call.
// ---------------------------------------------------------------------------

/**
 * Per-operation GCP auth/exec envelope.
 *
 * Replaces ambient gcloud auth. `run` is a {@link ScopedRunner} bound to the
 * user's `DeploymentContext`; `env` carries the scratch-scoped credential
 * redirection (`GOOGLE_APPLICATION_CREDENTIALS`, `CLOUDSDK_CONFIG`,
 * `DOCKER_CONFIG`) so neither gcloud nor docker ever read or write host auth
 * files. `multiUser` gates host-identity behaviour: in multi-user mode there is
 * no host default-project fallback and no auto IAM-grant of `run.admin`.
 */
export interface GcpScope {
  /** Scoped runner bound to the user's DeploymentContext. */
  run: ScopedRunner;
  /**
   * Child-env overrides for gcloud: GOOGLE_APPLICATION_CREDENTIALS (scratch SA
   * key), CLOUDSDK_CONFIG (scratch gcloud config dir), DOCKER_CONFIG (scratch
   * docker config dir).
   */
  env: Record<string, string>;
  /**
   * When true, host-identity shortcuts are disabled: ensureProjectSet requires
   * an explicit project_id, and ensureCloudRunPermissions does NOT auto-grant
   * IAM roles (which would escalate to whatever `gcloud config get-value
   * account` returns — cross-tenant escalation). Pre-provisioned SA perms are
   * required instead. The single-user CLI path sets this false.
   */
  multiUser: boolean;
  /**
   * Optional registry auth for `docker tag`/`docker push` in {@link pushToGcr}.
   * For Artifact Registry / GCR the credential helper (`gcloud auth
   * configure-docker`) is used with the scratch DOCKER_CONFIG, so a registry
   * login is generally unnecessary; this is here only when an explicit docker
   * login is also desired.
   */
  dockerAuth?: DockerAuth;
}

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** Google Cloud Run supported regions. */
export enum CloudRunRegion {
  // Americas
  US_CENTRAL1 = "us-central1",
  US_EAST1 = "us-east1",
  US_EAST4 = "us-east4",
  US_WEST1 = "us-west1",
  US_WEST2 = "us-west2",
  US_WEST3 = "us-west3",
  US_WEST4 = "us-west4",
  NORTHAMERICA_NORTHEAST1 = "northamerica-northeast1",
  NORTHAMERICA_NORTHEAST2 = "northamerica-northeast2",
  SOUTHAMERICA_EAST1 = "southamerica-east1",
  SOUTHAMERICA_WEST1 = "southamerica-west1",

  // Europe
  EUROPE_NORTH1 = "europe-north1",
  EUROPE_WEST1 = "europe-west1",
  EUROPE_WEST2 = "europe-west2",
  EUROPE_WEST3 = "europe-west3",
  EUROPE_WEST4 = "europe-west4",
  EUROPE_WEST6 = "europe-west6",
  EUROPE_WEST8 = "europe-west8",
  EUROPE_WEST9 = "europe-west9",
  EUROPE_CENTRAL2 = "europe-central2",
  EUROPE_SOUTHWEST1 = "europe-southwest1",

  // Asia Pacific
  ASIA_EAST1 = "asia-east1",
  ASIA_EAST2 = "asia-east2",
  ASIA_NORTHEAST1 = "asia-northeast1",
  ASIA_NORTHEAST2 = "asia-northeast2",
  ASIA_NORTHEAST3 = "asia-northeast3",
  ASIA_SOUTH1 = "asia-south1",
  ASIA_SOUTH2 = "asia-south2",
  ASIA_SOUTHEAST1 = "asia-southeast1",
  ASIA_SOUTHEAST2 = "asia-southeast2",
  AUSTRALIA_SOUTHEAST1 = "australia-southeast1",
  AUSTRALIA_SOUTHEAST2 = "australia-southeast2"
}

/** Return all region values. */
export function listCloudRunRegions(): string[] {
  return Object.values(CloudRunRegion);
}

/** Google Cloud Run CPU allocation options. */
export enum CloudRunCPU {
  CPU_1 = "1",
  CPU_2 = "2",
  CPU_4 = "4",
  CPU_6 = "6",
  CPU_8 = "8"
}

export function listCloudRunCPUs(): string[] {
  return Object.values(CloudRunCPU);
}

/** Google Cloud Run memory allocation options. */
export enum CloudRunMemory {
  MEMORY_512Mi = "512Mi",
  MEMORY_1Gi = "1Gi",
  MEMORY_2Gi = "2Gi",
  MEMORY_4Gi = "4Gi",
  MEMORY_8Gi = "8Gi",
  MEMORY_16Gi = "16Gi",
  MEMORY_32Gi = "32Gi"
}

export function listCloudRunMemory(): string[] {
  return Object.values(CloudRunMemory);
}

// ---------------------------------------------------------------------------
// Helper — run gcloud commands through the scoped runner
// ---------------------------------------------------------------------------

interface ExecResult {
  stdout: string;
  stderr: string;
}

/**
 * Run a `gcloud` command through the scope's scoped runner with the scratch
 * credential env (GOOGLE_APPLICATION_CREDENTIALS / CLOUDSDK_CONFIG /
 * DOCKER_CONFIG). Never spawns gcloud with the host's ambient env.
 */
async function gcloud(
  scope: GcpScope,
  args: string[],
  opts?: { timeoutMs?: number }
): Promise<ExecResult> {
  return scope.run("gcloud", args, {
    env: scope.env,
    timeoutMs: opts?.timeoutMs
  });
}

// ---------------------------------------------------------------------------
// Authentication & Project helpers
// ---------------------------------------------------------------------------

/**
 * Verify the SA credentials in the scope can talk to gcloud.
 *
 * With GOOGLE_APPLICATION_CREDENTIALS set to the scratch SA key, gcloud uses
 * Application Default Credentials — there is no interactive login to perform.
 * This only confirms the gcloud binary is reachable and the credentials load.
 */
export async function ensureGcloudAuth(scope: GcpScope): Promise<void> {
  try {
    await gcloud(scope, ["--version"]);
  } catch {
    console.error("Google Cloud SDK (gcloud) is not installed");
    console.error("Install it from: https://cloud.google.com/sdk/docs/install");
    throw new Error("gcloud CLI not installed");
  }

  // Activate the service-account key explicitly so subsequent calls use it
  // rather than any ambient account. The key path comes from the scratch env.
  const keyFile = scope.env["GOOGLE_APPLICATION_CREDENTIALS"];
  if (keyFile) {
    try {
      await gcloud(scope, [
        "auth",
        "activate-service-account",
        "--key-file",
        keyFile,
        "--quiet"
      ]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(
        `Failed to activate the GCP service-account key: ${msg}. ` +
          `Check that the GCP_SERVICE_ACCOUNT_KEY secret is a valid SA JSON key.`
      );
    }
  } else if (scope.multiUser) {
    throw new Error(
      "No GCP service-account credentials available. " +
        "Set the GCP_SERVICE_ACCOUNT_KEY secret for this deployment."
    );
  }
}

/**
 * Ensure the required Cloud Run IAM permissions.
 *
 * Multi-user mode SKIPS the auto IAM-grant entirely: granting `run.admin` to
 * whatever `gcloud config get-value account` returns would escalate to the
 * host/ambient identity and cross tenant boundaries. The deployment SA must be
 * pre-provisioned with the necessary roles out of band.
 *
 * The single-user CLI path keeps the historical best-effort grant.
 */
export async function ensureCloudRunPermissions(
  scope: GcpScope,
  projectId: string,
  serviceAccount?: string | null
): Promise<void> {
  if (scope.multiUser) {
    // No host-identity IAM mutation in multi-user mode. The deployment's
    // service account must already hold roles/run.admin (+ optionally
    // roles/iam.serviceAccountUser). Cross-tenant escalation is not permitted.
    return;
  }

  try {
    const { stdout } = await gcloud(scope, [
      "config",
      "get-value",
      "account"
    ]);
    const userAccount = stdout.trim();

    if (!userAccount || userAccount === "(unset)") {
      console.warn("Could not determine current user account");
      return;
    }

    console.log(`Ensuring Cloud Run permissions for ${userAccount}...`);

    const requiredRoles: string[] = serviceAccount
      ? ["roles/run.admin"]
      : ["roles/run.admin", "roles/iam.serviceAccountUser"];

    for (const role of requiredRoles) {
      console.log(`Granting ${role}...`);
      try {
        await gcloud(scope, [
          "projects",
          "add-iam-policy-binding",
          projectId,
          "--member",
          `user:${userAccount}`,
          "--role",
          role,
          "--quiet"
        ]);
        console.log(`Granted ${role}`);
      } catch {
        console.warn(`Could not grant ${role} (might already exist)`);
      }
    }
  } catch (e) {
    console.warn(`Could not auto-configure permissions: ${e}`);
    console.warn("You may need to run manually:");
    console.warn(
      `gcloud projects add-iam-policy-binding ${projectId} --member=user:$(gcloud config get-value account) --role=roles/run.admin`
    );
    if (!serviceAccount) {
      console.warn(
        `gcloud projects add-iam-policy-binding ${projectId} --member=user:$(gcloud config get-value account) --role=roles/iam.serviceAccountUser`
      );
    }
  }
}

/**
 * Resolve the Google Cloud project to use.
 *
 * Multi-user mode REQUIRES an explicit `projectId`: there is no host
 * default-project fallback (it would target whatever the host gcloud config
 * points at — wrong tenant). The single-user CLI path may fall back to the
 * gcloud default project.
 */
export async function ensureProjectSet(
  scope: GcpScope,
  projectId?: string | null
): Promise<string> {
  if (projectId) return projectId;

  if (scope.multiUser) {
    throw new Error(
      "No Google Cloud project configured. A multi-user GCP deployment must " +
        "set an explicit project_id in its configuration; the host default " +
        "project is never used."
    );
  }

  // Single-user CLI fallback: read the host gcloud default project.
  try {
    const { stdout } = await gcloud(scope, [
      "config",
      "get-value",
      "project"
    ]);
    const project = stdout.trim();
    if (project && project !== "(unset)") {
      return project;
    }
  } catch {
    // fall through to the error below
  }

  throw new Error(
    "No Google Cloud project configured. Set a project with: gcloud config set project YOUR_PROJECT_ID"
  );
}

/**
 * Enable required Google Cloud APIs.
 */
export async function enableRequiredApis(
  scope: GcpScope,
  projectId: string
): Promise<void> {
  const requiredApis = [
    "run.googleapis.com",
    "cloudbuild.googleapis.com",
    "containerregistry.googleapis.com",
    "artifactregistry.googleapis.com"
  ];

  console.log("Enabling required APIs...");

  for (const api of requiredApis) {
    try {
      await gcloud(scope, ["services", "enable", api, "--project", projectId]);
      console.log(`Enabled ${api}`);
    } catch (e) {
      console.warn(`Failed to enable ${api}: ${e}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Service deployment
// ---------------------------------------------------------------------------

/**
 * Serialize a flat string→string map to minimal YAML for
 * `gcloud --env-vars-file`. Values are quoted to survive special characters;
 * keys are plain identifiers (env-var names). Used to keep env values OUT of
 * argv (ps/proc-visible) per the multi-tenant rule.
 */
function envVarsToYaml(envVars: Record<string, string>): string {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(envVars)) {
    // Double-quote and escape backslashes and quotes for YAML double-quoted
    // scalars. This keeps `=`, spaces, and `:` safe.
    const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    lines.push(`${key}: "${escaped}"`);
  }
  return lines.join("\n") + "\n";
}

export interface DeployToCloudRunOptions {
  scope: GcpScope;
  serviceName: string;
  imageUrl: string;
  region: string;
  projectId: string;
  port?: number;
  cpu?: string;
  memory?: string;
  gpuType?: string | null;
  gpuCount?: number;
  minInstances?: number;
  maxInstances?: number;
  concurrency?: number;
  timeout?: number;
  allowUnauthenticated?: boolean;
  envVars?: Record<string, string>;
  serviceAccount?: string | null;
  gcsBucket?: string | null;
  gcsMountPath?: string;
  /**
   * Absolute path to a scratch env-vars YAML file written by the caller from
   * `envVars` (via `writeScratchFile`). When set, env vars are passed via
   * `--env-vars-file` so values never appear in argv. When omitted (single-user
   * CLI path), env vars fall back to `--set-env-vars`.
   */
  envVarsFile?: string;
}

/**
 * Deploy a service to Google Cloud Run.
 * Creates a new service or updates an existing one.
 */
export async function deployToCloudRun(
  options: DeployToCloudRunOptions
): Promise<Record<string, unknown>> {
  const {
    scope,
    serviceName,
    imageUrl,
    region,
    projectId,
    port = 8000,
    cpu = "4",
    memory = "16Gi",
    gpuType = "nvidia-l4",
    gpuCount = 1,
    minInstances = 0,
    maxInstances = 3,
    concurrency = 80,
    timeout = 3600,
    allowUnauthenticated = true,
    envVars,
    serviceAccount,
    gcsBucket,
    gcsMountPath = "/mnt/gcs",
    envVarsFile
  } = options;

  console.log(`Deploying ${serviceName} to Cloud Run...`);

  /** Append env-var flags, preferring an --env-vars-file (no secrets in argv). */
  const appendEnvVarFlags = (cmd: string[]): void => {
    if (envVarsFile) {
      cmd.push("--env-vars-file", envVarsFile);
    } else if (envVars) {
      for (const [key, value] of Object.entries(envVars)) {
        cmd.push("--set-env-vars", `${key}=${value}`);
      }
    }
  };

  // Determine whether to create (deploy) or update existing service
  let existingService: Record<string, unknown> | null;
  try {
    existingService = await getCloudRunService(
      scope,
      serviceName,
      region,
      projectId
    );
  } catch {
    existingService = null;
  }

  if (existingService === null) {
    // ---- Create new service via deploy ----
    const cmd: string[] = [
      "run",
      "deploy",
      serviceName,
      "--image",
      imageUrl,
      "--region",
      region,
      "--project",
      projectId,
      "--port",
      String(port),
      "--cpu",
      cpu,
      "--memory",
      memory,
      "--no-gpu-zonal-redundancy",
      "--min-instances",
      String(minInstances),
      "--max-instances",
      String(maxInstances),
      "--concurrency",
      String(concurrency),
      "--timeout",
      `${timeout}s`,
      "--format",
      "json",
      "--quiet"
    ];

    if (gcsBucket) {
      cmd.push(
        "--add-volume",
        `name=gcs,type=cloud-storage,bucket=${gcsBucket}`
      );
      cmd.push("--add-volume-mount", `volume=gcs,mount-path=${gcsMountPath}`);
    }
    if (gpuType) {
      cmd.push("--gpu-type", gpuType);
      cmd.push("--no-cpu-throttling");
    }
    if (gpuCount) {
      cmd.push("--gpu", String(gpuCount));
    }
    appendEnvVarFlags(cmd);
    if (serviceAccount) {
      cmd.push("--service-account", serviceAccount);
      console.log(`Using service account: ${serviceAccount}`);
    }
    if (allowUnauthenticated) {
      cmd.push("--allow-unauthenticated");
    }

    try {
      const { stdout } = await gcloud(scope, cmd);
      const deploymentInfo = JSON.parse(stdout) as Record<string, unknown>;
      console.log("Successfully deployed to Cloud Run");
      const status = deploymentInfo["status"] as
        | Record<string, unknown>
        | undefined;
      console.log(`Service URL: ${status?.["url"] ?? "N/A"}`);
      return deploymentInfo;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("Failed to deploy to Cloud Run");
      console.error(`Error: ${msg}`);
      throw new Error(`Cloud Run deployment failed: ${msg}`);
    }
  } else {
    // ---- Update existing service ----
    console.log(
      `Service '${serviceName}' exists. Updating it per docs: https://cloud.google.com/sdk/gcloud/reference/run/services/update`
    );

    const cmd: string[] = [
      "run",
      "services",
      "update",
      serviceName,
      "--image",
      imageUrl,
      "--region",
      region,
      "--project",
      projectId,
      "--port",
      String(port),
      "--cpu",
      cpu,
      "--memory",
      memory,
      "--min-instances",
      String(minInstances),
      "--max-instances",
      String(maxInstances),
      "--concurrency",
      String(concurrency),
      "--timeout",
      `${timeout}s`,
      "--format",
      "json",
      "--quiet"
    ];

    if (gcsBucket) {
      cmd.push(
        "--add-volume",
        `name=gcs,type=cloud-storage,bucket=${gcsBucket}`
      );
      cmd.push("--add-volume-mount", `volume=gcs,mount-path=${gcsMountPath}`);
    }
    if (gpuType) {
      cmd.push("--gpu-type", gpuType);
      cmd.push("--no-cpu-throttling");
    }
    if (gpuCount) {
      cmd.push("--gpu", String(gpuCount));
    }
    appendEnvVarFlags(cmd);
    if (serviceAccount) {
      cmd.push("--service-account", serviceAccount);
    }

    try {
      const { stdout } = await gcloud(scope, cmd);
      const deploymentInfo = JSON.parse(stdout) as Record<string, unknown>;

      // Handle unauthenticated access post-update
      if (allowUnauthenticated) {
        try {
          await gcloud(scope, [
            "run",
            "services",
            "add-iam-policy-binding",
            serviceName,
            "--region",
            region,
            "--project",
            projectId,
            "--member",
            "allUsers",
            "--role",
            "roles/run.invoker",
            "--quiet"
          ]);
        } catch {
          // Suppressed — may already be bound
        }
      }

      console.log("Successfully updated Cloud Run service");
      const status = deploymentInfo["status"] as
        | Record<string, unknown>
        | undefined;
      console.log(`Service URL: ${status?.["url"] ?? "N/A"}`);
      return deploymentInfo;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("Failed to update Cloud Run service");
      console.error(`Error: ${msg}`);
      throw new Error(`Cloud Run update failed: ${msg}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Service management
// ---------------------------------------------------------------------------

/**
 * Delete a Cloud Run service.
 */
export async function deleteCloudRunService(
  scope: GcpScope,
  serviceName: string,
  region: string,
  projectId: string
): Promise<boolean> {
  console.log(`Deleting Cloud Run service ${serviceName}...`);

  try {
    await gcloud(scope, [
      "run",
      "services",
      "delete",
      serviceName,
      "--region",
      region,
      "--project",
      projectId,
      "--quiet"
    ]);
    console.log(`Successfully deleted service ${serviceName}`);
    return true;
  } catch (e) {
    console.error(`Failed to delete service: ${e}`);
    return false;
  }
}

/**
 * Get information about a Cloud Run service.
 */
export async function getCloudRunService(
  scope: GcpScope,
  serviceName: string,
  region: string,
  projectId: string
): Promise<Record<string, unknown> | null> {
  try {
    const { stdout } = await gcloud(scope, [
      "run",
      "services",
      "describe",
      serviceName,
      "--region",
      region,
      "--project",
      projectId,
      "--format",
      "json"
    ]);
    return JSON.parse(stdout) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * List all Cloud Run services in a region.
 */
export async function listCloudRunServices(
  scope: GcpScope,
  region: string,
  projectId: string
): Promise<Record<string, unknown>[]> {
  try {
    const { stdout } = await gcloud(scope, [
      "run",
      "services",
      "list",
      "--region",
      region,
      "--project",
      projectId,
      "--format",
      "json"
    ]);
    return JSON.parse(stdout) as Record<string, unknown>[];
  } catch {
    return [];
  }
}

/**
 * Push a Docker image to Google Container Registry or Artifact Registry.
 *
 * Registry auth uses gcloud as a docker credential helper, configured into the
 * scratch DOCKER_CONFIG dir (`gcloud auth configure-docker` runs with the
 * scope's child env so it writes the scratch config, NOT host
 * `~/.docker/config.json`). The subsequent `docker tag`/`docker push` reuse the
 * same scratch DOCKER_CONFIG.
 */
export async function pushToGcr(
  scope: GcpScope,
  imageName: string,
  tag: string,
  projectId: string,
  registry = "gcr.io"
): Promise<string> {
  let fullImageUrl: string;

  if (registry === "gcr.io") {
    fullImageUrl = `gcr.io/${projectId}/${imageName}:${tag}`;
  } else {
    // Artifact Registry
    const region = registry.split("-")[0];
    const repoName = "nodetool";

    try {
      console.log(
        `Ensuring Artifact Registry repository '${repoName}' exists in ${region}...`
      );
      const result = await gcloud(scope, [
        "artifacts",
        "repositories",
        "create",
        repoName,
        "--repository-format=docker",
        "--location",
        region,
        "--project",
        projectId,
        "--quiet"
      ]);

      if (result.stdout || !result.stderr) {
        console.log(`Repository '${repoName}' created successfully`);
      }
    } catch {
      console.log(
        `Repository '${repoName}' already exists or creation skipped`
      );
    }

    fullImageUrl = `${registry}/${projectId}/${repoName}/${imageName}:${tag}`;
  }

  console.log(`Pushing image to ${registry}...`);

  // Configure Docker to use gcloud as credential helper. Runs with the scope's
  // env (DOCKER_CONFIG points into the scratch dir) so it never writes the host
  // ~/.docker/config.json.
  try {
    await gcloud(scope, ["auth", "configure-docker", "--quiet"]);
    if (registry.includes("pkg.dev")) {
      const registryHost = registry.split("/")[0];
      await gcloud(scope, [
        "auth",
        "configure-docker",
        registryHost,
        "--quiet"
      ]);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Failed to configure Docker authentication: ${msg}`);
  }

  // Tag and push the image through the scoped runner, carrying the scratch
  // DOCKER_CONFIG (set up by configure-docker above) in the child env.
  try {
    await scope.run("docker", ["tag", `${imageName}:${tag}`, fullImageUrl], {
      env: scope.env
    });
    await scope.run("docker", ["push", fullImageUrl], { env: scope.env });
    console.log(`Successfully pushed to ${registry}`);
    return fullImageUrl;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Failed to push image: ${msg}`);
  }
}

/** Build the env-vars YAML body for a scratch `--env-vars-file`. */
export function gcpEnvVarsToYaml(envVars: Record<string, string>): string {
  return envVarsToYaml(envVars);
}
