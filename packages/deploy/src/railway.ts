/**
 * Railway deployment implementation for NodeTool.
 *
 * Handles deployment to Railway using the `railway` CLI, including:
 * - Docker image building and deployment
 * - Environment variable configuration
 * - Service management (create, destroy, status, logs)
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

import { createLogger } from "@nodetool-ai/config";

const log = createLogger("nodetool.deploy.railway");

import { loadImageSpec } from "./image-spec.js";
import { generateDockerfile } from "./image-builder.js";
import { StateManager } from "./state.js";
import { DeploymentStatus } from "./deployment-config.js";

import type { RailwayDeployment } from "./deployment-config.js";
import type { DeployResult } from "./self-hosted.js";

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Run a `railway` CLI command and return stdout.
 * Throws a descriptive error when the CLI is not installed.
 */
async function railwayCli(
  args: string[],
  opts?: { timeout?: number; cwd?: string }
): Promise<string> {
  try {
    const { stdout } = await execFileAsync("railway", args, {
      timeout: opts?.timeout ?? 60_000,
      cwd: opts?.cwd
    });
    return stdout;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("ENOENT")) {
      throw new Error(
        "railway CLI not found. Install it with: npm install -g @railway/cli\n" +
          "See https://docs.railway.app/develop/cli for details."
      );
    }
    throw new Error(`railway CLI failed: ${msg}`);
  }
}

// ---------------------------------------------------------------------------
// RailwayDeployer class
// ---------------------------------------------------------------------------

/**
 * Handles deployment to Railway.
 *
 * Orchestrates the entire Railway deployment process including:
 * - Docker image building from an image spec
 * - Linking to a Railway project
 * - Setting environment variables
 * - Deploying the service
 * - State management
 */
export class RailwayDeployer {
  readonly deploymentName: string;
  readonly deployment: RailwayDeployment;
  readonly stateManager: StateManager;

  constructor(
    deploymentName: string,
    deployment: RailwayDeployment,
    stateManager?: StateManager
  ) {
    this.deploymentName = deploymentName;
    this.deployment = deployment;
    this.stateManager = stateManager ?? new StateManager();
  }

  // ---------- Public API ----------

  /**
   * Generate a deployment plan showing what changes will be made.
   */
  async plan(): Promise<Record<string, unknown>> {
    const planResult: Record<string, unknown> = {
      deployment_name: this.deploymentName,
      type: "railway",
      project: this.deployment.project,
      service: this.deployment.service,
      changes: [] as string[],
      will_create: [] as string[],
      will_update: [] as string[],
      will_destroy: [] as string[]
    };

    const changes = planResult["changes"] as string[];
    const willCreate = planResult["will_create"] as string[];

    const currentState = await this.stateManager.readState(this.deploymentName);

    willCreate.push("Docker image (if changed)");

    if (!currentState || !currentState["last_deployed"]) {
      changes.push("Initial deployment - will create all resources");
      willCreate.push(`Railway service: ${this.deployment.service}`);
    } else {
      changes.push("Will re-deploy service with current configuration");
      (planResult["will_update"] as string[]).push(
        `Railway service: ${this.deployment.service}`
      );
    }

    if (this.deployment.environment) {
      const envKeys = Object.keys(this.deployment.environment);
      if (envKeys.length > 0) {
        changes.push(`Environment variables: ${envKeys.join(", ")}`);
      }
    }

    return planResult;
  }

