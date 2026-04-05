import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock modules BEFORE importing the module under test
// ---------------------------------------------------------------------------

vi.mock("../src/ssh.js", () => ({
  SSHCommandError: class SSHCommandError extends Error {
    public readonly exitCode: number;
    public readonly stdout: string;
    public readonly stderr: string;
    constructor(
      message: string,
      exitCode: number,
      stdout: string,
      stderr: string
    ) {
      super(message);
      this.name = "SSHCommandError";
      this.exitCode = exitCode;
      this.stdout = stdout;
      this.stderr = stderr;
    }
  },
  SSHConnection: class SSHConnection {
    execute = vi.fn().mockResolvedValue([0, "", ""]);
    mkdir = vi.fn().mockResolvedValue(undefined);
    connect = vi.fn().mockResolvedValue(undefined);
    disconnect = vi.fn();
  }
}));

vi.mock("../src/docker.js", () => ({
  shellEscape: (s: string) => {
    if (s === "") return "''";
    if (/[^\w@%+=:,./-]/i.test(s)) {
      return "'" + s.replace(/'/g, "'\"'\"'") + "'";
    }
    return s;
  }
}));

vi.mock("../src/docker-run.js", () => {
  const mockGenerator = {
    generateCommand: vi
      .fn()
      .mockReturnValue("docker run -d --name nodetool-test myimage:latest"),
    generateHash: vi.fn().mockReturnValue("abc123hash"),
    getContainerName: vi.fn().mockReturnValue("nodetool-test")
  };
  const DockerRunGenerator = class DockerRunGenerator {
    generateCommand = mockGenerator.generateCommand;
    generateHash = mockGenerator.generateHash;
    getContainerName = mockGenerator.getContainerName;
  };
  return {
    DockerRunGenerator,
    INTERNAL_API_PORT: 7777,
    APP_ENV_PORT: 8000,
    __mockGenerator: mockGenerator
  };
});

vi.mock("../src/state.js", () => {
  const StateManager = class StateManager {
    readState = vi.fn().mockResolvedValue(null);
    writeState = vi.fn();
    updateDeploymentStatus = vi.fn().mockResolvedValue(undefined);
  };
  return { StateManager };
});

vi.mock("../src/deployment-config.js", () => ({
  DeploymentStatus: {
    UNKNOWN: "unknown",
    PENDING: "pending",
    DEPLOYING: "deploying",
    RUNNING: "running",
    ACTIVE: "active",
    SERVING: "serving",
    ERROR: "error",
    STOPPED: "stopped",
    DESTROYED: "destroyed"
  },
  dockerDeploymentGetServerUrl: vi.fn().mockReturnValue("http://myhost:8000"),
  shellDeploymentGetServerUrl: vi.fn().mockReturnValue("http://localhost:9000"),
  imageConfigFullName: vi.fn().mockReturnValue("myimage:latest")
}));

// Mock child_process, fs, os for LocalExecutor and isLocalhost
vi.mock("child_process", () => ({
  execSync: vi.fn().mockReturnValue(""),
  execFileSync: vi.fn().mockReturnValue("")
}));

vi.mock("fs", () => ({
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn().mockReturnValue(true),
  readFileSync: vi.fn().mockReturnValue(""),
  copyFileSync: vi.fn(),
  chmodSync: vi.fn(),
  default: {
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    existsSync: vi.fn().mockReturnValue(true),
    readFileSync: vi.fn().mockReturnValue(""),
    copyFileSync: vi.fn(),
    chmodSync: vi.fn()
  }
}));

