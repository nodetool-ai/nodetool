/**
 * HuggingFace Spaces deployment implementation for NodeTool.
 *
 * Handles deployment to HuggingFace Spaces (Docker type), including:
 * - Dockerfile generation from image spec
 * - HF Space repository creation and management
 * - Git-based deployment (push Dockerfile to HF repo, Spaces builds it)
 * - Space metadata via README.md frontmatter
 *
 * Multi-tenant credentials: the HuggingFace token is sourced from
 * `ctx.credentials.HF_TOKEN` (a per-user Secret), NEVER from `process.env`.
 * It reaches the child processes two ways, neither of which puts the token on
 * argv (where `ps` / `/proc` could read it):
 *   - `huggingface-cli` honours the `HF_TOKEN` env var, so it is passed via the
 *     scoped child env.
 *   - `git` clone/push authenticates via an `http.extraHeader` Bearer header
 *     injected through `GIT_CONFIG_COUNT` / `GIT_CONFIG_KEY_0` /
 *     `GIT_CONFIG_VALUE_0` env vars (config-via-env, not via `-c` on argv).
 */

import * as path from "node:path";
import * as fs from "node:fs/promises";

import { loadImageSpec } from "./image-spec.js";
import { generateDockerfile } from "./image-builder.js";
import { StateManager } from "./state.js";
import { DeploymentStatus } from "./deployment-config.js";
import {
  makeScopedRunner,
  type DeploymentContext,
  type ScopedRunner
} from "./deployment-context.js";

import type { HuggingFaceDeployment } from "./deployment-config.js";
import type { DeployResult } from "./self-hosted.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build the child-env entries that carry the HuggingFace token to git as an
 * `http.extraHeader` Bearer header WITHOUT placing the token on argv.
 *
 * Git reads `GIT_CONFIG_KEY_<n>` / `GIT_CONFIG_VALUE_<n>` pairs from the
 * environment when `GIT_CONFIG_COUNT` is set, so the secret stays out of the
 * process command line. When no token is present, returns an empty object and
 * the clone/push proceeds unauthenticated (public spaces / CLI fallback).
 */
function gitAuthEnv(token: string | undefined): Record<string, string> {
  if (!token) {
    return {};
  }
  return {
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "http.extraHeader",
    GIT_CONFIG_VALUE_0: `Authorization: Bearer ${token}`
  };
}

/**
 * Build the child-env entries that authenticate `huggingface-cli`.
 *
 * The CLI honours the `HF_TOKEN` env var; the token comes from
 * `ctx.credentials`, never `process.env`.
 */
function hfCliEnv(token: string | undefined): Record<string, string> {
  return token ? { HF_TOKEN: token } : {};
}

/**
 * Run the `huggingface-cli` command (through the scoped runner) and return
 * stdout. Throws a descriptive error when the CLI is not installed.
 */
async function hfCli(
  run: ScopedRunner,
  args: string[],
  opts?: { timeoutMs?: number; cwd?: string; env?: Record<string, string> }
): Promise<string> {
  try {
    const { stdout } = await run("huggingface-cli", args, {
      timeoutMs: opts?.timeoutMs ?? 60_000,
      cwd: opts?.cwd,
      env: opts?.env
    });
    return stdout;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("ENOENT") || msg.includes("huggingface-cli")) {
      // ENOENT or a command-not-found style failure: surface install guidance.
      if (msg.includes("ENOENT")) {
        throw new Error(
          "huggingface-cli not found. Install it with: pip install huggingface_hub[cli]\n" +
            "See https://huggingface.co/docs/huggingface_hub/guides/cli for details."
        );
      }
    }
    throw new Error(`huggingface-cli failed: ${msg}`);
  }
}

/**
 * Run a git command (through the scoped runner) and return stdout.
 */
async function git(
  run: ScopedRunner,
  args: string[],
  opts?: { timeoutMs?: number; cwd?: string; env?: Record<string, string> }
): Promise<string> {
  try {
    const { stdout } = await run("git", args, {
      timeoutMs: opts?.timeoutMs ?? 60_000,
      cwd: opts?.cwd,
      env: opts?.env
    });
    return stdout;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`git command failed: ${msg}`);
  }
}

/**
 * Generate the README.md content with HuggingFace Spaces YAML frontmatter.
 */
function generateSpaceReadme(deployment: HuggingFaceDeployment): string {
  const frontmatter: string[] = [
    "---",
    "title: NodeTool",
    'emoji: "\\U0001F527"',
    "colorFrom: blue",
    "colorTo: purple",
    "sdk: docker",
    "app_port: 7777"
  ];

  if (deployment.hardware) {
    frontmatter.push(`hardware: ${deployment.hardware}`);
  }

  frontmatter.push("pinned: false");
  frontmatter.push("---");
  frontmatter.push("");

  return frontmatter.join("\n");
}

