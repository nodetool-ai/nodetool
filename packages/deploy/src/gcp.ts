/**
 * Google Cloud Run deployment implementation for NodeTool.
 *
 * Handles deployment to Google Cloud Run, including:
 * - Docker image building and pushing to GCR/Artifact Registry
 * - Cloud Run service deployment
 * - Service management
 * - IAM permission setup
 *
 * Ported from nodetool.deploy.gcp (Python).
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { GCPDeployment } from "./deployment-config.js";
import { DeploymentStatus } from "./deployment-config.js";
import { StateManager } from "./state.js";
import {
  deployToGcp,
  deleteGcpService,
  getGcpDefaultEnv,
  listGcpServices
} from "./deploy-to-gcp.js";
import { getCloudRunService } from "./google-cloud-run-api.js";

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// GCPDeployer class
// ---------------------------------------------------------------------------

/**
 * Handles deployment to Google Cloud Run.
 *
 * Orchestrates the entire GCP deployment process including:
 * - Docker image building and pushing
 * - Cloud Run service deployment
 * - Service configuration
 * - State management
 */
export class GCPDeployer {
  readonly deploymentName: string;
  readonly deployment: GCPDeployment;
  readonly stateManager: StateManager;

  constructor(
    deploymentName: string,
    deployment: GCPDeployment,
    stateManager?: StateManager
  ) {
    this.deploymentName = deploymentName;
    this.deployment = deployment;
    this.stateManager = stateManager ?? new StateManager();
  }

  // ---------- Private helpers ----------

  /**
   * Detect changes between local configuration and remote service.
   */
  private _detectChanges(currentService: Record<string, unknown>): string[] {
    const changes: string[] = [];

    const spec = nested(currentService, "spec", "template", "spec") as Record<
      string,
      unknown
    >;
    const metadata = nested(
      currentService,
      "spec",
      "template",
      "metadata"
    ) as Record<string, unknown>;
    const annotations = (metadata?.["annotations"] ?? {}) as Record<
      string,
      string
    >;
    const containers = (spec?.["containers"] ?? [{}]) as Record<
      string,
      unknown
    >[];
    const container = containers[0] ?? {};
    const resources = nested(container, "resources", "limits") as Record<
      string,
      string
    >;

    // 1. Resources (CPU, Memory)
    let remoteCpu = resources?.["cpu"] ?? "";
    // Normalize remote CPU (1000m -> 1)
    if (remoteCpu.endsWith("m")) {
      const remoteCpuVal = parseInt(remoteCpu.slice(0, -1), 10) / 1000;
      remoteCpu = Number.isInteger(remoteCpuVal)
        ? String(remoteCpuVal)
        : String(remoteCpuVal);
    }

    if (String(this.deployment.resources.cpu) !== remoteCpu) {
      changes.push(`CPU: ${remoteCpu} -> ${this.deployment.resources.cpu}`);
    }

    const remoteMemory = resources?.["memory"] ?? "";
    if (this.deployment.resources.memory !== remoteMemory) {
      changes.push(
        `Memory: ${remoteMemory} -> ${this.deployment.resources.memory}`
      );
    }

    // 2. GPU
    const remoteGpuCount = annotations["run.googleapis.com/gpu"] ?? "0";
    const expectedGpuCount =
      this.deployment.resources.gpu_count ??
      (this.deployment.resources.gpu_type ? 1 : 0);
    if (String(expectedGpuCount) !== String(remoteGpuCount)) {
      changes.push(`GPU Count: ${remoteGpuCount} -> ${expectedGpuCount}`);
    }

    // 3. Scaling
    const remoteMin = annotations["autoscaling.knative.dev/minScale"] ?? "0";
    if (String(this.deployment.resources.min_instances) !== String(remoteMin)) {
      changes.push(
        `Min Instances: ${remoteMin} -> ${this.deployment.resources.min_instances}`
      );
    }

    const remoteMax = annotations["autoscaling.knative.dev/maxScale"] ?? "0";
    if (String(this.deployment.resources.max_instances) !== String(remoteMax)) {
      changes.push(
        `Max Instances: ${remoteMax} -> ${this.deployment.resources.max_instances}`
      );
    }

    // 4. Concurrency & Timeout
    const remoteConcurrency = spec?.["containerConcurrency"] as
      | number
      | string
      | undefined;
    if (
      remoteConcurrency !== undefined &&
      String(this.deployment.resources.concurrency) !==
        String(remoteConcurrency)
    ) {
      changes.push(
        `Concurrency: ${remoteConcurrency} -> ${this.deployment.resources.concurrency}`
      );
    }

    const remoteTimeout = spec?.["timeoutSeconds"] as
      | number
      | string
      | undefined;
    if (
      remoteTimeout !== undefined &&
      String(this.deployment.resources.timeout) !== String(remoteTimeout)
    ) {
      changes.push(
        `Timeout: ${remoteTimeout}s -> ${this.deployment.resources.timeout}s`
      );
    }

    // 5. Service Account
    const remoteSa = spec?.["serviceAccountName"] as string | undefined;
    if (
      this.deployment.iam.service_account &&
      this.deployment.iam.service_account !== remoteSa
    ) {
      changes.push(
        `Service Account: ${remoteSa} -> ${this.deployment.iam.service_account}`
      );
    }

    // 6. Environment Variables
    const remoteEnvList = (container["env"] ?? []) as Array<{
      name: string;
      value?: string;
    }>;
    const remoteEnv: Record<string, string> = {};
    for (const item of remoteEnvList) {
      remoteEnv[item.name] = item.value ?? "";
    }

    const expectedEnv = getGcpDefaultEnv(this.deployment);
    const envChanges: string[] = [];
    for (const [k, v] of Object.entries(expectedEnv)) {
      if (!(k in remoteEnv)) {
        envChanges.push(`added ${k}`);
      } else if (remoteEnv[k] !== String(v)) {
        envChanges.push(`changed ${k}`);
      }
    }

    if (envChanges.length > 0) {
      changes.push(`Environment variables: ${envChanges.join(", ")}`);
    }

    return changes;
  }

