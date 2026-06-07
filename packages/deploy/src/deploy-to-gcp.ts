/**
 * Google Cloud Run Deployment Script for NodeTool Workflows
 *
 * Automates the deployment of NodeTool services to Google Cloud Run:
 * 1. Builds a Docker container for Cloud Run execution
 * 2. Pushes the image to Google Container Registry or Artifact Registry
 * 3. Deploys the service to Google Cloud Run
 *
 * Multi-tenant rule: every gcloud/docker call runs through the per-operation
 * {@link GcpScope} (scratch SA key + scratch CLOUDSDK_CONFIG/DOCKER_CONFIG) —
 * no ambient gcloud auth, no host docker config. Env vars for the service are
 * written to a 0600 scratch file and passed via `--env-vars-file` so values
 * never appear in argv.
 *
 * Ported from nodetool.deploy.deploy_to_gcp (Python).
 */

import type { GCPDeployment } from "./deployment-config.js";
import type { DeploymentContext } from "./deployment-context.js";
import { writeScratchFile } from "./deployment-context.js";

import {
  deployToCloudRun,
  enableRequiredApis,
  ensureCloudRunPermissions,
  ensureGcloudAuth,
  ensureProjectSet,
  pushToGcr,
  deleteCloudRunService,
  listCloudRunServices,
  gcpEnvVarsToYaml,
  type GcpScope
} from "./google-cloud-run-api.js";

import type { DockerAuth } from "./docker.js";
import { buildDockerImage } from "./docker.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Sanitize a name for use as Cloud Run service name.
 *
 * Cloud Run service names must:
 * - Start with a letter
 * - Contain only lowercase letters, numbers, and hyphens
 * - Be 63 characters or less
 * - End with a letter or number
 */
export function sanitizeServiceName(name: string): string {
  // Convert to lowercase and replace invalid chars with hyphens
  let sanitized = name.toLowerCase().replace(/[^a-z0-9-]/g, "-");

  // Remove consecutive hyphens
  sanitized = sanitized.replace(/-+/g, "-");

  // Ensure it starts with a letter
  if (sanitized.length > 0 && !/^[a-z]/.test(sanitized)) {
    sanitized = "svc-" + sanitized;
  }

  // Remove leading/trailing hyphens
  sanitized = sanitized.replace(/^-+|-+$/g, "");

  // Ensure it ends with alphanumeric
  if (sanitized.length > 0 && !/[a-z0-9]$/.test(sanitized)) {
    sanitized = sanitized.replace(/-+$/, "");
  }

  // Truncate to 63 characters
  if (sanitized.length > 63) {
    sanitized = sanitized.slice(0, 60) + "svc";
  }

  // Ensure it's not empty
  if (!sanitized) {
    sanitized = "nodetool-svc";
  }

  return sanitized;
}

/**
 * Infer Artifact Registry URL from region.
 */
export function inferRegistryFromRegion(region: string): string {
  return `${region}-docker.pkg.dev`;
}

/**
 * Get the default environment variables for a GCP deployment.
 */
export function getGcpDefaultEnv(
  deployment: GCPDeployment
): Record<string, string> {
  const env: Record<string, string> = {};
  const gcsBucket = deployment.storage?.gcs_bucket ?? null;
  const gcsMountPath = deployment.storage?.gcs_mount_path ?? "/mnt/gcs";

  env["NODETOOL_SERVER_MODE"] = "private";
  env["HF_HOME"] = gcsBucket
    ? `${gcsMountPath}/.cache/huggingface`
    : "/workspace/.cache/huggingface";
  env["HF_HUB_CACHE"] = gcsBucket
    ? `${gcsMountPath}/.cache/huggingface/hub`
    : "/workspace/.cache/huggingface/hub";
  env["TRANSFORMERS_CACHE"] = gcsBucket
    ? `${gcsMountPath}/.cache/transformers`
    : "/workspace/.cache/transformers";
  env["OLLAMA_MODELS"] = gcsBucket
    ? `${gcsMountPath}/.ollama/models`
    : "/workspace/.ollama/models";

  const persistentPaths = deployment.persistent_paths;
  if (persistentPaths) {
    env["USERS_FILE"] = persistentPaths.users_file;
    env["DB_PATH"] = persistentPaths.db_path;
    env["CHROMA_PATH"] = persistentPaths.chroma_path;
    env["ASSET_BUCKET"] = persistentPaths.asset_bucket;
    env["AUTH_PROVIDER"] = "multi_user";
  } else {
    env["AUTH_PROVIDER"] = "static";
  }

  return env;
}