  /**
   * Apply the deployment to Railway.
   *
   * Steps:
   * 1. Load image spec and build Docker image
   * 2. Link to Railway project
   * 3. Set environment variables
   * 4. Deploy with `railway up`
   * 5. Update deployment state
   *
   * @param opts.dryRun If true, only show what would be done without executing.
   */
  async apply(opts?: { dryRun?: boolean }): Promise<DeployResult> {
    if (opts?.dryRun) {
      return (await this.plan()) as unknown as DeployResult;
    }

    const results: DeployResult = {
      deployment_name: this.deploymentName,
      status: "success",
      steps: [],
      errors: []
    };

    if (!/^[\w-]+$/.test(this.deployment.project)) {
      throw new Error(`Invalid Railway project: "${this.deployment.project}"`);
    }

    const tmpDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "nodetool-railway-")
    );

    try {
      await this.stateManager.updateDeploymentStatus(
        this.deploymentName,
        DeploymentStatus.DEPLOYING
      );

      // 1. Generate Dockerfile from image spec
      results.steps.push("Loading image spec...");
      const spec = await loadImageSpec(this.deployment.image);

      results.steps.push("Generating Dockerfile...");
      const dockerfile = generateDockerfile(spec);
      await fs.writeFile(path.join(tmpDir, "Dockerfile"), dockerfile);
      results.steps.push("Wrote Dockerfile to temp directory");

      // 2. Link to Railway project
      results.steps.push(
        `Linking to Railway project: ${this.deployment.project}...`
      );
      await railwayCli(["link", "--project", this.deployment.project], {
        cwd: tmpDir
      });
      results.steps.push("Linked to Railway project");

      // 3. Set environment variables (must be after link)
      if (this.deployment.environment) {
        const envEntries = Object.entries(this.deployment.environment);
        if (envEntries.length > 0) {
          results.steps.push("Setting environment variables...");
          const vars = envEntries.map(([k, v]) => `${k}=${v}`);
          await railwayCli(["variables", "set", ...vars], { cwd: tmpDir });
          results.steps.push(
            `Set ${envEntries.length} environment variable(s)`
          );
        }
      }

      // 4. Deploy from temp dir (Railway detects Dockerfile)
      results.steps.push(`Deploying service: ${this.deployment.service}...`);
      await railwayCli(["up", "--service", this.deployment.service], {
        cwd: tmpDir,
        timeout: 300_000
      });
      results.steps.push("Railway deployment completed");

      // 4. Update state
      await this.stateManager.writeState(this.deploymentName, {
        status: DeploymentStatus.SERVING,
        project: this.deployment.project,
        service: this.deployment.service
      });
    } catch (e) {
      results.status = "error";
      results.errors.push(e instanceof Error ? e.message : String(e));

      await this.stateManager.updateDeploymentStatus(
        this.deploymentName,
        DeploymentStatus.ERROR
      );

      throw e;
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch((err) => {
        log.debug(`Failed to clean up Railway temp dir ${tmpDir}`, err);
      });
    }

    return results;
  }

  /**
   * Destroy the Railway service.
   */
  async destroy(): Promise<DeployResult> {
    const results: DeployResult = {
      deployment_name: this.deploymentName,
      status: "success",
      steps: [],
      errors: []
    };

    const tmpDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "nodetool-railway-")
    );
    try {
      results.steps.push(
        `Deleting Railway service: ${this.deployment.service}...`
      );

      // Link to project first so the CLI knows which project to target
      await railwayCli(["link", "--project", this.deployment.project], {
        cwd: tmpDir
      });
      await railwayCli(
        ["service", "delete", this.deployment.service, "--yes"],
        { cwd: tmpDir }
      );

      results.steps.push("Service deleted successfully");

      await this.stateManager.updateDeploymentStatus(
        this.deploymentName,
        DeploymentStatus.DESTROYED
      );
    } catch (e) {
      results.status = "error";
      results.errors.push(e instanceof Error ? e.message : String(e));
      await this.stateManager.updateDeploymentStatus(
        this.deploymentName,
        DeploymentStatus.ERROR
      );
      throw e;
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch((err) => {
        log.debug(`Failed to clean up Railway temp dir ${tmpDir}`, err);
      });
    }

    return results;
  }

  /**
   * Get current deployment status from Railway.
   */
  async status(): Promise<Record<string, unknown>> {
    const statusInfo: Record<string, unknown> = {
      deployment_name: this.deploymentName,
      type: "railway",
      project: this.deployment.project,
      service: this.deployment.service
    };

    // Get state from state manager
    const state = await this.stateManager.readState(this.deploymentName);
    if (state) {
      statusInfo["status"] = state["status"] ?? "unknown";
      statusInfo["last_deployed"] = state["last_deployed"];
    }

    // Try to get live status from Railway
    const tmpDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "nodetool-railway-")
    );
    try {
      await railwayCli(["link", "--project", this.deployment.project], {
        cwd: tmpDir
      });
      const output = await railwayCli(["status", "--json"], { cwd: tmpDir });
      statusInfo["live_status"] = JSON.parse(output);
    } catch (e) {
      statusInfo["live_status_error"] =
        e instanceof Error ? e.message : String(e);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch((err) => {
        log.debug(`Failed to clean up Railway temp dir ${tmpDir}`, err);
      });
    }

    return statusInfo;
  }

  /**
   * Get logs from the Railway service.
   *
   * @param opts.follow Stream logs in real time.
   * @param opts.tail Number of recent log lines to fetch.
   */
  async logs(opts?: { follow?: boolean; tail?: number }): Promise<string> {
    if (opts?.follow) {
      throw new Error(
        "Streaming logs not supported. Use 'railway logs --service " +
          `${this.deployment.service} --follow' directly.`
      );
    }

    const args = ["logs", "--service", this.deployment.service];

    if (opts?.tail !== undefined) {
      args.push("--tail", String(opts.tail));
    }

    const tmpDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "nodetool-railway-")
    );
    try {
      // Link to project so CLI targets the right one
      await railwayCli(["link", "--project", this.deployment.project], {
        cwd: tmpDir
      });
      return await railwayCli(args, { cwd: tmpDir, timeout: 30_000 });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`Failed to fetch Railway logs: ${msg}`);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch((err) => {
        log.debug(`Failed to clean up Railway temp dir ${tmpDir}`, err);
      });
    }
  }
}
