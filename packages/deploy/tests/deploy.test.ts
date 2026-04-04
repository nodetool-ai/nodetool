import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  runLocalDocker,
  getDockerUsername,
  printDeploymentSummary,
  type RunCommandFn,
  type GetDockerUsernameFromConfigFn
} from "../src/deploy.js";

describe("runLocalDocker", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it("calls runCommand with the correct docker run command", () => {
    const runCommand: RunCommandFn = vi.fn();
    runLocalDocker("myregistry/myimage", "v1.0", runCommand);
    expect(runCommand).toHaveBeenCalledWith(
      "docker run -d -p 8000:8000 myregistry/myimage:v1.0"
    );
  });

  it("logs startup message", () => {
    const runCommand: RunCommandFn = vi.fn();
    runLocalDocker("img", "latest", runCommand);
    expect(logSpy).toHaveBeenCalledWith("Starting local Docker container...");
  });

  it("logs success message", () => {
    const runCommand: RunCommandFn = vi.fn();
    runLocalDocker("img", "latest", runCommand);
    expect(logSpy).toHaveBeenCalledWith(
      "Local Docker container started successfully!"
    );
  });

  it("logs the API URL", () => {
    const runCommand: RunCommandFn = vi.fn();
    runLocalDocker("img", "latest", runCommand);
    expect(logSpy).toHaveBeenCalledWith(
      "API available at: http://localhost:8000"
    );
  });

  it("logs stop and remove instructions with full image name", () => {
    const runCommand: RunCommandFn = vi.fn();
    runLocalDocker("myimg", "v2", runCommand);
    expect(logSpy).toHaveBeenCalledWith(
      "To stop the container: docker stop myimg:v2"
    );
    expect(logSpy).toHaveBeenCalledWith(
      "To remove the container: docker rm myimg:v2"
    );
  });

  it("handles empty tag", () => {
    const runCommand: RunCommandFn = vi.fn();
    runLocalDocker("myimg", "", runCommand);
    expect(runCommand).toHaveBeenCalledWith(
      "docker run -d -p 8000:8000 myimg:"
    );
  });

  it("handles image name with slashes", () => {
    const runCommand: RunCommandFn = vi.fn();
    runLocalDocker("ghcr.io/org/repo", "sha-abc123", runCommand);
    expect(runCommand).toHaveBeenCalledWith(
      "docker run -d -p 8000:8000 ghcr.io/org/repo:sha-abc123"
    );
  });
});

describe("getDockerUsername", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env["DOCKER_USERNAME"];
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("returns explicit dockerUsername when provided", () => {
    const result = getDockerUsername({
      dockerUsername: "myuser",
      getDockerUsernameFromConfig: () => null
    });
    expect(result).toBe("myuser");
  });

  it("falls back to DOCKER_USERNAME env var", () => {
    process.env["DOCKER_USERNAME"] = "envuser";
    const result = getDockerUsername({
      getDockerUsernameFromConfig: () => null
    });
    expect(result).toBe("envuser");
  });

  it("falls back to config fn when no explicit or env username", () => {
    const configFn: GetDockerUsernameFromConfigFn = vi.fn(() => "configuser");
    const result = getDockerUsername({
      getDockerUsernameFromConfig: configFn
    });
    expect(result).toBe("configuser");
    expect(configFn).toHaveBeenCalledWith("docker.io");
  });

  it("uses custom registry for config fn", () => {
    const configFn: GetDockerUsernameFromConfigFn = vi.fn(() => "user");
    getDockerUsername({
      dockerRegistry: "ghcr.io",
      getDockerUsernameFromConfig: configFn
    });
    expect(configFn).toHaveBeenCalledWith("ghcr.io");
  });

  it("throws when no username found and build/push not skipped", () => {
    expect(() =>
      getDockerUsername({
        getDockerUsernameFromConfig: () => null
      })
    ).toThrow("Docker username is required");
  });

  it("returns null when no username but both build and push skipped", () => {
    const result = getDockerUsername({
      skipBuild: true,
      skipPush: true,
      getDockerUsernameFromConfig: () => null
    });
    expect(result).toBeNull();
  });

  it("throws when no username and only skipBuild is true", () => {
    expect(() =>
      getDockerUsername({
        skipBuild: true,
        skipPush: false,
        getDockerUsernameFromConfig: () => null
      })
    ).toThrow("Docker username is required");
  });

  it("throws when no username and only skipPush is true", () => {
    expect(() =>
      getDockerUsername({
        skipBuild: false,
        skipPush: true,
        getDockerUsernameFromConfig: () => null
      })
    ).toThrow("Docker username is required");
  });

  it("prefers explicit username over env var", () => {
    process.env["DOCKER_USERNAME"] = "envuser";
    const result = getDockerUsername({
      dockerUsername: "explicit",
      getDockerUsernameFromConfig: () => "config"
    });
    expect(result).toBe("explicit");
  });

  it("prefers env var over config fn", () => {
    process.env["DOCKER_USERNAME"] = "envuser";
    const configFn = vi.fn(() => "config");
    const result = getDockerUsername({
      getDockerUsernameFromConfig: configFn
    });
    expect(result).toBe("envuser");
  });

  it("logs the resolved username", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    getDockerUsername({
      dockerUsername: "logtest",
      getDockerUsernameFromConfig: () => null
    });
    expect(logSpy).toHaveBeenCalledWith("Using Docker username: logtest");
  });

  it("does not log when username is null (skipped)", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    getDockerUsername({
      skipBuild: true,
      skipPush: true,
      getDockerUsernameFromConfig: () => null
    });
    // Only the mock setup call, no "Using Docker username" logged
    const calls = logSpy.mock.calls.flat().join(" ");
    expect(calls).not.toContain("Using Docker username");
  });

  it("error message mentions all three methods", () => {
    try {
      getDockerUsername({
        getDockerUsernameFromConfig: () => null
      });
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain("Command line");
      expect(msg).toContain("Environment variable");
      expect(msg).toContain("Docker login");
    }
  });
});

