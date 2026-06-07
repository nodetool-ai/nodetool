import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
//
// After the multi-tenant refactor, deploy-to-gcp is host-credential-free: every
// gcloud/docker call routes through an explicit `GcpScope` (a scoped runner +
// scratch credential env) and the env-vars file is written via the context's
// `writeScratchFile`. We mock the google-cloud-run-api helpers (asserting they
// receive the scope), the docker build, and `writeScratchFile` (so nothing
// touches the filesystem). The Docker availability probe now runs through
// `scope.run("docker", ["--version"], ...)`, so we control it via the fake
// scope rather than a `runCommand` mock.

vi.mock("../src/google-cloud-run-api.js", () => ({
  deployToCloudRun: vi.fn(),
  enableRequiredApis: vi.fn(),
  ensureCloudRunPermissions: vi.fn(),
  ensureGcloudAuth: vi.fn(),
  ensureProjectSet: vi.fn(),
  pushToGcr: vi.fn(),
  deleteCloudRunService: vi.fn(),
  listCloudRunServices: vi.fn(),
  // gcpEnvVarsToYaml is a pure serializer; the real one is fine for the tests.
  gcpEnvVarsToYaml: vi.fn((env: Record<string, string>) =>
    Object.entries(env)
      .map(([k, v]) => `${k}: "${v}"`)
      .join("\n")
  )
}));

// Mock docker (build only — the version probe is handled by the scope).
vi.mock("../src/docker.js", () => ({
  buildDockerImage: vi.fn()
}));

