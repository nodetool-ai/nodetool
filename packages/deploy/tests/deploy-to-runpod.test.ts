import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sanitizeName, deployToRunpod } from "../src/deploy-to-runpod.js";
import type { RunPodDeployment } from "../src/deployment-config.js";
import type { RunpodAuth } from "../src/runpod-api.js";
import type { DockerAuth } from "../src/docker.js";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
//
// After the multi-tenant refactor deployToRunpod is host-credential-free:
//   - RunPod API auth arrives as an explicit `auth: RunpodAuth` arg (Bearer from
//     ctx.credentials.RUNPOD_API_KEY); it never transits process.env.
//   - Docker registry auth arrives as an explicit scratch-scoped `dockerAuth:
//     DockerAuth`; build/push run through its scoped runner.
//   - The docker username is supplied EXPLICITLY by the caller (from the
//     DOCKER_USERNAME secret via ctx.credentials, or deployment.docker.username)
//     — never read from process.env.
//
// The docker version check goes through `runCommandArgs("docker", ["--version"])`
// (shell-free argv exec), so that is what we mock and assert on.

vi.mock("../src/docker.js", () => ({
  buildDockerImage: vi.fn().mockResolvedValue(false),
  formatImageName: vi.fn((name: string, user: string, registry: string) =>
    registry === "docker.io" ? `${user}/${name}` : `${registry}/${user}/${name}`
  ),
  generateImageTag: vi.fn().mockReturnValue("auto-tag-abc123"),
  pushToRegistry: vi.fn(),
  runCommandArgs: vi.fn().mockReturnValue("Docker version 24.0.0")
}));

vi.mock("../src/runpod-api.js", () => ({
  createOrUpdateRunpodTemplate: vi.fn().mockResolvedValue("tpl-new-1"),
  createRunpodEndpointGraphql: vi.fn().mockResolvedValue("ep-new-1")
}));

import {
  buildDockerImage,
  formatImageName,
  generateImageTag,
  pushToRegistry,
  runCommandArgs
} from "../src/docker.js";
import {
  createOrUpdateRunpodTemplate,
  createRunpodEndpointGraphql
} from "../src/runpod-api.js";

const mockedBuild = vi.mocked(buildDockerImage);
const mockedFormat = vi.mocked(formatImageName);
const mockedGenTag = vi.mocked(generateImageTag);
const mockedPush = vi.mocked(pushToRegistry);
const mockedRunCmd = vi.mocked(runCommandArgs);
const mockedCreateTemplate = vi.mocked(createOrUpdateRunpodTemplate);
const mockedCreateEndpoint = vi.mocked(createRunpodEndpointGraphql);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Per-call RunPod auth bag. In production the apiKey is sourced from
// ctx.credentials.RUNPOD_API_KEY, never process.env.
const AUTH: RunpodAuth = { apiKey: "rp-token-123" };

// A fake scratch-scoped docker auth. Its scoped runner is a no-op so build/push
// never touch the network or filesystem; tests assert build/push were threaded
// this auth.
function makeDockerAuth(): DockerAuth {
  return {
    run: vi.fn().mockResolvedValue({ stdout: "", stderr: "" }),
    dockerConfigDir: "/tmp/scratch/.docker"
  };
}

