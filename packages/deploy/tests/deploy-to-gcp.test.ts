import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock google-cloud-run-api
vi.mock("../src/google-cloud-run-api.js", () => ({
  deployToCloudRun: vi.fn(),
  enableRequiredApis: vi.fn(),
  ensureCloudRunPermissions: vi.fn(),
  ensureGcloudAuth: vi.fn(),
  ensureProjectSet: vi.fn(),
  pushToGcr: vi.fn(),
  deleteCloudRunService: vi.fn(),
  listCloudRunServices: vi.fn()
}));

// Mock docker
vi.mock("../src/docker.js", () => ({
  buildDockerImage: vi.fn(),
  runCommand: vi.fn()
}));

import {
  sanitizeServiceName,
  inferRegistryFromRegion,
  getGcpDefaultEnv,
  deployToGcp,
  deleteGcpService,
  listGcpServices,
  printGcpDeploymentSummary
} from "../src/deploy-to-gcp.js";

import type { GCPDeployment } from "../src/deployment-config.js";

import {
  deployToCloudRun,
  enableRequiredApis,
  ensureCloudRunPermissions,
  ensureGcloudAuth,
  ensureProjectSet,
  pushToGcr,
  deleteCloudRunService,
  listCloudRunServices
} from "../src/google-cloud-run-api.js";

import { buildDockerImage, runCommand } from "../src/docker.js";

const mockEnsureGcloudAuth = vi.mocked(ensureGcloudAuth);
const mockEnsureProjectSet = vi.mocked(ensureProjectSet);
const mockEnableRequiredApis = vi.mocked(enableRequiredApis);
const mockEnsureCloudRunPermissions = vi.mocked(ensureCloudRunPermissions);
const mockPushToGcr = vi.mocked(pushToGcr);
const mockDeployToCloudRun = vi.mocked(deployToCloudRun);
const mockBuildDockerImage = vi.mocked(buildDockerImage);
const mockRunCommand = vi.mocked(runCommand);
const mockDeleteCloudRunService = vi.mocked(deleteCloudRunService);
const mockListCloudRunServices = vi.mocked(listCloudRunServices);

