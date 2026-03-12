import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  DeploymentManager,
  type Deployer,
  type DeployerFactory,
  type DeploymentInfo,
  type ValidationResult,
} from "../src/manager.js";
import type { StateManager } from "../src/state.js";
import type { DeploymentConfig, AnyDeployment } from "../src/deployment-config.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockDeployer(overrides: Partial<Deployer> = {}): Deployer {
  return {
    plan: vi.fn().mockReturnValue({ changes: [] }),
    apply: vi.fn().mockReturnValue({ status: "applied" }),
    status: vi.fn().mockReturnValue({ status: "running" }),
    logs: vi.fn().mockReturnValue("some log output"),
    destroy: vi.fn().mockReturnValue({ status: "destroyed" }),
    ...overrides,
  };
}

function makeMockStateManager(
  states: Record<string, Record<string, unknown> | null> = {}
): StateManager {
  return {
    readState: vi.fn(async (name: string) => states[name] ?? null),
    getAllStates: vi.fn(async () => {
      const result: Record<string, Record<string, unknown>> = {};
      for (const [k, v] of Object.entries(states)) {
        if (v) result[k] = v;
      }
      return result;
    }),
  } as unknown as StateManager;
}

function makeDockerDeployment(
  overrides: Partial<Record<string, unknown>> = {}
): AnyDeployment {
  return {
    type: "docker",
    enabled: true,
    host: "10.0.0.1",
    container: { name: "nodetool-api", port: 8000 },
    image: { name: "nodetool/api", tag: "latest", registry: "docker.io" },
    paths: { workspace: "/data/workspace", hf_cache: "/data/hf" },
    state: { status: "unknown", last_deployed: null },
    ...overrides,
  } as unknown as AnyDeployment;
}

function makeSSHDeployment(
  overrides: Partial<Record<string, unknown>> = {}
): AnyDeployment {
  return {
    type: "ssh",
    enabled: true,
    host: "10.0.0.2",
    port: 8000,
    ssh: { user: "root", key_path: "/home/user/.ssh/id_rsa", port: 22 },
    service_name: "nodetool",
    paths: { workspace: "/data/workspace", hf_cache: "/data/hf" },
    state: { status: "running", last_deployed: "2025-01-01T00:00:00Z" },
    ...overrides,
  } as unknown as AnyDeployment;
}

function makeLocalDeployment(): AnyDeployment {
  return {
    type: "local",
    enabled: true,
    host: "localhost",
    port: 8000,
    service_name: "nodetool-local",
    paths: { workspace: "/data/workspace", hf_cache: "/data/hf" },
    state: { status: "running", last_deployed: null },
  } as unknown as AnyDeployment;
}

function makeRunPodDeployment(): AnyDeployment {
  return {
    type: "runpod",
    enabled: true,
    image: { name: "nodetool/api", tag: "latest" },
    state: { status: "active", pod_id: "pod-123", last_deployed: "2025-06-01T00:00:00Z" },
  } as unknown as AnyDeployment;
}

function makeGCPDeployment(): AnyDeployment {
  return {
    type: "gcp",
    enabled: true,
    project_id: "my-project",
    region: "us-central1",
    service_name: "nodetool-api",
    image: { registry: "gcr.io", repository: "my-project/api", tag: "v1" },
    state: { status: "serving", last_deployed: "2025-03-01T00:00:00Z" },
  } as unknown as AnyDeployment;
}

function makeConfig(
  deployments: Record<string, AnyDeployment>
): DeploymentConfig {
  return {
    version: "1.0",
    defaults: {
      chat_provider: "llama_cpp",
      default_model: "",
      log_level: "INFO",
      auth_provider: "local",
      extra: {},
    },
    deployments,
  } as DeploymentConfig;
}

