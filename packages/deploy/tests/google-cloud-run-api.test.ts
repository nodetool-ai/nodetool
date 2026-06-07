import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  CloudRunRegion,
  CloudRunCPU,
  CloudRunMemory,
  listCloudRunRegions,
  listCloudRunCPUs,
  listCloudRunMemory,
  ensureGcloudAuth,
  ensureProjectSet,
  ensureCloudRunPermissions,
  enableRequiredApis,
  deployToCloudRun,
  deleteCloudRunService,
  getCloudRunService,
  listCloudRunServices,
  pushToGcr,
  type GcpScope
} from "../src/google-cloud-run-api.js";
import type { ScopedRunner } from "../src/deployment-context.js";

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
//
// After the host-credential-free refactor, every gcloud/docker call goes
// through a per-operation GcpScope.run (a ScopedRunner sourced from the user's
// DeploymentContext) carrying scope.env (the scratch credential redirection).
// Tests build a fake scope with a vi.fn() runner and assert against its calls
// instead of the old execAsync/host-auth mocks.

type RunMock = ReturnType<typeof vi.fn> & ScopedRunner;

function makeScope(
  overrides: Partial<GcpScope> = {}
): GcpScope & { run: RunMock } {
  const run = vi
    .fn()
    .mockResolvedValue({ stdout: "", stderr: "" }) as unknown as RunMock;
  return {
    run,
    env: {},
    multiUser: false,
    ...overrides
  };
}

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

// NOTE: The `checkGcloudAuth` describe block was REMOVED. That standalone helper
// read the host's ambient gcloud account (`gcloud auth list`) — a host-identity
// shortcut intentionally deleted in the host-credential-free refactor. There is
// no equivalent behaviour to re-express.

// ---------------------------------------------------------------------------
// ensureGcloudAuth
// ---------------------------------------------------------------------------

describe("ensureGcloudAuth", () => {
  it("succeeds and activates the SA key when one is present in scope.env", async () => {
    const scope = makeScope({
      env: { GOOGLE_APPLICATION_CREDENTIALS: "/scratch/sa-key.json" }
    });
    // gcloud --version succeeds, then activate-service-account succeeds.
    await expect(ensureGcloudAuth(scope)).resolves.toBeUndefined();

    expect(scope.run).toHaveBeenCalledWith(
      "gcloud",
      ["--version"],
      expect.objectContaining({ env: scope.env })
    );
    expect(scope.run).toHaveBeenCalledWith(
      "gcloud",
      [
        "auth",
        "activate-service-account",
        "--key-file",
        "/scratch/sa-key.json",
        "--quiet"
      ],
      expect.objectContaining({ env: scope.env })
    );
  });

  it("succeeds without activation when no SA key is in scope.env (single-user)", async () => {
    // multiUser=false and no GOOGLE_APPLICATION_CREDENTIALS: only --version runs.
    const scope = makeScope();
    await expect(ensureGcloudAuth(scope)).resolves.toBeUndefined();
    expect(scope.run).toHaveBeenCalledTimes(1);
    expect(scope.run).toHaveBeenCalledWith(
      "gcloud",
      ["--version"],
      expect.anything()
    );
  });

  it("throws when gcloud is not installed", async () => {
    const scope = makeScope();
    scope.run.mockRejectedValueOnce(new Error("command not found"));
    await expect(ensureGcloudAuth(scope)).rejects.toThrow(
      "gcloud CLI not installed"
    );
  });

  it("throws when SA key activation fails", async () => {
    const scope = makeScope({
      env: { GOOGLE_APPLICATION_CREDENTIALS: "/scratch/sa-key.json" }
    });
    // --version succeeds, activate-service-account fails.
    scope.run.mockResolvedValueOnce({ stdout: "", stderr: "" });
    scope.run.mockRejectedValueOnce(new Error("invalid key"));
    await expect(ensureGcloudAuth(scope)).rejects.toThrow(
      /Failed to activate the GCP service-account key/
    );
  });

  it("throws when multi-user mode has no SA credentials", async () => {
    // No GOOGLE_APPLICATION_CREDENTIALS in a multiUser scope: the credentials
    // are required, so it fails fast after --version.
    const scope = makeScope({ multiUser: true, env: {} });
    await expect(ensureGcloudAuth(scope)).rejects.toThrow(
      /No GCP service-account credentials available/
    );
  });
});