// Mock writeScratchFile so the env-vars-file write stays offline. We re-export
// the real types implicitly; only the side-effecting writer is replaced.
vi.mock("../src/deployment-context.js", () => ({
  writeScratchFile: vi.fn(async (_ctx, relPath: string) => `/tmp/scratch/${relPath}`)
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
import type { DeploymentContext } from "../src/deployment-context.js";
import type { GcpScope } from "../src/google-cloud-run-api.js";

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

import { buildDockerImage } from "../src/docker.js";
import { writeScratchFile } from "../src/deployment-context.js";

const mockEnsureGcloudAuth = vi.mocked(ensureGcloudAuth);
const mockEnsureProjectSet = vi.mocked(ensureProjectSet);
const mockEnableRequiredApis = vi.mocked(enableRequiredApis);
const mockEnsureCloudRunPermissions = vi.mocked(ensureCloudRunPermissions);
const mockPushToGcr = vi.mocked(pushToGcr);
const mockDeployToCloudRun = vi.mocked(deployToCloudRun);
const mockBuildDockerImage = vi.mocked(buildDockerImage);
const mockDeleteCloudRunService = vi.mocked(deleteCloudRunService);
const mockListCloudRunServices = vi.mocked(listCloudRunServices);
const mockWriteScratchFile = vi.mocked(writeScratchFile);

// ---------------------------------------------------------------------------
// Helpers — fake DeploymentContext and GcpScope
// ---------------------------------------------------------------------------

// A per-operation context. Credentials come from here (e.g. the GCP SA key),
// never process.env. scratchDir is where the env-vars file would be written.
function makeCtx(
  credentials: Record<string, string> = {
    GCP_SERVICE_ACCOUNT_KEY: "{json-sa-key}"
  }
): DeploymentContext {
  return { userId: "u1", credentials, scratchDir: "/tmp/scratch" };
}

// A fake GcpScope. `run` is a scoped-runner stub that resolves an empty
// exec result by default (used for `docker --version` and any gcloud the
// non-mocked helpers might issue — though all gcloud-issuing helpers are
// themselves mocked here). `env` carries the scratch credential redirection.
function makeScope(
  overrides: Partial<GcpScope> = {}
): GcpScope & { run: ReturnType<typeof vi.fn> } {
  const run = vi.fn().mockResolvedValue({ stdout: "", stderr: "" });
  return {
    run,
    env: {
      GOOGLE_APPLICATION_CREDENTIALS: "/tmp/scratch/gcp/sa-key.json",
      CLOUDSDK_CONFIG: "/tmp/scratch/gcloud",
      DOCKER_CONFIG: "/tmp/scratch/.docker"
    },
    multiUser: true,
    ...overrides
  } as GcpScope & { run: ReturnType<typeof vi.fn> };
}

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

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});

  // Default mock implementations
  mockEnsureGcloudAuth.mockResolvedValue(undefined);
  mockEnsureProjectSet.mockImplementation(async (_scope, pid) => pid ?? "my-project");
  mockEnableRequiredApis.mockResolvedValue(undefined);
  mockEnsureCloudRunPermissions.mockResolvedValue(undefined);
  mockWriteScratchFile.mockImplementation(
    async (_ctx, relPath: string) => `/tmp/scratch/${relPath}`
  );
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
    const ctx = makeCtx();
    const scope = makeScope();
    mockBuildDockerImage.mockResolvedValue(false);
    mockPushToGcr.mockResolvedValueOnce(
      "us-central1-docker.pkg.dev/my-project/nodetool/my-repo:v1"
    );
    mockDeployToCloudRun.mockResolvedValueOnce({
      status: { url: "https://my-svc.run.app" }
    });

    await deployToGcp({ ctx, scope, deployment: dep });

    // Auth/project/api/permission helpers all receive the scope.
    expect(mockEnsureGcloudAuth).toHaveBeenCalledOnce();
    expect(mockEnsureGcloudAuth).toHaveBeenCalledWith(scope);
    expect(mockEnsureProjectSet).toHaveBeenCalledWith(scope, "my-project");
    expect(mockEnableRequiredApis).toHaveBeenCalledWith(scope, "my-project");
    expect(mockEnsureCloudRunPermissions).toHaveBeenCalledWith(
      scope,
      "my-project",
      null
    );
    expect(mockBuildDockerImage).toHaveBeenCalledOnce();
    // pushToGcr is invoked with the scope as the first positional arg.
    expect(mockPushToGcr).toHaveBeenCalledOnce();
    expect(mockPushToGcr.mock.calls[0][0]).toBe(scope);
    // deployToCloudRun receives the scope on its options bag.
    expect(mockDeployToCloudRun).toHaveBeenCalledOnce();
    expect(mockDeployToCloudRun.mock.calls[0][0]).toEqual(
      expect.objectContaining({ scope })
    );
  });

  it("probes docker through the scoped runner, not the host env", async () => {
    const dep = makeDeployment();
    const ctx = makeCtx();
    const scope = makeScope();
    mockBuildDockerImage.mockResolvedValue(false);
    mockPushToGcr.mockResolvedValueOnce("image-url");
    mockDeployToCloudRun.mockResolvedValueOnce({ status: {} });

    await deployToGcp({ ctx, scope, deployment: dep });

    // The docker availability probe runs `docker --version` via scope.run with
    // the scratch credential env — never the ambient host environment.
    expect(scope.run).toHaveBeenCalledWith(
      "docker",
      ["--version"],
      expect.objectContaining({ env: scope.env })
    );
  });

  it("skips build when skipBuild is true", async () => {
    const dep = makeDeployment();
    const scope = makeScope();
    mockPushToGcr.mockResolvedValueOnce("image-url");
    mockDeployToCloudRun.mockResolvedValueOnce({ status: {} });

    await deployToGcp({ ctx: makeCtx(), scope, deployment: dep, skipBuild: true });

    expect(mockBuildDockerImage).not.toHaveBeenCalled();
    // With build skipped, the docker version probe is skipped too.
    expect(scope.run).not.toHaveBeenCalled();
  });

  it("skips push when skipPush is true", async () => {
    const dep = makeDeployment();
    const scope = makeScope();
    mockBuildDockerImage.mockResolvedValue(false);

    await deployToGcp({ ctx: makeCtx(), scope, deployment: dep, skipPush: true });

    expect(mockPushToGcr).not.toHaveBeenCalled();
    // Also skipDeploy because no gcpImageUrl
    expect(mockDeployToCloudRun).not.toHaveBeenCalled();
  });

  it("skips deploy when skipDeploy is true", async () => {
    const dep = makeDeployment();
    const scope = makeScope();
    mockBuildDockerImage.mockResolvedValue(false);
    mockPushToGcr.mockResolvedValueOnce("image-url");

    await deployToGcp({ ctx: makeCtx(), scope, deployment: dep, skipDeploy: true });

    expect(mockDeployToCloudRun).not.toHaveBeenCalled();
  });

  it("skips permission setup when skipPermissionSetup is true", async () => {
    const dep = makeDeployment();
    const scope = makeScope();
    mockBuildDockerImage.mockResolvedValue(false);
    mockPushToGcr.mockResolvedValueOnce("image-url");
    mockDeployToCloudRun.mockResolvedValueOnce({ status: {} });

    await deployToGcp({
      ctx: makeCtx(),
      scope,
      deployment: dep,
      skipPermissionSetup: true
    });

    expect(mockEnsureCloudRunPermissions).not.toHaveBeenCalled();
  });

  it("infers registry from region when not provided", async () => {
    const dep = makeDeployment();
    dep.image.registry = "";
    const scope = makeScope();
    mockBuildDockerImage.mockResolvedValue(false);
    mockPushToGcr.mockResolvedValueOnce("image-url");
    mockDeployToCloudRun.mockResolvedValueOnce({ status: {} });

    await deployToGcp({ ctx: makeCtx(), scope, deployment: dep });

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("Inferred registry from region")
    );
  });

  it("uses provided registry when available", async () => {
    const dep = makeDeployment();
    dep.image.registry = "gcr.io";
    const scope = makeScope();
    mockBuildDockerImage.mockResolvedValue(false);
    mockPushToGcr.mockResolvedValueOnce("image-url");
    mockDeployToCloudRun.mockResolvedValueOnce({ status: {} });

    await deployToGcp({ ctx: makeCtx(), scope, deployment: dep });

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("Using provided registry: gcr.io")
    );
  });

  it("sanitizes the service name", async () => {
    const dep = makeDeployment();
    dep.service_name = "My_Service.v1";
    const scope = makeScope();
    mockBuildDockerImage.mockResolvedValue(false);
    mockPushToGcr.mockResolvedValueOnce("image-url");
    mockDeployToCloudRun.mockResolvedValueOnce({ status: {} });

    await deployToGcp({ ctx: makeCtx(), scope, deployment: dep });

    expect(mockDeployToCloudRun).toHaveBeenCalledWith(
      expect.objectContaining({ serviceName: "my-service-v1" })
    );
  });

  it("merges user env with default env (user takes precedence)", async () => {
    const dep = makeDeployment();
    const scope = makeScope();
    mockBuildDockerImage.mockResolvedValue(false);
    mockPushToGcr.mockResolvedValueOnce("image-url");
    mockDeployToCloudRun.mockResolvedValueOnce({ status: {} });

    await deployToGcp({
      ctx: makeCtx(),
      scope,
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

  it("writes env vars to a scratch file and passes it via --env-vars-file", async () => {
    const dep = makeDeployment();
    const ctx = makeCtx();
    const scope = makeScope();
    mockBuildDockerImage.mockResolvedValue(false);
    mockPushToGcr.mockResolvedValueOnce("image-url");
    mockDeployToCloudRun.mockResolvedValueOnce({ status: {} });

    await deployToGcp({ ctx, scope, deployment: dep });

    // Env vars are written to a 0600 scratch file (so values never hit argv) and
    // the resulting path is threaded to deployToCloudRun as envVarsFile.
    expect(mockWriteScratchFile).toHaveBeenCalledWith(
      ctx,
      "gcloud/env-vars.yaml",
      expect.any(String)
    );
    expect(mockDeployToCloudRun.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        envVarsFile: "/tmp/scratch/gcloud/env-vars.yaml"
      })
    );
  });

  it("forwards dockerAuth to the build for the multi-user path", async () => {
    const dep = makeDeployment();
    const scope = makeScope();
    const dockerAuth = {
      run: vi.fn().mockResolvedValue({ stdout: "", stderr: "" }),
      dockerConfigDir: "/tmp/scratch/.docker"
    };
    mockBuildDockerImage.mockResolvedValue(false);
    mockPushToGcr.mockResolvedValueOnce("image-url");
    mockDeployToCloudRun.mockResolvedValueOnce({ status: {} });

    await deployToGcp({
      ctx: makeCtx(),
      scope,
      deployment: dep,
      dockerAuth: dockerAuth as any
    });

    expect(mockBuildDockerImage).toHaveBeenCalledWith(
      expect.objectContaining({ auth: dockerAuth })
    );
  });

  it("throws on deploy failure", async () => {
    const dep = makeDeployment();
    const scope = makeScope();
    mockBuildDockerImage.mockResolvedValue(false);
    mockPushToGcr.mockResolvedValueOnce("image-url");
    mockDeployToCloudRun.mockRejectedValueOnce(new Error("quota exceeded"));

    await expect(
      deployToGcp({ ctx: makeCtx(), scope, deployment: dep })
    ).rejects.toThrow("GCP deployment failed: quota exceeded");
  });

  it("throws when Docker is not available", async () => {
    const dep = makeDeployment();
    // The docker probe runs through scope.run; a rejection there means docker
    // is unavailable in the scoped environment.
    const scope = makeScope({
      run: vi.fn().mockRejectedValue(new Error("not found"))
    } as Partial<GcpScope>);

    await expect(
      deployToGcp({ ctx: makeCtx(), scope, deployment: dep })
    ).rejects.toThrow("Docker is not installed or not running");
  });

  it("uses service name as image name when repository is empty", async () => {
    const dep = makeDeployment();
    dep.image.repository = "";
    dep.service_name = "my-svc";
    const scope = makeScope();
    mockBuildDockerImage.mockResolvedValue(false);
    mockPushToGcr.mockResolvedValueOnce("image-url");
    mockDeployToCloudRun.mockResolvedValueOnce({ status: {} });

    await deployToGcp({ ctx: makeCtx(), scope, deployment: dep });

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
  it("authenticates, resolves project, sanitizes name, and deletes (scoped)", async () => {
    const scope = makeScope();
    mockDeleteCloudRunService.mockResolvedValueOnce(true);

    const result = await deleteGcpService(
      scope,
      "My_Service",
      "us-central1",
      "my-project"
    );
    expect(result).toBe(true);
    expect(mockEnsureGcloudAuth).toHaveBeenCalledOnce();
    expect(mockEnsureGcloudAuth).toHaveBeenCalledWith(scope);
    // deleteCloudRunService takes the scope as its first positional arg.
    expect(mockDeleteCloudRunService).toHaveBeenCalledWith(
      scope,
      "my-service",
      "us-central1",
      "my-project"
    );
  });

  it("uses default region when not provided", async () => {
    const scope = makeScope();
    mockDeleteCloudRunService.mockResolvedValueOnce(true);

    await deleteGcpService(scope, "svc");
    expect(mockDeleteCloudRunService).toHaveBeenCalledWith(
      scope,
      "svc",
      "us-central1",
      "my-project"
    );
  });

  it("resolves project from ensureProjectSet when not provided", async () => {
    const scope = makeScope();
    mockEnsureProjectSet.mockResolvedValueOnce("default-project");
    mockDeleteCloudRunService.mockResolvedValueOnce(true);

    await deleteGcpService(scope, "svc", "us-central1", null);
    expect(mockEnsureProjectSet).toHaveBeenCalledWith(scope, null);
    expect(mockDeleteCloudRunService).toHaveBeenCalledWith(
      scope,
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
  it("authenticates, resolves project, and lists services (scoped)", async () => {
    const scope = makeScope();
    const services = [{ metadata: { name: "svc1" } }];
    mockListCloudRunServices.mockResolvedValueOnce(services);

    const result = await listGcpServices(scope, "us-central1", "my-project");
    expect(result).toEqual(services);
    expect(mockEnsureGcloudAuth).toHaveBeenCalledOnce();
    expect(mockEnsureGcloudAuth).toHaveBeenCalledWith(scope);
    expect(mockListCloudRunServices).toHaveBeenCalledWith(
      scope,
      "us-central1",
      "my-project"
    );
  });

  it("uses default region and resolved project", async () => {
    const scope = makeScope();
    mockEnsureProjectSet.mockResolvedValueOnce("default-proj");
    mockListCloudRunServices.mockResolvedValueOnce([]);

    await listGcpServices(scope);
    expect(mockListCloudRunServices).toHaveBeenCalledWith(
      scope,
      "us-central1",
      "default-proj"
    );
  });
});
