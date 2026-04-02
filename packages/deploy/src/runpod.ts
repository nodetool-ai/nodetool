/**
 * RunPod deployment implementation for NodeTool.
 *
 * Handles deployment to RunPod serverless infrastructure, including:
 * - Docker image building and pushing
 * - RunPod template creation/update
 * - Serverless endpoint creation
 * - Endpoint management
 */

import type { RunPodDeployment } from "./deployment-config.js";
import { StateManager } from "./state.js";
import { deployToRunpod } from "./deploy-to-runpod.js";
import { getRunpodEndpointByName } from "./runpod-api.js";

// ---------------------------------------------------------------------------
// Interfaces for result types
// ---------------------------------------------------------------------------

export interface DeploymentPlan {
  deploymentName: string;
  type: "runpod";
  changes: string[];
  willCreate: string[];
  willUpdate: string[];
  willDestroy: string[];
}

export interface DeploymentResult {
  deploymentName: string;
  status: "success" | "error";
  steps: string[];
  errors: string[];
}

export interface StatusInfo {
  deploymentName: string;
  type: "runpod";
  status?: string;
  lastDeployed?: string;
  templateName?: string;
  podId?: string;
  liveStatus?: "active" | "not_found";
  endpointId?: string;
  gpuIds?: string;
  workerCount?: string;
  urls?: {
    runsync: string;
    run: string;
  };
  liveStatusError?: string;
}

// ---------------------------------------------------------------------------
// RunPodDeployer
// ---------------------------------------------------------------------------

/**
 * Handles deployment to RunPod serverless infrastructure.
 *
 * Orchestrates the entire RunPod deployment process including:
 * - Docker image building and pushing
 * - Template creation/update
 * - Endpoint creation and configuration
 * - State management
 */
export class RunPodDeployer {
  readonly deploymentName: string;
  readonly deployment: RunPodDeployment;
  readonly stateManager: StateManager;

  constructor(
    deploymentName: string,
    deployment: RunPodDeployment,
    stateManager: StateManager
  ) {
    this.deploymentName = deploymentName;
    this.deployment = deployment;
    this.stateManager = stateManager;
  }

  /**
   * Generate a deployment plan showing what changes will be made.
   */
  async plan(): Promise<DeploymentPlan> {
    const plan: DeploymentPlan = {
      deploymentName: this.deploymentName,
      type: "runpod",
      changes: [],
      willCreate: [],
      willUpdate: [],
      willDestroy: []
    };

    const currentState = await this.stateManager.readState(this.deploymentName);

    if (!currentState || !currentState.last_deployed) {
      plan.changes.push("Initial deployment - will create all resources");
      plan.willCreate.push(
        "Docker image",
        "RunPod template",
        "RunPod serverless endpoint"
      );
    } else {
      plan.changes.push("Configuration may have changed");
      plan.willUpdate.push("RunPod endpoint configuration");
    }

    return plan;
  }

  /**
   * Apply the deployment to RunPod.
   *
   * @param dryRun - If true, only show what would be done without executing
   */
  async apply(dryRun = false): Promise<DeploymentResult | DeploymentPlan> {
    if (dryRun) {
      return this.plan();
    }

    const results: DeploymentResult = {
      deploymentName: this.deploymentName,
      status: "success",
      steps: [],
      errors: []
    };

    try {
      await this.stateManager.updateDeploymentStatus(
        this.deploymentName,
        "deploying"
      );

      results.steps.push("Starting RunPod deployment...");

      const env: Record<string, string> = this.deployment.environment
        ? { ...(this.deployment.environment as Record<string, string>) }
        : {};
      const templateName = this.deployment.template_name ?? this.deploymentName;

      await deployToRunpod({
        deployment: this.deployment,
        dockerUsername: this.deployment.docker.username ?? undefined,
        dockerRegistry: this.deployment.docker.registry,
        imageName: this.deployment.image.name,
        tag: this.deployment.image.tag,
        templateName,
        platform: this.deployment.platform,
        gpuTypes: this.deployment.gpu_types,
        gpuCount: this.deployment.gpu_count ?? undefined,
        dataCenters: this.deployment.data_centers,
        workersMin: this.deployment.workers_min,
        workersMax: this.deployment.workers_max,
        idleTimeout: this.deployment.idle_timeout,
        executionTimeout: this.deployment.execution_timeout ?? undefined,
        flashboot: this.deployment.flashboot,
        env,
        skipBuild: false,
        skipPush: false,
        skipTemplate: false,
        skipEndpoint: false,
        name: this.deploymentName
      });

      results.steps.push("RunPod deployment completed");

      await this.stateManager.writeState(this.deploymentName, {
        status: "active",
        template_name: templateName
      });
    } catch (err) {
      results.status = "error";
      results.errors.push(String(err));

      await this.stateManager.updateDeploymentStatus(
        this.deploymentName,
        "error"
      );

      throw err;
    }

    return results;
  }

  /**
   * Get current deployment status.
   */
  async status(): Promise<StatusInfo> {
    const statusInfo: StatusInfo = {
      deploymentName: this.deploymentName,
      type: "runpod"
    };

    const state = await this.stateManager.readState(this.deploymentName);
    if (state) {
      statusInfo.status = (state.status as string) ?? "unknown";
      statusInfo.lastDeployed = (state.last_deployed as string) ?? "unknown";
      statusInfo.templateName = (state.template_name as string) ?? "unknown";
      statusInfo.podId = (state.pod_id as string) ?? "unknown";
    }

    try {
      const liveEndpoint = await getRunpodEndpointByName(
        this.deploymentName,
        /* quiet */ true
      );

      if (liveEndpoint) {
        statusInfo.liveStatus = "active";
        statusInfo.endpointId = liveEndpoint.id as string;
        statusInfo.gpuIds = liveEndpoint.gpuIds as string;
        statusInfo.workerCount = `${liveEndpoint.workersMin}-${liveEndpoint.workersMax}`;

        if (liveEndpoint.id) {
          statusInfo.urls = {
            runsync: `https://api.runpod.ai/v2/${liveEndpoint.id}/runsync`,
            run: `https://api.runpod.ai/v2/${liveEndpoint.id}/run`
          };
        }
      } else {
        statusInfo.liveStatus = "not_found";
      }
    } catch (err) {
      console.warn("Failed to query RunPod API status:", err);
      statusInfo.liveStatusError = String(err);
    }

    return statusInfo;
  }

  /**
   * Get logs from RunPod endpoint.
   *
   * RunPod serverless endpoints don't provide direct log access.
   */
  logs(_service?: string, _follow?: boolean, _tail?: number): never {
    throw new Error(
      "RunPod serverless endpoints don't provide direct log access. " +
        "Check logs via RunPod web console or API."
    );
  }

  /**
   * Destroy the deployment (delete endpoint).
   */
  async destroy(): Promise<DeploymentResult> {
    const results: DeploymentResult = {
      deploymentName: this.deploymentName,
      status: "success",
      steps: [],
      errors: []
    };

    try {
      results.steps.push("Destroying RunPod endpoint...");
      results.steps.push(
        "RunPod endpoint deletion must be done manually via RunPod console"
      );
      results.steps.push(
        `Visit https://www.runpod.io/console/serverless and delete endpoint '${this.deploymentName}'`
      );

      await this.stateManager.updateDeploymentStatus(
        this.deploymentName,
        "destroyed"
      );
    } catch (err) {
      results.status = "error";
      results.errors.push(String(err));
      throw err;
    }

    return results;
  }
}