// NOTE: The `getDefaultProject` describe block was REMOVED. That standalone
// helper read the host gcloud default project (`gcloud config get-value
// project`) — a host-identity shortcut deleted in the refactor. The remaining
// single-user fallback now lives inside ensureProjectSet and is covered there.

// ---------------------------------------------------------------------------
// ensureProjectSet
// ---------------------------------------------------------------------------

describe("ensureProjectSet", () => {
  it("returns the provided projectId when given (single-user)", async () => {
    const scope = makeScope();
    expect(await ensureProjectSet(scope, "explicit-project")).toBe(
      "explicit-project"
    );
    // An explicit project short-circuits before any gcloud call.
    expect(scope.run).not.toHaveBeenCalled();
  });

  it("returns the provided projectId when given (multi-user)", async () => {
    const scope = makeScope({ multiUser: true });
    expect(await ensureProjectSet(scope, "explicit-project")).toBe(
      "explicit-project"
    );
    expect(scope.run).not.toHaveBeenCalled();
  });

  it("falls back to the gcloud default project when projectId is null (single-user)", async () => {
    const scope = makeScope();
    scope.run.mockResolvedValueOnce({
      stdout: "default-project\n",
      stderr: ""
    });
    expect(await ensureProjectSet(scope, null)).toBe("default-project");
    expect(scope.run).toHaveBeenCalledWith(
      "gcloud",
      ["config", "get-value", "project"],
      expect.objectContaining({ env: scope.env })
    );
  });

  it("falls back to the gcloud default project when projectId is undefined (single-user)", async () => {
    const scope = makeScope();
    scope.run.mockResolvedValueOnce({
      stdout: "default-project\n",
      stderr: ""
    });
    expect(await ensureProjectSet(scope)).toBe("default-project");
  });

  it("throws when single-user has no project configured", async () => {
    const scope = makeScope();
    scope.run.mockResolvedValueOnce({ stdout: "(unset)\n", stderr: "" });
    await expect(ensureProjectSet(scope, null)).rejects.toThrow(
      "No Google Cloud project configured"
    );
  });

  it("throws in multi-user mode when no explicit project is given (no host fallback)", async () => {
    // Multi-user must NOT read the host default project; it requires an explicit
    // project_id and fails fast without ever calling gcloud.
    const scope = makeScope({ multiUser: true });
    await expect(ensureProjectSet(scope, null)).rejects.toThrow(
      "No Google Cloud project configured"
    );
    expect(scope.run).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// ensureCloudRunPermissions
// ---------------------------------------------------------------------------

describe("ensureCloudRunPermissions", () => {
  it("grants run.admin and serviceAccountUser when no service account (single-user)", async () => {
    const scope = makeScope();
    // get account
    scope.run.mockResolvedValueOnce({
      stdout: "user@example.com\n",
      stderr: ""
    });
    // grant roles/run.admin
    scope.run.mockResolvedValueOnce({ stdout: "", stderr: "" });
    // grant roles/iam.serviceAccountUser
    scope.run.mockResolvedValueOnce({ stdout: "", stderr: "" });

    await ensureCloudRunPermissions(scope, "my-project");
    expect(scope.run).toHaveBeenCalledTimes(3);
    // Both roles should have been granted.
    const calls = scope.run.mock.calls.map((c) => (c[1] as string[]).join(" "));
    expect(calls.some((c) => c.includes("roles/run.admin"))).toBe(true);
    expect(
      calls.some((c) => c.includes("roles/iam.serviceAccountUser"))
    ).toBe(true);
  });

  it("only grants run.admin when serviceAccount is provided (single-user)", async () => {
    const scope = makeScope();
    scope.run.mockResolvedValueOnce({
      stdout: "user@example.com\n",
      stderr: ""
    });
    scope.run.mockResolvedValueOnce({ stdout: "", stderr: "" });

    await ensureCloudRunPermissions(
      scope,
      "my-project",
      "sa@proj.iam.gserviceaccount.com"
    );
    expect(scope.run).toHaveBeenCalledTimes(2);
    const calls = scope.run.mock.calls.map((c) => (c[1] as string[]).join(" "));
    expect(
      calls.some((c) => c.includes("roles/iam.serviceAccountUser"))
    ).toBe(false);
  });

  it("warns when account is (unset) (single-user)", async () => {
    const scope = makeScope();
    scope.run.mockResolvedValueOnce({ stdout: "(unset)\n", stderr: "" });
    await ensureCloudRunPermissions(scope, "my-project");
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("Could not determine")
    );
  });

  it("handles failure to get account gracefully (single-user)", async () => {
    const scope = makeScope();
    scope.run.mockRejectedValueOnce(new Error("fail"));
    await ensureCloudRunPermissions(scope, "my-project");
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("Could not auto-configure")
    );
  });

  it("handles permission granting failure gracefully (single-user)", async () => {
    const scope = makeScope();
    scope.run.mockResolvedValueOnce({
      stdout: "user@example.com\n",
      stderr: ""
    });
    scope.run.mockRejectedValueOnce(new Error("permission denied"));
    scope.run.mockRejectedValueOnce(new Error("permission denied"));

    await ensureCloudRunPermissions(scope, "my-project");
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("Could not grant")
    );
  });

  it("does NOT mutate IAM in multi-user mode (no host-identity escalation)", async () => {
    // Multi-user mode skips the auto IAM-grant entirely: granting run.admin to
    // whatever `gcloud config get-value account` returns would escalate to the
    // host identity and cross tenant boundaries.
    const scope = makeScope({ multiUser: true });
    await ensureCloudRunPermissions(scope, "my-project");
    expect(scope.run).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// enableRequiredApis
// ---------------------------------------------------------------------------

describe("enableRequiredApis", () => {
  it("enables all four required APIs", async () => {
    const scope = makeScope();
    await enableRequiredApis(scope, "my-project");
    expect(scope.run).toHaveBeenCalledTimes(4);
  });

  it("warns but does not throw if an API fails to enable", async () => {
    const scope = makeScope();
    scope.run.mockResolvedValueOnce({ stdout: "", stderr: "" });
    scope.run.mockRejectedValueOnce(new Error("fail"));
    scope.run.mockResolvedValueOnce({ stdout: "", stderr: "" });
    scope.run.mockResolvedValueOnce({ stdout: "", stderr: "" });

    await enableRequiredApis(scope, "my-project");
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
    const scope = makeScope();
    scope.run.mockResolvedValueOnce({
      stdout: JSON.stringify(svc),
      stderr: ""
    });
    const result = await getCloudRunService(
      scope,
      "my-svc",
      "us-central1",
      "my-project"
    );
    expect(result).toEqual(svc);
  });

  it("returns null when service does not exist", async () => {
    const scope = makeScope();
    scope.run.mockRejectedValueOnce(new Error("not found"));
    const result = await getCloudRunService(
      scope,
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
    const scope = makeScope();
    scope.run.mockResolvedValueOnce({
      stdout: JSON.stringify(services),
      stderr: ""
    });
    const result = await listCloudRunServices(scope, "us-central1", "my-project");
    expect(result).toEqual(services);
    expect(result.length).toBe(2);
  });

  it("returns empty array on error", async () => {
    const scope = makeScope();
    scope.run.mockRejectedValueOnce(new Error("fail"));
    const result = await listCloudRunServices(scope, "us-central1", "my-project");
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// deleteCloudRunService
// ---------------------------------------------------------------------------

describe("deleteCloudRunService", () => {
  it("returns true on successful deletion", async () => {
    const scope = makeScope();
    const result = await deleteCloudRunService(
      scope,
      "my-svc",
      "us-central1",
      "my-project"
    );
    expect(result).toBe(true);
  });

  it("returns false on failure", async () => {
    const scope = makeScope();
    scope.run.mockRejectedValueOnce(new Error("fail"));
    const result = await deleteCloudRunService(
      scope,
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
    const scope = makeScope();
    // getCloudRunService (describe) fails -> not found
    scope.run.mockRejectedValueOnce(new Error("not found"));
    // deploy succeeds
    const deployResult = { status: { url: "https://test-svc.run.app" } };
    scope.run.mockResolvedValueOnce({
      stdout: JSON.stringify(deployResult),
      stderr: ""
    });

    const result = await deployToCloudRun({ ...baseOptions, scope });
    expect(result).toEqual(deployResult);
  });

  it("updates an existing service", async () => {
    const scope = makeScope();
    // getCloudRunService succeeds
    scope.run.mockResolvedValueOnce({
      stdout: JSON.stringify({ metadata: { name: "test-svc" } }),
      stderr: ""
    });
    // update succeeds
    const updateResult = { status: { url: "https://test-svc.run.app" } };
    scope.run.mockResolvedValueOnce({
      stdout: JSON.stringify(updateResult),
      stderr: ""
    });
    // IAM binding for allowUnauthenticated (default true)
    scope.run.mockResolvedValueOnce({ stdout: "", stderr: "" });

    const result = await deployToCloudRun({ ...baseOptions, scope });
    expect(result).toEqual(updateResult);
  });

  it("throws on deploy failure for new service", async () => {
    const scope = makeScope();
    // not found
    scope.run.mockRejectedValueOnce(new Error("not found"));
    // deploy fails
    scope.run.mockRejectedValueOnce(new Error("quota exceeded"));

    await expect(deployToCloudRun({ ...baseOptions, scope })).rejects.toThrow(
      "Cloud Run deployment failed"
    );
  });

  it("throws on update failure for existing service", async () => {
    const scope = makeScope();
    // service exists
    scope.run.mockResolvedValueOnce({
      stdout: JSON.stringify({ metadata: { name: "test-svc" } }),
      stderr: ""
    });
    // update fails
    scope.run.mockRejectedValueOnce(new Error("quota exceeded"));

    await expect(deployToCloudRun({ ...baseOptions, scope })).rejects.toThrow(
      "Cloud Run update failed"
    );
  });

  it("includes GPU flags when gpuType is set", async () => {
    const scope = makeScope();
    scope.run.mockRejectedValueOnce(new Error("not found"));
    const deployResult = { status: { url: "https://test-svc.run.app" } };
    scope.run.mockResolvedValueOnce({
      stdout: JSON.stringify(deployResult),
      stderr: ""
    });

    await deployToCloudRun({
      ...baseOptions,
      scope,
      gpuType: "nvidia-l4",
      gpuCount: 2
    });

    // calls[0] is the describe (getCloudRunService); calls[1] is the deploy.
    const args = scope.run.mock.calls[1][1] as string[];
    const cmdStr = args.join(" ");
    expect(cmdStr).toContain("--gpu-type");
    expect(cmdStr).toContain("nvidia-l4");
    expect(cmdStr).toContain("--gpu");
  });

  it("includes env vars flags when provided (single-user --set-env-vars)", async () => {
    const scope = makeScope();
    scope.run.mockRejectedValueOnce(new Error("not found"));
    const deployResult = { status: { url: "https://test-svc.run.app" } };
    scope.run.mockResolvedValueOnce({
      stdout: JSON.stringify(deployResult),
      stderr: ""
    });

    await deployToCloudRun({
      ...baseOptions,
      scope,
      envVars: { FOO: "bar", BAZ: "qux" }
    });

    const args = scope.run.mock.calls[1][1] as string[];
    const cmdStr = args.join(" ");
    expect(cmdStr).toContain("--set-env-vars");
    expect(cmdStr).toContain("FOO=bar");
    expect(cmdStr).toContain("BAZ=qux");
  });

  it("uses --env-vars-file (not --set-env-vars) when an env-vars file is provided", async () => {
    // The multi-tenant path writes a scratch env-vars YAML so secrets stay out
    // of argv; deployToCloudRun then passes --env-vars-file instead of inlining.
    const scope = makeScope();
    scope.run.mockRejectedValueOnce(new Error("not found"));
    const deployResult = { status: { url: "https://test-svc.run.app" } };
    scope.run.mockResolvedValueOnce({
      stdout: JSON.stringify(deployResult),
      stderr: ""
    });

    await deployToCloudRun({
      ...baseOptions,
      scope,
      envVars: { FOO: "bar" },
      envVarsFile: "/scratch/env-vars.yaml"
    });

    const args = scope.run.mock.calls[1][1] as string[];
    const cmdStr = args.join(" ");
    expect(cmdStr).toContain("--env-vars-file");
    expect(cmdStr).toContain("/scratch/env-vars.yaml");
    expect(cmdStr).not.toContain("--set-env-vars");
    expect(cmdStr).not.toContain("FOO=bar");
  });

  it("includes GCS bucket flags when provided", async () => {
    const scope = makeScope();
    scope.run.mockRejectedValueOnce(new Error("not found"));
    const deployResult = { status: {} };
    scope.run.mockResolvedValueOnce({
      stdout: JSON.stringify(deployResult),
      stderr: ""
    });

    await deployToCloudRun({ ...baseOptions, scope, gcsBucket: "my-bucket" });

    const args = scope.run.mock.calls[1][1] as string[];
    const cmdStr = args.join(" ");
    expect(cmdStr).toContain("--add-volume");
    expect(cmdStr).toContain("my-bucket");
    expect(cmdStr).toContain("--add-volume-mount");
  });

  it("includes service account flag when provided", async () => {
    const scope = makeScope();
    scope.run.mockRejectedValueOnce(new Error("not found"));
    const deployResult = { status: {} };
    scope.run.mockResolvedValueOnce({
      stdout: JSON.stringify(deployResult),
      stderr: ""
    });

    await deployToCloudRun({
      ...baseOptions,
      scope,
      serviceAccount: "sa@proj.iam.gserviceaccount.com"
    });

    const args = scope.run.mock.calls[1][1] as string[];
    const cmdStr = args.join(" ");
    expect(cmdStr).toContain("--service-account");
    expect(cmdStr).toContain("sa@proj.iam.gserviceaccount.com");
  });

  it("includes --allow-unauthenticated for new service when enabled", async () => {
    const scope = makeScope();
    scope.run.mockRejectedValueOnce(new Error("not found"));
    const deployResult = { status: {} };
    scope.run.mockResolvedValueOnce({
      stdout: JSON.stringify(deployResult),
      stderr: ""
    });

    await deployToCloudRun({
      ...baseOptions,
      scope,
      allowUnauthenticated: true
    });

    const args = scope.run.mock.calls[1][1] as string[];
    const cmdStr = args.join(" ");
    expect(cmdStr).toContain("--allow-unauthenticated");
  });

  it("does NOT include --allow-unauthenticated for new service when disabled", async () => {
    const scope = makeScope();
    scope.run.mockRejectedValueOnce(new Error("not found"));
    const deployResult = { status: {} };
    scope.run.mockResolvedValueOnce({
      stdout: JSON.stringify(deployResult),
      stderr: ""
    });

    await deployToCloudRun({
      ...baseOptions,
      scope,
      allowUnauthenticated: false
    });

    const args = scope.run.mock.calls[1][1] as string[];
    const cmdStr = args.join(" ");
    expect(cmdStr).not.toContain("--allow-unauthenticated");
  });

  it("silently handles IAM binding failure on update", async () => {
    const scope = makeScope();
    scope.run.mockResolvedValueOnce({
      stdout: JSON.stringify({ metadata: { name: "test-svc" } }),
      stderr: ""
    });
    const updateResult = { status: { url: "https://test-svc.run.app" } };
    scope.run.mockResolvedValueOnce({
      stdout: JSON.stringify(updateResult),
      stderr: ""
    });
    // IAM binding fails
    scope.run.mockRejectedValueOnce(new Error("already bound"));

    const result = await deployToCloudRun({ ...baseOptions, scope });
    expect(result).toEqual(updateResult);
  });

  it("runs every gcloud call through scope.run with scope.env", async () => {
    // The whole point of the refactor: no ambient exec. Verify the child env
    // (scratch credential redirection) is threaded into each gcloud invocation.
    const scope = makeScope({
      env: { CLOUDSDK_CONFIG: "/scratch/gcloud", GOOGLE_APPLICATION_CREDENTIALS: "/scratch/sa.json" }
    });
    scope.run.mockRejectedValueOnce(new Error("not found"));
    scope.run.mockResolvedValueOnce({
      stdout: JSON.stringify({ status: {} }),
      stderr: ""
    });

    await deployToCloudRun({ ...baseOptions, scope });

    for (const call of scope.run.mock.calls) {
      expect(call[0]).toBe("gcloud");
      expect(call[2]).toMatchObject({ env: scope.env });
    }
  });
});

// ---------------------------------------------------------------------------
// pushToGcr
// ---------------------------------------------------------------------------

describe("pushToGcr", () => {
  it("pushes to gcr.io with correct image URL", async () => {
    const scope = makeScope();
    // configure-docker, docker tag, docker push all succeed (default mock).
    const url = await pushToGcr(scope, "my-image", "v1", "my-project", "gcr.io");
    expect(url).toBe("gcr.io/my-project/my-image:v1");

    // Docker tag/push must run through the scoped runner with scope.env so the
    // scratch DOCKER_CONFIG is used, not the host ~/.docker/config.json.
    expect(scope.run).toHaveBeenCalledWith(
      "docker",
      ["tag", "my-image:v1", "gcr.io/my-project/my-image:v1"],
      expect.objectContaining({ env: scope.env })
    );
    expect(scope.run).toHaveBeenCalledWith(
      "docker",
      ["push", "gcr.io/my-project/my-image:v1"],
      expect.objectContaining({ env: scope.env })
    );
  });

  it("pushes to Artifact Registry and creates repository", async () => {
    const scope = makeScope();
    // repo create returns some stdout (success), everything else default-mocked.
    scope.run.mockResolvedValueOnce({ stdout: "created", stderr: "" });

    const url = await pushToGcr(
      scope,
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
    const scope = makeScope();
    // repo create fails (already exists); push proceeds.
    scope.run.mockRejectedValueOnce(new Error("already exists"));

    const url = await pushToGcr(
      scope,
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
    const scope = makeScope();
    // For gcr.io: configure-docker (first call) fails.
    scope.run.mockRejectedValueOnce(new Error("docker not found"));

    await expect(pushToGcr(scope, "img", "v1", "proj")).rejects.toThrow(
      "Failed to configure Docker authentication"
    );
  });

  it("throws when docker tag/push fails", async () => {
    const scope = makeScope();
    // configure-docker succeeds, docker tag fails.
    scope.run.mockResolvedValueOnce({ stdout: "", stderr: "" });
    scope.run.mockRejectedValueOnce(new Error("no such image"));

    await expect(pushToGcr(scope, "img", "v1", "proj")).rejects.toThrow(
      "Failed to push image"
    );
  });
});
