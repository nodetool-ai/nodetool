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

/** Function to retrieve Docker username from config file. */
export type GetDockerUsernameFromConfigFn = (registry: string) => string | null;

/**
 * Get Docker username from multiple sources with validation.
 *
 * @param opts.dockerUsername - Explicit username from command line
 * @param opts.dockerRegistry - Docker registry URL (default: "docker.io")
 * @param opts.skipBuild - Whether build is being skipped
 * @param opts.skipPush - Whether push is being skipped
 * @param opts.getDockerUsernameFromConfig - Function to read username from Docker config
 * @returns Docker username or null if not needed
 * @throws Error if username is required but not found
 */
export function getDockerUsername(opts: {
  dockerUsername?: string;
  dockerRegistry?: string;
  skipBuild?: boolean;
  skipPush?: boolean;
  getDockerUsernameFromConfig: GetDockerUsernameFromConfigFn;
}): string | null {
  const {
    dockerUsername,
    dockerRegistry = "docker.io",
    skipBuild = false,
    skipPush = false,
    getDockerUsernameFromConfig
  } = opts;

  const username =
    dockerUsername ||
    process.env["DOCKER_USERNAME"] ||
    getDockerUsernameFromConfig(dockerRegistry);

  if (!username && !(skipBuild && skipPush)) {
    const message = [
      "Error: Docker username is required for building and pushing images.",
      "Provide it via one of these methods:",
      "1. Command line: --docker-username myusername",
      "2. Environment variable: export DOCKER_USERNAME=myusername",
      "3. Docker login: docker login (will be read from ~/.docker/config.json)"
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
