import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as os from "os";
import * as path from "path";
import * as fs from "fs/promises";
import * as crypto from "crypto";
import * as yaml from "js-yaml";

import {
  StateManager,
  createStateSnapshot,
  restoreStateFromSnapshot
} from "../src/state.js";
import {
  parseDeploymentConfig,
  type DeploymentConfig
} from "../src/deployment-config.js";

// ============================================================================
// Helpers
// ============================================================================

function makeTmpDir(): string {
  return path.join(os.tmpdir(), `nodetool-state-test-${crypto.randomUUID()}`);
}

function makeConfigPath(tmpDir: string): string {
  return path.join(tmpDir, "deployment.yaml");
}

/** Create a minimal deployment config YAML and write to disk. */
async function writeTestConfig(
  configPath: string,
  config?: Record<string, unknown>
): Promise<void> {
  const dir = path.dirname(configPath);
  await fs.mkdir(dir, { recursive: true });

  const defaultConfig = config ?? {
    version: "2.0",
    defaults: {},
    deployments: {
      prod: {
        type: "docker",
        host: "server1",
        image: { name: "nodetool/api" },
        container: { name: "nodetool", port: 8000 }
      },
      staging: {
        type: "runpod",
        image: { name: "nodetool/api", tag: "staging" }
      },
      dev: {
        type: "docker",
        host: "localhost",
        image: { name: "nodetool/api" },
        container: { name: "nodetool-dev", port: 8000 }
      },
      cloud: {
        type: "gcp",
        project_id: "my-project",
        service_name: "nodetool",
        image: { repository: "proj/repo", tag: "v1" }
      }
    }
  };

  const yamlStr = yaml.dump(defaultConfig);
  await fs.writeFile(configPath, yamlStr, "utf-8");
}

// ============================================================================
// StateManager tests
// ============================================================================