function makeDeployment(overrides: Record<string, any> = {}): RunPodDeployment {
  return {
    type: "runpod" as const,
    enabled: true,
    docker: { registry: "docker.io", username: "testuser" },
    image: { name: "my-image", tag: "v1" },
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
  // Re-set mock implementations after clearAllMocks resets them
  mockedBuild.mockResolvedValue(false);
  mockedFormat.mockImplementation(
    (name: string, user: string, registry: string) =>
      registry === "docker.io"
        ? `${user}/${name}`
        : `${registry}/${user}/${name}`
  );
  mockedGenTag.mockReturnValue("auto-tag-abc123");
  mockedRunCmd.mockReturnValue("Docker version 24.0.0");
  mockedCreateTemplate.mockResolvedValue("tpl-new-1");
  mockedCreateEndpoint.mockResolvedValue("ep-new-1");
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// sanitizeName
// ---------------------------------------------------------------------------

describe("sanitizeName", () => {
  it("lowercases the name", () => {
    expect(sanitizeName("MyApp")).toBe("myapp");
  });

  it("replaces spaces with hyphens", () => {
    expect(sanitizeName("my app name")).toBe("my-app-name");
  });

  it("replaces special characters with hyphens", () => {
    expect(sanitizeName("my_app@v2!")).toBe("my-app-v2");
  });

  it("collapses consecutive hyphens", () => {
    expect(sanitizeName("my---app")).toBe("my-app");
  });

  it("removes leading and trailing hyphens", () => {
    expect(sanitizeName("--my-app--")).toBe("my-app");
  });

  it("returns 'workflow' for empty result", () => {
    expect(sanitizeName("")).toBe("workflow");
    expect(sanitizeName("!!!")).toBe("workflow");
  });

  it("preserves valid names", () => {
    expect(sanitizeName("my-app-123")).toBe("my-app-123");
  });

  it("handles names with only numbers", () => {
    expect(sanitizeName("12345")).toBe("12345");
  });

  it("handles single character", () => {
    expect(sanitizeName("a")).toBe("a");
  });

  it("handles mixed special characters", () => {
    expect(sanitizeName("Hello World! @#$%")).toBe("hello-world");
  });
});

// ---------------------------------------------------------------------------
// deployToRunpod - full pipeline
// ---------------------------------------------------------------------------

describe("deployToRunpod", () => {
  it("runs full pipeline: build, push, template, endpoint", async () => {
    const dep = makeDeployment();
    await deployToRunpod({
      deployment: dep,
      auth: AUTH,
      dockerUsername: "testuser",
      imageName: "my-image",
      tag: "v1",
      templateName: "my-tpl",
      name: "my-endpoint"
    });
    expect(mockedRunCmd).toHaveBeenCalled(); // docker version check
    expect(mockedBuild).toHaveBeenCalledOnce();
    expect(mockedPush).toHaveBeenCalledOnce();
    expect(mockedCreateTemplate).toHaveBeenCalledOnce();
    expect(mockedCreateEndpoint).toHaveBeenCalledOnce();
  });

  it("threads RunpodAuth into template and endpoint creation", async () => {
    await deployToRunpod({
      deployment: makeDeployment(),
      auth: AUTH,
      dockerUsername: "testuser",
      imageName: "my-image",
      tag: "v1",
      name: "ep"
    });
    // Template: (templateName, imageName, tag, auth, env)
    expect(mockedCreateTemplate.mock.calls[0][3]).toBe(AUTH);
    // Endpoint: opts.auth
    expect(mockedCreateEndpoint.mock.calls[0][0].auth).toBe(AUTH);
  });

  it("threads scratch-scoped dockerAuth into build and push", async () => {
    const dockerAuth = makeDockerAuth();
    await deployToRunpod({
      deployment: makeDeployment(),
      auth: AUTH,
      dockerAuth,
      dockerUsername: "testuser",
      imageName: "my-image",
      tag: "v1",
      name: "ep"
    });
    expect(mockedBuild).toHaveBeenCalledWith(
      expect.objectContaining({ auth: dockerAuth })
    );
    expect(mockedPush).toHaveBeenCalledWith(
      expect.any(String),
      "v1",
      "docker.io",
      dockerAuth
    );
  });

  it("skips build when skipBuild is true", async () => {
    await deployToRunpod({
      deployment: makeDeployment(),
      auth: AUTH,
      dockerUsername: "testuser",
      imageName: "my-image",
      tag: "v1",
      name: "ep",
      skipBuild: true
    });
    expect(mockedBuild).not.toHaveBeenCalled();
    expect(mockedRunCmd).not.toHaveBeenCalled(); // no docker version check
  });

  it("skips push when skipPush is true", async () => {
    await deployToRunpod({
      deployment: makeDeployment(),
      auth: AUTH,
      dockerUsername: "testuser",
      imageName: "my-image",
      tag: "v1",
      name: "ep",
      skipPush: true
    });
    expect(mockedPush).not.toHaveBeenCalled();
  });

  it("skips push when build already pushed (autoPush)", async () => {
    mockedBuild.mockResolvedValueOnce(true); // imagePushedDuringBuild = true
    await deployToRunpod({
      deployment: makeDeployment(),
      auth: AUTH,
      dockerUsername: "testuser",
      imageName: "my-image",
      tag: "v1",
      name: "ep"
    });
    expect(mockedPush).not.toHaveBeenCalled();
  });

  it("skips template when skipTemplate is true", async () => {
    await deployToRunpod({
      deployment: makeDeployment(),
      auth: AUTH,
      dockerUsername: "testuser",
      imageName: "my-image",
      tag: "v1",
      name: "ep",
      skipTemplate: true
    });
    expect(mockedCreateTemplate).not.toHaveBeenCalled();
  });

  it("skips endpoint when skipEndpoint is true", async () => {
    await deployToRunpod({
      deployment: makeDeployment(),
      auth: AUTH,
      dockerUsername: "testuser",
      imageName: "my-image",
      tag: "v1",
      name: "ep",
      skipEndpoint: true
    });
    expect(mockedCreateEndpoint).not.toHaveBeenCalled();
  });

  it("skips endpoint when no templateId (skipTemplate)", async () => {
    await deployToRunpod({
      deployment: makeDeployment(),
      auth: AUTH,
      dockerUsername: "testuser",
      imageName: "my-image",
      tag: "v1",
      name: "ep",
      skipTemplate: true
    });
    // templateId is undefined since template creation was skipped
    expect(mockedCreateEndpoint).not.toHaveBeenCalled();
  });

  it("generates auto tag when no tag provided", async () => {
    const dep = makeDeployment({
      image: { name: "my-image", tag: undefined }
    });
    await deployToRunpod({
      deployment: dep,
      auth: AUTH,
      dockerUsername: "testuser",
      imageName: "my-image",
      name: "ep"
    });
    expect(mockedGenTag).toHaveBeenCalled();
  });

  it("uses provided tag over auto-generated", async () => {
    await deployToRunpod({
      deployment: makeDeployment(),
      auth: AUTH,
      dockerUsername: "testuser",
      imageName: "my-image",
      tag: "my-custom-tag",
      name: "ep"
    });
    // The build should use the provided tag
    expect(mockedBuild).toHaveBeenCalledWith(
      expect.objectContaining({ tag: "my-custom-tag" })
    );
  });

  it("throws when Docker is not available", async () => {
    mockedRunCmd.mockImplementationOnce(() => {
      throw new Error("not found");
    });
    await expect(
      deployToRunpod({
        deployment: makeDeployment(),
        auth: AUTH,
        dockerUsername: "testuser",
        imageName: "my-image",
        tag: "v1",
        name: "ep"
      })
    ).rejects.toThrow("Docker is not available");
  });

  it("throws when image name is missing", async () => {
    await expect(
      deployToRunpod({
        deployment: makeDeployment({ image: { name: undefined, tag: "v1" } }),
        auth: AUTH,
        dockerUsername: "testuser",
        tag: "v1",
        name: "ep",
        skipBuild: true,
        skipPush: true
      })
    ).rejects.toThrow("Image name is required");
  });

  it("throws when docker username is missing and build/push needed", async () => {
    // No dockerUsername opt and no deployment.docker.username — and the username
    // is no longer sourced from process.env, so this must throw.
    const dep = makeDeployment({ docker: { registry: "docker.io" } });
    await expect(
      deployToRunpod({
        deployment: dep,
        auth: AUTH,
        imageName: "my-image",
        tag: "v1",
        name: "ep"
      })
    ).rejects.toThrow("Docker username is required");
  });

  it("uses explicit dockerUsername (from DOCKER_USERNAME secret via ctx.credentials)", async () => {
    // Replaces the old "uses DOCKER_USERNAME env" test. Env reading was
    // intentionally removed in the multi-tenant refactor: the username now
    // arrives as an explicit caller argument (resolved from the DOCKER_USERNAME
    // secret in ctx.credentials, or deployment.docker.username). We assert the
    // explicit username flows through to image-name formatting.
    const dep = makeDeployment({ docker: { registry: "docker.io" } });
    await deployToRunpod({
      deployment: dep,
      auth: AUTH,
      dockerUsername: "secretuser",
      imageName: "my-image",
      tag: "v1",
      name: "ep"
    });
    expect(mockedFormat).toHaveBeenCalledWith(
      "my-image",
      "secretuser",
      "docker.io"
    );
  });

  it("falls back to deployment.docker.username when no explicit dockerUsername", async () => {
    const dep = makeDeployment({
      docker: { registry: "docker.io", username: "configuser" }
    });
    await deployToRunpod({
      deployment: dep,
      auth: AUTH,
      imageName: "my-image",
      tag: "v1",
      name: "ep"
    });
    expect(mockedFormat).toHaveBeenCalledWith(
      "my-image",
      "configuser",
      "docker.io"
    );
  });

  it("sets PORT and PORT_HEALTH env vars for template", async () => {
    await deployToRunpod({
      deployment: makeDeployment(),
      auth: AUTH,
      dockerUsername: "testuser",
      imageName: "my-image",
      tag: "v1",
      name: "ep"
    });
    const envArg = mockedCreateTemplate.mock.calls[0][4];
    expect(envArg).toMatchObject({ PORT: "8000", PORT_HEALTH: "8000" });
  });

  it("sets AUTH_PROVIDER to static when no persistent_paths", async () => {
    await deployToRunpod({
      deployment: makeDeployment(),
      auth: AUTH,
      dockerUsername: "testuser",
      imageName: "my-image",
      tag: "v1",
      name: "ep"
    });
    const envArg = mockedCreateTemplate.mock.calls[0][4];
    expect(envArg?.AUTH_PROVIDER).toBe("static");
  });

  it("sets persistent path env vars when persistent_paths provided", async () => {
    const dep = makeDeployment({
      persistent_paths: {
        users_file: "/data/users.json",
        db_path: "/data/db",
        chroma_path: "/data/chroma",
        hf_cache: "/data/hf",
        asset_bucket: "/data/assets"
      }
    });
    await deployToRunpod({
      deployment: dep,
      auth: AUTH,
      dockerUsername: "testuser",
      imageName: "my-image",
      tag: "v1",
      name: "ep"
    });
    const envArg = mockedCreateTemplate.mock.calls[0][4];
    expect(envArg?.USERS_FILE).toBe("/data/users.json");
    expect(envArg?.DB_PATH).toBe("/data/db");
    expect(envArg?.CHROMA_PATH).toBe("/data/chroma");
    expect(envArg?.HF_HOME).toBe("/data/hf");
    expect(envArg?.ASSET_BUCKET).toBe("/data/assets");
    expect(envArg?.AUTH_PROVIDER).toBe("multi_user");
  });

  it("passes correct options to createRunpodEndpointGraphql", async () => {
    const dep = makeDeployment({
      compute_type: "GPU",
      network_volume_id: "vol-1"
    });
    await deployToRunpod({
      deployment: dep,
      auth: AUTH,
      dockerUsername: "testuser",
      imageName: "my-image",
      tag: "v1",
      name: "my-ep",
      gpuTypes: ["ADA_48_PRO"],
      gpuCount: 2,
      dataCenters: ["US-TX-3"],
      workersMin: 1,
      workersMax: 5,
      idleTimeout: 10,
      executionTimeout: 300000,
      flashboot: true
    });
    expect(mockedCreateEndpoint).toHaveBeenCalledWith({
      auth: AUTH,
      templateId: "tpl-new-1",
      name: "my-ep",
      computeType: "GPU",
      gpuTypeIds: ["ADA_48_PRO"],
      gpuCount: 2,
      dataCenterIds: ["US-TX-3"],
      workersMin: 1,
      workersMax: 5,
      idleTimeout: 10,
      executionTimeoutMs: 300000,
      flashboot: true,
      networkVolumeId: "vol-1"
    });
  });

  it("throws when name is missing for endpoint creation", async () => {
    await expect(
      deployToRunpod({
        deployment: makeDeployment(),
        auth: AUTH,
        dockerUsername: "testuser",
        imageName: "my-image",
        tag: "v1"
        // name is missing
      })
    ).rejects.toThrow("Name is required for endpoint creation");
  });

  it("uses deployment docker registry as default", async () => {
    const dep = makeDeployment({
      docker: { registry: "ghcr.io", username: "user" }
    });
    await deployToRunpod({
      deployment: dep,
      auth: AUTH,
      imageName: "my-image",
      tag: "v1",
      name: "ep"
    });
    expect(mockedFormat).toHaveBeenCalledWith("my-image", "user", "ghcr.io");
  });

  it("passes noCache to buildDockerImage", async () => {
    await deployToRunpod({
      deployment: makeDeployment(),
      auth: AUTH,
      dockerUsername: "testuser",
      imageName: "my-image",
      tag: "v1",
      name: "ep",
      noCache: true
    });
    expect(mockedBuild).toHaveBeenCalledWith(
      expect.objectContaining({ useCache: false })
    );
  });

  it("rethrows deployment errors", async () => {
    mockedCreateTemplate.mockRejectedValueOnce(new Error("template fail"));
    await expect(
      deployToRunpod({
        deployment: makeDeployment(),
        auth: AUTH,
        dockerUsername: "testuser",
        imageName: "my-image",
        tag: "v1",
        name: "ep"
      })
    ).rejects.toThrow("template fail");
  });

  it("uses imageName as templateName fallback", async () => {
    await deployToRunpod({
      deployment: makeDeployment(),
      auth: AUTH,
      dockerUsername: "testuser",
      imageName: "my-image",
      tag: "v1",
      name: "ep"
      // no templateName provided
    });
    // templateName should fall back: opts.templateName ?? opts.name ?? deployment.template_name ?? undefined
    // then templateName = templateName ?? imageName
    // Since opts.name = "ep", templateName = "ep", then after ?? imageName it stays "ep"
    expect(mockedCreateTemplate).toHaveBeenCalledWith(
      "ep",
      expect.any(String),
      "v1",
      AUTH,
      expect.any(Object)
    );
  });

  it("uses explicit templateName when provided", async () => {
    await deployToRunpod({
      deployment: makeDeployment(),
      auth: AUTH,
      dockerUsername: "testuser",
      imageName: "my-image",
      tag: "v1",
      name: "ep",
      templateName: "custom-tpl"
    });
    expect(mockedCreateTemplate).toHaveBeenCalledWith(
      "custom-tpl",
      expect.any(String),
      "v1",
      AUTH,
      expect.any(Object)
    );
  });

  it("does not override existing env vars with persistent_paths", async () => {
    const dep = makeDeployment({
      persistent_paths: {
        users_file: "/default/users.json",
        db_path: "/default/db",
        chroma_path: "/default/chroma",
        hf_cache: "/default/hf",
        asset_bucket: "/default/assets"
      }
    });
    await deployToRunpod({
      deployment: dep,
      auth: AUTH,
      dockerUsername: "testuser",
      imageName: "my-image",
      tag: "v1",
      name: "ep",
      env: { USERS_FILE: "/custom/users.json", AUTH_PROVIDER: "custom" }
    });
    const envArg = mockedCreateTemplate.mock.calls[0][4];
    expect(envArg?.USERS_FILE).toBe("/custom/users.json");
    expect(envArg?.AUTH_PROVIDER).toBe("custom");
  });

  it("sets NODETOOL_SERVER_MODE to private by default", async () => {
    await deployToRunpod({
      deployment: makeDeployment(),
      auth: AUTH,
      dockerUsername: "testuser",
      imageName: "my-image",
      tag: "v1",
      name: "ep"
    });
    const envArg = mockedCreateTemplate.mock.calls[0][4];
    expect(envArg?.NODETOOL_SERVER_MODE).toBe("private");
  });

  it("preserves existing NODETOOL_SERVER_MODE", async () => {
    await deployToRunpod({
      deployment: makeDeployment(),
      auth: AUTH,
      dockerUsername: "testuser",
      imageName: "my-image",
      tag: "v1",
      name: "ep",
      env: { NODETOOL_SERVER_MODE: "public" }
    });
    const envArg = mockedCreateTemplate.mock.calls[0][4];
    expect(envArg?.NODETOOL_SERVER_MODE).toBe("public");
  });
});
