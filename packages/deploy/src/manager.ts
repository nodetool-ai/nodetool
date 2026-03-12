/**
 * Deployment manager orchestrator for all deployment types.
 *
 * This module provides a unified interface for managing deployments across
 * different platforms (self-hosted, RunPod, GCP). It handles:
 * - Change detection (comparing current vs desired state)
 * - Plan generation (showing what will change)
 * - Deployment orchestration
 * - State management
 * - Validation and error handling
 */

import type {
  DeploymentConfig,
  DockerDeployment,
  SSHDeployment,
  LocalDeployment,
  GCPDeployment,
  SSHConfig,
  AnyDeployment,
} from "./deployment-config.js";
import type { StateManager } from "./state.js";

/** Info returned by listDeployments. */
export interface DeploymentInfo {
  name: string;
  type: string;
  status: string;
  last_deployed: string | null;
  host?: string;
  container?: string;
  service?: string;
  pod_id?: string | null;
  project?: string;
  region?: string;
}

/** Validation results. */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/** Interface for deployers — all share the same operation signatures. */
export interface Deployer {
  plan(): Record<string, unknown>;
  apply(opts?: { dryRun?: boolean }): Record<string, unknown>;
  status(): Record<string, unknown>;
  logs(opts?: {
    service?: string;
    follow?: boolean;
    tail?: number;
  }): string;
  destroy(): Record<string, unknown>;
}

/** Factory function signature for creating deployers. */
export type DeployerFactory = (
  deploymentName: string,
  deployment: AnyDeployment,
  stateManager: StateManager
) => Deployer;

/**
 * Orchestrates deployments across all platforms.
 *
 * This class provides a unified interface for deployment operations
 * regardless of the target platform (self-hosted, RunPod, GCP).
 */
export class DeploymentManager {
  private config: DeploymentConfig;
  private stateManager: StateManager;
  private deployerFactories: Record<string, DeployerFactory>;

  /**
   * @param config - Loaded deployment configuration
   * @param stateManager - State manager instance
   * @param deployerFactories - Map of deployment type to deployer factory.
   *   Callers provide their own factory map so this module stays decoupled
   *   from concrete deployer implementations.
   */
  constructor(
    config: DeploymentConfig,
    stateManager: StateManager,
    deployerFactories: Record<string, DeployerFactory>
  ) {
    this.config = config;
    this.stateManager = stateManager;
    this.deployerFactories = deployerFactories;
  }

  /**
   * List all configured deployments with their current status.
   */
  async listDeployments(): Promise<DeploymentInfo[]> {
    const deployments: DeploymentInfo[] = [];

    const entries = Object.entries(this.config.deployments) as [
      string,
      AnyDeployment
    ][];

    for (const [name, deployment] of entries) {
      const state = await this.stateManager.readState(name);

      const info: DeploymentInfo = {
        name,
        type: deployment.type,
        status: state?.["status"]
          ? String(state["status"])
          : "unknown",
        last_deployed: state?.["last_deployed"]
          ? String(state["last_deployed"])
          : null,
      };

      // Add type-specific info
      if (deployment.type === "docker") {
        const d = deployment as DockerDeployment;
        info.host = d.host;
        info.container = d.container.name;
      } else if (
        deployment.type === "ssh" ||
        deployment.type === "local"
      ) {
        const d = deployment as SSHDeployment | LocalDeployment;
        info.host = d.host;
        info.service = d.service_name ?? undefined;
      } else if (deployment.type === "runpod") {
        info.pod_id = state?.["pod_id"]
          ? String(state["pod_id"])
          : null;
      } else if (deployment.type === "gcp") {
        const d = deployment as GCPDeployment;
        info.project = d.project_id;
        info.region = d.region;
      }

      deployments.push(info);
    }

    return deployments;
  }

  /**
   * Get deployment configuration by name.
   *
   * @throws Error if deployment not found
   */
  getDeployment(name: string): AnyDeployment {
    const deployment = this.config.deployments[name] as
      | AnyDeployment
      | undefined;
    if (!deployment) {
      throw new Error(`Deployment '${name}' not found`);
    }
    return deployment;
  }

