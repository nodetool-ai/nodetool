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
import * as dns from "dns";
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
  SelfHostedDeployment,
  SSHConfig,
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

/**
 * Check if host resolves to the local machine.
 */
export function isLocalhost(host: string): boolean {
  const localhostNames = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);
  const normalizedHost = host.trim().toLowerCase();
  if (localhostNames.has(normalizedHost)) {
    return true;
  }

  function resolveIps(target: string): Set<string> {
    const ips = new Set<string>();
    try {
      // Synchronous DNS lookup via Node.js dns.resolve
      const addresses = dns.resolve4.length
        ? (() => {
            try {
              // Use execFileSync with getent (Linux) as primary method
              const result = execFileSync("getent", ["hosts", target], {
                encoding: "utf-8",
                timeout: 5000
              }).trim();
              const resolved: string[] = [];
              for (const line of result.split("\n")) {
                const ip = line.trim().split(/\s+/)[0];
                if (ip) resolved.push(ip);
              }
              return resolved;
            } catch {
              // getent not available (macOS) — fall back to dscacheutil or just skip
              try {
                const result = execFileSync(
                  "dscacheutil",
                  ["-q", "host", "-a", "name", target],
                  { encoding: "utf-8", timeout: 5000 }
                ).trim();
                const resolved: string[] = [];
                for (const line of result.split("\n")) {
                  const match = line.match(/^ip_address:\s+(.+)/);
                  if (match) resolved.push(match[1].trim());
                }
                return resolved;
              } catch {
                return [];
              }
            }
          })()
        : [];
      for (const ip of addresses) ips.add(ip);
    } catch {
      // Unable to resolve
    }
    return ips;
  }

  let hostIps: Set<string>;
  try {
    hostIps = resolveIps(host);
  } catch {
    return false;
  }

  if (hostIps.size === 0) return false;

  const localIps = new Set<string>();
  for (const target of ["localhost", os.hostname()]) {
    try {
      for (const ip of resolveIps(target)) localIps.add(ip);
    } catch {
      continue;
    }
  }

  for (const ip of hostIps) {
    if (localIps.has(ip)) return true;
  }

  return false;
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
   * Execute a command locally.
   *
   * Matches SSHConnection behavior by running in a shell.
   * This allows shell features like pipes, redirects, &&/|| operators,
   * and environment variable assignments.
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
// BaseSSHDeployer (abstract)
// ---------------------------------------------------------------------------

/**
 * Base class for SSH-based deployments.
 *
 * Type parameter `T` is the concrete deployment configuration type
 * (e.g. DockerDeployment).
 */
export abstract class BaseSSHDeployer<T extends SelfHostedDeployment> {
  readonly deploymentName: string;
  readonly deployment: T;
  readonly stateManager: StateManager;
  readonly isLocalhost: boolean;

  constructor(
    deploymentName: string,
    deployment: T,
    stateManager?: StateManager
  ) {
    this.deploymentName = deploymentName;
    this.deployment = deployment;
    this.stateManager = stateManager ?? new StateManager();
    this.isLocalhost = isLocalhost(deployment.host);
  }

  // ---- Logging -----------------------------------------------------------

  protected log(results: Record<string, unknown>, message: string): void {
    const steps = results["steps"];
    if (Array.isArray(steps)) {
      steps.push(message);
    }
    console.log(`  ${message}`);
  }

  // ---- Executor ----------------------------------------------------------

