/**
 * Deployment state management for NodeTool.
 *
 * This module provides utilities for managing deployment state with atomic operations,
 * locking, and timestamp tracking to ensure safe concurrent access.
 */

import * as fs from "fs/promises";
import * as path from "path";
import * as crypto from "crypto";
import * as yaml from "js-yaml";

import {
  type DeploymentConfig,
  type AnyDeployment,
  parseDeploymentConfig,
  getDeploymentConfigPath,
  loadDeploymentConfig,
  saveDeploymentConfig,
  SelfHostedStateSchema,
  RunPodStateSchema,
  GCPStateSchema,
  FlyStateSchema,
  RailwayStateSchema,
  HuggingFaceStateSchema
} from "./deployment-config.js";

// ============================================================================
// Simple async mutex for in-process thread safety
// ============================================================================

class AsyncMutex {
  private _locked = false;
  private readonly _waiters: Array<() => void> = [];

  async acquire(timeout: number): Promise<boolean> {
    if (!this._locked) {
      this._locked = true;
      return true;
    }

    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        const idx = this._waiters.indexOf(waiter);
        if (idx !== -1) this._waiters.splice(idx, 1);
        resolve(false);
      }, timeout * 1000);

      const waiter = (): void => {
        clearTimeout(timer);
        this._locked = true;
        resolve(true);
      };
      this._waiters.push(waiter);
    });
  }

  release(): void {
    if (this._waiters.length > 0) {
      const next = this._waiters.shift()!;
      next();
    } else {
      this._locked = false;
    }
  }
}

// ============================================================================
// Advisory file lock (cross-process)
// ============================================================================

/**
 * Acquire an advisory file lock by creating a lock directory (mkdir is atomic on all platforms).
 * Returns a release function.
 */
async function acquireFileLock(
  lockPath: string,
  timeout: number
): Promise<() => Promise<void>> {
  const startTime = Date.now();
  const pollInterval = 100; // ms

  while (Date.now() - startTime < timeout * 1000) {
    try {
      await fs.mkdir(lockPath);
      // Lock acquired — return a release function
      return async () => {
        try {
          await fs.rmdir(lockPath);
        } catch {
          // ignore errors during cleanup
        }
      };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "EEXIST") {
        // Lock held by another process — wait and retry
        await new Promise<void>((r) => setTimeout(r, pollInterval));
        continue;
      }
      throw err;
    }
  }

  throw new Error(
    `Could not acquire lock on ${lockPath} within ${timeout} seconds`
  );
}

// ============================================================================
// State Manager
// ============================================================================

/**
 * Manages deployment state with atomic operations and file locking.
 *
 * Provides methods for safely reading and writing deployment state with:
 * - Atomic file operations
 * - Directory-based locking to prevent concurrent modifications
 * - In-process async mutex for single-process thread safety
 * - Automatic timestamp tracking
 */
export class StateManager {
  readonly configPath: string;
  readonly lockPath: string;
  private static readonly _mutex = new AsyncMutex();

  constructor(configPath?: string) {
    this.configPath = configPath ?? getDeploymentConfigPath();
    this.lockPath = this.configPath + ".lock";
  }

  /**
   * Execute a callback while holding an exclusive lock on the config file.
   * Combines an in-process async mutex with a filesystem advisory lock.
   */
  async withLock<T>(callback: () => Promise<T>, timeout = 30): Promise<T> {
    const acquired = await StateManager._mutex.acquire(timeout);
    if (!acquired) {
      throw new Error(
        `Could not acquire in-process lock within ${timeout} seconds`
      );
    }

    try {
      // Ensure parent directory exists for the lock
      await fs.mkdir(path.dirname(this.lockPath), { recursive: true });

      const releaseFsLock = await acquireFileLock(this.lockPath, timeout);
      try {
        return await callback();
      } finally {
        await releaseFsLock();
      }
    } finally {
      StateManager._mutex.release();
    }
  }

  /** Load the DeploymentConfig from this manager's config path. */
  private async loadConfig(): Promise<DeploymentConfig> {
    const raw = await fs.readFile(this.configPath, "utf-8");
    const data = yaml.load(raw, { schema: yaml.JSON_SCHEMA });
    return parseDeploymentConfig(data ?? {});
  }

