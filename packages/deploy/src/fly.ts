/**
 * Fly.io deployment implementation for NodeTool.
 *
 * Handles deployment to Fly.io using the `flyctl` CLI, including:
 * - Docker image building from nodetool-image.yaml specs
 * - Fly app creation and management
 * - Volume provisioning
 * - Secret/environment variable configuration
 * - Service deployment and monitoring
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";

import { loadImageSpec } from "./image-spec.js";
import { buildImage } from "./image-builder.js";
import { DeploymentStatus } from "./deployment-config.js";
import { StateManager } from "./state.js";

import type { FlyDeployment } from "./deployment-config.js";
import type { DeployResult, DeployPlan, DeployStatus } from "./self-hosted.js";

const execFileAsync = promisify(execFile);

// ============================================================================
// Helpers
// ============================================================================

/**
 * Run a flyctl command and return parsed JSON output.
 *
 * Throws a descriptive error when flyctl is not installed or the command fails.
 */
async function flyctl(
  args: string[],
  opts?: { timeout?: number }
): Promise<string> {
  try {
    const { stdout } = await execFileAsync("flyctl", args, {
      timeout: opts?.timeout ?? 60_000
    });
    return stdout;
  } catch (e: unknown) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === "ENOENT") {
      throw new Error(
        "flyctl not found — install from https://fly.io/docs/flyctl/install/"
      );
    }
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`flyctl ${args[0]} failed: ${msg}`);
  }
}

/**
 * Run flyctl and parse the JSON output.
 */
async function flyctlJson<T = unknown>(
  args: string[],
  opts?: { timeout?: number }
): Promise<T> {
  const raw = await flyctl(args, opts);
  return JSON.parse(raw) as T;
}

/**
 * Check whether a Fly app already exists.
 */
async function appExists(app: string): Promise<boolean> {
  try {
    const apps = await flyctlJson<Array<{ Name?: string; name?: string }>>([
      "apps",
      "list",
      "--json"
    ]);
    return apps.some((a) => (a.Name ?? a.name) === app);
  } catch {
    return false;
  }
}

// ============================================================================
// FlyDeployer
// ============================================================================

/**
 * Deploys NodeTool to Fly.io using the flyctl CLI.
 *
 * Lifecycle:
 *  plan()    — check what will be created/updated
 *  apply()   — build image, create app, set secrets, deploy
 *  destroy() — tear down the Fly app
 *  status()  — query current app status
 *  logs()    — stream or tail app logs
 */
export class FlyDeployer {
  readonly deploymentName: string;
  readonly deployment: FlyDeployment;
  readonly stateManager: StateManager;

  constructor(
    deploymentName: string,
    deployment: FlyDeployment,
    stateManager?: StateManager
  ) {
    this.deploymentName = deploymentName;
    this.deployment = deployment;
    this.stateManager = stateManager ?? new StateManager();
  }

  // ---------- plan ----------

  async plan(): Promise<DeployPlan> {
    const plan: DeployPlan = {
      deployment_name: this.deploymentName,
      host: `${this.deployment.app}.fly.dev`,
      type: "fly",
      changes: [],
      will_create: [],
      will_update: [],
      will_destroy: []
    };

    const exists = await appExists(this.deployment.app);

    if (!exists) {
      plan.changes.push("Initial deployment — will create all resources");
      plan.will_create.push(`Fly app: ${this.deployment.app}`);
    } else {
      plan.changes.push("App exists — will update deployment");
      plan.will_update.push(`Fly app: ${this.deployment.app}`);
    }

    plan.will_create.push("Docker image (if changed)");

    if (this.deployment.volumes?.length) {
      for (const vol of this.deployment.volumes) {
        plan.will_create.push(
          `Volume: ${vol.name} (${vol.size}GB at ${vol.mount})`
        );
      }
    }

    if (this.deployment.environment) {
      const keys = Object.keys(this.deployment.environment);
      if (keys.length > 0) {
        plan.will_update.push(`Secrets: ${keys.join(", ")}`);
      }
    }

    return plan;
  }

  // ---------- apply ----------

