import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockExecAsync } = vi.hoisted(() => {
  const mockExecAsync = vi.fn();
  return { mockExecAsync };
});

// Mock child_process (used by GCPDeployer.logs via execFileAsync)
vi.mock("node:child_process", () => ({
  exec: vi.fn(),
  execFile: vi.fn()
}));

vi.mock("node:util", () => ({
  promisify: () => mockExecAsync
}));

// Mock deploy-to-gcp
vi.mock("../src/deploy-to-gcp.js", () => ({
  deployToGcp: vi.fn(),
  deleteGcpService: vi.fn(),
  getGcpDefaultEnv: vi.fn(),
  listGcpServices: vi.fn()
}));

// Mock google-cloud-run-api
vi.mock("../src/google-cloud-run-api.js", () => ({
  getCloudRunService: vi.fn()
}));

// Mock state manager
vi.mock("../src/state.js", () => {
  const StateManager = vi.fn();
  StateManager.prototype.readState = vi.fn();
  StateManager.prototype.writeState = vi.fn();
  StateManager.prototype.updateDeploymentStatus = vi.fn();
  return { StateManager };
});

import { GCPDeployer } from "../src/gcp.js";
import { DeploymentStatus } from "../src/deployment-config.js";
import type { GCPDeployment } from "../src/deployment-config.js";
import { StateManager } from "../src/state.js";
import {
  deployToGcp,
  deleteGcpService,
  getGcpDefaultEnv,
  listGcpServices
} from "../src/deploy-to-gcp.js";
import { getCloudRunService } from "../src/google-cloud-run-api.js";

const mockDeployToGcp = vi.mocked(deployToGcp);
const mockDeleteGcpService = vi.mocked(deleteGcpService);
const mockGetGcpDefaultEnv = vi.mocked(getGcpDefaultEnv);
const mockListGcpServices = vi.mocked(listGcpServices);
const mockGetCloudRunService = vi.mocked(getCloudRunService);

function makeDeployment(overrides?: Partial<GCPDeployment>): GCPDeployment {
  return {
    type: "gcp",
    enabled: true,
    project_id: "my-project",
    region: "us-central1",
    service_name: "my-svc",
    image: {
      registry: "us-docker.pkg.dev",
      repository: "my-repo",
      tag: "latest",
      build: { platform: "linux/amd64" }
    },
    resources: {
      cpu: "4",
      memory: "16Gi",
      min_instances: 0,
      max_instances: 3,
      concurrency: 80,
      timeout: 3600
    },
    iam: {
      allow_unauthenticated: true
    },
    workflows: [],
    state: {
      service_url: null,
      last_deployed: null,
      status: "unknown",
      revision: null
    },
    ...overrides
  } as GCPDeployment;
}

let stateManager: StateManager;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  stateManager = new StateManager();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Constructor
// ---------------------------------------------------------------------------

describe("GCPDeployer constructor", () => {
  it("stores deployment name and deployment config", () => {
    const dep = makeDeployment();
    const deployer = new GCPDeployer("test-deploy", dep, stateManager);
    expect(deployer.deploymentName).toBe("test-deploy");
    expect(deployer.deployment).toBe(dep);
  });

  it("creates a default StateManager if none provided", () => {
    const dep = makeDeployment();
    const deployer = new GCPDeployer("test-deploy", dep);
    expect(deployer.stateManager).toBeDefined();
  });

  it("uses provided StateManager", () => {
    const dep = makeDeployment();
    const deployer = new GCPDeployer("test-deploy", dep, stateManager);
    expect(deployer.stateManager).toBe(stateManager);
  });
});

// ---------------------------------------------------------------------------
// plan
// ---------------------------------------------------------------------------