function makeManager(
  deployments: Record<string, AnyDeployment>,
  states: Record<string, Record<string, unknown> | null> = {},
  factoryOverrides: Record<string, DeployerFactory> = {}
): {
  manager: DeploymentManager;
  deployer: Deployer;
  stateManager: StateManager;
} {
  const deployer = makeMockDeployer();
  const defaultFactory: DeployerFactory = vi.fn(() => deployer);
  const stateManager = makeMockStateManager(states);
  const config = makeConfig(deployments);

  const factories: Record<string, DeployerFactory> = {
    docker: defaultFactory,
    ssh: defaultFactory,
    local: defaultFactory,
    runpod: defaultFactory,
    gcp: defaultFactory,
    ...factoryOverrides,
  };

  const manager = new DeploymentManager(config, stateManager, factories);
  return { manager, deployer, stateManager };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DeploymentManager", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ---- listDeployments ----

  describe("listDeployments", () => {
    it("returns empty array when no deployments configured", async () => {
      const { manager } = makeManager({});
      const result = await manager.listDeployments();
      expect(result).toEqual([]);
    });

    it("lists a docker deployment with host and container info", async () => {
      const { manager } = makeManager(
        { web: makeDockerDeployment() },
        { web: { status: "running", last_deployed: "2025-01-01T00:00:00Z" } }
      );
      const result = await manager.listDeployments();
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("web");
      expect(result[0].type).toBe("docker");
      expect(result[0].status).toBe("running");
      expect(result[0].last_deployed).toBe("2025-01-01T00:00:00Z");
      expect(result[0].host).toBe("10.0.0.1");
      expect(result[0].container).toBe("nodetool-api");
    });

    it("lists an SSH deployment with host and service_name", async () => {
      const { manager } = makeManager(
        { prod: makeSSHDeployment() },
        { prod: { status: "running", last_deployed: "2025-01-01T00:00:00Z" } }
      );
      const result = await manager.listDeployments();
      expect(result[0].host).toBe("10.0.0.2");
      expect(result[0].service).toBe("nodetool");
    });

    it("lists a local deployment", async () => {
      const { manager } = makeManager({ dev: makeLocalDeployment() });
      const result = await manager.listDeployments();
      expect(result[0].type).toBe("local");
      expect(result[0].host).toBe("localhost");
      expect(result[0].service).toBe("nodetool-local");
    });

    it("lists a RunPod deployment with pod_id from state", async () => {
      const { manager } = makeManager(
        { rp: makeRunPodDeployment() },
        { rp: { status: "active", pod_id: "pod-abc" } }
      );
      const result = await manager.listDeployments();
      expect(result[0].type).toBe("runpod");
      expect(result[0].pod_id).toBe("pod-abc");
    });

    it("lists a GCP deployment with project and region", async () => {
      const { manager } = makeManager(
        { gcp: makeGCPDeployment() },
        { gcp: { status: "serving", last_deployed: "2025-03-01T00:00:00Z" } }
      );
      const result = await manager.listDeployments();
      expect(result[0].type).toBe("gcp");
      expect(result[0].project).toBe("my-project");
      expect(result[0].region).toBe("us-central1");
    });

    it("shows status as unknown when no state exists", async () => {
      const { manager } = makeManager({ web: makeDockerDeployment() });
      const result = await manager.listDeployments();
      expect(result[0].status).toBe("unknown");
      expect(result[0].last_deployed).toBeNull();
    });

    it("lists multiple deployments at once", async () => {
      const { manager } = makeManager({
        a: makeDockerDeployment(),
        b: makeSSHDeployment(),
        c: makeGCPDeployment(),
      });
      const result = await manager.listDeployments();
      expect(result).toHaveLength(3);
      const names = result.map((d) => d.name);
      expect(names).toContain("a");
      expect(names).toContain("b");
      expect(names).toContain("c");
    });

    it("shows null pod_id for RunPod when state has no pod_id", async () => {
      const { manager } = makeManager(
        { rp: makeRunPodDeployment() },
        { rp: { status: "pending" } }
      );
      const result = await manager.listDeployments();
      expect(result[0].pod_id).toBeNull();
    });
  });

  // ---- getDeployment ----

  describe("getDeployment", () => {
    it("returns the deployment for a known name", () => {
      const dep = makeDockerDeployment();
      const { manager } = makeManager({ web: dep });
      expect(manager.getDeployment("web")).toBe(dep);
    });

    it("throws for unknown deployment name", () => {
      const { manager } = makeManager({});
      expect(() => manager.getDeployment("nope")).toThrow(
        "Deployment 'nope' not found"
      );
    });
  });

  // ---- plan ----

  describe("plan", () => {
    it("delegates to deployer.plan()", () => {
      const { manager, deployer } = makeManager({ web: makeDockerDeployment() });
      (deployer.plan as ReturnType<typeof vi.fn>).mockReturnValue({
        changes: [{ action: "create" }],
      });
      const result = manager.plan("web");
      expect(result).toEqual({ changes: [{ action: "create" }] });
      expect(deployer.plan).toHaveBeenCalled();
    });

    it("throws for unknown deployment", () => {
      const { manager } = makeManager({});
      expect(() => manager.plan("nope")).toThrow("Deployment 'nope' not found");
    });
  });

  // ---- apply ----

  describe("apply", () => {
    it("delegates to deployer.apply()", () => {
      const spy = vi.spyOn(console, "log").mockImplementation(() => {});
      const { manager, deployer } = makeManager({ web: makeDockerDeployment() });
      const result = manager.apply("web");
      expect(result).toEqual({ status: "applied" });
      expect(deployer.apply).toHaveBeenCalledWith({ dryRun: undefined });
      spy.mockRestore();
    });

    it("passes dryRun option", () => {
      vi.spyOn(console, "log").mockImplementation(() => {});
      const { manager, deployer } = makeManager({ web: makeDockerDeployment() });
      manager.apply("web", { dryRun: true });
      expect(deployer.apply).toHaveBeenCalledWith({ dryRun: true });
    });

    it("logs the deployment name and type", () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const { manager } = makeManager({ web: makeDockerDeployment() });
      manager.apply("web");
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining("Applying deployment 'web'")
      );
      logSpy.mockRestore();
    });

    it("throws for unknown deployment", () => {
      const { manager } = makeManager({});
      expect(() => manager.apply("nope")).toThrow("Deployment 'nope' not found");
    });
  });

  // ---- status ----

  describe("status", () => {
    it("delegates to deployer.status()", () => {
      const { manager, deployer } = makeManager({ web: makeDockerDeployment() });
      (deployer.status as ReturnType<typeof vi.fn>).mockReturnValue({
        status: "running",
        uptime: 3600,
      });
      const result = manager.status("web");
      expect(result).toEqual({ status: "running", uptime: 3600 });
    });

    it("throws for unknown deployment", () => {
      const { manager } = makeManager({});
      expect(() => manager.status("nope")).toThrow("Deployment 'nope' not found");
    });
  });

  // ---- logs ----

  describe("logs", () => {
    it("delegates to deployer.logs() with defaults", () => {
      const { manager, deployer } = makeManager({ web: makeDockerDeployment() });
      const result = manager.logs("web");
      expect(result).toBe("some log output");
      expect(deployer.logs).toHaveBeenCalledWith({
        service: undefined,
        follow: undefined,
        tail: 100,
      });
    });

    it("passes custom tail and service options", () => {
      const { manager, deployer } = makeManager({ web: makeDockerDeployment() });
      manager.logs("web", { service: "api", tail: 50, follow: true });
      expect(deployer.logs).toHaveBeenCalledWith({
        service: "api",
        follow: true,
        tail: 50,
      });
    });

    it("throws for unknown deployment", () => {
      const { manager } = makeManager({});
      expect(() => manager.logs("nope")).toThrow("Deployment 'nope' not found");
    });
  });

  // ---- destroy ----

  describe("destroy", () => {
    it("delegates to deployer.destroy()", () => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      const { manager, deployer } = makeManager({ web: makeDockerDeployment() });
      const result = manager.destroy("web");
      expect(result).toEqual({ status: "destroyed" });
      expect(deployer.destroy).toHaveBeenCalled();
    });

    it("logs a warning", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const { manager } = makeManager({ web: makeDockerDeployment() });
      manager.destroy("web");
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Destroying deployment 'web'")
      );
      warnSpy.mockRestore();
    });

    it("throws for unknown deployment", () => {
      const { manager } = makeManager({});
      expect(() => manager.destroy("nope")).toThrow(
        "Deployment 'nope' not found"
      );
    });
  });

  // ---- validate ----

  describe("validate", () => {
    it("returns valid for a properly configured docker deployment", () => {
      const { manager } = makeManager({ web: makeDockerDeployment() });
      const result = manager.validate("web");
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("returns error when docker deployment has no container", () => {
      const dep = makeDockerDeployment({ container: undefined });
      const { manager } = makeManager({ web: dep });
      const result = manager.validate("web");
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.stringContaining("No container configured"),
        ])
      );
    });

    it("returns error when ssh deployment has no port", () => {
      const dep = makeSSHDeployment({ port: undefined });
      const { manager } = makeManager({ prod: dep });
      const result = manager.validate("prod");
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.stringContaining("No port configured"),
        ])
      );
    });

    it("warns when SSH deployment has no auth method", () => {
      const dep = makeSSHDeployment({
        ssh: { user: "root", port: 22 },
      });
      const { manager } = makeManager({ prod: dep });
      const result = manager.validate("prod");
      expect(result.warnings).toEqual(
        expect.arrayContaining([
          expect.stringContaining("No SSH authentication method"),
        ])
      );
    });

    it("validates all deployments when no name provided", () => {
      const { manager } = makeManager({
        a: makeDockerDeployment(),
        b: makeSSHDeployment(),
      });
      const result = manager.validate();
      expect(result.valid).toBe(true);
    });

    it("handles error when deployment does not exist (validate by name)", () => {
      const { manager } = makeManager({});
      const result = manager.validate("missing");
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("missing");
    });

    it("returns valid for GCP deployment", () => {
      const { manager } = makeManager({ gcp: makeGCPDeployment() });
      const result = manager.validate("gcp");
      expect(result.valid).toBe(true);
    });

    it("returns valid for RunPod deployment", () => {
      const { manager } = makeManager({ rp: makeRunPodDeployment() });
      const result = manager.validate("rp");
      expect(result.valid).toBe(true);
    });
  });

  // ---- hasChanges ----

  describe("hasChanges", () => {
    it("returns false when plan has empty changes", () => {
      const { manager, deployer } = makeManager({ web: makeDockerDeployment() });
      (deployer.plan as ReturnType<typeof vi.fn>).mockReturnValue({ changes: [] });
      expect(manager.hasChanges("web")).toBe(false);
    });

    it("returns true when plan has changes", () => {
      const { manager, deployer } = makeManager({ web: makeDockerDeployment() });
      (deployer.plan as ReturnType<typeof vi.fn>).mockReturnValue({
        changes: [{ action: "update" }],
      });
      expect(manager.hasChanges("web")).toBe(true);
    });

    it("returns false when plan throws", () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const { manager } = makeManager({});
      expect(manager.hasChanges("nope")).toBe(false);
    });

    it("returns false when changes is not an array", () => {
      const { manager, deployer } = makeManager({ web: makeDockerDeployment() });
      (deployer.plan as ReturnType<typeof vi.fn>).mockReturnValue({
        changes: "none",
      });
      expect(manager.hasChanges("web")).toBe(false);
    });
  });

  // ---- getAllStates ----

  describe("getAllStates", () => {
    it("delegates to stateManager.getAllStates()", async () => {
      const states = { web: { status: "running" } };
      const { manager, stateManager } = makeManager(
        { web: makeDockerDeployment() },
        states
      );
      const result = await manager.getAllStates();
      expect(stateManager.getAllStates).toHaveBeenCalled();
      expect(result).toEqual(states);
    });
  });

  // ---- getDeployer (private, tested through public methods) ----

  describe("unknown deployment type", () => {
    it("throws when no factory exists for the deployment type", () => {
      const dep = { type: "custom", enabled: true } as unknown as AnyDeployment;
      const config = makeConfig({ x: dep });
      const stateManager = makeMockStateManager();
      const manager = new DeploymentManager(config, stateManager, {});
      expect(() => manager.plan("x")).toThrow("Unknown deployment type: custom");
    });
  });
});
