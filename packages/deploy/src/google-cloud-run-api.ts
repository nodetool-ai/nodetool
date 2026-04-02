/**
 * Google Cloud Run API Module
 *
 * Provides a clean interface to Google Cloud Run API for managing
 * services and deployments. Handles authentication, request/response processing,
 * and error handling for all Cloud Run operations.
 *
 * Ported from nodetool.deploy.google_cloud_run_api (Python).
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

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
// Helper — run gcloud commands
// ---------------------------------------------------------------------------

interface ExecResult {
  stdout: string;
  stderr: string;
}

async function gcloud(args: string[]): Promise<ExecResult> {
  return execFileAsync("gcloud", args);
}

// ---------------------------------------------------------------------------
// Authentication & Project helpers
// ---------------------------------------------------------------------------

/**
 * Check if gcloud CLI is authenticated.
 */
export async function checkGcloudAuth(): Promise<boolean> {
  try {
    const { stdout } = await gcloud([
      "auth",
      "list",
      "--filter=status:ACTIVE",
      "--format=value(account)"
    ]);
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * Ensure gcloud CLI is authenticated and configured.
 * Throws if authentication fails or gcloud is not installed.
 */
export async function ensureGcloudAuth(): Promise<void> {
  // Check if gcloud is installed
  try {
    await gcloud(["--version"]);
  } catch {
    console.error("Google Cloud SDK (gcloud) is not installed");
    console.error("Install it from: https://cloud.google.com/sdk/docs/install");
    throw new Error("gcloud CLI not installed");
  }

  // Check authentication
  if (!(await checkGcloudAuth())) {
    console.warn("Not authenticated with Google Cloud");
    console.warn("Run: gcloud auth login");
    throw new Error(
      "Not authenticated with Google Cloud. Run `gcloud auth login`."
    );
  }
}

/**
 * Get the default Google Cloud project.
 */
export async function getDefaultProject(): Promise<string | null> {
  try {
    const { stdout } = await gcloud(["config", "get-value", "project"]);
    const project = stdout.trim();
    return project && project !== "(unset)" ? project : null;
  } catch {
    return null;
  }
}

/**
 * Ensure the current user has required Cloud Run permissions.
 */
export async function ensureCloudRunPermissions(
  projectId: string,
  serviceAccount?: string | null
): Promise<void> {
  try {
    const { stdout } = await gcloud(["config", "get-value", "account"]);
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
        await gcloud([
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
 * Ensure a Google Cloud project is set.
 * Returns the project ID.
 */
export async function ensureProjectSet(
  projectId?: string | null
): Promise<string> {
  if (projectId) return projectId;

  const project = await getDefaultProject();
  if (!project) {
    throw new Error(
      "No Google Cloud project configured. Set a project with: gcloud config set project YOUR_PROJECT_ID"
    );
  }

  return project;
}

/**
 * Enable required Google Cloud APIs.
 */
export async function enableRequiredApis(projectId: string): Promise<void> {
  const requiredApis = [
    "run.googleapis.com",
    "cloudbuild.googleapis.com",
    "containerregistry.googleapis.com",
    "artifactregistry.googleapis.com"
  ];

  console.log("Enabling required APIs...");

  for (const api of requiredApis) {
    try {
      await gcloud(["services", "enable", api, "--project", projectId]);
      console.log(`Enabled ${api}`);
    } catch (e) {
      console.warn(`Failed to enable ${api}: ${e}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Service deployment
// ---------------------------------------------------------------------------

export interface DeployToCloudRunOptions {
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
}

/**
 * Deploy a service to Google Cloud Run.
 * Creates a new service or updates an existing one.
 */
export async function deployToCloudRun(
  options: DeployToCloudRunOptions
): Promise<Record<string, unknown>> {
  const {
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
    gcsMountPath = "/mnt/gcs"
  } = options;

  console.log(`Deploying ${serviceName} to Cloud Run...`);

  // Determine whether to create (deploy) or update existing service
  let existingService: Record<string, unknown> | null;
  try {
    existingService = await getCloudRunService(serviceName, region, projectId);
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
    if (envVars) {
      for (const [key, value] of Object.entries(envVars)) {
        cmd.push("--set-env-vars", `${key}=${value}`);
      }
    }
    if (serviceAccount) {
      cmd.push("--service-account", serviceAccount);
      console.log(`Using service account: ${serviceAccount}`);
    }
    if (allowUnauthenticated) {
      cmd.push("--allow-unauthenticated");
    }

    try {
      const { stdout } = await gcloud(cmd);
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
    if (envVars) {
      for (const [key, value] of Object.entries(envVars)) {
        cmd.push("--set-env-vars", `${key}=${value}`);
      }
    }
    if (serviceAccount) {
      cmd.push("--service-account", serviceAccount);
    }

    try {
      const { stdout } = await gcloud(cmd);
      const deploymentInfo = JSON.parse(stdout) as Record<string, unknown>;

      // Handle unauthenticated access post-update
      if (allowUnauthenticated) {
        try {
          await gcloud([
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
  serviceName: string,
  region: string,
  projectId: string
): Promise<boolean> {
  console.log(`Deleting Cloud Run service ${serviceName}...`);

  try {
    await gcloud([
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
  serviceName: string,
  region: string,
  projectId: string
): Promise<Record<string, unknown> | null> {
  try {
    const { stdout } = await gcloud([
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
  region: string,
  projectId: string
): Promise<Record<string, unknown>[]> {
  try {
    const { stdout } = await gcloud([
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
 */
export async function pushToGcr(
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
      const result = await execFileAsync("gcloud", [
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

  // Configure Docker to use gcloud as credential helper
  try {
    await execFileAsync("gcloud", ["auth", "configure-docker", "--quiet"]);
    if (registry.includes("pkg.dev")) {
      const registryHost = registry.split("/")[0];
      await execFileAsync("gcloud", [
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

  // Tag and push the image
  try {
    await execFileAsync("docker", ["tag", `${imageName}:${tag}`, fullImageUrl]);
    await execFileAsync("docker", ["push", fullImageUrl]);
    console.log(`Successfully pushed to ${registry}`);
    return fullImageUrl;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Failed to push image: ${msg}`);
  }
}