  /** Atomically write a DeploymentConfig to disk. */
  private async saveConfig(config: DeploymentConfig): Promise<void> {
    const data = JSON.parse(
      JSON.stringify(config, (_k, v) => (v === null ? undefined : v))
    );
    const yamlStr = yaml.dump(data, {
      flowLevel: -1,
      sortKeys: false,
      noCompatMode: true
    });
    const tempPath = this.configPath + ".tmp";
    await fs.writeFile(tempPath, yamlStr, { encoding: "utf-8", mode: 0o600 });
    await fs.rename(tempPath, this.configPath);
  }

  /**
   * Read the state for a specific deployment.
   *
   * @returns State as a plain object, or null if the deployment is not found.
   */
  async readState(
    deploymentName: string
  ): Promise<Record<string, unknown> | null> {
    return this.withLock(async () => {
      const config = await this.loadConfig();
      const deployment = config.deployments[deploymentName];
      if (!deployment) return null;
      return { ...deployment.state } as Record<string, unknown>;
    });
  }

  /**
   * Update the state for a specific deployment.
   *
   * @param deploymentName - Name of the deployment.
   * @param stateUpdates - Fields to merge into the current state.
   * @param updateTimestamp - Whether to set last_deployed to now (default true).
   */
  async writeState(
    deploymentName: string,
    stateUpdates: Record<string, unknown>,
    updateTimestamp = true
  ): Promise<void> {
    return this.withLock(async () => {
      const config = await this.loadConfig();
      const deployment = config.deployments[deploymentName];
      if (!deployment) {
        throw new Error(`Deployment '${deploymentName}' not found`);
      }

      if (updateTimestamp) {
        stateUpdates.last_deployed = new Date().toISOString();
      }

      const currentState = { ...deployment.state } as Record<string, unknown>;
      Object.assign(currentState, stateUpdates);

      // Re-validate through the correct schema
      deployment.state = revalidateState(deployment, currentState);

      await this.saveConfig(config);
    });
  }

  /**
   * Update the status of a deployment.
   */
  async updateDeploymentStatus(
    deploymentName: string,
    status: string,
    updateTimestamp = true
  ): Promise<void> {
    await this.writeState(deploymentName, { status }, updateTimestamp);
  }

  /**
   * Get state for all deployments.
   */
  async getAllStates(): Promise<Record<string, Record<string, unknown>>> {
    return this.withLock(async () => {
      const config = await this.loadConfig();
      const states: Record<string, Record<string, unknown>> = {};
      for (const [name, deployment] of Object.entries(config.deployments)) {
        states[name] = { ...deployment.state } as Record<string, unknown>;
      }
      return states;
    });
  }

  /**
   * Retrieve a secret from deployment state, generating and persisting it if missing.
   */
  async getOrCreateSecret(
    deploymentName: string,
    fieldName: string,
    byteLength = 32
  ): Promise<string> {
    return this.withLock(async () => {
      const config = await this.loadConfig();
      const deployment = config.deployments[deploymentName];
      if (!deployment) {
        throw new Error(`Deployment '${deploymentName}' not found`);
      }

      const stateDict = { ...deployment.state } as Record<string, unknown>;
      const existing = stateDict[fieldName];
      if (existing) {
        return String(existing);
      }

      const secretValue = crypto.randomBytes(byteLength).toString("base64url");
      stateDict[fieldName] = secretValue;

      deployment.state = revalidateState(deployment, stateDict);
      await this.saveConfig(config);

      return secretValue;
    });
  }

  /**
   * Clear/reset the state for a deployment back to defaults.
   */
  async clearState(deploymentName: string): Promise<void> {
    return this.withLock(async () => {
      const config = await this.loadConfig();
      const deployment = config.deployments[deploymentName];
      if (!deployment) {
        throw new Error(`Deployment '${deploymentName}' not found`);
      }

      deployment.state = revalidateState(deployment, {});
      await this.saveConfig(config);
    });
  }