  async apply(opts?: { dryRun?: boolean }): Promise<DeployResult> {
    if (!/^[\w-]+$/.test(this.deployment.app)) {
      throw new Error(`Invalid Fly app name: "${this.deployment.app}"`);
    }

    if (opts?.dryRun) {
      return (await this.plan()) as unknown as DeployResult;
    }

    const results: DeployResult = {
      deployment_name: this.deploymentName,
      status: "success",
      steps: [],
      errors: []
    };

    try {
      await this.stateManager.updateDeploymentStatus(
        this.deploymentName,
        DeploymentStatus.DEPLOYING
      );

      const app = this.deployment.app;
      const region = this.deployment.region;
      const imageTag = `registry.fly.io/${app}:latest`;

      // 1. Load and validate image spec, then build Docker image
      const specPath = resolve(this.deployment.image);
      const spec = await loadImageSpec(specPath);
      results.steps.push(`Loaded image spec from ${specPath}`);

      // Build Docker image tagged for Fly registry
      await buildImage(spec, imageTag);
      results.steps.push(`Built Docker image: ${imageTag}`);

      // Push to Fly registry
      await execFileAsync("docker", ["push", imageTag], { timeout: 600_000 });
      results.steps.push(`Pushed image to Fly registry`);

      // 2. Ensure Fly app exists
      const exists = await appExists(app);
      if (!exists) {
        await flyctl(["apps", "create", app, "--json"]);
        results.steps.push(`Created Fly app: ${app}`);
      } else {
        results.steps.push(`Fly app already exists: ${app}`);
      }

      // 3. Create volumes if specified
      if (this.deployment.volumes?.length) {
        for (const vol of this.deployment.volumes) {
          try {
            await flyctl([
              "volumes",
              "create",
              vol.name,
              "--app",
              app,
              "--region",
              region,
              "--size",
              String(vol.size),
              "--json",
              "--yes"
            ]);
            results.steps.push(
              `Created volume: ${vol.name} (${vol.size}GB at ${vol.mount})`
            );
          } catch (e) {
            // Volume may already exist; not fatal
            const msg = e instanceof Error ? e.message : String(e);
            if (!msg.includes("already exists")) {
              results.errors.push(`Volume ${vol.name}: ${msg}`);
            } else {
              results.steps.push(`Volume already exists: ${vol.name}`);
            }
          }
        }
      }

      // 4. Set environment variables as secrets
      if (this.deployment.environment) {
        const entries = Object.entries(this.deployment.environment);
        if (entries.length > 0) {
          const secretArgs = entries.map(([k, v]) => `${k}=${v}`);
          await flyctl(["secrets", "set", "--app", app, ...secretArgs]);
          results.steps.push(`Set ${entries.length} secret(s)`);
        }
      }

      // 5. Deploy
      await flyctl(
        ["deploy", "--app", app, "--image", imageTag, "--region", region],
        { timeout: 600_000 }
      );
      results.steps.push("Deployment complete");

      // 6. Update state
      await this.stateManager.writeState(this.deploymentName, {
        status: DeploymentStatus.SERVING,
        app,
        region,
        url: `https://${app}.fly.dev`
      });
    } catch (e) {
      results.status = "error";
      results.errors.push(e instanceof Error ? e.message : String(e));

      await this.stateManager.updateDeploymentStatus(
        this.deploymentName,
        DeploymentStatus.ERROR
      );

      throw e;
    }

    return results;
  }

  // ---------- destroy ----------

  async destroy(): Promise<DeployResult> {
    const results: DeployResult = {
      deployment_name: this.deploymentName,
      status: "success",
      steps: [],
      errors: []
    };

    try {
      results.steps.push(`Destroying Fly app: ${this.deployment.app}...`);

      await flyctl(["apps", "destroy", this.deployment.app, "--yes"]);

      results.steps.push("App destroyed successfully");

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
    }

    return results;
  }

  // ---------- status ----------

  async status(): Promise<DeployStatus> {
    const statusInfo: DeployStatus = {
      deployment_name: this.deploymentName,
      host: `${this.deployment.app}.fly.dev`,
      type: "fly"
    };

    // Get saved state
    const state = await this.stateManager.readState(this.deploymentName);
    if (state) {
      statusInfo.status = (state["status"] as string) ?? "unknown";
      statusInfo.last_deployed = state["last_deployed"] as string | undefined;
      statusInfo.url = state["url"] as string | undefined;
    }

    // Get live status from Fly
    try {
      const raw = await flyctl([
        "status",
        "--app",
        this.deployment.app,
        "--json"
      ]);
      const live = JSON.parse(raw) as Record<string, unknown>;
      statusInfo.live_status = (live["Status"] ?? live["status"]) as
        | string
        | undefined;
    } catch (e) {
      statusInfo.live_status_error = e instanceof Error ? e.message : String(e);
    }

    return statusInfo;
  }

  // ---------- logs ----------

  async logs(opts?: { follow?: boolean; tail?: number }): Promise<string> {
    if (opts?.follow) {
      throw new Error(
        "Streaming logs not supported. Use 'flyctl logs --app " +
          `${this.deployment.app} --follow' directly.`
      );
    }

    const args = ["logs", "--app", this.deployment.app];
    if (opts?.tail !== undefined) {
      args.push("--num", String(opts.tail));
    }

    try {
      const stdout = await flyctl(args, { timeout: 30_000 });
      return stdout;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`Failed to fetch logs: ${msg}`);
    }
  }
}
