import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock child_process before importing docker module
vi.mock("node:child_process", () => ({
  execSync: vi.fn(() => ""),
  execFileSync: vi.fn(() => ""),
  exec: vi.fn(),
  execFile: vi.fn(),
  spawnSync: vi.fn(() => ({ status: 0, stdout: "", stderr: "" }))
}));

import { execSync, execFileSync } from "node:child_process";
import {
  shellEscape,
  runCommand,
  runCommandArgs,
  formatImageName,
  generateImageTag,
  pushToRegistry,
  type DockerAuth
} from "../src/docker.js";
import {
  withDeploymentContext,
  type ScopedRunner
} from "../src/deployment-context.js";

const mockedExecSync = vi.mocked(execSync);
const mockedExecFileSync = vi.mocked(execFileSync);

// A DockerAuth whose scoped runner records every docker invocation, so we can
// assert pushes go through the scoped runner with DOCKER_CONFIG redirected to
// the scratch dir (multi-user path) — never the host ~/.docker.
function makeRecordingAuth(
  dockerConfigDir: string
): {
  auth: DockerAuth;
  calls: Array<{ file: string; args: string[]; env?: Record<string, string> }>;
} {
  const calls: Array<{
    file: string;
    args: string[];
    env?: Record<string, string>;
  }> = [];
  const run: ScopedRunner = async (file, args, opts) => {
    calls.push({ file, args, env: opts?.env });
    return { stdout: "", stderr: "" };
  };
  return { auth: { run, dockerConfigDir }, calls };
}

// ---------------------------------------------------------------------------
// shellEscape
// ---------------------------------------------------------------------------

describe("shellEscape", () => {
  it("should return '' for empty string", () => {
    expect(shellEscape("")).toBe("''");
  });

  it("should not quote safe strings", () => {
    expect(shellEscape("hello")).toBe("hello");
    expect(shellEscape("foo/bar")).toBe("foo/bar");
    expect(shellEscape("a@b")).toBe("a@b");
    expect(shellEscape("file.txt")).toBe("file.txt");
  });

  it("should quote strings with spaces", () => {
    expect(shellEscape("hello world")).toBe("'hello world'");
  });

  it("should quote strings with special chars", () => {
    expect(shellEscape("foo;bar")).toBe("'foo;bar'");
    expect(shellEscape("a&b")).toBe("'a&b'");
    expect(shellEscape("$(cmd)")).toBe("'$(cmd)'");
  });

  it("should escape embedded single quotes", () => {
    const result = shellEscape("it's");
    expect(result).toContain("'\"'\"'");
  });

  it("should handle strings with only special chars", () => {
    expect(shellEscape("!@#$")).toBe("'!@#$'");
  });

  it("should not quote alphanumeric with allowed punctuation", () => {
    expect(shellEscape("user/image:tag")).toBe("user/image:tag");
    expect(shellEscape("key=value")).toBe("key=value");
    expect(shellEscape("a+b")).toBe("a+b");
    expect(shellEscape("100%")).toBe("100%");
  });
});

// ---------------------------------------------------------------------------
// runCommand
// ---------------------------------------------------------------------------

describe("runCommand", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("should call execSync with correct args", () => {
    mockedExecSync.mockReturnValue("output");
    runCommand("echo hello", true);
    expect(mockedExecSync).toHaveBeenCalledWith("echo hello", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      shell: "/bin/sh"
    });
  });

  it("should return trimmed output when captureOutput=true", () => {
    mockedExecSync.mockReturnValue("  result  \n");
    const result = runCommand("cmd", true);
    expect(result).toBe("result");
  });

  it("should return empty string when captureOutput=false", () => {
    mockedExecSync.mockReturnValue("some output");
    const result = runCommand("cmd", false);
    expect(result).toBe("");
  });

  it("should return empty string when captureOutput defaults to false", () => {
    mockedExecSync.mockReturnValue("output");
    const result = runCommand("cmd");
    expect(result).toBe("");
  });

  it("should print lines in stream mode", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    mockedExecSync.mockReturnValue("line1\nline2");
    runCommand("cmd", false);
    expect(logSpy).toHaveBeenCalledWith("line1");
    expect(logSpy).toHaveBeenCalledWith("line2");
  });

  it("should handle null result from execSync", () => {
    mockedExecSync.mockReturnValue(null as any);
    const result = runCommand("cmd", true);
    expect(result).toBe("");
  });

  it("should throw an Error on command failure", () => {
    mockedExecSync.mockImplementation(() => {
      const err = new Error("fail") as any;
      err.status = 127;
      throw err;
    });
    expect(() => runCommand("bad-cmd")).toThrow(
      "Command failed with return code 127: bad-cmd"
    );
  });

  it("should use status 1 as default when error has no status", () => {
    mockedExecSync.mockImplementation(() => {
      throw new Error("fail");
    });
    expect(() => runCommand("bad-cmd")).toThrow(
      "Command failed with return code 1: bad-cmd"
    );
  });

  it("should handle empty output gracefully", () => {
    mockedExecSync.mockReturnValue("");
    expect(runCommand("cmd", true)).toBe("");
    expect(runCommand("cmd", false)).toBe("");
  });
});

// ---------------------------------------------------------------------------
// runCommandArgs
// ---------------------------------------------------------------------------