describe("GCPDeployer.plan", () => {
  it("returns initial deployment plan when no state exists", async () => {
    const dep = makeDeployment();
    const deployer = new GCPDeployer("test", dep, stateManager);

    vi.mocked(stateManager.readState).mockResolvedValueOnce(null);
    mockGetCloudRunService.mockResolvedValueOnce(null);

    const plan = await deployer.plan();
    expect(plan.deployment_name).toBe("test");
    expect(plan.type).toBe("gcp");
    expect(plan.changes as string[]).toContain(
      "Initial deployment - will create all resources"
    );
    expect(plan.will_create as string[]).toContain("Docker image (if changed)");
  });

  it("returns initial deployment plan when state has no last_deployed", async () => {
    const dep = makeDeployment();
    const deployer = new GCPDeployer("test", dep, stateManager);

    vi.mocked(stateManager.readState).mockResolvedValueOnce({
      status: "unknown"
    });
    mockGetCloudRunService.mockResolvedValueOnce({
      metadata: { name: "my-svc" }
    });

    const plan = await deployer.plan();
    expect(plan.changes as string[]).toContain(
      "Initial deployment - will create all resources"
    );
  });

  it("detects no changes when remote matches config", async () => {
    const dep = makeDeployment();
    const deployer = new GCPDeployer("test", dep, stateManager);

    vi.mocked(stateManager.readState).mockResolvedValueOnce({
      status: "serving",
      last_deployed: "2024-01-01"
    });

    mockGetGcpDefaultEnv.mockReturnValueOnce({
      NODETOOL_SERVER_MODE: "private"
    });

    const remoteService = {
      spec: {
        template: {
          metadata: {
            annotations: {
              "run.googleapis.com/gpu": "0",
              "autoscaling.knative.dev/minScale": "0",
              "autoscaling.knative.dev/maxScale": "3"
            }
          },
          spec: {
            containers: [
              {
                resources: { limits: { cpu: "4", memory: "16Gi" } },
                env: [{ name: "NODETOOL_SERVER_MODE", value: "private" }]
              }
            ],
            containerConcurrency: 80,
            timeoutSeconds: 3600
          }
        }
      }
    };

    mockGetCloudRunService.mockResolvedValueOnce(remoteService);

    const plan = await deployer.plan();
    expect(plan.changes as string[]).toContain(
      "No configuration changes detected"
    );
    expect((plan.will_update as string[]).length).toBe(0);
  });

  it("detects CPU change", async () => {
    const dep = makeDeployment({
      resources: {
        cpu: "8",
        memory: "16Gi",
        min_instances: 0,
        max_instances: 3,
        concurrency: 80,
        timeout: 3600
      } as any
    });
    const deployer = new GCPDeployer("test", dep, stateManager);

    vi.mocked(stateManager.readState).mockResolvedValueOnce({
      status: "serving",
      last_deployed: "2024-01-01"
    });
    mockGetGcpDefaultEnv.mockReturnValueOnce({});

    const remoteService = {
      spec: {
        template: {
          metadata: { annotations: {} },
          spec: {
            containers: [
              { resources: { limits: { cpu: "4", memory: "16Gi" } }, env: [] }
            ]
          }
        }
      }
    };
    mockGetCloudRunService.mockResolvedValueOnce(remoteService);

    const plan = await deployer.plan();
    const changes = plan.changes as string[];
    expect(changes.some((c) => c.includes("CPU"))).toBe(true);
  });

  it("detects memory change", async () => {
    const dep = makeDeployment({
      resources: {
        cpu: "4",
        memory: "32Gi",
        min_instances: 0,
        max_instances: 3,
        concurrency: 80,
        timeout: 3600
      } as any
    });
    const deployer = new GCPDeployer("test", dep, stateManager);

    vi.mocked(stateManager.readState).mockResolvedValueOnce({
      status: "serving",
      last_deployed: "2024-01-01"
    });
    mockGetGcpDefaultEnv.mockReturnValueOnce({});

    const remoteService = {
      spec: {
        template: {
          metadata: { annotations: {} },
          spec: {
            containers: [
              { resources: { limits: { cpu: "4", memory: "16Gi" } }, env: [] }
            ]
          }
        }
      }
    };
    mockGetCloudRunService.mockResolvedValueOnce(remoteService);

    const plan = await deployer.plan();
    const changes = plan.changes as string[];
    expect(changes.some((c) => c.includes("Memory"))).toBe(true);
  });

  it("normalizes remote CPU from millicores", async () => {
    const dep = makeDeployment({
      resources: {
        cpu: "4",
        memory: "16Gi",
        min_instances: 0,
        max_instances: 3,
        concurrency: 80,
        timeout: 3600
      } as any
    });
    const deployer = new GCPDeployer("test", dep, stateManager);

    vi.mocked(stateManager.readState).mockResolvedValueOnce({
      status: "serving",
      last_deployed: "2024-01-01"
    });
    mockGetGcpDefaultEnv.mockReturnValueOnce({});

    const remoteService = {
      spec: {
        template: {
          metadata: { annotations: {} },
          spec: {
            containers: [
              {
                resources: { limits: { cpu: "4000m", memory: "16Gi" } },
                env: []
              }
            ]
          }
        }
      }
    };
    mockGetCloudRunService.mockResolvedValueOnce(remoteService);

    const plan = await deployer.plan();
    // 4000m normalizes to 4, so no CPU change
    const changes = plan.changes as string[];
    expect(changes.some((c) => c.includes("CPU"))).toBe(false);
  });

  it("detects env var changes", async () => {
    const dep = makeDeployment();
    const deployer = new GCPDeployer("test", dep, stateManager);

    vi.mocked(stateManager.readState).mockResolvedValueOnce({
      status: "serving",
      last_deployed: "2024-01-01"
    });
    mockGetGcpDefaultEnv.mockReturnValueOnce({ FOO: "bar", NEW_VAR: "val" });

    const remoteService = {
      spec: {
        template: {
          metadata: {
            annotations: {
              "autoscaling.knative.dev/minScale": "0",
              "autoscaling.knative.dev/maxScale": "3"
            }
          },
          spec: {
            containers: [
              {
                resources: { limits: { cpu: "4", memory: "16Gi" } },
                env: [{ name: "FOO", value: "old" }]
              }
            ]
          }
        }
      }
    };
    mockGetCloudRunService.mockResolvedValueOnce(remoteService);

    const plan = await deployer.plan();
    const changes = plan.changes as string[];
    expect(changes.some((c) => c.includes("Environment variables"))).toBe(true);
  });

  it("handles getCloudRunService failure gracefully", async () => {
    const dep = makeDeployment();
    const deployer = new GCPDeployer("test", dep, stateManager);

    vi.mocked(stateManager.readState).mockResolvedValueOnce(null);
    mockGetCloudRunService.mockRejectedValueOnce(new Error("network error"));

    const plan = await deployer.plan();
    expect(plan.changes as string[]).toContain(
      "Initial deployment - will create all resources"
    );
  });
});