  /**
   * Generate a deployment plan showing what changes will be made.
   * Similar to 'terraform plan'.
   */
  plan(name: string): Record<string, unknown> {
    const deployer = this.getDeployer(name);
    return deployer.plan();
  }

  /**
   * Apply a deployment to its target platform.
   */
  apply(
    name: string,
    opts: { dryRun?: boolean; force?: boolean } = {}
  ): Record<string, unknown> {
    const deployment = this.getDeployment(name);
    console.log(
      `Applying deployment '${name}' (type: ${deployment.type})`
    );
    const deployer = this.getDeployer(name);
    return deployer.apply({ dryRun: opts.dryRun });
  }

  /**
   * Get current status of a deployment.
   */
  status(name: string): Record<string, unknown> {
    const deployer = this.getDeployer(name);
    return deployer.status();
  }

  /**
   * Get logs from a deployment.
   */
  logs(
    name: string,
    opts: { service?: string; follow?: boolean; tail?: number } = {}
  ): string {
    const deployer = this.getDeployer(name);
    return deployer.logs({
      service: opts.service,
      follow: opts.follow,
      tail: opts.tail ?? 100,
    });
  }

  /**
   * Destroy a deployment (stop and remove all resources).
   */
  destroy(
    name: string,
    _opts: { force?: boolean } = {}
  ): Record<string, unknown> {
    const deployment = this.getDeployment(name);
    console.warn(
      `Destroying deployment '${name}' (type: ${deployment.type})`
    );
    const deployer = this.getDeployer(name);
    return deployer.destroy();
  }

  /**
   * Validate deployment configuration.
   */
  validate(name?: string): ValidationResult {
    const results: ValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
    };

    const deploymentsToValidate: string[] = name
      ? [name]
      : Object.keys(this.config.deployments);

    for (const deploymentName of deploymentsToValidate) {
      try {
        const deployment = this.getDeployment(deploymentName);

        if (
          deployment.type === "docker" ||
          deployment.type === "ssh" ||
          deployment.type === "local"
        ) {
          // Validate SSH config if applicable
          const sshConfig = (deployment as { ssh?: SSHConfig }).ssh;
          if (sshConfig && !sshConfig.key_path && !sshConfig.password) {
            results.warnings.push(
              `${deploymentName}: No SSH authentication method configured`
            );
          }

          if (deployment.type === "docker") {
            const d = deployment as DockerDeployment;
            if (!d.container) {
              results.errors.push(
                `${deploymentName}: No container configured`
              );
              results.valid = false;
            }
          } else if (
            deployment.type === "ssh" ||
            deployment.type === "local"
          ) {
            const d = deployment as SSHDeployment | LocalDeployment;
            if (!d.port) {
              results.errors.push(
                `${deploymentName}: No port configured`
              );
              results.valid = false;
            }
          }
        }
      } catch (e) {
        results.errors.push(
          `${deploymentName}: ${e instanceof Error ? e.message : String(e)}`
        );
        results.valid = false;
      }
    }

    return results;
  }

  /**
   * Check if a deployment has changes that need to be applied.
   */
  hasChanges(name: string): boolean {
    try {
      const planResult = this.plan(name);
      const changes = planResult["changes"];
      return Array.isArray(changes) && changes.length > 0;
    } catch (e) {
      console.error(`Error checking for changes: ${e}`);
      return false;
    }
  }

  /**
   * Get state for all deployments.
   */
  async getAllStates(): Promise<Record<string, Record<string, unknown>>> {
    return this.stateManager.getAllStates();
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private getDeployer(name: string): Deployer {
    const deployment = this.getDeployment(name);
    const factory = this.deployerFactories[deployment.type];
    if (!factory) {
      throw new Error(`Unknown deployment type: ${deployment.type}`);
    }
    return factory(name, deployment, this.stateManager);
  }
}