// ---------------------------------------------------------------------------
// HuggingFaceDeployer class
// ---------------------------------------------------------------------------

/**
 * Handles deployment to HuggingFace Spaces.
 *
 * HF Spaces with Docker type build from a Dockerfile pushed to a git repo.
 * This deployer generates the Dockerfile from the image spec, pushes it to
 * the HF Space repository, and lets HuggingFace handle the build and deploy.
 */
export class HuggingFaceDeployer {
  readonly deploymentName: string;
  readonly deployment: HuggingFaceDeployment;
  readonly stateManager: StateManager;
  private readonly ctx: DeploymentContext;
  /** Runner bound to {@link ctx}; every child process runs with the scoped env. */
  private readonly run: ScopedRunner;

  constructor(
    deploymentName: string,
    deployment: HuggingFaceDeployment,
    stateManager: StateManager,
    ctx: DeploymentContext
  ) {
    this.deploymentName = deploymentName;
    this.deployment = deployment;
    this.stateManager = stateManager;
    this.ctx = ctx;
    this.run = makeScopedRunner(ctx);
  }

  // ---------- Public API ----------

  /**
   * Generate a deployment plan showing what changes will be made.
   */
  async plan(): Promise<Record<string, unknown>> {
    const planResult: Record<string, unknown> = {
      deployment_name: this.deploymentName,
      type: "huggingface",
      repo: this.deployment.repo,
      changes: [] as string[],
      will_create: [] as string[],
      will_update: [] as string[],
      will_destroy: [] as string[]
    };

    const changes = planResult["changes"] as string[];
    const willCreate = planResult["will_create"] as string[];

    const currentState = await this.stateManager.readState(this.deploymentName);

    if (!currentState || !currentState["last_deployed"]) {
      changes.push("Initial deployment - will create HF Space repository");
      willCreate.push(`HuggingFace Space: ${this.deployment.repo}`);
      willCreate.push("Dockerfile (generated from image spec)");
      willCreate.push("README.md (Space metadata)");
    } else {
      changes.push("Will update Dockerfile and push to HF Space");
      (planResult["will_update"] as string[]).push(
        `HuggingFace Space: ${this.deployment.repo}`
      );
    }

    if (this.deployment.hardware) {
      changes.push(`Hardware: ${this.deployment.hardware}`);
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
   * Apply the deployment to HuggingFace Spaces.
   *
   * Steps:
   * 1. Load image spec and generate Dockerfile (not built locally)
   * 2. Create or clone the HF Space repository
   * 3. Write Dockerfile and README.md with Space metadata
   * 4. Git commit and push to HuggingFace
   * 5. HF Spaces auto-builds and deploys from the Dockerfile
   * 6. Update deployment state
   *
   * @param opts.dryRun If true, only show what would be done without executing.
   */
  async apply(opts?: { dryRun?: boolean }): Promise<DeployResult> {
    if (!/^[\w-]+\/[\w.-]+$/.test(this.deployment.repo)) {
      throw new Error(
        `Invalid HuggingFace repo: "${this.deployment.repo}". Expected "owner/name"`
      );
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

    // The token is per-user (Secret store), never process.env. It reaches the
    // CLI via the HF_TOKEN env var and git via an http.extraHeader injected
    // through GIT_CONFIG_* env vars — neither places it on argv.
    const token = this.ctx.credentials.HF_TOKEN;
    const gitEnv = gitAuthEnv(token);
    const cliEnv = hfCliEnv(token);

    // Clone/build inside the call-scoped scratch dir (owned + torn down by the
    // manager) rather than a self-managed mkdtemp.
    const repoDir = path.join(this.ctx.scratchDir, "hf-repo");

    try {
      await this.stateManager.updateDeploymentStatus(
        this.deploymentName,
        DeploymentStatus.DEPLOYING
      );

      // 1. Generate Dockerfile from image spec
      results.steps.push("Loading image spec...");
      const spec = await loadImageSpec(this.deployment.image);

      results.steps.push("Generating Dockerfile...");
      const dockerfileContent = generateDockerfile(spec);

      // 2. Create or clone the HF repo
      results.steps.push(
        `Setting up HuggingFace Space: ${this.deployment.repo}...`
      );
      await this.ensureRepo(repoDir, results, gitEnv, cliEnv);

      // 3. Write Dockerfile
      results.steps.push("Writing Dockerfile...");
      await fs.writeFile(
        path.join(repoDir, "Dockerfile"),
        dockerfileContent,
        "utf-8"
      );

      // 4. Write README.md with Space metadata
      results.steps.push("Writing Space metadata (README.md)...");
      const readme = generateSpaceReadme(this.deployment);
      await fs.writeFile(path.join(repoDir, "README.md"), readme, "utf-8");

      // 5. Git commit and push
      results.steps.push("Committing and pushing to HuggingFace...");
      await git(this.run, ["config", "user.email", "deploy@nodetool.ai"], {
        cwd: repoDir
      });
      await git(this.run, ["config", "user.name", "NodeTool Deploy"], {
        cwd: repoDir
      });
      await git(this.run, ["add", "-A"], { cwd: repoDir });

      // Check if there are changes to commit
      try {
        await git(this.run, ["diff", "--cached", "--quiet"], { cwd: repoDir });
        results.steps.push("No changes detected, skipping commit");
      } catch {
        // diff --quiet exits non-zero when there are changes
        await git(
          this.run,
          ["commit", "-m", "Deploy NodeTool via nodetool deploy"],
          { cwd: repoDir }
        );
        await git(this.run, ["push", "origin", "main"], {
          cwd: repoDir,
          timeoutMs: 120_000,
          env: gitEnv
        });
        results.steps.push("Pushed to HuggingFace Space");
      }

      results.steps.push(
        "HuggingFace Spaces will now build and deploy the Dockerfile"
      );

      // 6. Update state
      await this.stateManager.writeState(this.deploymentName, {
        status: DeploymentStatus.SERVING,
        repo: this.deployment.repo,
        space_url: `https://huggingface.co/spaces/${this.deployment.repo}`
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

  /**
   * Destroy the HuggingFace Space.
   */
  async destroy(): Promise<DeployResult> {
    const results: DeployResult = {
      deployment_name: this.deploymentName,
      status: "success",
      steps: [],
      errors: []
    };

    const cliEnv = hfCliEnv(this.ctx.credentials.HF_TOKEN);

    try {
      results.steps.push(
        `Deleting HuggingFace Space: ${this.deployment.repo}...`
      );

      await hfCli(
        this.run,
        ["repo", "delete", this.deployment.repo, "--type", "space", "--yes"],
        { env: cliEnv }
      );

      results.steps.push("Space deleted successfully");

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

  /**
   * Get current deployment status.
   */
  async status(): Promise<Record<string, unknown>> {
    const statusInfo: Record<string, unknown> = {
      deployment_name: this.deploymentName,
      type: "huggingface",
      repo: this.deployment.repo,
      space_url: `https://huggingface.co/spaces/${this.deployment.repo}`
    };

    // Get state from state manager
    const state = await this.stateManager.readState(this.deploymentName);
    if (state) {
      statusInfo["status"] = state["status"] ?? "unknown";
      statusInfo["last_deployed"] = state["last_deployed"];
    }

    // Try to get live status from HF
    try {
      const output = await hfCli(
        this.run,
        ["repo", "info", this.deployment.repo, "--type", "space"],
        { env: hfCliEnv(this.ctx.credentials.HF_TOKEN) }
      );
      statusInfo["live_status"] = output.trim();
    } catch (e) {
      statusInfo["live_status_error"] =
        e instanceof Error ? e.message : String(e);
    }

    return statusInfo;
  }

  /**
   * Get logs from the HuggingFace Space.
   *
   * HuggingFace Spaces does not expose logs via the CLI. Logs are available
   * through the web UI at the Space URL.
   */
  async logs(_opts?: { follow?: boolean; tail?: number }): Promise<string> {
    const spaceUrl = `https://huggingface.co/spaces/${this.deployment.repo}`;
    return (
      `HuggingFace Spaces logs are not available via the CLI.\n` +
      `View logs in the web UI: ${spaceUrl}\n` +
      `Navigate to the "Logs" tab in your Space settings.`
    );
  }

  // ---------- Private helpers ----------

  /**
   * Ensure the HF Space repository exists and is cloned to `repoDir`.
   * Creates the repo if it does not exist, then clones it.
   *
   * @param gitEnv Child-env entries carrying the git Bearer header (off argv).
   * @param cliEnv Child-env entries carrying HF_TOKEN for `huggingface-cli`.
   */
  private async ensureRepo(
    repoDir: string,
    results: DeployResult,
    gitEnv: Record<string, string>,
    cliEnv: Record<string, string>
  ): Promise<void> {
    // Try to create the repo (may already exist)
    try {
      await hfCli(
        this.run,
        [
          "repo",
          "create",
          this.deployment.repo,
          "--type",
          "space",
          "--space_sdk",
          "docker",
          "--yes"
        ],
        { env: cliEnv }
      );
      results.steps.push(`Created HuggingFace Space: ${this.deployment.repo}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Ignore "already exists" errors
      if (!msg.includes("already exists") && !msg.includes("409")) {
        throw e;
      }
      results.steps.push(
        `HuggingFace Space already exists: ${this.deployment.repo}`
      );
    }

    const repoUrl = `https://huggingface.co/spaces/${this.deployment.repo}`;
    await git(this.run, ["clone", repoUrl, repoDir], {
      timeoutMs: 120_000,
      env: gitEnv
    });
    results.steps.push(`Cloned Space repository: ${this.deployment.repo}`);
  }
}