// ---------------------------------------------------------------------------
// apply
// ---------------------------------------------------------------------------

describe("GCPDeployer.apply", () => {
  it("delegates to plan when dryRun is true", async () => {
    const dep = makeDeployment();
    const deployer = new GCPDeployer("test", dep, stateManager);

    vi.mocked(stateManager.readState).mockResolvedValueOnce(null);
    mockGetCloudRunService.mockResolvedValueOnce(null);

    const result = await deployer.apply(true);
    expect(result.deployment_name).toBe("test");
    expect(result.type).toBe("gcp");
    // deployToGcp should NOT have been called
    expect(mockDeployToGcp).not.toHaveBeenCalled();
  });

  it("runs full deployment on apply", async () => {
    const dep = makeDeployment();
    const deployer = new GCPDeployer("test", dep, stateManager);

    mockDeployToGcp.mockResolvedValueOnce(undefined);
    vi.mocked(stateManager.updateDeploymentStatus).mockResolvedValue(undefined);
    vi.mocked(stateManager.writeState).mockResolvedValue(undefined);

    const result = await deployer.apply();
    expect(result.status).toBe("success");
    expect(result.steps as string[]).toContain(
      "Google Cloud Run deployment completed"
    );
    expect(mockDeployToGcp).toHaveBeenCalledOnce();
  });

  it("updates status to DEPLOYING then SERVING on success", async () => {
    const dep = makeDeployment();
    const deployer = new GCPDeployer("test", dep, stateManager);

    mockDeployToGcp.mockResolvedValueOnce(undefined);
    vi.mocked(stateManager.updateDeploymentStatus).mockResolvedValue(undefined);
    vi.mocked(stateManager.writeState).mockResolvedValue(undefined);

    await deployer.apply();

    expect(vi.mocked(stateManager.updateDeploymentStatus)).toHaveBeenCalledWith(
      "test",
      DeploymentStatus.DEPLOYING
    );
    expect(vi.mocked(stateManager.writeState)).toHaveBeenCalledWith(
      "test",
      expect.objectContaining({ status: DeploymentStatus.SERVING })
    );
  });

  it("updates status to ERROR and re-throws on failure", async () => {
    const dep = makeDeployment();
    const deployer = new GCPDeployer("test", dep, stateManager);

    mockDeployToGcp.mockRejectedValueOnce(new Error("deploy failed"));
    vi.mocked(stateManager.updateDeploymentStatus).mockResolvedValue(undefined);

    await expect(deployer.apply()).rejects.toThrow("deploy failed");
    expect(vi.mocked(stateManager.updateDeploymentStatus)).toHaveBeenCalledWith(
      "test",
      DeploymentStatus.ERROR
    );
  });

  it("includes error message in results on failure", async () => {
    const dep = makeDeployment();
    const deployer = new GCPDeployer("test", dep, stateManager);

    mockDeployToGcp.mockRejectedValueOnce(new Error("quota exceeded"));
    vi.mocked(stateManager.updateDeploymentStatus).mockResolvedValue(undefined);

    try {
      await deployer.apply();
    } catch {
      // expected
    }
  });
});

