import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock child_process before importing docker module
vi.mock("node:child_process", () => ({
  execSync: vi.fn(() => ""),
  execFileSync: vi.fn(() => ""),
  exec: vi.fn(),
  execFile: vi.fn(),
  spawnSync: vi.fn(() => ({ status: 0, stdout: "", stderr: "" }))
}));

// Mock node:fs so we can control existsSync / readFileSync
vi.mock("node:fs", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import("node:fs");
  return {
    ...actual,
    existsSync: vi.fn(actual.existsSync),
    readFileSync: vi.fn(actual.readFileSync)
  };
});

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execSync, execFileSync } from "node:child_process";
import {
  shellEscape,
  runCommand,
  runCommandArgs,
  checkDockerAuth,
  formatImageName,
  generateImageTag,
  pushToRegistry,
  getDockerUsernameFromConfig
} from "../src/docker.js";

const mockedExecSync = vi.mocked(execSync);
const mockedExecFileSync = vi.mocked(execFileSync);
const mockedExistsSync = vi.mocked(fs.existsSync);
const mockedReadFileSync = vi.mocked(fs.readFileSync);

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
// checkDockerAuth
// ---------------------------------------------------------------------------

describe("checkDockerAuth", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("should return true when docker system info succeeds", () => {
    mockedExecSync.mockReturnValue("info");
    expect(checkDockerAuth()).toBe(true);
  });

  it("should try docker login --get-login if system info fails", () => {
    mockedExecSync
      .mockImplementationOnce(() => {
        throw new Error("fail");
      })
      .mockReturnValueOnce("username");
    expect(checkDockerAuth()).toBe(true);
  });

  it("should return false when both checks fail", () => {
    mockedExecSync.mockImplementation(() => {
      throw new Error("fail");
    });
    expect(checkDockerAuth()).toBe(false);
  });

  it("should accept registry parameter", () => {
    mockedExecSync.mockReturnValue("ok");
    expect(checkDockerAuth("ghcr.io")).toBe(true);
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

describe("pushToRegistry", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("should push image when authenticated", () => {
    // checkDockerAuth uses execSync, push uses execFileSync
    mockedExecSync.mockReturnValue("ok");
    mockedExecFileSync.mockReturnValue("" as any);
    pushToRegistry("user/app", "v1");
    // execSync should be called for auth check
    expect(mockedExecSync).toHaveBeenCalled();
    // execFileSync should be called for the push
    expect(mockedExecFileSync).toHaveBeenCalledWith(
      "docker",
      ["push", "user/app:v1"],
      expect.any(Object)
    );
  });

  it("should throw when not authenticated", () => {
    mockedExecSync.mockImplementation(() => {
      throw new Error("not logged in");
    });
    expect(() => pushToRegistry("user/app", "v1")).toThrow(
      "Not authenticated with Docker registry"
    );
  });

  it("should accept custom registry", () => {
    mockedExecSync.mockReturnValue("ok");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    pushToRegistry("user/app", "v1", "ghcr.io");
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("ghcr.io"));
  });
});

// ---------------------------------------------------------------------------
// getDockerUsernameFromConfig
// ---------------------------------------------------------------------------

describe("getDockerUsernameFromConfig", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("should return null when config file does not exist", () => {
    mockedExistsSync.mockReturnValue(false);
    expect(getDockerUsernameFromConfig()).toBeNull();
  });

  it("should return username from auths with username field", () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(
      JSON.stringify({
        auths: {
          "https://index.docker.io/v1/": {
            username: "myuser"
          }
        }
      })
    );
    expect(getDockerUsernameFromConfig()).toBe("myuser");
  });

  it("should decode base64 auth field", () => {
    mockedExistsSync.mockReturnValue(true);
    const encoded = Buffer.from("myuser:mypass").toString("base64");
    mockedReadFileSync.mockReturnValue(
      JSON.stringify({
        auths: {
          "https://index.docker.io/v1/": {
            auth: encoded
          }
        }
      })
    );
    expect(getDockerUsernameFromConfig()).toBe("myuser");
  });

  it("should try multiple registry keys for docker.io", () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(
      JSON.stringify({
        auths: {
          "docker.io": {
            username: "direct-user"
          }
        }
      })
    );
    expect(getDockerUsernameFromConfig()).toBe("direct-user");
  });

  it("should return null when auths is empty", () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(JSON.stringify({ auths: {} }));
    expect(getDockerUsernameFromConfig()).toBeNull();
  });

  it("should return null when no matching registry found", () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(
      JSON.stringify({
        auths: {
          "ghcr.io": { username: "user" }
        }
      })
    );
    expect(getDockerUsernameFromConfig()).toBeNull();
  });

  it("should find username for custom registry", () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(
      JSON.stringify({
        auths: {
          "ghcr.io": { username: "ghuser" }
        }
      })
    );
    expect(getDockerUsernameFromConfig("ghcr.io")).toBe("ghuser");
  });

  it("should return null when config is unparseable", () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue("not json");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(getDockerUsernameFromConfig()).toBeNull();
  });

  it("should handle config with no auths key", () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(JSON.stringify({}));
    expect(getDockerUsernameFromConfig()).toBeNull();
  });

  it("should handle auth entry with invalid base64", () => {
    mockedExistsSync.mockReturnValue(true);
    // The base64 decoding won't fail for most strings, but we can test
    // that it tries to split on colon
    mockedReadFileSync.mockReturnValue(
      JSON.stringify({
        auths: {
          "https://index.docker.io/v1/": {
            auth: Buffer.from("justusername").toString("base64")
          }
        }
      })
    );
    expect(getDockerUsernameFromConfig()).toBe("justusername");
  });

  it("should try https://<registry>/v1/ format", () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(
      JSON.stringify({
        auths: {
          "https://docker.io/v1/": { username: "v1user" }
        }
      })
    );
    expect(getDockerUsernameFromConfig()).toBe("v1user");
  });
});
