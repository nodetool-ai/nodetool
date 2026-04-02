/**
 * Docker run command generation for self-hosted deployments.
 *
 * This module generates docker run commands from deployment configuration,
 * supporting GPU assignments, volume mounts, and environment variables.
 */

import * as crypto from "node:crypto";

import { shellEscape } from "./docker.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const INTERNAL_API_PORT = 7777;
export const APP_ENV_PORT = 8000;

// ---------------------------------------------------------------------------
// Deployment configuration types (local to docker-run, not exported to
// avoid clashing with the canonical types in deployment-config.ts)
// ---------------------------------------------------------------------------

/** Persistent storage paths for deployment data. */
interface PersistentPaths {
  usersFile: string;
  dbPath: string;
  chromaPath: string;
  hfCache: string;
  assetBucket: string;
  logsPath?: string;
}

/** Paths on the remote server. */
interface ServerPaths {
  workspace: string;
  hfCache: string;
}

/** Docker container configuration. */
interface ContainerConfig {
  name: string;
  port: number;
  gpu?: string;
  environment?: Record<string, string>;
  workflows?: string[];
}

/** Docker image configuration. */
interface ImageConfig {
  name: string;
  tag: string;
  registry: string;
}

/** Compute the full image name (name:tag). */
export function imageFullName(image: ImageConfig): string {
  if (image.name.includes("@")) return image.name;
  const lastSegment = image.name.split("/").pop() ?? image.name;
  if (lastSegment.includes(":")) return image.name;
  return `${image.name}:${image.tag}`;
}

/** Deployment shape expected by DockerRunGenerator (camelCase accessors). */
export interface DockerRunDeployment {
  image: ImageConfig;
  container: ContainerConfig;
  paths: ServerPaths;
  persistentPaths?: PersistentPaths;
  serverAuthToken?: string;
}

// ---------------------------------------------------------------------------
// Safe shlex quote (allows ~/...)
// ---------------------------------------------------------------------------

function safeShellQuote(s: string): string {
  if (s.startsWith("~/")) {
    return "~/" + shellEscape(s.slice(2));
  }
  return shellEscape(s);
}

// ---------------------------------------------------------------------------
// DockerRunGenerator
// ---------------------------------------------------------------------------

/**
 * Generates docker run command from deployment settings.
 *
 * Handles conversion of NodeTool deployment configuration into a docker run
 * command suitable for single container deployment.
 */
export class DockerRunGenerator {
  public readonly deployment: DockerRunDeployment;
  public readonly container: ContainerConfig;
  public readonly runtimeCommand: string;

  constructor(
    deployment: DockerRunDeployment,
    runtimeCommand: string = "docker"
  ) {
    this.deployment = deployment;
    this.container = deployment.container;
    this.runtimeCommand = runtimeCommand;
  }

  /** Generate docker run command as a string. */
  generateCommand(): string {
    const parts: string[] = [`${shellEscape(this.runtimeCommand)} run`];

    // Detached mode
    parts.push("-d");

    // Container name
    const containerName = `nodetool-${this.container.name}`;
    parts.push(`--name ${shellEscape(containerName)}`);

    // Restart policy
    parts.push("--restart unless-stopped");

    // Port mapping
    const hostPort = this.resolveHostPort();
    parts.push(`-p ${hostPort}:${INTERNAL_API_PORT}`);

    // Volume mounts
    for (const volume of this.buildVolumes()) {
      parts.push(`-v ${volume}`);
    }

    // Environment variables
    for (const env of this.buildEnvironment()) {
      parts.push(`-e ${env}`);
    }

    // GPU configuration
    if (this.container.gpu) {
      const gpuArgs = this.buildGpuArgs();
      parts.push(...gpuArgs);
    }

    // Health check
    const healthcheck =
      `--health-cmd="curl -f http://localhost:${INTERNAL_API_PORT}/health || exit 1" ` +
      "--health-interval=30s " +
      "--health-timeout=10s " +
      "--health-retries=3 " +
      "--health-start-period=40s";
    parts.push(healthcheck);

    // Image name
    parts.push(shellEscape(imageFullName(this.deployment.image)));

    return parts.join(" \\\n  ");
  }