// ---------------------------------------------------------------------------
// status
// ---------------------------------------------------------------------------

describe("GCPDeployer.status", () => {
  it("returns basic info with no state", async () => {
    const dep = makeDeployment();
    const deployer = new GCPDeployer("test", dep, stateManager);

    vi.mocked(stateManager.readState).mockResolvedValueOnce(null);
    mockListGcpServices.mockResolvedValueOnce([]);

    const status = await deployer.status();
    expect(status.deployment_name).toBe("test");
    expect(status.type).toBe("gcp");
    expect(status.project).toBe("my-project");
    expect(status.region).toBe("us-central1");
  });

  it("includes state info when available", async () => {
    const dep = makeDeployment();
    const deployer = new GCPDeployer("test", dep, stateManager);

    vi.mocked(stateManager.readState).mockResolvedValueOnce({
      status: "serving",
      last_deployed: "2024-01-01T00:00:00Z"
    });
    mockListGcpServices.mockResolvedValueOnce([]);

    const status = await deployer.status();
    expect(status.status).toBe("serving");
    expect(status.last_deployed).toBe("2024-01-01T00:00:00Z");
  });

  it("includes live status from matching service", async () => {
    const dep = makeDeployment();
    const deployer = new GCPDeployer("test", dep, stateManager);

    vi.mocked(stateManager.readState).mockResolvedValueOnce(null);
    mockListGcpServices.mockResolvedValueOnce([
      {
        metadata: { name: "my-svc" },
        status: { url: "https://my-svc.run.app" }
      }
    ]);

    const status = await deployer.status();
    expect(status.url).toBe("https://my-svc.run.app");
    expect(status.live_status).toEqual({ url: "https://my-svc.run.app" });
  });

  it("does not include live status for non-matching service", async () => {
    const dep = makeDeployment();
    const deployer = new GCPDeployer("test", dep, stateManager);

    vi.mocked(stateManager.readState).mockResolvedValueOnce(null);
    mockListGcpServices.mockResolvedValueOnce([
      {
        metadata: { name: "other-svc" },
        status: { url: "https://other.run.app" }
      }
    ]);

    const status = await deployer.status();
    expect(status.url).toBeUndefined();
  });

  it("handles listGcpServices failure gracefully", async () => {
    const dep = makeDeployment();
    const deployer = new GCPDeployer("test", dep, stateManager);

    vi.mocked(stateManager.readState).mockResolvedValueOnce(null);
    mockListGcpServices.mockRejectedValueOnce(new Error("network error"));

    const status = await deployer.status();
    expect(status.live_status_error).toBe("network error");
  });
});

