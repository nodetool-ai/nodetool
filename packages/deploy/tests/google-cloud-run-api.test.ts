import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockExecAsync } = vi.hoisted(() => {
  const mockExecAsync = vi.fn();
  return { mockExecAsync };
});

// Mock child_process before importing the module under test
vi.mock("node:child_process", () => ({
  exec: vi.fn(),
  execFile: vi.fn()
}));

vi.mock("node:util", () => ({
  promisify: () => mockExecAsync
}));

import {
  CloudRunRegion,
  CloudRunCPU,
  CloudRunMemory,
  listCloudRunRegions,
  listCloudRunCPUs,
  listCloudRunMemory,
  checkGcloudAuth,
  ensureGcloudAuth,
  getDefaultProject,
  ensureProjectSet,
  ensureCloudRunPermissions,
  enableRequiredApis,
  deployToCloudRun,
  deleteCloudRunService,
  getCloudRunService,
  listCloudRunServices,
  pushToGcr
} from "../src/google-cloud-run-api.js";

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Enum helpers
// ---------------------------------------------------------------------------

describe("listCloudRunRegions", () => {
  it("returns all CloudRunRegion values", () => {
    const regions = listCloudRunRegions();
    expect(regions).toContain("us-central1");
    expect(regions).toContain("europe-west1");
    expect(regions).toContain("asia-east1");
    expect(regions.length).toBeGreaterThan(20);
  });

  it("matches Object.values of CloudRunRegion", () => {
    expect(listCloudRunRegions()).toEqual(Object.values(CloudRunRegion));
  });
});

describe("listCloudRunCPUs", () => {
  it("returns all CPU options", () => {
    const cpus = listCloudRunCPUs();
    expect(cpus).toEqual(["1", "2", "4", "6", "8"]);
  });

  it("matches Object.values of CloudRunCPU", () => {
    expect(listCloudRunCPUs()).toEqual(Object.values(CloudRunCPU));
  });
});

describe("listCloudRunMemory", () => {
  it("returns all memory options", () => {
    const mems = listCloudRunMemory();
    expect(mems).toContain("512Mi");
    expect(mems).toContain("32Gi");
    expect(mems.length).toBe(7);
  });

  it("matches Object.values of CloudRunMemory", () => {
    expect(listCloudRunMemory()).toEqual(Object.values(CloudRunMemory));
  });
});

// ---------------------------------------------------------------------------
// checkGcloudAuth
// ---------------------------------------------------------------------------