function makeDeployment(overrides?: Partial<GCPDeployment>): GCPDeployment {
  return {
    type: "gcp",
    enabled: true,
    project_id: "my-project",
    region: "us-central1",
    service_name: "my-service",
    image: {
      registry: "",
      repository: "my-repo",
      tag: "v1",
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

// Capture and suppress process.exit
let mockProcessExit: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  mockProcessExit = vi.spyOn(process, "exit").mockImplementation((() => {
    throw new Error("process.exit called");
  }) as any);

  // Default mock implementations
  mockEnsureGcloudAuth.mockResolvedValue(undefined);
  mockEnsureProjectSet.mockImplementation(async (pid) => pid ?? "my-project");
  mockEnableRequiredApis.mockResolvedValue(undefined);
  mockEnsureCloudRunPermissions.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// sanitizeServiceName
// ---------------------------------------------------------------------------

describe("sanitizeServiceName", () => {
  it("converts to lowercase", () => {
    expect(sanitizeServiceName("MyService")).toBe("myservice");
  });

  it("replaces invalid characters with hyphens", () => {
    expect(sanitizeServiceName("my_service.v1")).toBe("my-service-v1");
  });

  it("removes consecutive hyphens", () => {
    expect(sanitizeServiceName("my--service---v1")).toBe("my-service-v1");
  });

  it("prepends svc- when name starts with a number", () => {
    expect(sanitizeServiceName("123service")).toBe("svc-123service");
  });

  it("prepends svc- when name starts with a hyphen", () => {
    const result = sanitizeServiceName("-myservice");
    expect(result).toMatch(/^[a-z]/);
  });

  it("prepends svc- for leading hyphen and strips trailing", () => {
    // "-my-service-" -> replace invalid: "-my-service-" -> starts with non-letter: "svc--my-service-"
    // -> remove leading/trailing hyphens on original is after svc- prefix, trailing hyphen stripped
    expect(sanitizeServiceName("-my-service-")).toBe("svc--my-service");
  });

  it("truncates to 63 characters", () => {
    const longName = "a".repeat(100);
    const result = sanitizeServiceName(longName);
    expect(result.length).toBeLessThanOrEqual(63);
  });

  it("truncated name ends with 'svc'", () => {
    const longName = "a".repeat(100);
    const result = sanitizeServiceName(longName);
    expect(result).toMatch(/svc$/);
  });

  it("returns nodetool-svc for empty string", () => {
    expect(sanitizeServiceName("")).toBe("nodetool-svc");
  });

  it("handles already valid names", () => {
    expect(sanitizeServiceName("valid-name-123")).toBe("valid-name-123");
  });

  it("handles name with special characters", () => {
    const result = sanitizeServiceName("my service (v1)!");
    expect(result).toMatch(/^[a-z][a-z0-9-]*[a-z0-9]$/);
  });

  it("handles name that is all special characters", () => {
    // "!!!@@@" -> "------" -> "-" -> "svc--" -> "svc"
    const result = sanitizeServiceName("!!!@@@");
    expect(result).toBe("svc");
  });
});

// ---------------------------------------------------------------------------
// inferRegistryFromRegion
// ---------------------------------------------------------------------------

describe("inferRegistryFromRegion", () => {
  it("returns correct Artifact Registry URL for us-central1", () => {
    expect(inferRegistryFromRegion("us-central1")).toBe(
      "us-central1-docker.pkg.dev"
    );
  });

  it("returns correct URL for europe-west1", () => {
    expect(inferRegistryFromRegion("europe-west1")).toBe(
      "europe-west1-docker.pkg.dev"
    );
  });

  it("returns correct URL for asia-east1", () => {
    expect(inferRegistryFromRegion("asia-east1")).toBe(
      "asia-east1-docker.pkg.dev"
    );
  });
});

// ---------------------------------------------------------------------------
// getGcpDefaultEnv
// ---------------------------------------------------------------------------

describe("getGcpDefaultEnv", () => {
  it("sets NODETOOL_SERVER_MODE to private", () => {
    const dep = makeDeployment();
    const env = getGcpDefaultEnv(dep);
    expect(env.NODETOOL_SERVER_MODE).toBe("private");
  });

  it("uses workspace paths when no GCS bucket", () => {
    const dep = makeDeployment();
    const env = getGcpDefaultEnv(dep);
    expect(env.HF_HOME).toBe("/workspace/.cache/huggingface");
    expect(env.OLLAMA_MODELS).toBe("/workspace/.ollama/models");
  });

  it("uses GCS mount paths when GCS bucket is set", () => {
    const dep = makeDeployment({
      storage: { gcs_bucket: "my-bucket", gcs_mount_path: "/mnt/gcs" }
    } as any);
    const env = getGcpDefaultEnv(dep);
    expect(env.HF_HOME).toBe("/mnt/gcs/.cache/huggingface");
    expect(env.HF_HUB_CACHE).toBe("/mnt/gcs/.cache/huggingface/hub");
    expect(env.TRANSFORMERS_CACHE).toBe("/mnt/gcs/.cache/transformers");
    expect(env.OLLAMA_MODELS).toBe("/mnt/gcs/.ollama/models");
  });

  it("uses default mount path when gcs_mount_path not provided", () => {
    const dep = makeDeployment({
      storage: { gcs_bucket: "my-bucket" }
    } as any);
    const env = getGcpDefaultEnv(dep);
    expect(env.HF_HOME).toBe("/mnt/gcs/.cache/huggingface");
  });

  it("sets AUTH_PROVIDER to static when no persistent paths", () => {
    const dep = makeDeployment();
    const env = getGcpDefaultEnv(dep);
    expect(env.AUTH_PROVIDER).toBe("static");
  });

  it("sets AUTH_PROVIDER to multi_user when persistent paths exist", () => {
    const dep = makeDeployment({
      persistent_paths: {
        users_file: "/data/users.yaml",
        db_path: "/data/db.sqlite",
        chroma_path: "/data/chroma",
        hf_cache: "/data/hf",
        asset_bucket: "/data/assets",
        logs_path: "/data/logs"
      }
    } as any);
    const env = getGcpDefaultEnv(dep);
    expect(env.AUTH_PROVIDER).toBe("multi_user");
    expect(env.USERS_FILE).toBe("/data/users.yaml");
    expect(env.DB_PATH).toBe("/data/db.sqlite");
    expect(env.CHROMA_PATH).toBe("/data/chroma");
    expect(env.ASSET_BUCKET).toBe("/data/assets");
  });
});

// ---------------------------------------------------------------------------
// deployToGcp
// ---------------------------------------------------------------------------

describe("deployToGcp", () => {
  it("orchestrates full deployment: auth, build, push, deploy", async () => {
    const dep = makeDeployment();
    mockRunCommand.mockReturnValue("Docker version 24.0.0");
    mockBuildDockerImage.mockReturnValue(false);
    mockPushToGcr.mockResolvedValueOnce(
      "us-central1-docker.pkg.dev/my-project/nodetool/my-repo:v1"
    );
    mockDeployToCloudRun.mockResolvedValueOnce({
      status: { url: "https://my-svc.run.app" }
    });

    await deployToGcp({ deployment: dep });

    expect(mockEnsureGcloudAuth).toHaveBeenCalledOnce();
    expect(mockEnsureProjectSet).toHaveBeenCalled();
    expect(mockEnableRequiredApis).toHaveBeenCalled();
    expect(mockEnsureCloudRunPermissions).toHaveBeenCalled();
    expect(mockBuildDockerImage).toHaveBeenCalledOnce();
    expect(mockPushToGcr).toHaveBeenCalledOnce();
    expect(mockDeployToCloudRun).toHaveBeenCalledOnce();
  });

  it("skips build when skipBuild is true", async () => {
    const dep = makeDeployment();
    mockPushToGcr.mockResolvedValueOnce("image-url");
    mockDeployToCloudRun.mockResolvedValueOnce({ status: {} });

    await deployToGcp({ deployment: dep, skipBuild: true });

    expect(mockBuildDockerImage).not.toHaveBeenCalled();
    expect(mockRunCommand).not.toHaveBeenCalled();
  });

  it("skips push when skipPush is true", async () => {
    const dep = makeDeployment();
    mockRunCommand.mockReturnValue("");
    mockBuildDockerImage.mockReturnValue(false);

    await deployToGcp({ deployment: dep, skipPush: true });

    expect(mockPushToGcr).not.toHaveBeenCalled();
    // Also skipDeploy because no gcpImageUrl
    expect(mockDeployToCloudRun).not.toHaveBeenCalled();
  });

  it("skips deploy when skipDeploy is true", async () => {
    const dep = makeDeployment();
    mockRunCommand.mockReturnValue("");
    mockBuildDockerImage.mockReturnValue(false);
    mockPushToGcr.mockResolvedValueOnce("image-url");

    await deployToGcp({ deployment: dep, skipDeploy: true });

    expect(mockDeployToCloudRun).not.toHaveBeenCalled();
  });

  it("skips permission setup when skipPermissionSetup is true", async () => {
    const dep = makeDeployment();
    mockRunCommand.mockReturnValue("");
    mockBuildDockerImage.mockReturnValue(false);
    mockPushToGcr.mockResolvedValueOnce("image-url");
    mockDeployToCloudRun.mockResolvedValueOnce({ status: {} });

    await deployToGcp({ deployment: dep, skipPermissionSetup: true });

    expect(mockEnsureCloudRunPermissions).not.toHaveBeenCalled();
  });

  it("infers registry from region when not provided", async () => {
    const dep = makeDeployment();
    dep.image.registry = "";
    mockRunCommand.mockReturnValue("");
    mockBuildDockerImage.mockReturnValue(false);
    mockPushToGcr.mockResolvedValueOnce("image-url");
    mockDeployToCloudRun.mockResolvedValueOnce({ status: {} });

    await deployToGcp({ deployment: dep });

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("Inferred registry from region")
    );
  });

  it("uses provided registry when available", async () => {
    const dep = makeDeployment();
    dep.image.registry = "gcr.io";
    mockRunCommand.mockReturnValue("");
    mockBuildDockerImage.mockReturnValue(false);
    mockPushToGcr.mockResolvedValueOnce("image-url");
    mockDeployToCloudRun.mockResolvedValueOnce({ status: {} });

    await deployToGcp({ deployment: dep });

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("Using provided registry: gcr.io")
    );
  });

  it("sanitizes the service name", async () => {
    const dep = makeDeployment();
    dep.service_name = "My_Service.v1";
    mockRunCommand.mockReturnValue("");
    mockBuildDockerImage.mockReturnValue(false);
    mockPushToGcr.mockResolvedValueOnce("image-url");
    mockDeployToCloudRun.mockResolvedValueOnce({ status: {} });

    await deployToGcp({ deployment: dep });

    expect(mockDeployToCloudRun).toHaveBeenCalledWith(
      expect.objectContaining({ serviceName: "my-service-v1" })
    );
  });

  it("merges user env with default env (user takes precedence)", async () => {
    const dep = makeDeployment();
    mockRunCommand.mockReturnValue("");
    mockBuildDockerImage.mockReturnValue(false);
    mockPushToGcr.mockResolvedValueOnce("image-url");
    mockDeployToCloudRun.mockResolvedValueOnce({ status: {} });

    await deployToGcp({
      deployment: dep,
      env: { NODETOOL_SERVER_MODE: "custom" }
    });

    // The user-provided env should override the default
    expect(mockDeployToCloudRun).toHaveBeenCalledWith(
      expect.objectContaining({
        envVars: expect.objectContaining({ NODETOOL_SERVER_MODE: "custom" })
      })
    );
  });

  it("throws on deploy failure", async () => {
    const dep = makeDeployment();
    mockRunCommand.mockReturnValue("");
    mockBuildDockerImage.mockReturnValue(false);
    mockPushToGcr.mockResolvedValueOnce("image-url");
    mockDeployToCloudRun.mockRejectedValueOnce(new Error("quota exceeded"));

    await expect(deployToGcp({ deployment: dep })).rejects.toThrow(
      "GCP deployment failed: quota exceeded"
    );
  });

  it("throws when Docker is not available", async () => {
    const dep = makeDeployment();
    mockRunCommand.mockImplementation(() => {
      throw new Error("not found");
    });

    await expect(deployToGcp({ deployment: dep })).rejects.toThrow(
      "Docker is not installed or not running"
    );
  });

  it("uses service name as image name when repository is empty", async () => {
    const dep = makeDeployment();
    dep.image.repository = "";
    dep.service_name = "my-svc";
    mockRunCommand.mockReturnValue("");
    mockBuildDockerImage.mockReturnValue(false);
    mockPushToGcr.mockResolvedValueOnce("image-url");
    mockDeployToCloudRun.mockResolvedValueOnce({ status: {} });

    await deployToGcp({ deployment: dep });

    // The localImageName should use sanitized service name
    expect(mockBuildDockerImage).toHaveBeenCalledWith(
      expect.objectContaining({
        imageName: expect.stringContaining("my-svc")
      })
    );
  });
});

// ---------------------------------------------------------------------------
// printGcpDeploymentSummary
// ---------------------------------------------------------------------------

describe("printGcpDeploymentSummary", () => {
  it("prints basic deployment summary", () => {
    printGcpDeploymentSummary({
      imageName: "my-image",
      imageTag: "v1",
      gcpImageUrl: null,
      serviceName: "my-svc",
      region: "us-central1",
      projectId: "my-project"
    });
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("my-image:v1")
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("my-project")
    );
  });

  it("prints GCP image URL when available", () => {
    printGcpDeploymentSummary({
      imageName: "my-image",
      imageTag: "v1",
      gcpImageUrl: "gcr.io/my-project/my-image:v1",
      serviceName: "my-svc",
      region: "us-central1",
      projectId: "my-project"
    });
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("gcr.io/my-project/my-image:v1")
    );
  });

  it("prints service URL from deployment info", () => {
    printGcpDeploymentSummary({
      imageName: "my-image",
      imageTag: "v1",
      gcpImageUrl: "url",
      serviceName: "my-svc",
      region: "us-central1",
      projectId: "my-project",
      deploymentInfo: { status: { url: "https://my-svc.run.app" } }
    });
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("https://my-svc.run.app")
    );
  });

  it("prints console link from deployment info", () => {
    printGcpDeploymentSummary({
      imageName: "my-image",
      imageTag: "v1",
      gcpImageUrl: "url",
      serviceName: "my-svc",
      region: "us-central1",
      projectId: "my-project",
      deploymentInfo: { status: { url: "https://my-svc.run.app" } }
    });
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("console.cloud.google.com")
    );
  });

  it("handles missing deployment info", () => {
    printGcpDeploymentSummary({
      imageName: "my-image",
      imageTag: "v1",
      gcpImageUrl: null,
      serviceName: "my-svc",
      region: "us-central1",
      projectId: "my-project",
      deploymentInfo: null
    });
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("Deployment ready for use")
    );
  });
});

