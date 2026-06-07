/**
 * RunPod Deployment Script for NodeTool Workflows
 *
 * Automates deployment of NodeTool services to RunPod serverless infrastructure:
 * 1. Builds a Docker container for RunPod execution
 * 2. Optionally creates RunPod templates and endpoints using the RunPod SDK
 *
 * Multi-tenant rule: ALL auth material is sourced from the per-user Secret store
 * via the caller's `DeploymentContext`, never from `process.env` or host auth
 * files. The RunPod API key reaches the in-process fetch() layer as an explicit
 * `RunpodAuth` argument; Docker registry credentials reach `docker login` /
 * `buildx --push` / `docker push` through a scratch-scoped `DockerAuth`
 * (DOCKER_CONFIG under the context scratch dir) — never `~/.docker/config.json`.
 *
 * Requirements:
 *   - Docker installed and running
 *   - RunPod API key (RUNPOD_API_KEY secret)
 *   - Docker registry credentials (DOCKER_USERNAME / DOCKER_PASSWORD secrets)
 */

import type { RunPodDeployment } from "./deployment-config.js";
import type { DockerAuth } from "./docker.js";
import {
  buildDockerImage,
  formatImageName,
  generateImageTag,
  pushToRegistry,
  runCommandArgs
} from "./docker.js";
import {
  createOrUpdateRunpodTemplate,
  createRunpodEndpointGraphql,
  type RunpodAuth
} from "./runpod-api.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Sanitize a name for use as Docker image name or RunPod template name.
 *
 * Converts to lowercase, replaces spaces and special characters with hyphens,
 * removes consecutive hyphens, and removes leading/trailing hyphens.
 */
export function sanitizeName(name: string): string {
  let sanitized = name.toLowerCase().replace(/[^a-zA-Z0-9-]/g, "-");
  sanitized = sanitized.replace(/-+/g, "-");
  sanitized = sanitized.replace(/^-+|-+$/g, "");
  return sanitized || "workflow";
}

// ---------------------------------------------------------------------------
// Docker username resolution
// ---------------------------------------------------------------------------

/**
 * Validate the Docker username for the multi-user path.
 *
 * The username is supplied EXPLICITLY by the caller — from the `DOCKER_USERNAME`
 * secret (via ctx.credentials) or `deployment.docker.username` in the config.
 * This function no longer reads `process.env.DOCKER_USERNAME` and no longer
 * consults `~/.docker/config.json`: both are host-ambient sources that would
 * cross tenant boundaries on a multi-user server.
 */
function getDockerUsername(
  dockerUsername: string | undefined,
  skipBuild: boolean,
  skipPush: boolean
): string | undefined {
  const username = dockerUsername ?? undefined;

  if (!username && !(skipBuild && skipPush)) {
    throw new Error(
      "Docker username is required for building and pushing images. " +
        "Provide it via the DOCKER_USERNAME secret or deployment.docker.username."
    );
  }

  if (username) {
    console.log(`Using Docker username: ${username}`);
  }

  return username;
}

// ---------------------------------------------------------------------------
// Deployment summary
// ---------------------------------------------------------------------------

function printDeploymentSummary(
  fullImageName: string,
  imageTag: string,
  platform: string,
  templateId: string | undefined,
  endpointId: string | undefined,
  deploymentPlatform = "RunPod"
): void {
  console.log(`\n${deploymentPlatform} Deployment completed successfully!`);
  console.log(`Image: ${fullImageName}:${imageTag}`);
  console.log(`Platform: ${platform}`);
  if (templateId) console.log(`Template ID: ${templateId}`);
  if (endpointId) console.log(`Endpoint ID: ${endpointId}`);
}

// ---------------------------------------------------------------------------
// Main deployment function
// ---------------------------------------------------------------------------

