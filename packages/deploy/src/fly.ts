/**
 * Fly.io deployment implementation for NodeTool.
 *
 * Handles deployment to Fly.io using the `flyctl` CLI, including:
 * - Docker image building from nodetool-image.yaml specs
 * - Fly app creation and management
 * - Volume provisioning
 * - Secret/environment variable configuration
 * - Service deployment and monitoring
 *
 * Multi-tenant rule: the Fly API token NEVER touches `process.env` or `~/.fly`.
 * It is sourced from the per-user secret store into `ctx.credentials.FLY_API_TOKEN`
 * and handed to every `flyctl` child via the scoped child env built by
 * {@link runScopedCommand} — flyctl reads `FLY_API_TOKEN` from its environment.
 * The Fly Docker registry (`registry.fly.io`) is authed into a call-scoped
 * `DOCKER_CONFIG` under the context scratch dir via `flyctl auth docker`, so no
 * host `~/.docker/config.json` is consulted for build/push.
 */

import { resolve } from "node:path";

import { loadImageSpec } from "./image-spec.js";
import { buildImage } from "./image-builder.js";
import { DeploymentStatus } from "./deployment-config.js";
import { StateManager } from "./state.js";
import {
  makeScopedRunner,
  writeScratchFile
} from "./deployment-context.js";

import type { FlyDeployment } from "./deployment-config.js";
import type { DeploymentContext, ScopedRunner } from "./deployment-context.js";
import type { DockerAuth } from "./docker.js";
import type { DeployResult, DeployPlan, DeployStatus } from "./self-hosted.js";

// ============================================================================
// Helpers
// ============================================================================

const FLY_CLI_TIMEOUT_MS = 60_000;

/**
 * Run a flyctl command and return its stdout.
 *
 * Auth comes from the scoped runner's child env (`FLY_API_TOKEN` from
 * `ctx.credentials`), never from `~/.fly`. Throws a descriptive error when
 * flyctl is not installed or the command fails.
 */
async function flyctl(
  run: ScopedRunner,
  args: string[],
  opts?: { timeoutMs?: number; env?: Record<string, string> }
): Promise<string> {
  try {
    const { stdout } = await run("flyctl", args, {
      timeoutMs: opts?.timeoutMs ?? FLY_CLI_TIMEOUT_MS,
      env: opts?.env
    });
    return stdout;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("ENOENT")) {
      throw new Error(
        "flyctl not found — install from https://fly.io/docs/flyctl/install/"
      );
    }
    throw new Error(`flyctl ${args[0]} failed: ${msg}`);
  }
}

/**
 * Run flyctl and parse the JSON output.
 */
async function flyctlJson<T = unknown>(
  run: ScopedRunner,
  args: string[],
  opts?: { timeoutMs?: number }
): Promise<T> {
  const raw = await flyctl(run, args, opts);
  return JSON.parse(raw) as T;
}

/**
 * Check whether a Fly app already exists.
 */
async function appExists(run: ScopedRunner, app: string): Promise<boolean> {
  try {
    const apps = await flyctlJson<Array<{ Name?: string; name?: string }>>(
      run,
      ["apps", "list", "--json"]
    );
    return apps.some((a) => (a.Name ?? a.name) === app);
  } catch {
    return false;
  }
}

/**
 * Configure a call-scoped Docker auth for the Fly registry.
 *
 * `flyctl auth docker` installs a credential entry for `registry.fly.io` using
 * the `FLY_API_TOKEN` carried in the scoped child env. We point `DOCKER_CONFIG`
 * at a scratch dir so the credential lands there instead of the host
 * `~/.docker/config.json`, and return a {@link DockerAuth} threading the same
 * scratch dir into the subsequent build/push.
 */
async function makeFlyDockerAuth(
  ctx: DeploymentContext,
  run: ScopedRunner
): Promise<DockerAuth> {
  // Ensure the scratch docker config dir exists (0700) before any docker call.
  await writeScratchFile(ctx, ".docker/.keep", "");
  const dockerConfigDir = resolve(ctx.scratchDir, ".docker");

  // Token comes from ctx.credentials.FLY_API_TOKEN via the scoped child env.
  await run("flyctl", ["auth", "docker"], {
    env: { DOCKER_CONFIG: dockerConfigDir },
    timeoutMs: FLY_CLI_TIMEOUT_MS
  });

  return { run, dockerConfigDir };
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
 *
 * All `flyctl`/`docker` invocations go through a context-bound
 * {@link ScopedRunner} so the user's `FLY_API_TOKEN` reaches the child env and
 * nothing leaks from the host.
 */
export class FlyDeployer {
  readonly deploymentName: string;
  readonly deployment: FlyDeployment;
  readonly stateManager: StateManager;
  private readonly ctx: DeploymentContext;
  private readonly run: ScopedRunner;

  constructor(
    deploymentName: string,
    deployment: FlyDeployment,
    stateManager: StateManager,
    ctx: DeploymentContext
  ) {
    this.deploymentName = deploymentName;
    this.deployment = deployment;
    this.stateManager = stateManager;
    this.ctx = ctx;
    this.run = makeScopedRunner(ctx);
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

    const exists = await appExists(this.run, this.deployment.app);

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

      // Authenticate the Fly registry into a scratch DOCKER_CONFIG (token from
      // ctx.credentials.FLY_API_TOKEN), never the host ~/.docker/config.json.
      const dockerAuth = await makeFlyDockerAuth(this.ctx, this.run);
      results.steps.push("Configured Fly registry auth (scoped)");

      // Build Docker image tagged for Fly registry (scoped DOCKER_CONFIG).
      await buildImage(spec, imageTag, { auth: dockerAuth });
      results.steps.push(`Built Docker image: ${imageTag}`);

      // Push to Fly registry through the scoped docker config.
      await dockerAuth.run("docker", ["push", imageTag], {
        env: { DOCKER_CONFIG: dockerAuth.dockerConfigDir },
        timeoutMs: 600_000
      });
      results.steps.push(`Pushed image to Fly registry`);

      // 2. Ensure Fly app exists
      const exists = await appExists(this.run, app);
      if (!exists) {
        await flyctl(this.run, ["apps", "create", app, "--json"]);
        results.steps.push(`Created Fly app: ${app}`);
      } else {
        results.steps.push(`Fly app already exists: ${app}`);
      }

      // 3. Create volumes if specified
      if (this.deployment.volumes?.length) {
        for (const vol of this.deployment.volumes) {
          try {
            await flyctl(this.run, [
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

      // 4. Set environment variables as secrets.
      //    Secret values are fed via `flyctl secrets import` over stdin so they
      //    never appear in argv (ps/proc-visible).
      if (this.deployment.environment) {
        const entries = Object.entries(this.deployment.environment);
        if (entries.length > 0) {
          const stdin = entries.map(([k, v]) => `${k}=${v}`).join("\n") + "\n";
          await this.run("flyctl", ["secrets", "import", "--app", app], {
            input: stdin,
            timeoutMs: FLY_CLI_TIMEOUT_MS
          });
          results.steps.push(`Set ${entries.length} secret(s)`);
        }
      }

      // 5. Deploy
      await flyctl(
        this.run,
        ["deploy", "--app", app, "--image", imageTag, "--region", region],
        { timeoutMs: 600_000 }
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

      await flyctl(this.run, ["apps", "destroy", this.deployment.app, "--yes"]);

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
      const raw = await flyctl(this.run, [
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
      const stdout = await flyctl(this.run, args, { timeoutMs: 30_000 });
      return stdout;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`Failed to fetch logs: ${msg}`);
    }
  }
}