describe("printDeploymentSummary", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it("prints image name and tag", () => {
    printDeploymentSummary({
      fullImageName: "myregistry/myimage",
      imageTag: "v1.0",
      platform: "linux/amd64"
    });
    expect(logSpy).toHaveBeenCalledWith("Image: myregistry/myimage:v1.0");
  });

  it("prints platform", () => {
    printDeploymentSummary({
      fullImageName: "img",
      imageTag: "latest",
      platform: "linux/arm64"
    });
    expect(logSpy).toHaveBeenCalledWith("Platform: linux/arm64");
  });

  it("uses RunPod as default deploymentPlatform", () => {
    printDeploymentSummary({
      fullImageName: "img",
      imageTag: "latest",
      platform: "linux/amd64"
    });
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("RunPod Deployment completed successfully")
    );
  });

  it("uses custom deploymentPlatform", () => {
    printDeploymentSummary({
      fullImageName: "img",
      imageTag: "latest",
      platform: "linux/amd64",
      deploymentPlatform: "GCP"
    });
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("GCP Deployment completed successfully")
    );
  });

  it("prints templateId when provided", () => {
    printDeploymentSummary({
      fullImageName: "img",
      imageTag: "v1",
      platform: "linux/amd64",
      templateId: "tmpl-123"
    });
    expect(logSpy).toHaveBeenCalledWith("Template ID: tmpl-123");
  });

  it("does not print templateId when not provided", () => {
    printDeploymentSummary({
      fullImageName: "img",
      imageTag: "v1",
      platform: "linux/amd64"
    });
    const allArgs = logSpy.mock.calls.flat().join(" ");
    expect(allArgs).not.toContain("Template ID");
  });

  it("prints endpointId when provided", () => {
    printDeploymentSummary({
      fullImageName: "img",
      imageTag: "v1",
      platform: "linux/amd64",
      endpointId: "ep-456"
    });
    expect(logSpy).toHaveBeenCalledWith("Endpoint ID: ep-456");
  });

  it("does not print endpointId when not provided", () => {
    printDeploymentSummary({
      fullImageName: "img",
      imageTag: "v1",
      platform: "linux/amd64"
    });
    const allArgs = logSpy.mock.calls.flat().join(" ");
    expect(allArgs).not.toContain("Endpoint ID");
  });

  it("prints both templateId and endpointId", () => {
    printDeploymentSummary({
      fullImageName: "img",
      imageTag: "v1",
      platform: "linux/amd64",
      templateId: "t1",
      endpointId: "e1"
    });
    expect(logSpy).toHaveBeenCalledWith("Template ID: t1");
    expect(logSpy).toHaveBeenCalledWith("Endpoint ID: e1");
  });
});
