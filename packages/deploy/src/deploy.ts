/**
 * Generic Deployment Module
 *
 * This module provides generic deployment functionality that can be shared
 * across different deployment targets (RunPod, local, etc.).
 *
 * Key Features:
 * - Docker image management
 * - Environment variable handling
 * - Local testing capabilities
 * - Common deployment utilities
 */

/** Function that runs a shell command (provided by the caller). */
export type RunCommandFn = (command: string) => void;

/**
 * Run a Docker container locally instead of deploying to a remote platform.
 *
 * @param fullImageName - Full Docker image name with registry/username
 * @param imageTag - Docker image tag
 * @param runCommand - Function to execute shell commands
 */
export function runLocalDocker(
  fullImageName: string,
  imageTag: string,
  runCommand: RunCommandFn
): void {
  console.log("Starting local Docker container...");

  const dockerRunCmd = [
    "docker",
    "run",
    "-d",
    "-p",
    "8000:8000",
    `${fullImageName}:${imageTag}`
  ];

  runCommand(dockerRunCmd.join(" "));
  console.log("Local Docker container started successfully!");
  console.log("API available at: http://localhost:8000");
  console.log(
    `To stop the container: docker stop ${fullImageName}:${imageTag}`
  );
  console.log(
    `To remove the container: docker rm ${fullImageName}:${imageTag}`
  );
}

/**
 * Optional single-user fallback to read a Docker username from a host config
 * file. Multi-user callers MUST pass the username explicitly (from the
 * DOCKER_USERNAME secret or the deployment config) and leave this undefined —
 * the deploy package never reads host docker config in the per-user path.
 */
export type GetDockerUsernameFromConfigFn = (registry: string) => string | null;

/**
 * Resolve the Docker username for a build/push.
 *
 * Multi-user path: the username comes from `opts.dockerUsername` (the
 * DOCKER_USERNAME secret or `deployment.docker.username`). No `process.env` and
 * no host docker-config reads.
 *
 * Single-user CLI fallback (explicitly gated by `opts.singleUserFallback`):
 * also consult `process.env.DOCKER_USERNAME` and, if provided, a host
 * config-file reader. This branch is the only place ambient host identity is
 * permitted, and only when the caller opts in.
 *
 * @returns Docker username or null if not needed.
 * @throws Error if a username is required (build/push not both skipped) but not found.
 */
export function getDockerUsername(opts: {
  dockerUsername?: string;
  dockerRegistry?: string;
  skipBuild?: boolean;
  skipPush?: boolean;
  /** Explicit opt-in to host-env / host-config fallbacks (CLI single-user). */
  singleUserFallback?: boolean;
  /** Host-config reader, used ONLY when `singleUserFallback` is true. */
  getDockerUsernameFromConfig?: GetDockerUsernameFromConfigFn;
}): string | null {
  const {
    dockerUsername,
    dockerRegistry = "docker.io",
    skipBuild = false,
    skipPush = false,
    singleUserFallback = false,
    getDockerUsernameFromConfig
  } = opts;

  let username = dockerUsername || undefined;

  if (!username && singleUserFallback) {
    username =
      process.env["DOCKER_USERNAME"] ||
      getDockerUsernameFromConfig?.(dockerRegistry) ||
      undefined;
  }

  if (!username && !(skipBuild && skipPush)) {
    const message = [
      "Error: Docker username is required for building and pushing images.",
      "Set a DOCKER_USERNAME secret or configure docker.username on the deployment."
    ].join("\n");
    throw new Error(message);
  }

  if (username) {
    console.log(`Using Docker username: ${username}`);
  }

  return username ?? null;
}

/**
 * Print a summary of the deployment results.
 */
export function printDeploymentSummary(opts: {
  fullImageName: string;
  imageTag: string;
  platform: string;
  templateId?: string;
  endpointId?: string;
  deploymentPlatform?: string;
}): void {
  const {
    fullImageName,
    imageTag,
    platform,
    templateId,
    endpointId,
    deploymentPlatform = "RunPod"
  } = opts;

  console.log(`\n${deploymentPlatform} Deployment completed successfully!`);
  console.log(`Image: ${fullImageName}:${imageTag}`);
  console.log(`Platform: ${platform}`);

  if (templateId) {
    console.log(`Template ID: ${templateId}`);
  }

  if (endpointId) {
    console.log(`Endpoint ID: ${endpointId}`);
  }
}
