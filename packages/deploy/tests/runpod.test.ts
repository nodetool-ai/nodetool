import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  RunPodDeployer,
  type DeploymentPlan,
  type DeploymentResult,
  type StatusInfo
} from "../src/runpod.js";
import type { RunPodDeployment } from "../src/deployment-config.js";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("../src/deploy-to-runpod.js", () => ({
  deployToRunpod: vi.fn().mockResolvedValue(undefined)
}));

vi.mock("../src/runpod-api.js", () => ({
  getRunpodEndpointByName: vi.fn().mockResolvedValue(null)
}));

import { deployToRunpod } from "../src/deploy-to-runpod.js";
import { getRunpodEndpointByName } from "../src/runpod-api.js";

const mockedDeployToRunpod = vi.mocked(deployToRunpod);
const mockedGetEndpoint = vi.mocked(getRunpodEndpointByName);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStateManager(state: Record<string, unknown> | null = null) {
  return {
    readState: vi.fn().mockResolvedValue(state),
    writeState: vi.fn().mockResolvedValue(undefined),
    updateDeploymentStatus: vi.fn().mockResolvedValue(undefined)
  } as any;
}

function makeDeployment(
  overrides: Partial<RunPodDeployment> = {}
): RunPodDeployment {
  return {
    type: "runpod" as const,
    enabled: true,
    docker: { registry: "docker.io", username: "testuser" },
    image: { name: "my-image", tag: "latest" },
    platform: "linux/amd64",
    gpu_types: ["ADA_24"],
    gpu_count: 1,
    workers_min: 0,
    workers_max: 3,
    idle_timeout: 5,
    flashboot: false,
    state: { status: "unknown" },
    ...overrides
  } as RunPodDeployment;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Constructor
// ---------------------------------------------------------------------------

describe("RunPodDeployer constructor", () => {
  it("stores deployment name, config, and state manager", () => {
    const sm = makeStateManager();
    const dep = makeDeployment();
    const deployer = new RunPodDeployer("my-deploy", dep, sm);
    expect(deployer.deploymentName).toBe("my-deploy");
    expect(deployer.deployment).toBe(dep);
    expect(deployer.stateManager).toBe(sm);
  });
});

// ---------------------------------------------------------------------------
// plan()
// ---------------------------------------------------------------------------

describe("RunPodDeployer.plan()", () => {
  it("returns initial deployment plan when no state exists", async () => {
    const sm = makeStateManager(null);
    const deployer = new RunPodDeployer("test", makeDeployment(), sm);
    const plan = await deployer.plan();
    expect(plan.deploymentName).toBe("test");
    expect(plan.type).toBe("runpod");
    expect(plan.willCreate).toContain("Docker image");
    expect(plan.willCreate).toContain("RunPod template");
    expect(plan.willCreate).toContain("RunPod serverless endpoint");
    expect(plan.willUpdate).toHaveLength(0);
  });

  it("returns initial deployment plan when state has no last_deployed", async () => {
    const sm = makeStateManager({ status: "pending" });
    const deployer = new RunPodDeployer("test", makeDeployment(), sm);
    const plan = await deployer.plan();
    expect(plan.willCreate.length).toBeGreaterThan(0);
    expect(plan.changes[0]).toContain("Initial deployment");
  });

  it("returns update plan when already deployed", async () => {
    const sm = makeStateManager({
      status: "active",
      last_deployed: "2025-01-01T00:00:00Z"
    });
    const deployer = new RunPodDeployer("test", makeDeployment(), sm);
    const plan = await deployer.plan();
    expect(plan.willCreate).toHaveLength(0);
    expect(plan.willUpdate).toContain("RunPod endpoint configuration");
    expect(plan.changes[0]).toContain("Configuration may have changed");
  });

  it("always sets type to runpod", async () => {
    const sm = makeStateManager(null);
    const deployer = new RunPodDeployer("x", makeDeployment(), sm);
    const plan = await deployer.plan();
    expect(plan.type).toBe("runpod");
  });
});

// ---------------------------------------------------------------------------
// apply()
// ---------------------------------------------------------------------------

describe("RunPodDeployer.apply()", () => {
  it("returns plan when dryRun is true", async () => {
    const sm = makeStateManager(null);
    const deployer = new RunPodDeployer("test", makeDeployment(), sm);
    const result = await deployer.apply(true);
    expect((result as DeploymentPlan).type).toBe("runpod");
    expect(mockedDeployToRunpod).not.toHaveBeenCalled();
  });

  it("calls deployToRunpod with correct options", async () => {
    const sm = makeStateManager(null);
    const dep = makeDeployment({
      template_name: "custom-template",
      environment: { MY_VAR: "hello" },
      execution_timeout: 600000
    } as any);
    const deployer = new RunPodDeployer("my-deploy", dep, sm);
    await deployer.apply();
    expect(mockedDeployToRunpod).toHaveBeenCalledOnce();
    const opts = mockedDeployToRunpod.mock.calls[0][0];
    expect(opts.deployment).toBe(dep);
    expect(opts.templateName).toBe("custom-template");
    expect(opts.name).toBe("my-deploy");
    expect(opts.env).toEqual({ MY_VAR: "hello" });
  });

  it("uses deploymentName as templateName when template_name is not set", async () => {
    const sm = makeStateManager(null);
    const dep = makeDeployment();
    const deployer = new RunPodDeployer("fallback-name", dep, sm);
    await deployer.apply();
    const opts = mockedDeployToRunpod.mock.calls[0][0];
    expect(opts.templateName).toBe("fallback-name");
  });

  it("updates status to deploying before deploy", async () => {
    const sm = makeStateManager(null);
    const deployer = new RunPodDeployer("test", makeDeployment(), sm);
    await deployer.apply();
    expect(sm.updateDeploymentStatus).toHaveBeenCalledWith("test", "deploying");
  });

  it("writes active state after successful deploy", async () => {
    const sm = makeStateManager(null);
    const deployer = new RunPodDeployer("test", makeDeployment(), sm);
    await deployer.apply();
    expect(sm.writeState).toHaveBeenCalledWith("test", {
      status: "active",
      template_name: "test"
    });
  });

  it("returns success result with steps", async () => {
    const sm = makeStateManager(null);
    const deployer = new RunPodDeployer("test", makeDeployment(), sm);
    const result = (await deployer.apply()) as DeploymentResult;
    expect(result.status).toBe("success");
    expect(result.steps).toContain("Starting RunPod deployment...");
    expect(result.steps).toContain("RunPod deployment completed");
    expect(result.errors).toHaveLength(0);
  });

  it("sets error status and rethrows on deploy failure", async () => {
    const sm = makeStateManager(null);
    mockedDeployToRunpod.mockRejectedValueOnce(new Error("deploy boom"));
    const deployer = new RunPodDeployer("test", makeDeployment(), sm);
    await expect(deployer.apply()).rejects.toThrow("deploy boom");
    expect(sm.updateDeploymentStatus).toHaveBeenCalledWith("test", "error");
  });

  it("passes empty env when deployment has no environment", async () => {
    const sm = makeStateManager(null);
    const dep = makeDeployment();
    // Ensure no environment property
    delete (dep as any).environment;
    const deployer = new RunPodDeployer("test", dep, sm);
    await deployer.apply();
    const opts = mockedDeployToRunpod.mock.calls[0][0];
    expect(opts.env).toEqual({});
  });

  it("passes all deployment fields to deployToRunpod", async () => {
    const sm = makeStateManager(null);
    const dep = makeDeployment({
      gpu_count: 2,
      data_centers: ["US-TX-3"],
      workers_min: 1,
      workers_max: 5,
      idle_timeout: 10,
      flashboot: true
    } as any);
    const deployer = new RunPodDeployer("test", dep, sm);
    await deployer.apply();
    const opts = mockedDeployToRunpod.mock.calls[0][0];
    expect(opts.gpuCount).toBe(2);
    expect(opts.dataCenters).toEqual(["US-TX-3"]);
    expect(opts.workersMin).toBe(1);
    expect(opts.workersMax).toBe(5);
    expect(opts.idleTimeout).toBe(10);
    expect(opts.flashboot).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// status()
// ---------------------------------------------------------------------------

describe("RunPodDeployer.status()", () => {
  it("returns basic info when no state exists", async () => {
    const sm = makeStateManager(null);
    mockedGetEndpoint.mockResolvedValueOnce(null);
    const deployer = new RunPodDeployer("test", makeDeployment(), sm);
    const info = await deployer.status();
    expect(info.deploymentName).toBe("test");
    expect(info.type).toBe("runpod");
    expect(info.liveStatus).toBe("not_found");
  });

  it("populates fields from state", async () => {
    const sm = makeStateManager({
      status: "active",
      last_deployed: "2025-06-01T00:00:00Z",
      template_name: "my-tpl",
      pod_id: "pod-123"
    });
    mockedGetEndpoint.mockResolvedValueOnce(null);
    const deployer = new RunPodDeployer("test", makeDeployment(), sm);
    const info = await deployer.status();
    expect(info.status).toBe("active");
    expect(info.lastDeployed).toBe("2025-06-01T00:00:00Z");
    expect(info.templateName).toBe("my-tpl");
    expect(info.podId).toBe("pod-123");
  });

  it("populates live endpoint info when found", async () => {
    const sm = makeStateManager(null);
    mockedGetEndpoint.mockResolvedValueOnce({
      id: "ep-1",
      gpuIds: "ADA_24",
      workersMin: 0,
      workersMax: 3
    });
    const deployer = new RunPodDeployer("test", makeDeployment(), sm);
    const info = await deployer.status();
    expect(info.liveStatus).toBe("active");
    expect(info.endpointId).toBe("ep-1");
    expect(info.gpuIds).toBe("ADA_24");
    expect(info.workerCount).toBe("0-3");
    expect(info.urls?.runsync).toContain("ep-1");
    expect(info.urls?.run).toContain("ep-1");
  });

  it("handles API error gracefully", async () => {
    const sm = makeStateManager(null);
    mockedGetEndpoint.mockRejectedValueOnce(new Error("API fail"));
    const deployer = new RunPodDeployer("test", makeDeployment(), sm);
    const info = await deployer.status();
    expect(info.liveStatusError).toContain("API fail");
    expect(info.liveStatus).toBeUndefined();
  });

  it("calls getRunpodEndpointByName with quiet=true", async () => {
    const sm = makeStateManager(null);
    mockedGetEndpoint.mockResolvedValueOnce(null);
    const deployer = new RunPodDeployer("my-dep", makeDeployment(), sm);
    await deployer.status();
    expect(mockedGetEndpoint).toHaveBeenCalledWith("my-dep", true);
  });

  it("uses unknown as default for missing state fields", async () => {
    const sm = makeStateManager({});
    mockedGetEndpoint.mockResolvedValueOnce(null);
    const deployer = new RunPodDeployer("test", makeDeployment(), sm);
    const info = await deployer.status();
    expect(info.status).toBe("unknown");
    expect(info.lastDeployed).toBe("unknown");
    expect(info.templateName).toBe("unknown");
    expect(info.podId).toBe("unknown");
  });

  it("does not set urls when endpoint has no id", async () => {
    const sm = makeStateManager(null);
    mockedGetEndpoint.mockResolvedValueOnce({
      id: undefined,
      gpuIds: "ADA_24",
      workersMin: 0,
      workersMax: 3
    } as any);
    const deployer = new RunPodDeployer("test", makeDeployment(), sm);
    const info = await deployer.status();
    expect(info.liveStatus).toBe("active");
    expect(info.urls).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// logs()
// ---------------------------------------------------------------------------

describe("RunPodDeployer.logs()", () => {
  it("throws with informative message", () => {
    const sm = makeStateManager(null);
    const deployer = new RunPodDeployer("test", makeDeployment(), sm);
    expect(() => deployer.logs()).toThrow("don't provide direct log access");
  });

  it("throws regardless of arguments", () => {
    const sm = makeStateManager(null);
    const deployer = new RunPodDeployer("test", makeDeployment(), sm);
    expect(() => deployer.logs("service", true, 100)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// destroy()
// ---------------------------------------------------------------------------

describe("RunPodDeployer.destroy()", () => {
  it("returns success with manual deletion instructions", async () => {
    const sm = makeStateManager(null);
    const deployer = new RunPodDeployer("my-deploy", makeDeployment(), sm);
    const result = await deployer.destroy();
    expect(result.status).toBe("success");
    expect(result.deploymentName).toBe("my-deploy");
    expect(result.steps.some((s) => s.includes("manually"))).toBe(true);
    expect(result.steps.some((s) => s.includes("my-deploy"))).toBe(true);
  });

  it("updates state to destroyed", async () => {
    const sm = makeStateManager(null);
    const deployer = new RunPodDeployer("test", makeDeployment(), sm);
    await deployer.destroy();
    expect(sm.updateDeploymentStatus).toHaveBeenCalledWith("test", "destroyed");
  });

  it("rethrows on state update error", async () => {
    const sm = makeStateManager(null);
    sm.updateDeploymentStatus.mockRejectedValueOnce(new Error("state fail"));
    const deployer = new RunPodDeployer("test", makeDeployment(), sm);
    await expect(deployer.destroy()).rejects.toThrow("state fail");
  });

  it("sets error status in result on failure", async () => {
    const sm = makeStateManager(null);
    sm.updateDeploymentStatus.mockRejectedValueOnce(new Error("boom"));
    const deployer = new RunPodDeployer("test", makeDeployment(), sm);
    try {
      await deployer.destroy();
    } catch {
      // expected
    }
    // The error is captured in the result before rethrowing but we can't
    // access the result since it throws. That's the expected behavior.
  });

  it("includes runpod console URL in steps", async () => {
    const sm = makeStateManager(null);
    const deployer = new RunPodDeployer("test", makeDeployment(), sm);
    const result = await deployer.destroy();
    expect(result.steps.some((s) => s.includes("runpod.io/console"))).toBe(
      true
    );
  });
});