vi.mock("js-yaml", () => ({
  dump: vi.fn().mockReturnValue("mocked: yaml"),
  default: { dump: vi.fn().mockReturnValue("mocked: yaml") }
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import {
  safeShellQuote,
  isLocalhost,
  LocalExecutor,
  DockerDeployer,
  type Executor,
  type DeployPlan,
  type DeployResult,
  type DeployStatus
} from "../src/self-hosted.js";
import { SSHCommandError } from "../src/ssh.js";
import { StateManager } from "../src/state.js";
import { execSync, execFileSync } from "child_process";
import * as fs from "fs";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDockerDeployment(overrides: Record<string, unknown> = {}) {
  return {
    type: "docker" as const,
    enabled: true,
    host: "localhost",
    paths: {
      workspace: "~/nodetool_data/workspace",
      hf_cache: "~/nodetool_data/hf-cache"
    },
    image: { name: "myimage", tag: "latest", registry: "docker.io" },
    container: {
      name: "test",
      port: 8000,
      gpu: undefined,
      environment: {},
      workflows: []
    },
    state: {
      last_deployed: null,
      status: "unknown",
      container_id: null,
      container_name: null,
      url: null,
      container_hash: null
    },
    ...overrides
  } as any;
}

function makeShellDeployment(overrides: Record<string, unknown> = {}) {
  return {
    type: "local" as const,
    enabled: true,
    host: "localhost",
    paths: {
      workspace: "~/nodetool_data/workspace",
      hf_cache: "~/nodetool_data/hf-cache"
    },
    port: 9000,
    service_name: "nodetool-test",
    environment: {},
    state: {
      last_deployed: null,
      status: "unknown",
      container_id: null,
      container_name: null,
      url: null,
      container_hash: null
    },
    ...overrides
  } as any;
}

function makeSSHDeployment(overrides: Record<string, unknown> = {}) {
  return {
    type: "ssh" as const,
    enabled: true,
    host: "remote.example.com",
    ssh: { user: "deploy", key_path: "~/.ssh/id_rsa", port: 22 },
    paths: {
      workspace: "~/nodetool_data/workspace",
      hf_cache: "~/nodetool_data/hf-cache"
    },
    port: 9000,
    service_name: "nodetool-test",
    environment: {},
    state: {
      last_deployed: null,
      status: "unknown",
      container_id: null,
      container_name: null,
      url: null,
      container_hash: null
    },
    ...overrides
  } as any;
}

function createMockStateManager() {
  return {
    readState: vi.fn().mockResolvedValue(null),
    writeState: vi.fn(),
    updateDeploymentStatus: vi.fn().mockResolvedValue(undefined)
  } as unknown as StateManager;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("safeShellQuote", () => {
  it("should preserve tilde prefix for home directory paths", () => {
    const result = safeShellQuote("~/some/path");
    expect(result).toMatch(/^~\//);
  });

  it("should quote strings without tilde normally", () => {
    const result = safeShellQuote("/etc/config");
    // shellQuote wraps in single quotes
    expect(result).toBe("'/etc/config'");
  });

  it("should escape single quotes in the path", () => {
    const result = safeShellQuote("it's a test");
    expect(result).toContain("'");
  });

  it("should handle empty strings", () => {
    const result = safeShellQuote("");
    expect(result).toBe("''");
  });

  it("should handle special characters", () => {
    const result = safeShellQuote("hello world");
    expect(result).toContain("'");
    expect(result).toContain("hello world");
  });

  it("should handle tilde path with special characters", () => {
    const result = safeShellQuote("~/my path/file");
    expect(result).toMatch(/^~\//);
  });
});

describe("isLocalhost", () => {
  beforeEach(() => {
    vi.mocked(execFileSync).mockReset();
  });

  it("should return true for 'localhost'", () => {
    expect(isLocalhost("localhost")).toBe(true);
  });

  it("should return true for '127.0.0.1'", () => {
    expect(isLocalhost("127.0.0.1")).toBe(true);
  });

  it("should return true for '::1'", () => {
    expect(isLocalhost("::1")).toBe(true);
  });

  it("should return true for '0.0.0.0'", () => {
    expect(isLocalhost("0.0.0.0")).toBe(true);
  });

  it("should be case-insensitive for localhost", () => {
    expect(isLocalhost("LOCALHOST")).toBe(true);
    expect(isLocalhost("Localhost")).toBe(true);
  });

  it("should trim whitespace", () => {
    expect(isLocalhost("  localhost  ")).toBe(true);
  });

  it("should return false for unknown hosts when resolution fails", () => {
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error("command failed");
    });
    expect(isLocalhost("some-unknown-host.example.com")).toBe(false);
  });
});

describe("LocalExecutor", () => {
  let executor: LocalExecutor;

  beforeEach(() => {
    vi.mocked(execSync).mockReset();
    vi.mocked(fs.mkdirSync).mockReset();
    executor = new LocalExecutor();
  });

  it("should return itself from open()", () => {
    expect(executor.open()).toBe(executor);
  });

  it("should not throw from close()", () => {
    expect(() => executor.close()).not.toThrow();
  });

  it("should execute a command and return [0, stdout, ''] on success", async () => {
    vi.mocked(execSync).mockReturnValue("hello\n");
    const [exitCode, stdout, stderr] = await executor.execute("echo hello");
    expect(exitCode).toBe(0);
    expect(stdout).toBe("hello\n");
    expect(stderr).toBe("");
  });

  it("should throw SSHCommandError on non-zero exit when check=true", async () => {
    vi.mocked(execSync).mockImplementation(() => {
      const err = new Error("fail") as any;
      err.status = 1;
      err.stdout = "";
      err.stderr = "error output";
      throw err;
    });
    await expect(executor.execute("false", true)).rejects.toThrow();
  });

  it("should return non-zero exit code when check=false", async () => {
    vi.mocked(execSync).mockImplementation(() => {
      const err = new Error("fail") as any;
      err.status = 1;
      err.stdout = "out";
      err.stderr = "err";
      throw err;
    });
    const [exitCode, stdout, stderr] = await executor.execute("false", false);
    expect(exitCode).toBe(1);
    expect(stdout).toBe("out");
    expect(stderr).toBe("err");
  });

  it("should throw SSHCommandError on timeout (killed process)", async () => {
    vi.mocked(execSync).mockImplementation(() => {
      const err = new Error("timeout") as any;
      err.killed = true;
      err.status = null;
      err.stdout = "";
      err.stderr = "";
      throw err;
    });
    await expect(executor.execute("sleep 100", true, 1)).rejects.toThrow(
      /timed out/i
    );
  });

  it("should create directory recursively by default", () => {
    executor.mkdir("/tmp/test/nested");
    expect(fs.mkdirSync).toHaveBeenCalledWith(
      expect.stringContaining("test/nested"),
      { recursive: true, mode: 0o755 }
    );
  });

  it("should create directory without recursive when parents=false", () => {
    executor.mkdir("/tmp/test", 0o700, false);
    expect(fs.mkdirSync).toHaveBeenCalledWith("/tmp/test", { mode: 0o700 });
  });

  it("should expand tilde in mkdir path", () => {
    executor.mkdir("~/test/dir");
    const call = vi.mocked(fs.mkdirSync).mock.calls[0];
    expect(call[0]).not.toContain("~");
  });
});

describe("DockerDeployer", () => {
  let deployer: DockerDeployer;
  let mockStateManager: ReturnType<typeof createMockStateManager>;

  beforeEach(() => {
    mockStateManager = createMockStateManager();
    const deployment = makeDockerDeployment();
    deployer = new DockerDeployer(
      "test-deploy",
      deployment,
      mockStateManager as any
    );
    vi.mocked(execSync).mockReset();
    vi.mocked(execSync).mockReturnValue("");
    vi.mocked(execFileSync).mockReset();
    vi.mocked(execFileSync).mockReturnValue("");
    vi.mocked(fs.mkdirSync).mockReset();
    vi.mocked(fs.writeFileSync).mockReset();
  });

  describe("plan()", () => {
    it("should return initial deployment plan when no state exists", async () => {
      mockStateManager.readState.mockResolvedValue(null);
      const plan = await deployer.plan();
      expect(plan.deployment_name).toBe("test-deploy");
      expect(plan.host).toBe("localhost");
      expect(plan.type).toBe("docker");
      expect(plan.changes.length).toBeGreaterThan(0);
      expect(plan.changes[0]).toContain("Initial deployment");
      expect(plan.will_create.length).toBeGreaterThan(0);
    });

    it("should report configuration change when hash differs", async () => {
      mockStateManager.readState.mockResolvedValue({
        last_deployed: "2024-01-01",
        container_run_hash: "oldhash",
        status: "running"
      });
      const plan = await deployer.plan();
      expect(plan.changes).toEqual(
        expect.arrayContaining([
          expect.stringContaining("configuration has changed")
        ])
      );
      expect(plan.will_update).toEqual(
        expect.arrayContaining([expect.stringContaining("App container")])
      );
    });

    it("should list directories and container in will_create", async () => {
      const plan = await deployer.plan();
      const createStr = plan.will_create.join(" ");
      expect(createStr).toContain("Directory");
      expect(createStr).toContain("Container");
    });
  });

  describe("apply()", () => {
    it("should return plan as result in dry-run mode", async () => {
      mockStateManager.readState.mockResolvedValue(null);
      const result = await deployer.apply({ dryRun: true });
      // dry-run returns the plan structure
      expect(result.deployment_name).toBe("test-deploy");
      expect(result).toHaveProperty("changes");
    });

    it("should deploy successfully on localhost", async () => {
      // Mock all the executor calls that apply() makes internally
      vi.mocked(execSync).mockReturnValue("");
      vi.mocked(execFileSync).mockReturnValue("docker\n");

      // The deployer uses withExecutor which creates a LocalExecutor.
      // execSync is called for each command. We need to handle them:
      let callCount = 0;
      vi.mocked(execSync).mockImplementation((cmd: string) => {
        callCount++;
        const cmdStr = String(cmd);
        // image check
        if (cmdStr.includes("images -q")) return "abc123\n";
        // container ps check
        if (cmdStr.includes("ps -a -q")) return "";
        // docker run
        if (cmdStr.includes("run -d")) return "containerid123\n";
        // health check / curl
        if (cmdStr.includes("curl")) return '{"status": "ok"}\n';
        // container status
        if (cmdStr.includes("ps -f name")) return "nodetool-test Up 10s\n";
        // port conflict check
        if (cmdStr.includes("--filter publish")) return "";
        return "";
      });

      const result = await deployer.apply();
      expect(result.deployment_name).toBe("test-deploy");
      expect(result.status).toBe("success");
      expect(result.steps.length).toBeGreaterThan(0);
      expect(mockStateManager.updateDeploymentStatus).toHaveBeenCalledWith(
        "test-deploy",
        "deploying"
      );
      expect(mockStateManager.writeState).toHaveBeenCalled();
    });

    it("should set status to error on failure", async () => {
      vi.mocked(execSync).mockImplementation((cmd: string) => {
        const cmdStr = String(cmd);
        if (cmdStr.includes("images -q")) return "abc123\n";
        if (cmdStr.includes("ps -a -q")) return "";
        if (cmdStr.includes("--filter publish")) return "";
        if (cmdStr.includes("run -d")) {
          const err = new Error("docker failed") as any;
          err.status = 1;
          err.stdout = "";
          err.stderr = "container start error";
          throw err;
        }
        return "";
      });
      vi.mocked(execFileSync).mockReturnValue("docker\n");

      await expect(deployer.apply()).rejects.toThrow();
      expect(mockStateManager.updateDeploymentStatus).toHaveBeenCalledWith(
        "test-deploy",
        "error"
      );
    });

    it("should add localhost step when deploying locally", async () => {
      // Make it pass through to check the localhost step
      vi.mocked(execSync).mockImplementation((cmd: string) => {
        const cmdStr = String(cmd);
        if (cmdStr.includes("images -q")) return "abc123\n";
        if (cmdStr.includes("ps -a -q")) return "";
        if (cmdStr.includes("--filter publish")) return "";
        if (cmdStr.includes("run -d")) return "containerid\n";
        if (cmdStr.includes("curl")) return "ok\n";
        if (cmdStr.includes("ps -f name")) return "nodetool-test Up\n";
        return "";
      });
      vi.mocked(execFileSync).mockReturnValue("docker\n");

      const result = await deployer.apply();
      expect(result.steps).toContain("Deploying to localhost (skipping SSH)");
    });
  });

  describe("status()", () => {
    it("should return status with deployment info", async () => {
      mockStateManager.readState.mockResolvedValue({
        status: "running",
        last_deployed: "2024-01-01T00:00:00Z",
        url: "http://localhost:8000"
      });
      vi.mocked(execSync).mockReturnValue("Up 5 minutes\n");

      const status = await deployer.status();
      expect(status.deployment_name).toBe("test-deploy");
      expect(status.host).toBe("localhost");
      expect(status.type).toBe("docker");
      expect(status.status).toBe("running");
      expect(status.last_deployed).toBe("2024-01-01T00:00:00Z");
    });

    it("should return status without state", async () => {
      mockStateManager.readState.mockResolvedValue(null);
      vi.mocked(execSync).mockReturnValue("");

      const status = await deployer.status();
      expect(status.deployment_name).toBe("test-deploy");
      expect(status.status).toBeUndefined();
    });

    it("should set live_status from executor output", async () => {
      mockStateManager.readState.mockResolvedValue(null);
      vi.mocked(execSync).mockReturnValue("Up 5 minutes\n");

      const status = await deployer.status();
      expect(status.live_status).toBe("Up 5 minutes");
    });

    it("should show 'Container not found' for empty output", async () => {
      mockStateManager.readState.mockResolvedValue(null);
      vi.mocked(execSync).mockReturnValue("");

      const status = await deployer.status();
      expect(status.live_status).toBe("Container not found");
    });
  });

  describe("logs()", () => {
    it("should return container logs", async () => {
      vi.mocked(execSync).mockReturnValue("log line 1\nlog line 2\n");
      const logs = await deployer.logs({ tail: 50 });
      expect(logs).toContain("log line 1");
    });

    it("should include -f flag when follow is true", async () => {
      vi.mocked(execSync).mockReturnValue("following...\n");
      await deployer.logs({ follow: true });
      const calls = vi.mocked(execSync).mock.calls;
      const lastCmd = String(calls[calls.length - 1][0]);
      expect(lastCmd).toContain("-f");
    });

    it("should use specified tail count", async () => {
      vi.mocked(execSync).mockReturnValue("");
      await deployer.logs({ tail: 25 });
      const calls = vi.mocked(execSync).mock.calls;
      const lastCmd = String(calls[calls.length - 1][0]);
      expect(lastCmd).toContain("--tail=25");
    });
  });

  describe("destroy()", () => {
    it("should stop and remove container", async () => {
      vi.mocked(execSync).mockReturnValue("");

      const result = await deployer.destroy();
      expect(result.deployment_name).toBe("test-deploy");
      expect(result.status).toBe("success");
      expect(result.steps.length).toBeGreaterThan(0);
      expect(mockStateManager.updateDeploymentStatus).toHaveBeenCalledWith(
        "test-deploy",
        "destroyed"
      );
    });

    it("should handle stop failure gracefully (timeout)", async () => {
      vi.mocked(execSync).mockImplementation((cmd: string) => {
        const cmdStr = String(cmd);
        if (cmdStr.includes("stop")) {
          // Simulate a timeout which causes SSHCommandError to be thrown
          const err = new Error("timeout") as any;
          err.killed = true;
          err.signal = "SIGTERM";
          err.stdout = "";
          err.stderr = "";
          throw err;
        }
        return "";
      });

      const result = await deployer.destroy();
      // The stop throws SSHCommandError (timeout), which is caught and logged as warning
      expect(result.steps).toEqual(
        expect.arrayContaining([expect.stringMatching(/Warning.*stop/i)])
      );
    });

    it("should throw when remove fails with timeout", async () => {
      vi.mocked(execSync).mockImplementation((cmd: string) => {
        const cmdStr = String(cmd);
        if (cmdStr.includes("rm")) {
          // Simulate timeout which throws SSHCommandError
          const err = new Error("timeout") as any;
          err.killed = true;
          err.signal = "SIGTERM";
          err.stdout = "";
          err.stderr = "";
          throw err;
        }
        return "";
      });

      await expect(deployer.destroy()).rejects.toThrow();
    });
  });
});

describe("DockerDeployer with remote host", () => {
  it("should require SSH config for remote host", () => {
    const deployment = makeDockerDeployment({
      host: "remote.example.com"
    });
    const sm = createMockStateManager();
    const deployer = new DockerDeployer("remote-deploy", deployment, sm as any);
    // isLocalhost should be false for remote host
    expect(deployer.isLocalhost).toBe(false);
  });

  it("should report correct host in plan", async () => {
    const deployment = makeDockerDeployment({
      host: "remote.example.com",
      ssh: { user: "deploy", key_path: "~/.ssh/id_rsa", port: 22 }
    });
    const sm = createMockStateManager();
    const deployer = new DockerDeployer("remote-deploy", deployment, sm as any);
    const plan = await deployer.plan();
    expect(plan.host).toBe("remote.example.com");
  });
});

describe("DockerDeployer with port 7777", () => {
  it("should use port 8000 as host port when container port is 7777", () => {
    const deployment = makeDockerDeployment({
      container: { name: "test", port: 7777, environment: {} }
    });
    const sm = createMockStateManager();
    const deployer = new DockerDeployer("test-7777", deployment, sm as any);
    // Access private method via prototype trick - test indirectly through plan
    // The appHostPort() should return 8000 when port is 7777
    expect((deployer as any).appHostPort()).toBe(8000);
  });
});

describe("BaseSSHDeployer common behavior", () => {
  it("should create state manager when not provided", () => {
    const deployment = makeDockerDeployment();
    const deployer = new DockerDeployer("auto-state", deployment);
    expect(deployer.stateManager).toBeDefined();
  });

  it("should detect localhost correctly", () => {
    const localDep = makeDockerDeployment({ host: "localhost" });
    const deployer1 = new DockerDeployer(
      "local",
      localDep,
      createMockStateManager() as any
    );
    expect(deployer1.isLocalhost).toBe(true);

    const remoteDep = makeDockerDeployment({ host: "10.0.0.5" });
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error("not found");
    });
    const deployer2 = new DockerDeployer(
      "remote",
      remoteDep,
      createMockStateManager() as any
    );
    expect(deployer2.isLocalhost).toBe(false);
  });

  it("should store deployment name", () => {
    const deployment = makeDockerDeployment();
    const deployer = new DockerDeployer(
      "my-name",
      deployment,
      createMockStateManager() as any
    );
    expect(deployer.deploymentName).toBe("my-name");
  });
});

describe("DockerDeployer with persistent paths", () => {
  it("should create deployer with persistent paths config", () => {
    const deployment = makeDockerDeployment({
      persistent_paths: {
        users_file: "/workspace/users.yaml",
        db_path: "/workspace/nodetool.db",
        chroma_path: "/workspace/chroma",
        hf_cache: "/workspace/hf-cache",
        asset_bucket: "/workspace/assets",
        logs_path: "/workspace/logs"
      }
    });
    const sm = createMockStateManager();
    const deployer = new DockerDeployer(
      "persist-deploy",
      deployment,
      sm as any
    );
    expect(deployer.deployment.persistent_paths).toBeDefined();
  });
});

describe("Interface types", () => {
  it("DeployResult should have required fields", () => {
    const result: DeployResult = {
      deployment_name: "test",
      status: "success",
      steps: ["step1"],
      errors: []
    };
    expect(result.deployment_name).toBe("test");
    expect(result.steps).toHaveLength(1);
  });

  it("DeployPlan should have required fields", () => {
    const plan: DeployPlan = {
      deployment_name: "test",
      host: "localhost",
      type: "docker",
      changes: [],
      will_create: [],
      will_update: [],
      will_destroy: []
    };
    expect(plan.type).toBe("docker");
  });

  it("DeployStatus should have required fields", () => {
    const status: DeployStatus = {
      deployment_name: "test",
      host: "localhost",
      type: "docker"
    };
    expect(status.container_name).toBeUndefined();
  });

  it("Executor interface should define execute and mkdir", async () => {
    const executor: Executor = {
      execute: vi.fn().mockResolvedValue([0, "", ""]),
      mkdir: vi.fn().mockResolvedValue(undefined)
    };
    const [code] = await executor.execute("test");
    expect(code).toBe(0);
  });
});