  // ---------- Public API ----------

  /**
   * Generate a deployment plan showing what changes will be made.
   */
  async plan(): Promise<Record<string, unknown>> {
    const planResult: Record<string, unknown> = {
      deployment_name: this.deploymentName,
      type: "gcp",
      project: this.deployment.project_id,
      region: this.deployment.region,
      changes: [] as string[],
      will_create: [] as string[],
      will_update: [] as string[],
      will_destroy: [] as string[]
    };

    const changes = planResult["changes"] as string[];
    const willCreate = planResult["will_create"] as string[];
    const willUpdate = planResult["will_update"] as string[];

    // Get current state
    const currentState = await this.stateManager.readState(this.deploymentName);

    // Check if service exists remotely
    let remoteService: Record<string, unknown> | null;
    try {
      remoteService = await getCloudRunService(
        this.deployment.service_name,
        this.deployment.region,
        this.deployment.project_id
      );
    } catch {
      remoteService = null;
    }

    // Always plan to build/push Docker image
    willCreate.push("Docker image (if changed)");

    if (!currentState || !currentState["last_deployed"] || !remoteService) {
      changes.push("Initial deployment - will create all resources");
      willCreate.push(`Cloud Run service: ${this.deployment.service_name}`);
    } else {
      const detectedChanges = this._detectChanges(remoteService);
      if (detectedChanges.length > 0) {
        changes.push(...detectedChanges);
        willUpdate.push(`Cloud Run service: ${this.deployment.service_name}`);
      } else {
        changes.push("No configuration changes detected");
      }
    }

    return planResult;
  }

  /**
   * Apply the deployment to Google Cloud Run.
   *
   * @param dryRun If true, only show what would be done without executing.
   */
  async apply(dryRun = false): Promise<Record<string, unknown>> {
    if (dryRun) {
      return this.plan();
    }

    const results: Record<string, unknown> = {
      deployment_name: this.deploymentName,
      status: "success",
      steps: [] as string[],
      errors: [] as string[]
    };
    const steps = results["steps"] as string[];
    const errors = results["errors"] as string[];

    try {
      // Update state to deploying
      await this.stateManager.updateDeploymentStatus(
        this.deploymentName,
        DeploymentStatus.DEPLOYING
      );

      steps.push("Starting Google Cloud Run deployment...");

      // Prepare environment variables
      const env: Record<string, string> = {};

      // Call deploy function
      await deployToGcp({
        deployment: this.deployment,
        env,
        skipBuild: false,
        skipPush: false,
        skipDeploy: false,
        skipPermissionSetup: false
      });

      steps.push("Google Cloud Run deployment completed");

      // Update state with success
      await this.stateManager.writeState(this.deploymentName, {
        status: DeploymentStatus.SERVING,
        service_name: this.deployment.service_name,
        project: this.deployment.project_id,
        region: this.deployment.region
      });
    } catch (e) {
      results["status"] = "error";
      errors.push(e instanceof Error ? e.message : String(e));

      // Update state with error
      await this.stateManager.updateDeploymentStatus(
        this.deploymentName,
        DeploymentStatus.ERROR
      );

      throw e;
    }

    return results;
  }