// ---------------------------------------------------------------------------
// deleteGcpService
// ---------------------------------------------------------------------------

describe("deleteGcpService", () => {
  it("authenticates, resolves project, sanitizes name, and deletes", async () => {
    mockDeleteCloudRunService.mockResolvedValueOnce(true);

    const result = await deleteGcpService(
      "My_Service",
      "us-central1",
      "my-project"
    );
    expect(result).toBe(true);
    expect(mockEnsureGcloudAuth).toHaveBeenCalledOnce();
    expect(mockDeleteCloudRunService).toHaveBeenCalledWith(
      "my-service",
      "us-central1",
      "my-project"
    );
  });

  it("uses default region when not provided", async () => {
    mockDeleteCloudRunService.mockResolvedValueOnce(true);

    await deleteGcpService("svc");
    expect(mockDeleteCloudRunService).toHaveBeenCalledWith(
      "svc",
      "us-central1",
      "my-project"
    );
  });

  it("resolves project from default when not provided", async () => {
    mockEnsureProjectSet.mockResolvedValueOnce("default-project");
    mockDeleteCloudRunService.mockResolvedValueOnce(true);

    await deleteGcpService("svc", "us-central1", null);
    expect(mockDeleteCloudRunService).toHaveBeenCalledWith(
      "svc",
      "us-central1",
      "default-project"
    );
  });
});

// ---------------------------------------------------------------------------
// listGcpServices
// ---------------------------------------------------------------------------

describe("listGcpServices", () => {
  it("authenticates, resolves project, and lists services", async () => {
    const services = [{ metadata: { name: "svc1" } }];
    mockListCloudRunServices.mockResolvedValueOnce(services);

    const result = await listGcpServices("us-central1", "my-project");
    expect(result).toEqual(services);
    expect(mockEnsureGcloudAuth).toHaveBeenCalledOnce();
  });

  it("uses default region and project", async () => {
    mockEnsureProjectSet.mockResolvedValueOnce("default-proj");
    mockListCloudRunServices.mockResolvedValueOnce([]);

    await listGcpServices();
    expect(mockListCloudRunServices).toHaveBeenCalledWith(
      "us-central1",
      "default-proj"
    );
  });
});
