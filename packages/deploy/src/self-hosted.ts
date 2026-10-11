/**
 * Self-hosted deployment implementation for NodeTool.
 *
 * This module handles deployment to self-hosted servers via SSH or locally, including:
 * - Docker run command generation
 * - Remote/local directory setup
 * - Single container orchestration
 * - Health monitoring
 * - Localhost detection (skips SSH for localhost deployments)
 */

import { execSync, execFileSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { SSHCommandError, SSHConnection } from "./ssh.js";
import {
  DockerRunGenerator,
  type DockerRunDeployment as DockerRunSelfHostedDeployment
} from "./docker-run.js";
import {
  DeploymentStatus,
  DockerDeployment,
  dockerDeploymentGetServerUrl,
  imageConfigFullName
} from "./deployment-config.js";
import { StateManager } from "./state.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Common interface for executors used in deployer code.
 * Both LocalExecutor and SSHConnection are used through this interface.
 * All methods return Promises to properly support async SSH operations.
 */
export interface Executor {
  execute(
    command: string,
    check?: boolean,
    timeout?: number
  ): Promise<[exitCode: number, stdout: string, stderr: string]>;
  mkdir(dirPath: string, mode?: number, parents?: boolean): Promise<void>;
}

/** Result dictionary used throughout deployer methods. */
export interface DeployResult {
  deployment_name: string;
  status: string;
  steps: string[];
  errors: string[];
  [key: string]: unknown;
}

/** Plan dictionary returned by plan(). */
export interface DeployPlan {
  deployment_name: string;
  host: string;
  type: string;
  changes: string[];
  will_create: string[];
  will_update: string[];
  will_destroy: string[];
  [key: string]: unknown;
}

/** Status dictionary returned by status(). */
export interface DeployStatus {
  deployment_name: string;
  host: string;
  type: string;
  container_name?: string;
  status?: string;
  last_deployed?: string;
  url?: string;
  live_status?: string;
  live_status_error?: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/**
 * Quote a string for use in a shell command, but allow ~ at the start.
 * This ensures that the shell can still expand the home directory.
 */
export function safeShellQuote(s: string): string {
  if (s.startsWith("~/")) {
    return "~/" + shellQuote(s.slice(2));
  }
  return shellQuote(s);
}

/**
 * Simple POSIX shell quoting: wraps in single-quotes, escaping existing
 * single-quotes by ending the quote, inserting an escaped single-quote,
 * then re-opening the quote.
 */
function shellQuote(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

/**
 * Expand a leading ~ to the user's home directory.
 */
function expandUser(p: string): string {
  if (p === "~" || p.startsWith("~/")) {
    return path.join(os.homedir(), p.slice(1));
  }
  return p;
}

/** uid and gid of the `node` user the published image runs as. */
const CONTAINER_UID = 1000;

/**
 * How long `docker stop` waits before SIGKILL. The server spends up to
 * NODETOOL_SHUTDOWN_GRACE_MS (240 s by default) letting aborted chat turns
 * and jobs write their final rows, then flushes telemetry. Docker's default
 * of 10 s cuts that off and leaves transcripts incomplete. An idle server
 * exits at once, so the longer limit costs nothing on a quiet redeploy.
 */
const STOP_TIMEOUT_SECONDS = 270;

const LOCALHOST_NAMES = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);

/** Every address a host resolves to; empty when neither tool answers. */
function resolveIps(target: string): string[] {
  try {
    // getent (Linux) prints "127.0.0.1  localhost" — the IP is the first field.
    return execFileSync("getent", ["hosts", target], {
      encoding: "utf-8",
      timeout: 5000
    })
      .trim()
      .split("\n")
      .map((line) => line.trim().split(/\s+/)[0])
      .filter((ip) => ip.length > 0);
  } catch {
    // getent is Linux-only; macOS answers through dscacheutil instead.
  }
  try {
    return execFileSync("dscacheutil", ["-q", "host", "-a", "name", target], {
      encoding: "utf-8",
      timeout: 5000
    })
      .trim()
      .split("\n")
      .map((line) => line.match(/^ip_address:\s+(.+)/))
      .filter((match): match is RegExpMatchArray => match !== null)
      .map((match) => match[1].trim());
  } catch {
    return [];
  }
}

/**
 * Check if host resolves to the local machine.
 */
export function isLocalhost(host: string): boolean {
  if (LOCALHOST_NAMES.has(host.trim().toLowerCase())) {
    return true;
  }

  const hostIps = resolveIps(host);
  if (hostIps.length === 0) return false;

  const localIps = new Set([
    ...resolveIps("localhost"),
    ...resolveIps(os.hostname())
  ]);
  return hostIps.some((ip) => localIps.has(ip));
}

// ---------------------------------------------------------------------------
// LocalExecutor
// ---------------------------------------------------------------------------

/**
 * Executes commands locally (mimics SSHConnection interface).
 */
export class LocalExecutor {
  /**
   * Open the executor (no-op for local).
   * Provided for symmetry with SSHConnection.
   */
  open(): LocalExecutor {
    return this;
  }

  /**
   * Close the executor (no-op for local).
   */
  close(): void {
    // nothing to do
  }

  /**
   * Execute a command locally in a shell, so pipes, redirects, &&/||, and
   * environment-variable assignments work as they do over SSH.
   */
  async execute(
    command: string,
    check = true,
    timeout?: number
  ): Promise<[exitCode: number, stdout: string, stderr: string]> {
    try {
      const result = execSync(command, {
        shell: "/bin/bash",
        encoding: "utf-8",
        timeout: timeout ? timeout * 1000 : undefined,
        maxBuffer: 50 * 1024 * 1024,
        stdio: ["pipe", "pipe", "pipe"]
      });
      return [0, result ?? "", ""];
    } catch (err: unknown) {
      const e = err as {
        status?: number;
        stdout?: string;
        stderr?: string;
        killed?: boolean;
        signal?: string;
      };

      const exitCode = e.status ?? -1;
      const stdout = typeof e.stdout === "string" ? e.stdout : "";
      const stderr = typeof e.stderr === "string" ? e.stderr : "";

      // Timeout
      if (e.killed || e.signal === "SIGTERM") {
        throw new SSHCommandError(
          `Command timed out: ${command}`,
          -1,
          stdout,
          stderr
        );
      }

      if (check && exitCode !== 0) {
        throw new SSHCommandError(
          `Command failed: ${command}`,
          exitCode,
          stdout,
          stderr
        );
      }

      return [exitCode, stdout, stderr];
    }
  }

  /**
   * Create a directory locally.
   */
  async mkdir(dirPath: string, _mode = 0o755, parents = true): Promise<void> {
    const expandedPath = expandUser(dirPath);
    if (parents) {
      fs.mkdirSync(expandedPath, { recursive: true, mode: _mode });
    } else {
      fs.mkdirSync(expandedPath, { mode: _mode });
    }
  }
}

// ---------------------------------------------------------------------------
// DockerDeployer
// ---------------------------------------------------------------------------

/**
 * Deployer for Docker-based self-hosted deployments, over SSH or locally.
 */
export class DockerDeployer {
  readonly deploymentName: string;
  readonly deployment: DockerDeployment;
  readonly stateManager: StateManager;
  readonly isLocalhost: boolean;

  constructor(
    deploymentName: string,
    deployment: DockerDeployment,
    stateManager?: StateManager
  ) {
    this.deploymentName = deploymentName;
    this.deployment = deployment;
    this.stateManager = stateManager ?? new StateManager();
    this.isLocalhost = isLocalhost(deployment.host);
  }

  // ---- Logging -----------------------------------------------------------

  private log(results: Record<string, unknown>, message: string): void {
    const steps = results["steps"];
    if (Array.isArray(steps)) {
      steps.push(message);
    }
    console.log(`  ${message}`);
  }

  // ---- Executor ----------------------------------------------------------

  private getExecutor(): Executor {
    if (this.isLocalhost) {
      return new LocalExecutor();
    }

    const sshConfig = this.deployment.ssh;
    if (!sshConfig) {
      throw new Error(
        `SSH configuration is required for remote host: ${this.deployment.host}`
      );
    }

    const conn = new SSHConnection({
      host: this.deployment.host,
      user: sshConfig.user,
      keyPath: sshConfig.key_path,
      password: sshConfig.password,
      port: sshConfig.port
    });

    // Wrap SSHConnection to match the async Executor interface.
    return {
      execute(command: string, check = true, timeout?: number) {
        return conn.execute(command, { check, timeout });
      },
      mkdir(dirPath: string, mode = 0o755, parents = true) {
        return conn.mkdir(dirPath, mode, parents);
      },
      _sshConnection: conn
    } as Executor & { _sshConnection: SSHConnection };
  }

  /**
   * Use an executor within a callback, ensuring proper open/close lifecycle.
   */
  private async withExecutor<R>(
    fn: (executor: Executor) => Promise<R>
  ): Promise<R> {
    const executor = this.getExecutor();
    const sshConn = (executor as { _sshConnection?: SSHConnection })
      ._sshConnection;
    if (sshConn) {
      await sshConn.connect();
    } else {
      // LocalExecutor
      (executor as LocalExecutor).open();
    }
    try {
      return await fn(executor);
    } finally {
      if (sshConn) {
        sshConn.disconnect();
      } else {
        (executor as LocalExecutor).close();
      }
    }
  }

  // ---- Directory creation ------------------------------------------------

  private async createDirectories(
    ssh: Executor,
    results: Record<string, unknown>
  ): Promise<void> {
    this.log(results, "Creating directories...");

    // Create the paths with the target's own shell so `~` expands to the home
    // directory there, which is what the `docker run -v` mount resolves to.
    const workspacePath = this.deployment.paths.workspace;
    const hfCachePath = this.deployment.paths.hf_cache;
    const dirs = [
      workspacePath,
      `${workspacePath}/data`,
      `${workspacePath}/assets`,
      `${workspacePath}/temp`,
      hfCachePath
    ];
    await ssh.execute(
      `mkdir -p ${dirs.map(safeShellQuote).join(" ")}`,
      true,
      30
    );
    this.log(results, `  Created: ${workspacePath}`);
    this.log(results, `  Created: ${hfCachePath}`);
  }

  /**
   * Hand the workspace mount to the image's `node` user (uid 1000). The
   * directory belongs to whoever ran `mkdir`, and the container cannot write
   * to it otherwise: the entrypoint cannot store the generated master key and
   * SQLite cannot create the database. Runs as root inside the image, so it
   * needs no sudo on the host and maps uids correctly under rootless podman.
   */
  private async prepareWorkspaceOwnership(
    ssh: Executor,
    results: DeployResult
  ): Promise<void> {
    const runtime = this.runtimeCommandForShell();
    const image = shellQuote(imageConfigFullName(this.deployment.image));
    const mount = safeShellQuote(
      `${this.deployment.paths.workspace}:/workspace`
    );
    await ssh.execute(
      `${runtime} run --rm --user 0 --entrypoint chown -v ${mount} ${image} ` +
        `${CONTAINER_UID}:${CONTAINER_UID} /workspace /workspace/data /workspace/assets /workspace/temp`,
      true,
      120
    );
    results.steps.push(`  Workspace owned by container user ${CONTAINER_UID}`);
  }

  // ---- Container runtime helpers -----------------------------------------

  private resolveLocalRuntimeCommand(): string {
    const override = process.env["NODETOOL_CONTAINER_RUNTIME"];
    if (override === "docker" || override === "podman") return override;

    try {
      execFileSync("which", ["docker"], { encoding: "utf-8" });
      return "docker";
    } catch {
      // docker not found
    }
    try {
      execFileSync("which", ["podman"], { encoding: "utf-8" });
      return "podman";
    } catch {
      // podman not found
    }
    return "docker";
  }

  private runtimeCommandForShell(): string {
    const override = process.env["NODETOOL_CONTAINER_RUNTIME"];
    if (override === "docker" || override === "podman") return override;
    if (this.isLocalhost) return this.resolveLocalRuntimeCommand();
    return "$((command -v docker >/dev/null 2>&1 && echo docker) || (command -v podman >/dev/null 2>&1 && echo podman) || echo docker)";
  }

  private containerGenerator(runtimeCommand?: string): DockerRunGenerator {
    const cmd = runtimeCommand ?? this.runtimeCommandForShell();
    const d = this.deployment;
    const converted: DockerRunSelfHostedDeployment = {
      image: d.image,
      container: d.container,
      paths: {
        workspace: d.paths.workspace,
        hfCache: d.paths.hf_cache
      },
      persistentPaths: d.persistent_paths
        ? {
            usersFile: d.persistent_paths.users_file,
            dbPath: d.persistent_paths.db_path,
            vectorstoreDbPath: d.persistent_paths.vectorstore_db_path,
            hfCache: d.persistent_paths.hf_cache,
            assetBucket: d.persistent_paths.asset_bucket,
            logsPath: d.persistent_paths.logs_path
          }
        : undefined,
      serverAuthToken: d.server_auth_token
    };
    return new DockerRunGenerator(converted, cmd);
  }

  private containerName(): string {
    return this.containerGenerator().getContainerName();
  }

  /**
   * Return host port for direct app mode (matches DockerRunGenerator).
   */
  private appHostPort(): number {
    const container = this.deployment.container;
    if (container && container.port === 7777) return 8000;
    return container?.port ?? 8000;
  }

  // ---- Deployment operations ---------------------------------------------

  async plan(): Promise<DeployPlan> {
    const plan: DeployPlan = {
      deployment_name: this.deploymentName,
      host: this.deployment.host,
      type: "docker",
      changes: [],
      will_create: [],
      will_update: [],
      will_destroy: []
    };

    const generator = this.containerGenerator();
    const containerName = generator.getContainerName();

    const currentState = await this.stateManager.readState(this.deploymentName);
    const currentHash = currentState
      ? (currentState["container_run_hash"] as string | undefined)
      : undefined;

    const newHash = generator.generateHash();

    if (!currentState || !currentState["last_deployed"]) {
      plan.changes.push("Initial deployment - will create all resources");
      plan.will_create.push(`App container: ${containerName}`);
    } else if (currentHash !== newHash) {
      plan.changes.push("Container configuration has changed");
      plan.will_update.push("App container");
    }

    plan.will_create.push(
      `Directory: ${this.deployment.paths.workspace}`,
      `Directory: ${this.deployment.paths.hf_cache}`,
      `Container: ${containerName}`
    );

    return plan;
  }

  async apply(opts?: { dryRun?: boolean }): Promise<DeployResult | DeployPlan> {
    // A dry run reports the plan itself rather than a deployment result.
    if (opts?.dryRun) {
      return await this.plan();
    }

    const results: DeployResult = {
      deployment_name: this.deploymentName,
      status: "success",
      steps: [],
      errors: []
    };

    if (this.isLocalhost) {
      results.steps.push("Deploying to localhost (skipping SSH)");
    }

    try {
      await this.stateManager.updateDeploymentStatus(
        this.deploymentName,
        DeploymentStatus.DEPLOYING
      );

      await this.withExecutor(async (executor) => {
        await this.createDirectories(executor, results);
        await this.ensureImage(executor, results);
        await this.prepareWorkspaceOwnership(executor, results);

        await this.stopExistingContainer(executor, results);

        const containerRunHash = await this.startContainer(executor, results);

        await this.checkHealth(executor, results);

        const containerName = this.containerName();
        await this.stateManager.writeState(this.deploymentName, {
          status: DeploymentStatus.RUNNING,
          container_run_hash: containerRunHash,
          container_name: containerName,
          container_id: null,
          url: dockerDeploymentGetServerUrl(this.deployment)
        });
      });
    } catch (e) {
      results.status = "error";
      results.errors.push(String(e));
      await this.stateManager.updateDeploymentStatus(
        this.deploymentName,
        DeploymentStatus.ERROR
      );
      throw e;
    }

    return results;
  }

  // ---- Private helpers ---------------------------------------------------

  private async stopExistingContainer(
    ssh: Executor,
    results: DeployResult
  ): Promise<void> {
    results.steps.push("Checking for existing app container...");

    const containerName = this.containerName();
    if (this.isLocalDockerRuntime()) {
      await this.stopExistingContainerWithShell(ssh, containerName, results);
      await this.stopLocalPortConflictsWithShell(
        ssh,
        containerName,
        this.appHostPort(),
        results
      );
      return;
    }

    const runtime = this.runtimeCommandForShell();
    const checkCommand = `${runtime} ps -a -q -f name=${safeShellQuote(containerName)}`;

    try {
      const [, stdout] = await ssh.execute(checkCommand, false);
      if (stdout.trim()) {
        results.steps.push(`  Found existing app container: ${containerName}`);
        await ssh.execute(
          `${runtime} stop -t ${STOP_TIMEOUT_SECONDS} ${safeShellQuote(containerName)}`,
          false,
          STOP_TIMEOUT_SECONDS + 30
        );
        results.steps.push(`  Stopped app container: ${containerName}`);
        await ssh.execute(
          `${runtime} rm ${safeShellQuote(containerName)}`,
          false,
          60
        );
        results.steps.push(`  Removed app container: ${containerName}`);
      } else {
        results.steps.push("  No existing app container found");
      }
    } catch (exc) {
      results.steps.push(`  Warning: could not inspect app container: ${exc}`);
    }

    // Clean up legacy NodeTool containers that still hold the same host port
    const publishCheck = `${runtime} ps -a --filter publish=${this.appHostPort()} --format '{{.Names}}'`;
    try {
      const [, stdout] = await ssh.execute(publishCheck, false);
      for (const line of stdout.split("\n")) {
        const conflictName = line.trim();
        if (!conflictName) continue;
        if (conflictName === containerName) continue;
        if (!conflictName.startsWith("nodetool-")) continue;
        results.steps.push(
          `  Found conflicting NodeTool container on port ${this.appHostPort()}: ${conflictName}`
        );
        await ssh.execute(
          `${runtime} stop -t ${STOP_TIMEOUT_SECONDS} ${safeShellQuote(conflictName)}`,
          false,
          STOP_TIMEOUT_SECONDS + 30
        );
        await ssh.execute(
          `${runtime} rm ${safeShellQuote(conflictName)}`,
          false,
          60
        );
        results.steps.push(`  Removed conflicting container: ${conflictName}`);
      }
    } catch (exc) {
      results.steps.push(`  Warning: could not check port conflicts: ${exc}`);
    }
  }

  private async stopExistingContainerWithShell(
    ssh: Executor,
    containerName: string,
    results: DeployResult
  ): Promise<void> {
    const runtime = this.runtimeCommandForShell();
    try {
      const [, stdout] = await ssh.execute(
        `${runtime} ps -a -q -f name=${safeShellQuote(containerName)}`,
        false
      );
      if (!stdout.trim()) {
        results.steps.push("  No existing app container found");
        return;
      }

      results.steps.push(`  Found existing app container: ${containerName}`);
      try {
        await ssh.execute(
          `${runtime} stop -t ${STOP_TIMEOUT_SECONDS} ${safeShellQuote(containerName)}`,
          false,
          STOP_TIMEOUT_SECONDS + 30
        );
        results.steps.push(`  Stopped app container: ${containerName}`);
      } catch (exc) {
        results.steps.push(`  Warning: failed stopping app container: ${exc}`);
      }
      try {
        await ssh.execute(
          `${runtime} rm ${safeShellQuote(containerName)}`,
          false,
          60
        );
        results.steps.push(`  Removed app container: ${containerName}`);
      } catch (exc) {
        results.steps.push(`  Warning: failed removing app container: ${exc}`);
      }
    } catch (exc) {
      results.steps.push(`  Warning: could not inspect app container: ${exc}`);
    }
  }

  private async stopLocalPortConflictsWithShell(
    ssh: Executor,
    containerName: string,
    hostPort: number,
    results: DeployResult
  ): Promise<void> {
    const runtime = this.runtimeCommandForShell();
    try {
      const publishCheck = `${runtime} ps -a --filter publish=${hostPort} --format '{{.Names}}'`;
      const [, stdout] = await ssh.execute(publishCheck, false);
      for (const line of stdout.split("\n")) {
        const conflictName = line.trim();
        if (!conflictName) continue;
        if (conflictName === containerName) continue;
        if (!conflictName.startsWith("nodetool-")) continue;
        results.steps.push(
          `  Found conflicting NodeTool container on port ${hostPort}: ${conflictName}`
        );
        try {
          await ssh.execute(
            `${runtime} stop -t ${STOP_TIMEOUT_SECONDS} ${safeShellQuote(conflictName)}`,
            false,
            STOP_TIMEOUT_SECONDS + 30
          );
        } catch {
          // ignore
        }
        try {
          await ssh.execute(
            `${runtime} rm -f ${safeShellQuote(conflictName)}`,
            false,
            60
          );
        } catch {
          // ignore
        }
        results.steps.push(`  Removed conflicting container: ${conflictName}`);
      }
    } catch (exc) {
      results.steps.push(`  Warning: could not check port conflicts: ${exc}`);
    }
  }

  private async startContainer(
    ssh: Executor,
    results: DeployResult
  ): Promise<string> {
    results.steps.push("Starting app container...");

    const generator = this.containerGenerator();
    const command = generator.generateCommand();
    const containerHash = generator.generateHash();
    // The command carries every `-e` value (SERVER_AUTH_TOKEN, provider keys),
    // so neither the step log nor a failure may echo it.
    results.steps.push(
      `  Image: ${imageConfigFullName(this.deployment.image)}`
    );

    try {
      const [, stdout] = await ssh.execute(command, true, 300);
      const containerId = stdout.trim() || "<unknown>";
      results.steps.push(
        `  App container started: ${containerId.slice(0, 12)}`
      );
    } catch (exc) {
      if (exc instanceof SSHCommandError) {
        results.errors.push(`Failed to start app container: ${exc.stderr}`);
        throw new SSHCommandError(
          `Failed to start app container (exit ${exc.exitCode}): ${exc.stderr.trim()}`,
          exc.exitCode,
          exc.stdout,
          exc.stderr
        );
      }
      throw exc;
    }

    return containerHash;
  }

  private async checkHealth(
    ssh: Executor,
    results: DeployResult
  ): Promise<void> {
    results.steps.push("Checking app health...");

    const containerName = this.containerName();
    const healthUrl = `http://127.0.0.1:${this.appHostPort()}/health`;
    // About a minute: the image's own HEALTHCHECK allows a 30 s start period,
    // and the first boot also runs migrations.
    const maxAttempts = 30;
    let lastErrors: string[] = [];

    await sleep(2);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const attemptErrors: string[] = [];
      const containerStatus = await this.getContainerStatus(ssh, containerName);
      if (containerStatus) {
        results.steps.push(`  Container status: ${containerStatus}`);
      } else {
        attemptErrors.push("app container not running");
      }

      try {
        await ssh.execute(`curl -fsS ${safeShellQuote(healthUrl)}`, true, 20);
        if (attemptErrors.length === 0) {
          results.steps.push(`  Health endpoint OK: ${healthUrl}`);
          return;
        }
      } catch (exc) {
        const err =
          exc instanceof SSHCommandError
            ? (exc.stderr || String(exc)).trim()
            : String(exc).trim();
        attemptErrors.push(`health check failed: ${err}`);
      }

      lastErrors = attemptErrors;
      if (attempt < maxAttempts) {
        results.steps.push(
          `  Waiting for app startup (attempt ${attempt}/${maxAttempts})...`
        );
        await sleep(2);
      }
    }

    for (const err of lastErrors) {
      results.steps.push(`  Warning: ${err}`);
    }
    results.errors.push(...lastErrors);
    throw new Error(`Deployment health check failed: ${lastErrors.join("; ")}`);
  }

  private async getContainerStatus(
    ssh: Executor,
    containerName: string
  ): Promise<string> {
    const runtime = this.runtimeCommandForShell();
    const statusCmd = `${runtime} ps -f name=${safeShellQuote(containerName)} --format '{{.Names}} {{.Status}} {{.Ports}}'`;
    try {
      const [, stdout] = await ssh.execute(statusCmd, false);
      return stdout.trim();
    } catch {
      return "";
    }
  }

  private isLocalDockerRuntime(): boolean {
    return this.isLocalhost && this.resolveLocalRuntimeCommand() === "docker";
  }

  async destroy(): Promise<DeployResult> {
    const results: DeployResult = {
      deployment_name: this.deploymentName,
      status: "success",
      steps: [],
      errors: []
    };

    try {
      await this.withExecutor(async (ssh) => {
        const containerName = this.containerName();
        const runtime = this.runtimeCommandForShell();

        try {
          await ssh.execute(
            `${runtime} stop -t ${STOP_TIMEOUT_SECONDS} ${safeShellQuote(containerName)}`,
            false,
            STOP_TIMEOUT_SECONDS + 30
          );
          results.steps.push(`Container stopped: ${containerName}`);
        } catch (e) {
          if (e instanceof SSHCommandError) {
            results.steps.push(
              `Warning: Failed to stop container: ${e.stderr}`
            );
          }
        }

        try {
          await ssh.execute(
            `${runtime} rm ${safeShellQuote(containerName)}`,
            false,
            30
          );
          results.steps.push(`Container removed: ${containerName}`);
        } catch (e) {
          if (e instanceof SSHCommandError) {
            results.errors.push(`Failed to remove container: ${e.stderr}`);
          }
          throw e;
        }

        await this.stateManager.updateDeploymentStatus(
          this.deploymentName,
          DeploymentStatus.DESTROYED
        );
      });
    } catch (e) {
      results.status = "error";
      results.errors.push(String(e));
      throw e;
    }

    return results;
  }

  async status(): Promise<DeployStatus> {
    const statusInfo: DeployStatus = {
      deployment_name: this.deploymentName,
      host: this.deployment.host,
      container_name: this.containerName(),
      type: "docker"
    };

    const state = await this.stateManager.readState(this.deploymentName);
    if (state) {
      statusInfo.status = (state["status"] as string) ?? "unknown";
      statusInfo.last_deployed =
        (state["last_deployed"] as string) ?? "unknown";
      statusInfo.url = (state["url"] as string) ?? "unknown";
    }

    try {
      await this.withExecutor(async (ssh) => {
        const containerName = this.containerName();
        const runtime = this.runtimeCommandForShell();
        const command = `${runtime} ps -a -f name=${safeShellQuote(containerName)} --format '{{.Status}}'`;
        const [, stdout] = await ssh.execute(command, false);
        statusInfo.live_status = stdout.trim() || "Container not found";
      });
    } catch (e) {
      statusInfo.live_status_error = String(e);
    }

    return statusInfo;
  }

  async logs(opts?: {
    service?: string;
    follow?: boolean;
    tail?: number;
  }): Promise<string> {
    const follow = opts?.follow ?? false;
    const tail = opts?.tail ?? 100;
    return this.withExecutor(async (ssh) => {
      const containerName = this.containerName();
      const runtime = this.runtimeCommandForShell();
      let command = `${runtime} logs --tail=${tail}`;
      if (follow) {
        command += " -f";
      }
      command += ` ${safeShellQuote(containerName)}`;
      const [, stdout] = await ssh.execute(
        command,
        false,
        follow ? undefined : 30
      );
      return stdout;
    });
  }

  private async ensureImage(
    ssh: Executor,
    results: DeployResult
  ): Promise<void> {
    const image = imageConfigFullName(this.deployment.image);

    this.log(results, `Checking image: ${image}`);

    const runtime = this.runtimeCommandForShell();
    const cmd = `${runtime} images -q ${safeShellQuote(image)}`;
    const [, stdout] = await ssh.execute(cmd, false);
    if (stdout.trim()) {
      this.log(results, "  Image already present.");
      return;
    }

    if (this.isLocalhost) {
      throw new Error(
        `Image '${image}' not found locally. ` +
          "Pull or build it explicitly before running deploy apply."
      );
    }

    results.steps.push(
      "  Image missing on host; pushing from local Docker daemon..."
    );
    this.pushImageToRemote(image);

    const [, stdoutAfter] = await ssh.execute(cmd, false);
    if (stdoutAfter.trim()) {
      results.steps.push("  Image transferred successfully.");
    } else {
      throw new Error(`Failed to transfer image '${image}' to remote host.`);
    }
  }

  private pushImageToRemote(image: string): void {
    const sshConfig = this.deployment.ssh;
    if (!sshConfig) {
      throw new Error("SSH configuration required to push image.");
    }

    const localRuntime = this.resolveLocalRuntimeCommand();

    // Check image exists locally
    try {
      execFileSync(localRuntime, ["image", "inspect", image], {
        stdio: ["pipe", "pipe", "pipe"]
      });
    } catch {
      throw new Error(
        `Image '${image}' not found locally. Build or pull it before deploying.`
      );
    }

    // Pipe docker save through ssh docker load using a single shell command
    try {
      const keyArg = sshConfig.key_path
        ? `-i ${shellQuote(expandUser(sshConfig.key_path))}`
        : "";
      const portArg =
        sshConfig.port && sshConfig.port !== 22
          ? `-p ${safeShellQuote(String(sshConfig.port))}`
          : "";
      const sshTarget = safeShellQuote(
        `${sshConfig.user}@${this.deployment.host}`
      );
      const runtimeForShell = this.runtimeCommandForShell();

      const pipeCmd = `${shellQuote(localRuntime)} save ${shellQuote(image)} | ssh -o StrictHostKeyChecking=no ${keyArg} ${portArg} ${sshTarget} sh -lc '${runtimeForShell} load'`;
      execSync(pipeCmd, {
        encoding: "utf-8",
        timeout: 600000,
        stdio: ["pipe", "pipe", "pipe"]
      });
    } catch (err: unknown) {
      const e = err as { stderr?: string; message?: string };
      throw new Error(
        `Failed to push image to remote host: ${e.stderr?.trim() || e.message || "unknown error"}`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Async sleep helper — returns a promise that resolves after the given seconds.
 */
async function sleep(seconds: number): Promise<void> {
  return new Promise((r) => setTimeout(r, seconds * 1000));
}