describe("runCommandArgs", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("should call execFileSync with program and args (no shell)", () => {
    mockedExecFileSync.mockReturnValue("output");
    runCommandArgs("docker", ["push", "img:tag"], { captureOutput: true });
    expect(mockedExecFileSync).toHaveBeenCalledWith(
      "docker",
      ["push", "img:tag"],
      { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
    );
  });

  it("should return trimmed output when captureOutput=true", () => {
    mockedExecFileSync.mockReturnValue("  result  \n" as any);
    const result = runCommandArgs("echo", ["hello"], { captureOutput: true });
    expect(result).toBe("result");
  });

  it("should return empty string when captureOutput=false", () => {
    mockedExecFileSync.mockReturnValue("some output" as any);
    const result = runCommandArgs("cmd", ["arg"]);
    expect(result).toBe("");
  });

  it("should throw an Error on command failure", () => {
    mockedExecFileSync.mockImplementation(() => {
      const err = new Error("fail") as any;
      err.status = 127;
      throw err;
    });
    expect(() => runCommandArgs("bad-cmd", ["arg"])).toThrow(
      "Command failed with return code 127: bad-cmd arg"
    );
  });
});

// ---------------------------------------------------------------------------
// formatImageName
// ---------------------------------------------------------------------------

describe("formatImageName", () => {
  it("should format for docker.io (default)", () => {
    expect(formatImageName("my-app", "myuser")).toBe("myuser/my-app");
  });

  it("should format for docker.io explicitly", () => {
    expect(formatImageName("my-app", "myuser", "docker.io")).toBe(
      "myuser/my-app"
    );
  });

  it("should include registry for non-docker.io", () => {
    expect(formatImageName("my-app", "myuser", "ghcr.io")).toBe(
      "ghcr.io/myuser/my-app"
    );
  });

  it("should handle custom registry", () => {
    expect(formatImageName("app", "user", "registry.example.com")).toBe(
      "registry.example.com/user/app"
    );
  });

  it("should handle image names with hyphens", () => {
    expect(formatImageName("my-cool-app", "user")).toBe("user/my-cool-app");
  });

  it("should handle username with org prefix", () => {
    expect(formatImageName("app", "org/team", "ghcr.io")).toBe(
      "ghcr.io/org/team/app"
    );
  });
});

// ---------------------------------------------------------------------------
// generateImageTag
// ---------------------------------------------------------------------------

describe("generateImageTag", () => {
  it("should return a tag in expected format", () => {
    const tag = generateImageTag();
    // Format: YYYYMMDD-HHMMSS-abcdef
    expect(tag).toMatch(/^\d{8}-\d{6}-[0-9a-f]{6}$/);
  });

  it("should generate unique tags", () => {
    const tags = new Set(Array.from({ length: 10 }, () => generateImageTag()));
    // The hash part should make each unique (timestamp could repeat for fast calls)
    expect(tags.size).toBeGreaterThanOrEqual(2);
  });

  it("should have correct date format", () => {
    const tag = generateImageTag();
    const datePart = tag.split("-")[0];
    expect(datePart.length).toBe(8);
    const year = parseInt(datePart.slice(0, 4));
    expect(year).toBeGreaterThanOrEqual(2024);
  });
});

// ---------------------------------------------------------------------------
// pushToRegistry
// ---------------------------------------------------------------------------

// After the multi-tenant refactor, pushToRegistry no longer probes host docker
// auth. With a DockerAuth it pushes through the scoped runner with DOCKER_CONFIG
// pointed at the scratch dir; the host ~/.docker is never read.
describe("pushToRegistry (scoped auth)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("pushes through the scoped runner with a scratch DOCKER_CONFIG", async () => {
    mockedExecSync.mockClear();
    mockedExecFileSync.mockClear();
    const dockerConfigDir = "/tmp/scratch/.docker";
    const { auth, calls } = makeRecordingAuth(dockerConfigDir);
    await pushToRegistry("user/app", "v1", "docker.io", auth);

    expect(calls).toHaveLength(1);
    expect(calls[0].file).toBe("docker");
    expect(calls[0].args).toEqual(["push", "user/app:v1"]);
    // The push runs against the per-call config dir, not the host ~/.docker.
    expect(calls[0].env?.DOCKER_CONFIG).toBe(dockerConfigDir);
    // No host probe via execSync/execFileSync during a scoped push.
    expect(mockedExecSync).not.toHaveBeenCalled();
    expect(mockedExecFileSync).not.toHaveBeenCalled();
  });

  it("threads a real scratch DOCKER_CONFIG end-to-end via withDeploymentContext", async () => {
    let configDir: string | undefined;
    await withDeploymentContext(
      { userId: "u1", credentials: {} },
      async (ctx) => {
        const { auth, calls } = makeRecordingAuth(`${ctx.scratchDir}/.docker`);
        await pushToRegistry("user/app", "v1", "docker.io", auth);
        configDir = calls[0].env?.DOCKER_CONFIG;
        // The config dir lives inside the call-scoped scratch dir.
        expect(configDir?.startsWith(ctx.scratchDir)).toBe(true);
      }
    );
    expect(configDir).toBeTruthy();
  });

  it("wraps a push failure in a helpful error", async () => {
    const run: ScopedRunner = async () => {
      throw new Error("denied");
    };
    const auth: DockerAuth = { run, dockerConfigDir: "/tmp/.docker" };
    await expect(
      pushToRegistry("user/app", "v1", "docker.io", auth)
    ).rejects.toThrow(/Failed to push image user\/app:v1/);
  });

  it("logs the target registry", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { auth } = makeRecordingAuth("/tmp/.docker");
    await pushToRegistry("user/app", "v1", "ghcr.io", auth);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("ghcr.io"));
  });
});