export interface DeployToRunpodOptions {
  deployment: RunPodDeployment;
  /**
   * Per-call RunPod API auth (Bearer token from ctx.credentials.RUNPOD_API_KEY,
   * plus optional non-secret base URL). Required — the in-process fetch() layer
   * receives this explicitly; the key never transits process.env.
   */
  auth: RunpodAuth;
  /**
   * Per-call Docker registry auth scoped to the context scratch dir. When
   * present, build/push run through the scoped runner with DOCKER_CONFIG
   * redirected to the scratch dir (multi-user path). When omitted, build/push
   * fall back to the host's ambient docker config (single-user CLI path).
   */
  dockerAuth?: DockerAuth;
  dockerUsername?: string;
  dockerRegistry?: string;
  imageName?: string;
  tag?: string;
  templateName?: string;
  platform?: string;
  gpuTypes?: string[];
  gpuCount?: number;
  dataCenters?: string[];
  workersMin?: number;
  workersMax?: number;
  idleTimeout?: number;
  executionTimeout?: number;
  flashboot?: boolean;
  skipBuild?: boolean;
  skipPush?: boolean;
  skipTemplate?: boolean;
  skipEndpoint?: boolean;
  noCache?: boolean;
  noAutoPush?: boolean;
  name?: string;
  env?: Record<string, string>;
}

/**
 * Deploy workflow or chat handler to RunPod serverless infrastructure.
 *
 * This is the main deployment function that orchestrates the entire deployment
 * process: build, push, template creation, and endpoint creation.
 */
