/**
 * Google Cloud Run deployment implementation for NodeTool.
 *
 * Handles deployment to Google Cloud Run, including:
 * - Docker image building and pushing to GCR/Artifact Registry
 * - Cloud Run service deployment
 * - Service management
 * - IAM permission setup
 *
 * Multi-tenant rule: this deployer holds a per-operation {@link
 * DeploymentContext}. It NEVER reads ambient gcloud auth, host
 * `~/.docker/config.json`, or `process.env` credentials. Instead it writes the
 * user's `GCP_SERVICE_ACCOUNT_KEY` secret to a 0600 scratch file and runs every
 * gcloud/docker call through a scoped runner whose child env carries
 * `GOOGLE_APPLICATION_CREDENTIALS` + `CLOUDSDK_CONFIG` + `DOCKER_CONFIG`
 * pointing into the call's scratch dir.
 *
 * Ported from nodetool.deploy.gcp (Python).
 */

import * as path from "node:path";

import type { GCPDeployment } from "./deployment-config.js";
import { DeploymentStatus } from "./deployment-config.js";
import { StateManager } from "./state.js";
import type { DeploymentContext, ScopedRunner } from "./deployment-context.js";
import { makeScopedRunner, writeScratchFile } from "./deployment-context.js";
import type { DockerAuth } from "./docker.js";
import { makeDockerAuth } from "./docker.js";
import {
  deployToGcp,
  deleteGcpService,
  getGcpDefaultEnv,
  listGcpServices
} from "./deploy-to-gcp.js";
import {
  getCloudRunService,
  type GcpScope
} from "./google-cloud-run-api.js";

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
  private readonly ctx: DeploymentContext;
  private readonly run: ScopedRunner;

  /**
   * @param ctx Per-operation deployment context (user id, decrypted
   *   credentials, scratch dir). Required and LAST. Constructed fresh by the
   *   manager for every plan/apply/status/logs/destroy call.
   */
  constructor(
    deploymentName: string,
    deployment: GCPDeployment,
    stateManager: StateManager,
    ctx: DeploymentContext
  ) {
    this.deploymentName = deploymentName;
    this.deployment = deployment;
    this.stateManager = stateManager;
    this.ctx = ctx;
    this.run = makeScopedRunner(ctx);
  }

  // ---------- Scope construction (per-call auth/exec envelope) ----------

  /**
   * Build the per-operation {@link GcpScope}: write the SA key from
   * `ctx.credentials.GCP_SERVICE_ACCOUNT_KEY` to a 0600 scratch file and point
   * the child env at scratch-scoped gcloud/docker config dirs. No ambient
   * gcloud auth, no host docker config.
   *
   * In multi-user mode the SA key is REQUIRED (clear error naming the key when
   * absent). The scope's `multiUser` flag disables host-identity shortcuts
   * (default-project fallback, run.admin auto-grant).
   */
  private async buildScope(): Promise<GcpScope> {
    const saKey = this.ctx.credentials["GCP_SERVICE_ACCOUNT_KEY"];
    if (!saKey) {
      throw new Error(
        "Missing required secret GCP_SERVICE_ACCOUNT_KEY for GCP deployment " +
          `'${this.deploymentName}'. Store it as a per-user secret.`
      );
    }

    // Write the SA key to a 0600 scratch file; point gcloud's ADC at it.
    const keyFile = await writeScratchFile(
      this.ctx,
      "gcloud/service-account.json",
      saKey
    );

    const cloudsdkConfig = path.join(this.ctx.scratchDir, "gcloud", "config");
    const dockerConfigDir = path.join(this.ctx.scratchDir, ".docker");
    // Ensure the scratch dirs exist (0700) before any gcloud/docker call.
    await writeScratchFile(this.ctx, "gcloud/config/.keep", "");
    await writeScratchFile(this.ctx, ".docker/.keep", "");

    const env: Record<string, string> = {
      GOOGLE_APPLICATION_CREDENTIALS: keyFile,
      CLOUDSDK_CONFIG: cloudsdkConfig,
      DOCKER_CONFIG: dockerConfigDir
    };

    return {
      run: this.run,
      env,
      multiUser: true
    };
  }

  /**
   * Build optional registry {@link DockerAuth} for the local image build/push.
   * For GCR/Artifact Registry the gcloud credential helper handles auth, so an
   * explicit docker login is only performed when DOCKER_USERNAME/PASSWORD
   * secrets are present (e.g. mirroring to Docker Hub). Username may also come
   * from the deployment image config. Returns undefined when no login is needed.
   */
  private async buildDockerAuth(): Promise<DockerAuth | undefined> {
    const username = this.ctx.credentials["DOCKER_USERNAME"];
    const password = this.ctx.credentials["DOCKER_PASSWORD"];
    if (!username || !password) {
      return undefined;
    }
    return makeDockerAuth(this.ctx, {
      registry: this.deployment.image.registry,
      username,
      password
    });
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

    // Check if service exists remotely (best-effort; needs scoped auth).
    let remoteService: Record<string, unknown> | null;
    try {
      const scope = await this.buildScope();
      remoteService = await getCloudRunService(
        scope,
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
   */
  async apply(opts?: { dryRun?: boolean }): Promise<Record<string, unknown>> {
    if (opts?.dryRun) {
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

      // Build the per-operation scoped auth/exec envelope.
      const scope = await this.buildScope();
      const dockerAuth = await this.buildDockerAuth();

      // Prepare environment variables
      const env: Record<string, string> = this.deployment.environment
        ? { ...this.deployment.environment }
        : {};

      // Call deploy function
      await deployToGcp({
        ctx: this.ctx,
        scope,
        deployment: this.deployment,
        env,
        skipBuild: false,
        skipPush: false,
        skipDeploy: false,
        skipPermissionSetup: false,
        dockerAuth
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
      const scope = await this.buildScope();
      const services = await listGcpServices(
        scope,
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
   */
  async logs(opts?: {
    service?: string;
    follow?: boolean;
    tail?: number;
  }): Promise<string> {
    const follow = opts?.follow ?? false;
    const tail = opts?.tail ?? 100;

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
      const scope = await this.buildScope();
      const { stdout } = await scope.run("gcloud", args, {
        env: scope.env,
        timeoutMs: follow ? 0 : 30_000
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

      const scope = await this.buildScope();
      const success = await deleteGcpService(
        scope,
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
