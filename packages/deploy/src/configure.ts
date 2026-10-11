/**
 * Non-interactive configuration helpers for deployments.
 *
 * Instead of interactive prompts (click.prompt / click.confirm from Python),
 * these functions accept typed config parameter objects.
 */

import { homedir } from "node:os";
import { join } from "node:path";
import { getHfHubCacheDir } from "@nodetool-ai/config";
import type { DockerDeployment } from "./deployment-config.js";
import { DockerDeploymentSchema } from "./deployment-config.js";

// ============================================================================
// Common helper
// ============================================================================

/**
 * Detect the default HuggingFace hub cache directory, resolved the way
 * Python `huggingface_hub` does (`getHfHubCacheDir` in `@nodetool-ai/config`:
 * HF_HUB_CACHE, HUGGINGFACE_HUB_CACHE, HF_HOME/hub, XDG_CACHE_HOME/huggingface/hub,
 * then ~/.cache/huggingface/hub).
 */
export function detectHfCacheDefault(): string {
  return getHfHubCacheDir();
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
      gpu: params.gpu
    },
    paths: {
      workspace: params.workspacePath ?? join(homedir(), ".nodetool-workspace"),
      hf_cache: params.hfCachePath ?? detectHfCacheDefault()
    }
  });
}
