/**
 * Non-interactive configuration helpers for deployments.
 *
 * Instead of interactive prompts (click.prompt / click.confirm from Python),
 * these functions accept typed config parameter objects.
 */

import { homedir } from "node:os";
import { join } from "node:path";
import type {
  DockerDeployment,
  RunPodDeployment,
  GCPDeployment
} from "./deployment-config.js";
import {
  DockerDeploymentSchema,
  RunPodDeploymentSchema,
  GCPDeploymentSchema
} from "./deployment-config.js";

// ============================================================================
// Common helper
// ============================================================================

/**
 * Detect the default HuggingFace cache directory.
 *
 * Checks the HF_HOME / HF_HUB_CACHE env vars, falling back to
 * ~/.cache/huggingface/hub.
 */
export function detectHfCacheDefault(): string {
  if (process.env["HF_HUB_CACHE"]) {
    return process.env["HF_HUB_CACHE"];
  }
  if (process.env["HF_HOME"]) {
    return join(process.env["HF_HOME"], "hub");
  }
  return join(homedir(), ".cache", "huggingface", "hub");
}

// ============================================================================
// Docker configuration
// ============================================================================

export interface DockerConfigParams {
  /** Remote host address (IP or hostname). */
  host: string;
  /** SSH username (required for non-localhost hosts). */
  sshUser?: string;
  /** SSH key path (default: ~/.ssh/id_rsa). */
  sshKeyPath?: string;
  /** Docker image name. */
  imageName?: string;
  /** Docker image tag. */
  imageTag?: string;
  /** Container name. */
  containerName?: string;
  /** Container port. */
  containerPort?: number;
  /** GPU device(s) (e.g., "0" or "0,1"). */
  gpu?: string;
  /** Workflow IDs to assign. */
  workflows?: string[];
  /** Workspace folder path. */
  workspacePath?: string;
  /** HuggingFace cache folder path. */
  hfCachePath?: string;
}

/**
 * Configure a Docker deployment from typed parameters.
 *
 * @param name - Deployment name (used as default container name suffix).
 * @param params - Configuration parameters.
 * @returns A fully validated DockerDeployment object.
 */
export function configureDocker(
  name: string,
  params: DockerConfigParams
): DockerDeployment {
  const isLocalhost = ["localhost", "127.0.0.1", "::1", "0.0.0.0"].includes(
    params.host.toLowerCase()
  );

  const sshConfig =
    !isLocalhost && params.sshUser
      ? {
          user: params.sshUser,
          key_path: params.sshKeyPath ?? "~/.ssh/id_rsa",
          port: 22
        }
      : undefined;

  return DockerDeploymentSchema.parse({
    type: "docker",
    host: params.host,
    ssh: sshConfig,
    image: {
      name: params.imageName ?? "ghcr.io/nodetool-ai/nodetool",
      tag: params.imageTag ?? "latest"
    },
    container: {
      name: params.containerName ?? `nodetool-${name}`,
      port: params.containerPort ?? 8000,
      gpu: params.gpu,
      workflows: params.workflows
    },
    paths: {
      workspace: params.workspacePath ?? join(homedir(), ".nodetool-workspace"),
      hf_cache: params.hfCachePath ?? detectHfCacheDefault()
    }
  });
}

// ============================================================================
// RunPod configuration
// ============================================================================

export interface RunPodConfigParams {
  /** Docker image name. */
  imageName: string;
  /** Docker image tag (default: "latest"). */
  imageTag?: string;
  /** Docker registry (default: "docker.io"). */
  registry?: string;
}

/**
 * Configure a RunPod deployment from typed parameters.
 *
 * @param _name - Deployment name (unused, kept for API consistency).
 * @param params - Configuration parameters.
 * @returns A fully validated RunPodDeployment object.
 */
export function configureRunPod(
  _name: string,
  params: RunPodConfigParams
): RunPodDeployment {
  return RunPodDeploymentSchema.parse({
    type: "runpod",
    image: {
      name: params.imageName,
      tag: params.imageTag ?? "latest",
      registry: params.registry ?? "docker.io"
    }
  });
}

// ============================================================================
// GCP configuration
// ============================================================================

export interface GCPConfigParams {
  /** GCP Project ID. */
  projectId: string;
  /** GCP region (default: "us-central1"). */
  region?: string;
  /** Cloud Run service name. */
  serviceName?: string;
  /** Docker image repository (e.g., "project/repo/image"). */
  imageRepository: string;
  /** Docker image tag (default: "latest"). */
  imageTag?: string;
  /** CPU cores (default: "4"). */
  cpu?: string;
  /** Memory (default: "16Gi"). */
  memory?: string;
}

/**
 * Configure a GCP deployment from typed parameters.
 *
 * @param name - Deployment name (used as default service name).
 * @param params - Configuration parameters.
 * @returns A fully validated GCPDeployment object.
 */
export function configureGCP(
  name: string,
  params: GCPConfigParams
): GCPDeployment {
  return GCPDeploymentSchema.parse({
    type: "gcp",
    project_id: params.projectId,
    region: params.region ?? "us-central1",
    service_name: params.serviceName ?? name,
    image: {
      repository: params.imageRepository,
      tag: params.imageTag ?? "latest"
    },
    resources: {
      cpu: params.cpu ?? "4",
      memory: params.memory ?? "16Gi"
    }
  });
}