  protected getExecutor(): Executor {
    if (this.isLocalhost) {
      return new LocalExecutor();
    }

    const sshConfig = (this.deployment as { ssh?: SSHConfig }).ssh;
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
  protected async withExecutor<R>(
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

  // ---- Content upload ----------------------------------------------------

  protected async uploadContent(
    ssh: Executor,
    content: string,
    remotePath: string
  ): Promise<void> {
    if (this.isLocalhost) {
      const expanded = remotePath.startsWith("~")
        ? expandUser(remotePath)
        : remotePath;
      const dir = path.dirname(expanded);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(expanded, content, "utf-8");
    } else {
      // Remote upload via base64 to avoid shell escaping issues
      const b64Content = Buffer.from(content, "utf-8").toString("base64");
      const dirName = path.posix.dirname(remotePath);
      await ssh.execute(`mkdir -p ${safeShellQuote(dirName)}`, true);
      await ssh.execute(
        `echo ${b64Content} | base64 -d > ${safeShellQuote(remotePath)}`,
        true
      );
    }
  }

  // ---- Directory creation ------------------------------------------------

  protected async createDirectories(
    ssh: Executor,
    results: Record<string, unknown>
  ): Promise<void> {
    this.log(results, "Creating directories...");

    const workspacePath = expandUser(this.deployment.paths.workspace);
    await ssh.mkdir(workspacePath, 0o755, true);
    this.log(results, `  Created: ${workspacePath}`);

    await ssh.mkdir(`${workspacePath}/data`, 0o755, true);
    await ssh.mkdir(`${workspacePath}/assets`, 0o755, true);
    await ssh.mkdir(`${workspacePath}/temp`, 0o755, true);

    // Deployment-specific directories
    await this.createSpecificDirectories(ssh, workspacePath);

    const hfCachePath = expandUser(this.deployment.paths.hf_cache);
    await ssh.mkdir(hfCachePath, 0o755, true);
    this.log(results, `  Created: ${hfCachePath}`);
  }

  // ---- Container runtime helpers -----------------------------------------

  protected resolveLocalRuntimeCommand(): string {
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

  protected runtimeCommandForShell(): string {
    const override = process.env["NODETOOL_CONTAINER_RUNTIME"];
    if (override === "docker" || override === "podman") return override;
    if (this.isLocalhost) return this.resolveLocalRuntimeCommand();
    return "$((command -v docker >/dev/null 2>&1 && echo docker) || (command -v podman >/dev/null 2>&1 && echo podman) || echo docker)";
  }

  protected containerGenerator(runtimeCommand?: string): DockerRunGenerator {
    const cmd = runtimeCommand ?? this.runtimeCommandForShell();
    const d = this.deployment as DockerDeployment;
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
            chromaPath: d.persistent_paths.chroma_path,
            hfCache: d.persistent_paths.hf_cache,
            assetBucket: d.persistent_paths.asset_bucket,
            logsPath: d.persistent_paths.logs_path
          }
        : undefined,
      serverAuthToken: d.server_auth_token
    };
    return new DockerRunGenerator(converted, cmd);
  }

  protected containerName(): string {
    return this.containerGenerator().getContainerName();
  }

  /**
   * Return host port for direct app mode (matches DockerRunGenerator).
   */
  protected appHostPort(): number {
    const container = (this.deployment as DockerDeployment).container;
    if (container && container.port === 7777) return 8000;
    return container?.port ?? 8000;
  }

  // ---- Abstract methods --------------------------------------------------

  protected abstract createSpecificDirectories(
    ssh: Executor,
    workspacePath: string
  ): Promise<void>;

  abstract plan(): Promise<DeployPlan>;
  abstract apply(opts?: { dryRun?: boolean }): Promise<DeployResult>;
  abstract destroy(): Promise<DeployResult>;
  abstract status(): Promise<DeployStatus>;
  abstract logs(opts?: {
    service?: string;
    follow?: boolean;
    tail?: number;
  }): Promise<string>;
}

// ---------------------------------------------------------------------------
// DockerDeployer
// ---------------------------------------------------------------------------

/**
 * Deployer for Docker-based self-hosted deployments.
 */
export class DockerDeployer extends BaseSSHDeployer<DockerDeployment> {
  protected async createSpecificDirectories(
    ssh: Executor,
    workspacePath: string
  ): Promise<void> {
    await ssh.mkdir(`${workspacePath}/proxy`, 0o755, true);
    await ssh.mkdir(`${workspacePath}/acme`, 0o755, true);
  }

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

        // Stop existing container if present
        await this.stopExistingContainer(executor, results);

        // Start container
        const containerRunHash = await this.startContainer(executor, results);

        // Check health
        await this.checkHealth(executor, results);

        // Update state with success
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
          `${runtime} stop ${safeShellQuote(containerName)}`,
          false,
          60
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
          `${runtime} stop ${safeShellQuote(conflictName)}`,
          false,
          60
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
          `${runtime} stop ${safeShellQuote(containerName)}`,
          false,
          60
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
            `${runtime} stop ${safeShellQuote(conflictName)}`,
            false,
            60
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
    results.steps.push(`  Command: ${command.slice(0, 120)}...`);

    try {
      const [, stdout] = await ssh.execute(command, true, 300);
      const containerId = stdout.trim() || "<unknown>";
      results.steps.push(
        `  App container started: ${containerId.slice(0, 12)}`
      );
    } catch (exc) {
      if (exc instanceof SSHCommandError) {
        results.errors.push(`Failed to start app container: ${exc.stderr}`);
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
    const maxAttempts = 10;
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

        // Stop container
        try {
          await ssh.execute(
            `${runtime} stop ${safeShellQuote(containerName)}`,
            false,
            30
          );
          results.steps.push(`Container stopped: ${containerName}`);
        } catch (e) {
          if (e instanceof SSHCommandError) {
            results.steps.push(
              `Warning: Failed to stop container: ${e.stderr}`
            );
          }
        }

        // Remove container
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

        // Update state
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
    const sshConfig = (this.deployment as { ssh?: SSHConfig }).ssh;
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