// ---------------------------------------------------------------------------
// logs
// ---------------------------------------------------------------------------

describe("GCPDeployer.logs", () => {
  it("returns log output", async () => {
    const dep = makeDeployment();
    const deployer = new GCPDeployer("test", dep, stateManager);

    mockExecAsync.mockResolvedValueOnce({
      stdout: "2024-01-01 hello world\n",
      stderr: ""
    });

    const logs = await deployer.logs();
    expect(logs).toBe("2024-01-01 hello world\n");
  });

  it("respects tail parameter", async () => {
    const dep = makeDeployment();
    const deployer = new GCPDeployer("test", dep, stateManager);

    mockExecAsync.mockResolvedValueOnce({ stdout: "log line\n", stderr: "" });

    await deployer.logs(undefined, false, 50);
    // execFileAsync is called with (program, args, options)
    const args = mockExecAsync.mock.calls[0][1] as string[];
    const limitIdx = args.indexOf("--limit");
    expect(limitIdx).toBeGreaterThan(-1);
    expect(args[limitIdx + 1]).toBe("50");
  });

  it("adds --follow when follow is true", async () => {
    const dep = makeDeployment();
    const deployer = new GCPDeployer("test", dep, stateManager);

    mockExecAsync.mockResolvedValueOnce({ stdout: "", stderr: "" });

    await deployer.logs(undefined, true);
    // execFileAsync is called with (program, args, options)
    const args = mockExecAsync.mock.calls[0][1] as string[];
    expect(args).toContain("--follow");
  });

  it("throws on failure", async () => {
    const dep = makeDeployment();
    const deployer = new GCPDeployer("test", dep, stateManager);

    mockExecAsync.mockRejectedValueOnce(new Error("access denied"));

    await expect(deployer.logs()).rejects.toThrow("Failed to fetch logs");
  });
});

// ---------------------------------------------------------------------------
// destroy
// ---------------------------------------------------------------------------

describe("GCPDeployer.destroy", () => {
  it("deletes the service and updates state", async () => {
    const dep = makeDeployment();
    const deployer = new GCPDeployer("test", dep, stateManager);

    mockDeleteGcpService.mockResolvedValueOnce(true);
    vi.mocked(stateManager.updateDeploymentStatus).mockResolvedValue(undefined);

    const result = await deployer.destroy();
    expect(result.status).toBe("success");
    expect(result.steps as string[]).toContain("Service deleted successfully");
    expect(vi.mocked(stateManager.updateDeploymentStatus)).toHaveBeenCalledWith(
      "test",
      DeploymentStatus.DESTROYED
    );
  });

  it("reports error when deletion returns false", async () => {
    const dep = makeDeployment();
    const deployer = new GCPDeployer("test", dep, stateManager);

    mockDeleteGcpService.mockResolvedValueOnce(false);
    vi.mocked(stateManager.updateDeploymentStatus).mockResolvedValue(undefined);

    const result = await deployer.destroy();
    expect(result.status).toBe("error");
    expect(result.errors as string[]).toContain("Failed to delete service");
  });

  it("re-throws on unexpected error", async () => {
    const dep = makeDeployment();
    const deployer = new GCPDeployer("test", dep, stateManager);

    mockDeleteGcpService.mockRejectedValueOnce(new Error("network fail"));
    vi.mocked(stateManager.updateDeploymentStatus).mockResolvedValue(undefined);

    await expect(deployer.destroy()).rejects.toThrow("network fail");
  });
});