// ---------------------------------------------------------------------------
// Main deploy function
// ---------------------------------------------------------------------------

export interface DeployToGcpOptions {
  /** Per-user deployment context (carries scratchDir for the env-vars file). */
  ctx: DeploymentContext;
  /** Per-operation GCP auth/exec envelope (scratch SA key + config dirs). */
  scope: GcpScope;
  deployment: GCPDeployment;
  env?: Record<string, string>;
  skipBuild?: boolean;
  skipPush?: boolean;
  skipDeploy?: boolean;
  noCache?: boolean;
  skipPermissionSetup?: boolean;
  /**
   * Optional registry auth for the local Docker build (multi-user path). When
   * provided, build runs through the scoped runner with DOCKER_CONFIG redirected
   * to the scratch dir. When omitted (single-user CLI path), build falls back to
   * the host's ambient docker config.
   */
  dockerAuth?: DockerAuth;
}

/**
 * Deploy nodetool service to Google Cloud Run infrastructure.
 *
 * This is the main deployment function that orchestrates the entire process.
 */
export async function deployToGcp(options: DeployToGcpOptions): Promise<void> {
  const {
    ctx,
    scope,
    deployment,
    env: envInput,
    skipBuild = false,
    skipPush = false,
    skipDeploy = false,
    noCache = false,
    skipPermissionSetup = false,
    dockerAuth
  } = options;

  const env: Record<string, string> = envInput ? { ...envInput } : {};

  let serviceName = deployment.service_name;
  let projectId = deployment.project_id;
  const region = deployment.region;
  let registry: string | undefined = deployment.image.registry;
  const cpu = deployment.resources.cpu;
  const memory = deployment.resources.memory;
  const gpuType = deployment.resources.gpu_type ?? null;
  const gpuCount = deployment.resources.gpu_count ?? (gpuType ? 1 : 0);
  const minInstances = deployment.resources.min_instances;
  const maxInstances = deployment.resources.max_instances;
  const concurrency = deployment.resources.concurrency;
  const timeout = deployment.resources.timeout;
  const allowUnauthenticated = deployment.iam.allow_unauthenticated;
  let imageName = deployment.image.repository;
  const tag = deployment.image.tag;
  const platform = deployment.image.build.platform;
  const serviceAccount = deployment.iam.service_account ?? null;
  const gcsBucket = deployment.storage?.gcs_bucket ?? null;
  const gcsMountPath = deployment.storage?.gcs_mount_path ?? "/mnt/gcs";

  // Sanitize service name for Cloud Run
  serviceName = sanitizeServiceName(serviceName);
  console.log(`Using service name: ${serviceName}`);

  // Ensure Google Cloud authentication and configuration (scoped SA key).
  await ensureGcloudAuth(scope);
  projectId = await ensureProjectSet(scope, projectId);
  console.log(`Using project: ${projectId}`);

  // Enable required APIs
  await enableRequiredApis(scope, projectId);

  // Ensure Cloud Run permissions (skipped automatically in multi-user mode).
  if (!skipPermissionSetup) {
    await ensureCloudRunPermissions(scope, projectId, serviceAccount);
  } else {
    console.warn("Skipping automatic permission setup");
  }

  // Infer registry from region if not provided
  if (!registry) {
    registry = inferRegistryFromRegion(region);
    console.log(`Inferred registry from region: ${registry}`);
  } else {
    console.log(`Using provided registry: ${registry}`);
  }

  const imageTag = tag;
  console.log(`Using provided tag: ${imageTag}`);

  // Use service name as image name if not provided
  if (!imageName) {
    imageName = serviceName;
  }

  const localImageName = `${registry}/${projectId}/${imageName}`;

  // Check if Docker is running (through the scoped runner so no host env leaks).
  if (!skipBuild) {
    try {
      await scope.run("docker", ["--version"], { env: scope.env });
    } catch {
      throw new Error("Docker is not installed or not running");
    }
  }

  console.log(`Local image name: ${localImageName}`);

  let deploymentInfo: Record<string, unknown> | null = null;

  try {
    // Build Docker image
    if (!skipBuild) {
      await buildDockerImage({
        imageName: localImageName,
        tag: imageTag,
        platform,
        useCache: !noCache,
        autoPush: false, // Always disable auto_push for GCP to keep image local
        auth: dockerAuth
      });
    }

    // Push to Google Container Registry
    let gcpImageUrl: string | null = null;
    if (!skipPush) {
      gcpImageUrl = await pushToGcr(
        scope,
        localImageName,
        imageTag,
        projectId,
        registry
      );
      console.log(`Image pushed to registry: ${gcpImageUrl}`);
    }

    // Set default cache envs (respect provided values)
    const defaultEnv = getGcpDefaultEnv(deployment);
    for (const [key, value] of Object.entries(defaultEnv)) {
      if (!(key in env)) {
        env[key] = value;
      }
    }

    // Deploy to Cloud Run
    if (!skipDeploy && gcpImageUrl) {
      console.log("Deploying to Cloud Run...");

      // Write the env vars to a 0600 scratch file and pass via
      // --env-vars-file so no value lands in argv (ps/proc-visible).
      let envVarsFile: string | undefined;
      if (Object.keys(env).length > 0) {
        envVarsFile = await writeScratchFile(
          ctx,
          "gcloud/env-vars.yaml",
          gcpEnvVarsToYaml(env)
        );
      }

      deploymentInfo = await deployToCloudRun({
        scope,
        serviceName,
        imageUrl: gcpImageUrl,
        region,
        projectId,
        port: 8000,
        cpu,
        memory,
        gpuType,
        gpuCount,
        minInstances,
        maxInstances,
        concurrency,
        timeout,
        allowUnauthenticated,
        envVars: env,
        envVarsFile,
        serviceAccount,
        gcsBucket,
        gcsMountPath
      });
    }

    // Print deployment summary
    printGcpDeploymentSummary({
      imageName: localImageName,
      imageTag,
      gcpImageUrl,
      serviceName,
      region,
      projectId,
      deploymentInfo
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`Deployment failed: ${msg}`);
    if (e instanceof Error && e.stack) {
      console.error(e.stack);
    }
    throw new Error(`GCP deployment failed: ${msg}`);
  }
}

// ---------------------------------------------------------------------------
// Summary printer
// ---------------------------------------------------------------------------

interface DeploymentSummaryOptions {
  imageName: string;
  imageTag: string;
  gcpImageUrl: string | null;
  serviceName: string;
  region: string;
  projectId: string;
  deploymentInfo?: Record<string, unknown> | null;
}

/**
 * Print a summary of the Google Cloud Run deployment results.
 */
export function printGcpDeploymentSummary(
  opts: DeploymentSummaryOptions
): void {
  console.log("\nGoogle Cloud Run Deployment completed successfully!");
  console.log(`Local Image: ${opts.imageName}:${opts.imageTag}`);
  if (opts.gcpImageUrl) {
    console.log(`GCP Image: ${opts.gcpImageUrl}`);
  }
  console.log(`Project: ${opts.projectId}`);
  console.log(`Region: ${opts.region}`);
  console.log(`Service: ${opts.serviceName}`);

  if (opts.deploymentInfo) {
    const status = opts.deploymentInfo["status"] as
      | Record<string, unknown>
      | undefined;
    const serviceUrl = status?.["url"];
    if (serviceUrl) {
      console.log(`Service URL: ${serviceUrl}`);
      console.log(
        `Console: https://console.cloud.google.com/run/detail/${opts.region}/${opts.serviceName}/metrics?project=${opts.projectId}`
      );
    }
  }

  console.log("\nDeployment ready for use!");
}

// ---------------------------------------------------------------------------
// Service management helpers
// ---------------------------------------------------------------------------

/**
 * Delete a Google Cloud Run service.
 */
export async function deleteGcpService(
  scope: GcpScope,
  serviceName: string,
  region = "us-central1",
  projectId?: string | null
): Promise<boolean> {
  await ensureGcloudAuth(scope);
  const resolvedProjectId = await ensureProjectSet(scope, projectId);
  const sanitizedName = sanitizeServiceName(serviceName);
  return deleteCloudRunService(scope, sanitizedName, region, resolvedProjectId);
}

/**
 * List Google Cloud Run services.
 */
export async function listGcpServices(
  scope: GcpScope,
  region = "us-central1",
  projectId?: string | null
): Promise<Record<string, unknown>[]> {
  await ensureGcloudAuth(scope);
  const resolvedProjectId = await ensureProjectSet(scope, projectId);
  return listCloudRunServices(scope, region, resolvedProjectId);
}