  /**
   * Get current deployment status.
   */
  async status(): Promise<Record<string, unknown>> {
    const statusInfo: Record<string, unknown> = {
      deployment_name: this.deploymentName,
      type: "gcp",
      project: this.deployment.project_id,
      region: this.deployment.region,
      service_name: this.deployment.service_name
    };

    // Get state from state manager
    const state = await this.stateManager.readState(this.deploymentName);
    if (state) {
      statusInfo["status"] = state["status"] ?? "unknown";
      statusInfo["last_deployed"] = state["last_deployed"];
    }

    // Try to get live status from Cloud Run
    try {
      const services = await listGcpServices(
        this.deployment.region,
        this.deployment.project_id
      );

      for (const service of services) {
        const serviceMetadata = service["metadata"] as
          | Record<string, unknown>
          | undefined;
        if (serviceMetadata?.["name"] === this.deployment.service_name) {
          const serviceStatus = service["status"] as
            | Record<string, unknown>
            | undefined;
          statusInfo["live_status"] = serviceStatus;
          statusInfo["url"] = serviceStatus?.["url"];
          break;
        }
      }
    } catch (e) {
      statusInfo["live_status_error"] =
        e instanceof Error ? e.message : String(e);
    }

    return statusInfo;
  }

  /**
   * Get logs from Cloud Run service.
   *
   * @param service Not used for GCP (kept for interface compatibility).
   * @param follow Follow log output (not recommended for programmatic use).
   * @param tail Number of lines to show.
   */
  async logs(_service?: string, follow = false, tail = 100): Promise<string> {
    const args = [
      "logging",
      "read",
      `resource.type="cloud_run_revision" AND resource.labels.service_name="${this.deployment.service_name}"`,
      "--project",
      this.deployment.project_id,
      "--limit",
      String(tail),
      "--format",
      "value(timestamp,textPayload)"
    ];

    if (follow) {
      args.push("--follow");
    }

    try {
      const { stdout } = await execFileAsync("gcloud", args, {
        timeout: follow ? 0 : 30_000
      });
      return stdout;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`Failed to fetch logs: ${msg}`);
    }
  }

  /**
   * Destroy the deployment (delete Cloud Run service).
   */
  async destroy(): Promise<Record<string, unknown>> {
    const results: Record<string, unknown> = {
      deployment_name: this.deploymentName,
      status: "success",
      steps: [] as string[],
      errors: [] as string[]
    };
    const steps = results["steps"] as string[];
    const errors = results["errors"] as string[];

    try {
      steps.push(
        `Deleting Cloud Run service: ${this.deployment.service_name}...`
      );

      const success = await deleteGcpService(
        this.deployment.service_name,
        this.deployment.region,
        this.deployment.project_id
      );

      if (success) {
        steps.push("Service deleted successfully");
      } else {
        errors.push("Failed to delete service");
        results["status"] = "error";
      }

      // Update state
      await this.stateManager.updateDeploymentStatus(
        this.deploymentName,
        DeploymentStatus.DESTROYED
      );
    } catch (e) {
      results["status"] = "error";
      errors.push(e instanceof Error ? e.message : String(e));
      throw e;
    }

    return results;
  }
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/**
 * Safely traverse nested objects without throwing on missing keys.
 */
function nested(obj: Record<string, unknown>, ...keys: string[]): unknown {
  let current: unknown = obj;
  for (const key of keys) {
    if (
      current === null ||
      current === undefined ||
      typeof current !== "object"
    ) {
      return {};
    }
    current = (current as Record<string, unknown>)[key];
  }
  return current ?? {};
}