export async function deployToRunpod(
  opts: DeployToRunpodOptions
): Promise<void> {
  const { deployment, auth, dockerAuth } = opts;
  const env: Record<string, string> = { ...(opts.env ?? {}) };

  let dockerUsername: string | undefined =
    opts.dockerUsername ?? deployment.docker.username ?? undefined;
  const dockerRegistry: string =
    opts.dockerRegistry ?? deployment.docker.registry ?? "docker.io";
  const imageName: string | undefined = opts.imageName ?? deployment.image.name;
  const platform: string =
    opts.platform ?? deployment.platform ?? "linux/amd64";
  let templateName: string | undefined =
    opts.templateName ?? opts.name ?? deployment.template_name ?? undefined;
  const computeType: string = deployment.compute_type ?? "GPU";

  const gpuTypes: string[] = opts.gpuTypes ?? deployment.gpu_types ?? [];
  const gpuCount: number | undefined =
    opts.gpuCount ?? deployment.gpu_count ?? undefined;
  const dataCenters: string[] =
    opts.dataCenters ?? deployment.data_centers ?? [];
  const workersMin: number = opts.workersMin ?? deployment.workers_min ?? 0;
  const workersMax: number = opts.workersMax ?? deployment.workers_max ?? 3;
  const idleTimeout: number = opts.idleTimeout ?? deployment.idle_timeout ?? 5;
  const executionTimeout: number | undefined =
    opts.executionTimeout ?? deployment.execution_timeout ?? undefined;
  const flashboot: boolean = opts.flashboot ?? deployment.flashboot ?? false;
  const networkVolumeId: string | undefined =
    deployment.network_volume_id ?? undefined;

  const skipBuild = opts.skipBuild ?? false;
  const skipPush = opts.skipPush ?? false;
  const skipTemplate = opts.skipTemplate ?? false;
  const skipEndpoint = opts.skipEndpoint ?? false;
  const noCache = opts.noCache ?? false;
  const noAutoPush = opts.noAutoPush ?? false;

  // Validate Docker username (explicit only — no process.env / host config).
  dockerUsername = getDockerUsername(dockerUsername, skipBuild, skipPush);

  // Generate unique tag if not provided
  let imageTag: string;
  if (opts.tag ?? deployment.image.tag) {
    imageTag = opts.tag ?? deployment.image.tag;
    console.log(`Using provided tag: ${imageTag}`);
  } else {
    imageTag = generateImageTag();
    console.log(`Generated unique tag: ${imageTag}`);
  }

  // Check if Docker is installed. The binary itself is host-installed and the
  // version probe carries no auth/credentials, so a plain (shell-free) exec is
  // fine here.
  if (!skipBuild) {
    try {
      runCommandArgs("docker", ["--version"], { captureOutput: true });
    } catch {
      console.error("Error: Docker is not installed or not running");
      throw new Error("Docker is not available");
    }
  }

  // Format full image name with registry and username
  if (!imageName) {
    throw new Error("Image name is required");
  }
  if (!dockerUsername) {
    throw new Error("Docker username is required");
  }

  const fullImageName = formatImageName(
    imageName,
    dockerUsername,
    dockerRegistry
  );
  console.log(`Full image name: ${fullImageName}`);

  templateName = templateName ?? imageName;
  console.log(`Using template name: ${templateName}`);

  let templateId: string | undefined;
  let endpointId: string | undefined;

  try {
    // Build Docker image. When dockerAuth is present (multi-user path) the
    // build runs through the scoped runner with DOCKER_CONFIG redirected to the
    // scratch dir; otherwise it falls back to the host's ambient docker config
    // (single-user CLI path).
    let imagePushedDuringBuild = false;
    if (!skipBuild) {
      imagePushedDuringBuild = await buildDockerImage({
        imageName: fullImageName,
        tag: imageTag,
        platform,
        useCache: !noCache,
        autoPush: !noAutoPush,
        auth: dockerAuth
      });
    }

    // Push to registry if needed
    if (!skipPush && !imagePushedDuringBuild) {
      await pushToRegistry(fullImageName, imageTag, dockerRegistry, dockerAuth);
    } else if (imagePushedDuringBuild) {
      console.log(
        `Image ${fullImageName}:${imageTag} already pushed during optimized build`
      );
    }

    // Create or update RunPod template
    if (!skipTemplate) {
      env.PORT = "8000";
      env.PORT_HEALTH = "8000";
      if (!env.NODETOOL_SERVER_MODE) {
        env.NODETOOL_SERVER_MODE = "private";
      }

      // Configure paths from persistent_paths if available
      const persistentPaths = deployment.persistent_paths;
      if (persistentPaths) {
        if (!env.USERS_FILE) env.USERS_FILE = persistentPaths.users_file;
        if (!env.DB_PATH) env.DB_PATH = persistentPaths.db_path;
        if (!env.CHROMA_PATH) env.CHROMA_PATH = persistentPaths.chroma_path;
        if (!env.HF_HOME) env.HF_HOME = persistentPaths.hf_cache;
        if (!env.ASSET_BUCKET) env.ASSET_BUCKET = persistentPaths.asset_bucket;
        if (!env.AUTH_PROVIDER) env.AUTH_PROVIDER = "multi_user";
      } else {
        if (!env.AUTH_PROVIDER) env.AUTH_PROVIDER = "static";
      }

      templateId = await createOrUpdateRunpodTemplate(
        templateName,
        fullImageName,
        imageTag,
        auth,
        env
      );
    }

    // Create RunPod endpoint
    if (!skipEndpoint && templateId) {
      const gpuTypeIds = gpuTypes.length > 0 ? gpuTypes : undefined;
      const dataCenterIds = dataCenters.length > 0 ? dataCenters : undefined;

      if (!opts.name) {
        throw new Error("Name is required for endpoint creation");
      }

      endpointId = await createRunpodEndpointGraphql({
        auth,
        templateId,
        name: opts.name,
        computeType,
        gpuTypeIds,
        gpuCount,
        dataCenterIds,
        workersMin,
        workersMax,
        idleTimeout,
        executionTimeoutMs: executionTimeout,
        flashboot,
        networkVolumeId
      });
    }

    // Print deployment summary
    printDeploymentSummary(
      fullImageName,
      imageTag,
      platform,
      templateId,
      endpointId,
      "RunPod"
    );
  } catch (err) {
    console.error("Deployment failed:", err);
    throw err;
  }
}