  /**
   * Get the last deployment timestamp for a deployment.
   */
  async getLastDeployed(deploymentName: string): Promise<Date | null> {
    const state = await this.readState(deploymentName);
    if (!state) return null;

    const lastDeployed = state.last_deployed;
    if (!lastDeployed) return null;

    if (typeof lastDeployed === "string") {
      return new Date(lastDeployed);
    }
    if (lastDeployed instanceof Date) {
      return lastDeployed;
    }
    return null;
  }

  /**
   * Check if a deployment has ever been deployed.
   */
  async hasBeenDeployed(deploymentName: string): Promise<boolean> {
    const last = await this.getLastDeployed(deploymentName);
    return last !== null;
  }
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Re-validate a state dict through the appropriate Zod schema based on deployment type.
 */
function revalidateState(
  deployment: AnyDeployment,
  stateDict: Record<string, unknown>
): AnyDeployment["state"] {
  switch (deployment.type) {
    case "docker":
      return SelfHostedStateSchema.parse(stateDict);
    case "fly":
      return FlyStateSchema.parse(stateDict);
    case "railway":
      return RailwayStateSchema.parse(stateDict);
    case "huggingface":
      return HuggingFaceStateSchema.parse(stateDict);
    case "runpod":
      return RunPodStateSchema.parse(stateDict);
    case "gcp":
      return GCPStateSchema.parse(stateDict);
  }
}

// ============================================================================
// Snapshot Utilities
// ============================================================================

/**
 * Create a snapshot of the current state of all deployments.
 * Useful for backup, auditing, or rollback.
 */
export function createStateSnapshot(
  config: DeploymentConfig,
  configPath?: string
): Record<string, unknown> {
  const snapshot: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    version: config.version,
    deployments: {} as Record<string, unknown>
  };

  if (configPath) {
    snapshot.config_path = configPath;
  }

  const deployments = snapshot.deployments as Record<string, unknown>;
  for (const [name, deployment] of Object.entries(config.deployments)) {
    deployments[name] = {
      type: deployment.type,
      enabled: deployment.enabled,
      state: { ...deployment.state }
    };
  }

  return snapshot;
}

/**
 * Restore deployment state from a snapshot.
 *
 * @param snapshot - Snapshot created by createStateSnapshot().
 * @param deploymentName - If provided, only restore this deployment.
 * @param configPath - Config file path override.
 */
export async function restoreStateFromSnapshot(
  snapshot: Record<string, unknown>,
  deploymentName?: string,
  configPath?: string
): Promise<void> {
  let resolvedConfigPath = configPath ?? undefined;
  if (!resolvedConfigPath && typeof snapshot.config_path === "string") {
    resolvedConfigPath = snapshot.config_path;
  }

  const stateManager = new StateManager(resolvedConfigPath);

  await stateManager.withLock(async () => {
    let config: DeploymentConfig;
    if (resolvedConfigPath) {
      const raw = await fs.readFile(resolvedConfigPath, "utf-8");
      const data = yaml.load(raw, { schema: yaml.JSON_SCHEMA });
      config = parseDeploymentConfig(data ?? {});
    } else {
      config = await loadDeploymentConfig();
    }

    const snapshotDeployments = snapshot.deployments as Record<
      string,
      Record<string, unknown>
    >;

    const deploymentsToRestore = deploymentName
      ? [deploymentName]
      : Object.keys(snapshotDeployments);

    for (const name of deploymentsToRestore) {
      if (!(name in snapshotDeployments)) {
        throw new Error(`Deployment '${name}' not found in snapshot`);
      }
      if (!(name in config.deployments)) {
        // Skip deployments that no longer exist in config
        continue;
      }

      const snapshotState = snapshotDeployments[name].state as Record<
        string,
        unknown
      >;
      const deployment = config.deployments[name];
      deployment.state = revalidateState(deployment, snapshotState);
    }

    if (resolvedConfigPath) {
      const data = JSON.parse(
        JSON.stringify(config, (_k, v) => (v === null ? undefined : v))
      );
      const yamlStr = yaml.dump(data, {
        flowLevel: -1,
        sortKeys: false
      });
      await fs.writeFile(resolvedConfigPath, yamlStr, {
        encoding: "utf-8",
        mode: 0o600
      });
    } else {
      await saveDeploymentConfig(config);
    }
  });
}