describe("checkGcloudAuth", () => {
  it("returns true when gcloud returns an active account", async () => {
    mockExecAsync.mockResolvedValueOnce({
      stdout: "user@example.com\n",
      stderr: ""
    });
    expect(await checkGcloudAuth()).toBe(true);
  });

  it("returns false when gcloud returns empty output", async () => {
    mockExecAsync.mockResolvedValueOnce({ stdout: "  \n", stderr: "" });
    expect(await checkGcloudAuth()).toBe(false);
  });

  it("returns false when gcloud command fails", async () => {
    mockExecAsync.mockRejectedValueOnce(new Error("gcloud not found"));
    expect(await checkGcloudAuth()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ensureGcloudAuth
// ---------------------------------------------------------------------------

describe("ensureGcloudAuth", () => {
  it("succeeds when gcloud is installed and authenticated", async () => {
    // --version succeeds
    mockExecAsync.mockResolvedValueOnce({
      stdout: "Google Cloud SDK 400.0.0",
      stderr: ""
    });
    // auth list succeeds
    mockExecAsync.mockResolvedValueOnce({
      stdout: "user@example.com\n",
      stderr: ""
    });
    await expect(ensureGcloudAuth()).resolves.toBeUndefined();
  });

  it("throws when gcloud is not installed", async () => {
    mockExecAsync.mockRejectedValueOnce(new Error("command not found"));
    await expect(ensureGcloudAuth()).rejects.toThrow(
      "gcloud CLI not installed"
    );
  });

  it("throws when not authenticated", async () => {
    // --version succeeds
    mockExecAsync.mockResolvedValueOnce({
      stdout: "Google Cloud SDK 400.0.0",
      stderr: ""
    });
    // auth list returns empty
    mockExecAsync.mockResolvedValueOnce({ stdout: "", stderr: "" });
    await expect(ensureGcloudAuth()).rejects.toThrow(
      "Not authenticated with Google Cloud"
    );
  });
});

// ---------------------------------------------------------------------------
// getDefaultProject
// ---------------------------------------------------------------------------

describe("getDefaultProject", () => {
  it("returns the project id when set", async () => {
    mockExecAsync.mockResolvedValueOnce({ stdout: "my-project\n", stderr: "" });
    expect(await getDefaultProject()).toBe("my-project");
  });

  it("returns null when project is (unset)", async () => {
    mockExecAsync.mockResolvedValueOnce({ stdout: "(unset)\n", stderr: "" });
    expect(await getDefaultProject()).toBeNull();
  });

  it("returns null when project is empty", async () => {
    mockExecAsync.mockResolvedValueOnce({ stdout: "\n", stderr: "" });
    expect(await getDefaultProject()).toBeNull();
  });

  it("returns null on error", async () => {
    mockExecAsync.mockRejectedValueOnce(new Error("fail"));
    expect(await getDefaultProject()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// ensureProjectSet
// ---------------------------------------------------------------------------

describe("ensureProjectSet", () => {
  it("returns the provided projectId when given", async () => {
    expect(await ensureProjectSet("explicit-project")).toBe("explicit-project");
  });

  it("falls back to default project when projectId is null", async () => {
    mockExecAsync.mockResolvedValueOnce({
      stdout: "default-project\n",
      stderr: ""
    });
    expect(await ensureProjectSet(null)).toBe("default-project");
  });

  it("falls back to default project when projectId is undefined", async () => {
    mockExecAsync.mockResolvedValueOnce({
      stdout: "default-project\n",
      stderr: ""
    });
    expect(await ensureProjectSet()).toBe("default-project");
  });

  it("throws when no project is configured", async () => {
    mockExecAsync.mockResolvedValueOnce({ stdout: "(unset)\n", stderr: "" });
    await expect(ensureProjectSet(null)).rejects.toThrow(
      "No Google Cloud project configured"
    );
  });
});

// ---------------------------------------------------------------------------
// ensureCloudRunPermissions
// ---------------------------------------------------------------------------

describe("ensureCloudRunPermissions", () => {
  it("grants run.admin and serviceAccountUser when no service account", async () => {
    // get account
    mockExecAsync.mockResolvedValueOnce({
      stdout: "user@example.com\n",
      stderr: ""
    });
    // grant roles/run.admin
    mockExecAsync.mockResolvedValueOnce({ stdout: "", stderr: "" });
    // grant roles/iam.serviceAccountUser
    mockExecAsync.mockResolvedValueOnce({ stdout: "", stderr: "" });

    await ensureCloudRunPermissions("my-project");
    expect(mockExecAsync).toHaveBeenCalledTimes(3);
  });

  it("only grants run.admin when serviceAccount is provided", async () => {
    mockExecAsync.mockResolvedValueOnce({
      stdout: "user@example.com\n",
      stderr: ""
    });
    mockExecAsync.mockResolvedValueOnce({ stdout: "", stderr: "" });

    await ensureCloudRunPermissions(
      "my-project",
      "sa@proj.iam.gserviceaccount.com"
    );
    expect(mockExecAsync).toHaveBeenCalledTimes(2);
  });

  it("warns when account is (unset)", async () => {
    mockExecAsync.mockResolvedValueOnce({ stdout: "(unset)\n", stderr: "" });
    await ensureCloudRunPermissions("my-project");
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("Could not determine")
    );
  });

  it("handles failure to get account gracefully", async () => {
    mockExecAsync.mockRejectedValueOnce(new Error("fail"));
    await ensureCloudRunPermissions("my-project");
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("Could not auto-configure")
    );
  });

  it("handles permission granting failure gracefully", async () => {
    mockExecAsync.mockResolvedValueOnce({
      stdout: "user@example.com\n",
      stderr: ""
    });
    mockExecAsync.mockRejectedValueOnce(new Error("permission denied"));
    mockExecAsync.mockRejectedValueOnce(new Error("permission denied"));

    await ensureCloudRunPermissions("my-project");
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("Could not grant")
    );
  });
});

// ---------------------------------------------------------------------------
// enableRequiredApis
// ---------------------------------------------------------------------------

describe("enableRequiredApis", () => {
  it("enables all four required APIs", async () => {
    mockExecAsync.mockResolvedValue({ stdout: "", stderr: "" });
    await enableRequiredApis("my-project");
    expect(mockExecAsync).toHaveBeenCalledTimes(4);
  });

  it("warns but does not throw if an API fails to enable", async () => {
    mockExecAsync.mockResolvedValueOnce({ stdout: "", stderr: "" });
    mockExecAsync.mockRejectedValueOnce(new Error("fail"));
    mockExecAsync.mockResolvedValueOnce({ stdout: "", stderr: "" });
    mockExecAsync.mockResolvedValueOnce({ stdout: "", stderr: "" });

    await enableRequiredApis("my-project");
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("Failed to enable")
    );
  });
});

// ---------------------------------------------------------------------------
// getCloudRunService
// ---------------------------------------------------------------------------

describe("getCloudRunService", () => {
  it("returns parsed JSON when service exists", async () => {
    const svc = {
      metadata: { name: "my-svc" },
      status: { url: "https://my-svc.run.app" }
    };
    mockExecAsync.mockResolvedValueOnce({
      stdout: JSON.stringify(svc),
      stderr: ""
    });
    const result = await getCloudRunService(
      "my-svc",
      "us-central1",
      "my-project"
    );
    expect(result).toEqual(svc);
  });

  it("returns null when service does not exist", async () => {
    mockExecAsync.mockRejectedValueOnce(new Error("not found"));
    const result = await getCloudRunService(
      "missing",
      "us-central1",
      "my-project"
    );
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// listCloudRunServices
// ---------------------------------------------------------------------------

describe("listCloudRunServices", () => {
  it("returns parsed array of services", async () => {
    const services = [
      { metadata: { name: "svc1" } },
      { metadata: { name: "svc2" } }
    ];
    mockExecAsync.mockResolvedValueOnce({
      stdout: JSON.stringify(services),
      stderr: ""
    });
    const result = await listCloudRunServices("us-central1", "my-project");
    expect(result).toEqual(services);
    expect(result.length).toBe(2);
  });

  it("returns empty array on error", async () => {
    mockExecAsync.mockRejectedValueOnce(new Error("fail"));
    const result = await listCloudRunServices("us-central1", "my-project");
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// deleteCloudRunService
// ---------------------------------------------------------------------------

describe("deleteCloudRunService", () => {
  it("returns true on successful deletion", async () => {
    mockExecAsync.mockResolvedValueOnce({ stdout: "", stderr: "" });
    const result = await deleteCloudRunService(
      "my-svc",
      "us-central1",
      "my-project"
    );
    expect(result).toBe(true);
  });

  it("returns false on failure", async () => {
    mockExecAsync.mockRejectedValueOnce(new Error("fail"));
    const result = await deleteCloudRunService(
      "my-svc",
      "us-central1",
      "my-project"
    );
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// deployToCloudRun
// ---------------------------------------------------------------------------

describe("deployToCloudRun", () => {
  const baseOptions = {
    serviceName: "test-svc",
    imageUrl: "gcr.io/my-project/test:latest",
    region: "us-central1",
    projectId: "my-project"
  };

  it("creates a new service when none exists", async () => {
    // getCloudRunService (describe) fails -> not found
    mockExecAsync.mockRejectedValueOnce(new Error("not found"));
    // deploy succeeds
    const deployResult = { status: { url: "https://test-svc.run.app" } };
    mockExecAsync.mockResolvedValueOnce({
      stdout: JSON.stringify(deployResult),
      stderr: ""
    });

    const result = await deployToCloudRun(baseOptions);
    expect(result).toEqual(deployResult);
  });

  it("updates an existing service", async () => {
    // getCloudRunService succeeds
    mockExecAsync.mockResolvedValueOnce({
      stdout: JSON.stringify({ metadata: { name: "test-svc" } }),
      stderr: ""
    });
    // update succeeds
    const updateResult = { status: { url: "https://test-svc.run.app" } };
    mockExecAsync.mockResolvedValueOnce({
      stdout: JSON.stringify(updateResult),
      stderr: ""
    });
    // IAM binding for allowUnauthenticated (default true)
    mockExecAsync.mockResolvedValueOnce({ stdout: "", stderr: "" });

    const result = await deployToCloudRun(baseOptions);
    expect(result).toEqual(updateResult);
  });

  it("throws on deploy failure for new service", async () => {
    // not found
    mockExecAsync.mockRejectedValueOnce(new Error("not found"));
    // deploy fails
    mockExecAsync.mockRejectedValueOnce(new Error("quota exceeded"));

    await expect(deployToCloudRun(baseOptions)).rejects.toThrow(
      "Cloud Run deployment failed"
    );
  });

  it("throws on update failure for existing service", async () => {
    // service exists
    mockExecAsync.mockResolvedValueOnce({
      stdout: JSON.stringify({ metadata: { name: "test-svc" } }),
      stderr: ""
    });
    // update fails
    mockExecAsync.mockRejectedValueOnce(new Error("quota exceeded"));

    await expect(deployToCloudRun(baseOptions)).rejects.toThrow(
      "Cloud Run update failed"
    );
  });

  it("includes GPU flags when gpuType is set", async () => {
    mockExecAsync.mockRejectedValueOnce(new Error("not found"));
    const deployResult = { status: { url: "https://test-svc.run.app" } };
    mockExecAsync.mockResolvedValueOnce({
      stdout: JSON.stringify(deployResult),
      stderr: ""
    });

    await deployToCloudRun({
      ...baseOptions,
      gpuType: "nvidia-l4",
      gpuCount: 2
    });

    const args = mockExecAsync.mock.calls[1][1] as string[];
    const cmdStr = args.join(" ");
    expect(cmdStr).toContain("--gpu-type");
    expect(cmdStr).toContain("nvidia-l4");
    expect(cmdStr).toContain("--gpu");
  });

  it("includes env vars flags when provided", async () => {
    mockExecAsync.mockRejectedValueOnce(new Error("not found"));
    const deployResult = { status: { url: "https://test-svc.run.app" } };
    mockExecAsync.mockResolvedValueOnce({
      stdout: JSON.stringify(deployResult),
      stderr: ""
    });

    await deployToCloudRun({
      ...baseOptions,
      envVars: { FOO: "bar", BAZ: "qux" }
    });

    const args = mockExecAsync.mock.calls[1][1] as string[];
    const cmdStr = args.join(" ");
    expect(cmdStr).toContain("--set-env-vars");
    expect(cmdStr).toContain("FOO=bar");
    expect(cmdStr).toContain("BAZ=qux");
  });

  it("includes GCS bucket flags when provided", async () => {
    mockExecAsync.mockRejectedValueOnce(new Error("not found"));
    const deployResult = { status: {} };
    mockExecAsync.mockResolvedValueOnce({
      stdout: JSON.stringify(deployResult),
      stderr: ""
    });

    await deployToCloudRun({ ...baseOptions, gcsBucket: "my-bucket" });

    const args = mockExecAsync.mock.calls[1][1] as string[];
    const cmdStr = args.join(" ");
    expect(cmdStr).toContain("--add-volume");
    expect(cmdStr).toContain("my-bucket");
    expect(cmdStr).toContain("--add-volume-mount");
  });

  it("includes service account flag when provided", async () => {
    mockExecAsync.mockRejectedValueOnce(new Error("not found"));
    const deployResult = { status: {} };
    mockExecAsync.mockResolvedValueOnce({
      stdout: JSON.stringify(deployResult),
      stderr: ""
    });

    await deployToCloudRun({
      ...baseOptions,
      serviceAccount: "sa@proj.iam.gserviceaccount.com"
    });

    const args = mockExecAsync.mock.calls[1][1] as string[];
    const cmdStr = args.join(" ");
    expect(cmdStr).toContain("--service-account");
    expect(cmdStr).toContain("sa@proj.iam.gserviceaccount.com");
  });

  it("includes --allow-unauthenticated for new service when enabled", async () => {
    mockExecAsync.mockRejectedValueOnce(new Error("not found"));
    const deployResult = { status: {} };
    mockExecAsync.mockResolvedValueOnce({
      stdout: JSON.stringify(deployResult),
      stderr: ""
    });

    await deployToCloudRun({ ...baseOptions, allowUnauthenticated: true });

    const args = mockExecAsync.mock.calls[1][1] as string[];
    const cmdStr = args.join(" ");
    expect(cmdStr).toContain("--allow-unauthenticated");
  });

  it("does NOT include --allow-unauthenticated for new service when disabled", async () => {
    mockExecAsync.mockRejectedValueOnce(new Error("not found"));
    const deployResult = { status: {} };
    mockExecAsync.mockResolvedValueOnce({
      stdout: JSON.stringify(deployResult),
      stderr: ""
    });

    await deployToCloudRun({ ...baseOptions, allowUnauthenticated: false });

    const args = mockExecAsync.mock.calls[1][1] as string[];
    const cmdStr = args.join(" ");
    expect(cmdStr).not.toContain("--allow-unauthenticated");
  });

  it("silently handles IAM binding failure on update", async () => {
    mockExecAsync.mockResolvedValueOnce({
      stdout: JSON.stringify({ metadata: { name: "test-svc" } }),
      stderr: ""
    });
    const updateResult = { status: { url: "https://test-svc.run.app" } };
    mockExecAsync.mockResolvedValueOnce({
      stdout: JSON.stringify(updateResult),
      stderr: ""
    });
    // IAM binding fails
    mockExecAsync.mockRejectedValueOnce(new Error("already bound"));

    const result = await deployToCloudRun(baseOptions);
    expect(result).toEqual(updateResult);
  });
});

// ---------------------------------------------------------------------------
// pushToGcr
// ---------------------------------------------------------------------------

describe("pushToGcr", () => {
  it("pushes to gcr.io with correct image URL", async () => {
    // configure-docker
    mockExecAsync.mockResolvedValueOnce({ stdout: "", stderr: "" });
    // docker tag
    mockExecAsync.mockResolvedValueOnce({ stdout: "", stderr: "" });
    // docker push
    mockExecAsync.mockResolvedValueOnce({ stdout: "", stderr: "" });

    const url = await pushToGcr("my-image", "v1", "my-project", "gcr.io");
    expect(url).toBe("gcr.io/my-project/my-image:v1");
  });

  it("pushes to Artifact Registry and creates repository", async () => {
    // repo create
    mockExecAsync.mockResolvedValueOnce({ stdout: "created", stderr: "" });
    // configure-docker (general)
    mockExecAsync.mockResolvedValueOnce({ stdout: "", stderr: "" });
    // configure-docker (artifact registry host)
    mockExecAsync.mockResolvedValueOnce({ stdout: "", stderr: "" });
    // docker tag
    mockExecAsync.mockResolvedValueOnce({ stdout: "", stderr: "" });
    // docker push
    mockExecAsync.mockResolvedValueOnce({ stdout: "", stderr: "" });

    const url = await pushToGcr(
      "my-image",
      "v1",
      "my-project",
      "us-central1-docker.pkg.dev"
    );
    expect(url).toBe(
      "us-central1-docker.pkg.dev/my-project/nodetool/my-image:v1"
    );
  });

  it("handles existing Artifact Registry repo gracefully", async () => {
    // repo create fails (already exists)
    mockExecAsync.mockRejectedValueOnce(new Error("already exists"));
    // configure-docker
    mockExecAsync.mockResolvedValueOnce({ stdout: "", stderr: "" });
    // configure-docker for pkg.dev
    mockExecAsync.mockResolvedValueOnce({ stdout: "", stderr: "" });
    // docker tag
    mockExecAsync.mockResolvedValueOnce({ stdout: "", stderr: "" });
    // docker push
    mockExecAsync.mockResolvedValueOnce({ stdout: "", stderr: "" });

    const url = await pushToGcr(
      "my-image",
      "v1",
      "my-project",
      "us-central1-docker.pkg.dev"
    );
    expect(url).toBe(
      "us-central1-docker.pkg.dev/my-project/nodetool/my-image:v1"
    );
  });

  it("throws when Docker auth configuration fails", async () => {
    // For gcr.io: configure-docker fails
    mockExecAsync.mockRejectedValueOnce(new Error("docker not found"));

    await expect(pushToGcr("img", "v1", "proj")).rejects.toThrow(
      "Failed to configure Docker authentication"
    );
  });

  it("throws when docker tag/push fails", async () => {
    // configure-docker succeeds
    mockExecAsync.mockResolvedValueOnce({ stdout: "", stderr: "" });
    // docker tag fails
    mockExecAsync.mockRejectedValueOnce(new Error("no such image"));

    await expect(pushToGcr("img", "v1", "proj")).rejects.toThrow(
      "Failed to push image"
    );
  });
});