  /**
   * Generate a hash of the docker run configuration.
   * Can be used to detect changes in the configuration.
   */
  generateHash(): string {
    const configDict = {
      image: imageFullName(this.deployment.image),
      container_name: this.container.name,
      port: this.resolveHostPort(),
      volumes: this.buildVolumes(),
      environment: this.buildEnvironment().sort(),
      gpu: this.container.gpu ?? null
    };
    const configStr = JSON.stringify(
      configDict,
      Object.keys(configDict).sort()
    );
    return crypto.createHash("sha256").update(configStr).digest("hex");
  }

  /** Get the full container name. */
  getContainerName(): string {
    return `nodetool-${this.container.name}`;
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private buildVolumes(): string[] {
    const volumes: string[] = [];

    // Workspace volume (read-write)
    const workspacePath = this.deployment.paths.workspace;
    volumes.push(`${workspacePath}:/workspace`);

    // HuggingFace cache volume
    const persistentPaths = this.deployment.persistentPaths;
    if (persistentPaths) {
      volumes.push(`${this.deployment.paths.hfCache}:/hf-cache`);
    } else {
      volumes.push(`${this.deployment.paths.hfCache}:/hf-cache:ro`);
    }

    return volumes.map(safeShellQuote);
  }

  private buildEnvironment(): string[] {
    // Start with container environment
    const env: Record<string, string> = {
      ...(this.container.environment ?? {})
    };

    // Add container-specific settings
    env["PORT"] = String(APP_ENV_PORT);
    env["NODETOOL_API_URL"] = `http://localhost:${this.container.port}`;
    env["NODETOOL_SERVER_MODE"] = "private";

    // Configure paths from persistentPaths if available
    const persistentPaths = this.deployment.persistentPaths;
    if (persistentPaths) {
      env["USERS_FILE"] = persistentPaths.usersFile;
      env["DB_PATH"] = persistentPaths.dbPath;
      env["CHROMA_PATH"] = persistentPaths.chromaPath;
      env["HF_HOME"] = persistentPaths.hfCache;
      env["ASSET_BUCKET"] = persistentPaths.assetBucket;
      env["AUTH_PROVIDER"] = "multi_user";
    } else {
      env["DB_PATH"] = "/workspace/nodetool.db";
      env["HF_HOME"] = "/hf-cache";
      if (!env["AUTH_PROVIDER"]) {
        env["AUTH_PROVIDER"] = "static";
      }
    }

    // Add workflow IDs if specified
    if (this.container.workflows && this.container.workflows.length > 0) {
      env["NODETOOL_WORKFLOWS"] = this.container.workflows.join(",");
    }

    // Add authentication token for self-hosted deployments
    if (this.deployment.serverAuthToken) {
      env["SERVER_AUTH_TOKEN"] = this.deployment.serverAuthToken;
    }

    // Convert to KEY=value format and quote
    return Object.entries(env).map(([key, value]) =>
      safeShellQuote(`${key}=${value}`)
    );
  }

  private resolveHostPort(): number {
    const hostPort = this.container.port || APP_ENV_PORT;
    if (hostPort === INTERNAL_API_PORT) {
      return APP_ENV_PORT;
    }
    return hostPort;
  }

  private buildGpuArgs(): string[] {
    if (!this.container.gpu) return [];

    const gpuIds = this.container.gpu.trim();
    // Format: --gpus '"device=0,1"' for multiple GPUs
    const quotedDevice = shellEscape(`"device=${gpuIds}"`);
    return [`--gpus ${quotedDevice}`];
  }
}

// ---------------------------------------------------------------------------
// Convenience functions
// ---------------------------------------------------------------------------

/**
 * Generate docker run command from deployment configuration.
 */
export function generateDockerRunCommand(
  deployment: DockerRunDeployment
): string {
  const generator = new DockerRunGenerator(deployment);
  return generator.generateCommand();
}

/**
 * Get hash of the docker run configuration for change detection.
 */
export function getDockerRunHash(deployment: DockerRunDeployment): string {
  const generator = new DockerRunGenerator(deployment);
  return generator.generateHash();
}

/**
 * Get the container name for the deployment.
 */
export function getContainerName(deployment: DockerRunDeployment): string {
  const generator = new DockerRunGenerator(deployment);
  return generator.getContainerName();
}