describe("StateManager", () => {
  let tmpDir: string;
  let configPath: string;
  let manager: StateManager;

  beforeEach(async () => {
    tmpDir = makeTmpDir();
    configPath = makeConfigPath(tmpDir);
    await writeTestConfig(configPath);
    manager = new StateManager(configPath);
  });

  afterEach(async () => {
    // Clean up lock directories if they exist
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  // --------------------------------------------------------------------------
  // Constructor
  // --------------------------------------------------------------------------

  describe("constructor", () => {
    it("uses provided configPath", () => {
      expect(manager.configPath).toBe(configPath);
    });

    it("sets lockPath based on configPath", () => {
      expect(manager.lockPath).toBe(configPath + ".lock");
    });

    it("uses default config path when none provided", () => {
      const defaultManager = new StateManager();
      expect(defaultManager.configPath).toContain("deployment.yaml");
    });
  });

  // --------------------------------------------------------------------------
  // readState
  // --------------------------------------------------------------------------

  describe("readState", () => {
    it("returns state for existing deployment", async () => {
      const state = await manager.readState("prod");
      expect(state).not.toBeNull();
      expect(state!.status).toBe("unknown");
    });

    it("returns null for non-existent deployment", async () => {
      const state = await manager.readState("nonexistent");
      expect(state).toBeNull();
    });

    it("returns default state fields for docker deployment", async () => {
      const state = await manager.readState("prod");
      expect(state).not.toBeNull();
      expect(state!.last_deployed).toBeNull();
      expect(state!.container_id).toBeNull();
      expect(state!.container_name).toBeNull();
    });

    it("returns default state fields for runpod deployment", async () => {
      const state = await manager.readState("staging");
      expect(state).not.toBeNull();
      expect(state!.template_id).toBeNull();
      expect(state!.endpoint_id).toBeNull();
      expect(state!.endpoint_url).toBeNull();
    });

    it("returns default state fields for gcp deployment", async () => {
      const state = await manager.readState("cloud");
      expect(state).not.toBeNull();
      expect(state!.service_url).toBeNull();
      expect(state!.revision).toBeNull();
    });

    it("returns default state for dev (docker) deployment", async () => {
      const state = await manager.readState("dev");
      expect(state).not.toBeNull();
      expect(state!.status).toBe("unknown");
    });
  });

  // --------------------------------------------------------------------------
  // writeState
  // --------------------------------------------------------------------------

  describe("writeState", () => {
    it("updates state fields", async () => {
      await manager.writeState("prod", {
        status: "running",
        container_id: "abc123"
      });
      const state = await manager.readState("prod");
      expect(state!.status).toBe("running");
      expect(state!.container_id).toBe("abc123");
    });

    it("sets last_deployed timestamp by default", async () => {
      const before = new Date();
      await manager.writeState("prod", { status: "deploying" });
      const state = await manager.readState("prod");
      expect(state!.last_deployed).toBeDefined();
      const ts = new Date(state!.last_deployed as string);
      expect(ts.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
    });

    it("skips timestamp when updateTimestamp is false", async () => {
      await manager.writeState("prod", { status: "running" }, false);
      const state = await manager.readState("prod");
      expect(state!.last_deployed).toBeNull();
    });

    it("throws for non-existent deployment", async () => {
      await expect(
        manager.writeState("nonexistent", { status: "running" })
      ).rejects.toThrow("Deployment 'nonexistent' not found");
    });

    it("persists state across reads", async () => {
      await manager.writeState("prod", {
        status: "active",
        container_id: "xyz",
        url: "http://server1:8000"
      });

      // Create a new manager to verify persistence
      const manager2 = new StateManager(configPath);
      const state = await manager2.readState("prod");
      expect(state!.status).toBe("active");
      expect(state!.container_id).toBe("xyz");
      expect(state!.url).toBe("http://server1:8000");
    });

    it("updates runpod state correctly", async () => {
      await manager.writeState("staging", {
        status: "running",
        template_id: "tmpl-123",
        endpoint_id: "ep-456",
        endpoint_url: "https://api.runpod.io/v2/ep-456"
      });
      const state = await manager.readState("staging");
      expect(state!.status).toBe("running");
      expect(state!.template_id).toBe("tmpl-123");
      expect(state!.endpoint_url).toBe("https://api.runpod.io/v2/ep-456");
    });

    it("updates gcp state correctly", async () => {
      await manager.writeState("cloud", {
        status: "serving",
        service_url: "https://nodetool-abc.run.app",
        revision: "nodetool-00001-abc"
      });
      const state = await manager.readState("cloud");
      expect(state!.status).toBe("serving");
      expect(state!.service_url).toBe("https://nodetool-abc.run.app");
      expect(state!.revision).toBe("nodetool-00001-abc");
    });
  });

  // --------------------------------------------------------------------------
  // updateDeploymentStatus
  // --------------------------------------------------------------------------

  describe("updateDeploymentStatus", () => {
    it("updates only the status field", async () => {
      await manager.writeState("prod", { container_id: "original" }, false);
      await manager.updateDeploymentStatus("prod", "running");
      const state = await manager.readState("prod");
      expect(state!.status).toBe("running");
      expect(state!.container_id).toBe("original");
    });

    it("updates timestamp by default", async () => {
      await manager.updateDeploymentStatus("prod", "deploying");
      const state = await manager.readState("prod");
      expect(state!.last_deployed).not.toBeNull();
    });

    it("skips timestamp when requested", async () => {
      await manager.updateDeploymentStatus("prod", "stopped", false);
      const state = await manager.readState("prod");
      expect(state!.last_deployed).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // getAllStates
  // --------------------------------------------------------------------------

  describe("getAllStates", () => {
    it("returns all deployment states", async () => {
      const states = await manager.getAllStates();
      expect(Object.keys(states)).toContain("prod");
      expect(Object.keys(states)).toContain("staging");
      expect(Object.keys(states)).toContain("dev");
      expect(Object.keys(states)).toContain("cloud");
    });

    it("returns empty object for config with no deployments", async () => {
      const emptyConfigPath = path.join(tmpDir, "empty.yaml");
      await fs.writeFile(
        emptyConfigPath,
        yaml.dump({ version: "2.0", defaults: {}, deployments: {} }),
        "utf-8"
      );
      const emptyManager = new StateManager(emptyConfigPath);
      const states = await emptyManager.getAllStates();
      expect(Object.keys(states)).toHaveLength(0);
    });

    it("reflects updated states", async () => {
      await manager.writeState("prod", { status: "running" }, false);
      await manager.writeState("staging", { status: "active" }, false);
      const states = await manager.getAllStates();
      expect(states.prod.status).toBe("running");
      expect(states.staging.status).toBe("active");
    });
  });

  // --------------------------------------------------------------------------
  // getOrCreateSecret
  // --------------------------------------------------------------------------

  describe("getOrCreateSecret", () => {
    it("generates a new secret when field is empty", async () => {
      const secret = await manager.getOrCreateSecret("prod", "container_hash");
      expect(secret).toBeTruthy();
      expect(typeof secret).toBe("string");
      expect(secret.length).toBeGreaterThan(0);
    });

    it("returns existing secret on second call", async () => {
      const first = await manager.getOrCreateSecret("prod", "container_hash");
      const second = await manager.getOrCreateSecret("prod", "container_hash");
      expect(second).toBe(first);
    });

    it("persists the generated secret", async () => {
      const secret = await manager.getOrCreateSecret("prod", "container_hash");
      const state = await manager.readState("prod");
      expect(state!.container_hash).toBe(secret);
    });

    it("throws for non-existent deployment", async () => {
      await expect(
        manager.getOrCreateSecret("nonexistent", "field")
      ).rejects.toThrow("Deployment 'nonexistent' not found");
    });

    it("generates different secrets for different fields", async () => {
      // Use url field which is also nullable string in SelfHostedState
      const secret1 = await manager.getOrCreateSecret("prod", "container_hash");
      const secret2 = await manager.getOrCreateSecret("prod", "url");
      // They should typically be different (probability of collision is negligible)
      expect(secret1).not.toBe(secret2);
    });
  });

  // --------------------------------------------------------------------------
  // clearState
  // --------------------------------------------------------------------------

  describe("clearState", () => {
    it("resets state to defaults", async () => {
      await manager.writeState("prod", {
        status: "running",
        container_id: "abc",
        url: "http://test"
      });
      await manager.clearState("prod");
      const state = await manager.readState("prod");
      expect(state!.status).toBe("unknown");
      expect(state!.container_id).toBeNull();
      expect(state!.url).toBeNull();
      expect(state!.last_deployed).toBeNull();
    });

    it("throws for non-existent deployment", async () => {
      await expect(manager.clearState("nonexistent")).rejects.toThrow(
        "Deployment 'nonexistent' not found"
      );
    });

    it("clears runpod state to defaults", async () => {
      await manager.writeState("staging", {
        status: "running",
        template_id: "tmpl-123",
        endpoint_id: "ep-456"
      });
      await manager.clearState("staging");
      const state = await manager.readState("staging");
      expect(state!.status).toBe("unknown");
      expect(state!.template_id).toBeNull();
      expect(state!.endpoint_id).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // getLastDeployed
  // --------------------------------------------------------------------------

  describe("getLastDeployed", () => {
    it("returns null when never deployed", async () => {
      const last = await manager.getLastDeployed("prod");
      expect(last).toBeNull();
    });

    it("returns Date after deployment", async () => {
      await manager.writeState("prod", { status: "running" });
      const last = await manager.getLastDeployed("prod");
      expect(last).toBeInstanceOf(Date);
    });

    it("returns null for non-existent deployment", async () => {
      const last = await manager.getLastDeployed("nonexistent");
      expect(last).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // hasBeenDeployed
  // --------------------------------------------------------------------------

  describe("hasBeenDeployed", () => {
    it("returns false when never deployed", async () => {
      expect(await manager.hasBeenDeployed("prod")).toBe(false);
    });

    it("returns true after deployment", async () => {
      await manager.writeState("prod", { status: "running" });
      expect(await manager.hasBeenDeployed("prod")).toBe(true);
    });

    it("returns false for non-existent deployment", async () => {
      expect(await manager.hasBeenDeployed("nonexistent")).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // withLock
  // --------------------------------------------------------------------------

  describe("withLock", () => {
    it("executes callback and returns result", async () => {
      const result = await manager.withLock(async () => {
        return 42;
      });
      expect(result).toBe(42);
    });

    it("cleans up lock directory after success", async () => {
      await manager.withLock(async () => {});
      // Lock should be released
      let exists = true;
      try {
        await fs.stat(manager.lockPath);
      } catch {
        exists = false;
      }
      expect(exists).toBe(false);
    });

    it("cleans up lock directory after error", async () => {
      try {
        await manager.withLock(async () => {
          throw new Error("test error");
        });
      } catch {
        // expected
      }
      let exists = true;
      try {
        await fs.stat(manager.lockPath);
      } catch {
        exists = false;
      }
      expect(exists).toBe(false);
    });

    it("propagates errors from callback", async () => {
      await expect(
        manager.withLock(async () => {
          throw new Error("callback failed");
        })
      ).rejects.toThrow("callback failed");
    });

    it("serializes concurrent operations", async () => {
      const order: number[] = [];
      const p1 = manager.withLock(async () => {
        await new Promise((r) => setTimeout(r, 50));
        order.push(1);
      });
      const p2 = manager.withLock(async () => {
        order.push(2);
      });
      await Promise.all([p1, p2]);
      expect(order).toEqual([1, 2]);
    });
  });
});

// ============================================================================
// createStateSnapshot
// ============================================================================

describe("createStateSnapshot", () => {
  it("creates snapshot with timestamp", () => {
    const config = parseDeploymentConfig({
      deployments: {
        prod: {
          type: "docker",
          host: "h",
          image: { name: "img" },
          container: { name: "c", port: 8000 }
        }
      }
    });
    const snapshot = createStateSnapshot(config);
    expect(snapshot.timestamp).toBeDefined();
    expect(snapshot.version).toBe("2.0");
    const deps = snapshot.deployments as Record<
      string,
      Record<string, unknown>
    >;
    expect(deps.prod).toBeDefined();
    expect(deps.prod.type).toBe("docker");
    expect(deps.prod.enabled).toBe(true);
    expect(deps.prod.state).toBeDefined();
  });

  it("includes configPath when provided", () => {
    const config = parseDeploymentConfig({});
    const snapshot = createStateSnapshot(config, "/custom/path.yaml");
    expect(snapshot.config_path).toBe("/custom/path.yaml");
  });

  it("omits configPath when not provided", () => {
    const config = parseDeploymentConfig({});
    const snapshot = createStateSnapshot(config);
    expect(snapshot.config_path).toBeUndefined();
  });

  it("includes all deployments", () => {
    const config = parseDeploymentConfig({
      deployments: {
        a: {
          type: "docker",
          host: "h",
          image: { name: "i" },
          container: { name: "c", port: 1 }
        },
        b: {
          type: "runpod",
          image: { name: "i", tag: "t" }
        }
      }
    });
    const snapshot = createStateSnapshot(config);
    const deps = snapshot.deployments as Record<string, unknown>;
    expect(Object.keys(deps)).toEqual(["a", "b"]);
  });

  it("captures current state values", () => {
    const config = parseDeploymentConfig({
      deployments: {
        prod: {
          type: "docker",
          host: "h",
          image: { name: "i" },
          container: { name: "c", port: 1 },
          state: { status: "running", container_id: "abc" }
        }
      }
    });
    const snapshot = createStateSnapshot(config);
    const deps = snapshot.deployments as Record<
      string,
      Record<string, unknown>
    >;
    const state = deps.prod.state as Record<string, unknown>;
    expect(state.status).toBe("running");
    expect(state.container_id).toBe("abc");
  });
});

// ============================================================================
// restoreStateFromSnapshot
// ============================================================================

describe("restoreStateFromSnapshot", () => {
  let tmpDir: string;
  let configPath: string;

  beforeEach(async () => {
    tmpDir = makeTmpDir();
    configPath = makeConfigPath(tmpDir);
    await writeTestConfig(configPath);
  });

  afterEach(async () => {
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("restores state from snapshot", async () => {
    // First, update state
    const manager = new StateManager(configPath);
    await manager.writeState("prod", {
      status: "running",
      container_id: "xyz"
    });

    // Create snapshot
    const rawConfig = yaml.load(
      await fs.readFile(configPath, "utf-8")
    ) as Record<string, unknown>;
    const config = parseDeploymentConfig(rawConfig);
    const snapshot = createStateSnapshot(config, configPath);

    // Clear state
    await manager.clearState("prod");
    const clearedState = await manager.readState("prod");
    expect(clearedState!.status).toBe("unknown");

    // Restore from snapshot
    await restoreStateFromSnapshot(snapshot, undefined, configPath);

    // Verify restoration
    const restored = await manager.readState("prod");
    expect(restored!.status).toBe("running");
    expect(restored!.container_id).toBe("xyz");
  });

  it("restores only named deployment when specified", async () => {
    const manager = new StateManager(configPath);
    await manager.writeState("prod", { status: "running" });
    await manager.writeState("staging", { status: "active" });

    const rawConfig = yaml.load(
      await fs.readFile(configPath, "utf-8")
    ) as Record<string, unknown>;
    const config = parseDeploymentConfig(rawConfig);
    const snapshot = createStateSnapshot(config, configPath);

    await manager.clearState("prod");
    await manager.clearState("staging");

    // Restore only prod
    await restoreStateFromSnapshot(snapshot, "prod", configPath);

    const prodState = await manager.readState("prod");
    const stagingState = await manager.readState("staging");
    expect(prodState!.status).toBe("running");
    expect(stagingState!.status).toBe("unknown");
  });

  it("throws when deployment not in snapshot", async () => {
    const snapshot = {
      timestamp: new Date().toISOString(),
      version: "2.0",
      deployments: {},
      config_path: configPath
    };

    await expect(
      restoreStateFromSnapshot(snapshot, "nonexistent", configPath)
    ).rejects.toThrow("Deployment 'nonexistent' not found in snapshot");
  });

  it("uses config_path from snapshot when no explicit path", async () => {
    const manager = new StateManager(configPath);
    await manager.writeState("prod", { status: "active" });

    const rawConfig = yaml.load(
      await fs.readFile(configPath, "utf-8")
    ) as Record<string, unknown>;
    const config = parseDeploymentConfig(rawConfig);
    const snapshot = createStateSnapshot(config, configPath);

    await manager.clearState("prod");

    // Restore using snapshot's config_path
    await restoreStateFromSnapshot(snapshot, "prod");

    const restored = await manager.readState("prod");
    expect(restored!.status).toBe("active");
  });
});
