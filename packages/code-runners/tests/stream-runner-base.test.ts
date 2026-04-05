import { describe, it, expect } from "vitest";
import { existsSync, rmdirSync } from "node:fs";
import {
  StreamRunnerBase,
  ContainerFailureError
} from "../src/stream-runner-base.js";
import { JavaScriptDockerRunner } from "../src/javascript-runner.js";
import { BashDockerRunner } from "../src/bash-runner.js";

// ---------------------------------------------------------------------------
// Minimal concrete subclass for testing the abstract-like base class
// ---------------------------------------------------------------------------

class EchoRunner extends StreamRunnerBase {
  override buildContainerCommand(userCode: string): string[] {
    return ["echo", userCode];
  }
}

// ============================================================================
// ContainerFailureError
// ============================================================================

describe("ContainerFailureError", () => {
  it("has the name ContainerFailureError", () => {
    const err = new ContainerFailureError("failed", 1);
    expect(err.name).toBe("ContainerFailureError");
  });

  it("preserves message", () => {
    const err = new ContainerFailureError("container died", 42);
    expect(err.message).toBe("container died");
  });

  it("stores exitCode", () => {
    const err = new ContainerFailureError("test", 127);
    expect(err.exitCode).toBe(127);
  });

  it("stores exitCode zero", () => {
    const err = new ContainerFailureError("test", 0);
    expect(err.exitCode).toBe(0);
  });

  it("is an instance of Error", () => {
    const err = new ContainerFailureError("test", 1);
    expect(err).toBeInstanceOf(Error);
  });

  it("is an instance of ContainerFailureError", () => {
    const err = new ContainerFailureError("test", 1);
    expect(err).toBeInstanceOf(ContainerFailureError);
  });
});

// ============================================================================
// StreamRunnerBase constructor defaults
// ============================================================================

describe("StreamRunnerBase constructor defaults", () => {
  it("defaults mode to docker", () => {
    const runner = new EchoRunner();
    expect(runner.mode).toBe("docker");
  });

  it("defaults image to bash:5.2", () => {
    const runner = new EchoRunner();
    expect(runner.image).toBe("bash:5.2");
  });

  it("defaults timeoutSeconds to 10", () => {
    const runner = new EchoRunner();
    expect(runner.timeoutSeconds).toBe(10);
  });

  it("defaults memLimit to 256m", () => {
    const runner = new EchoRunner();
    expect(runner.memLimit).toBe("256m");
  });

  it("defaults nanoCpus to 1_000_000_000", () => {
    const runner = new EchoRunner();
    expect(runner.nanoCpus).toBe(1_000_000_000);
  });

  it("defaults networkDisabled to true", () => {
    const runner = new EchoRunner();
    expect(runner.networkDisabled).toBe(true);
  });

  it("defaults ipcMode to host", () => {
    const runner = new EchoRunner();
    expect(runner.ipcMode).toBe("host");
  });

  it("defaults workspaceMountPath to /workspace", () => {
    const runner = new EchoRunner();
    expect(runner.workspaceMountPath).toBe("/workspace");
  });

  it("defaults dockerWorkdir to /workspace", () => {
    const runner = new EchoRunner();
    expect(runner.dockerWorkdir).toBe("/workspace");
  });

  it("accepts custom image", () => {
    const runner = new EchoRunner({ image: "ubuntu:22.04" });
    expect(runner.image).toBe("ubuntu:22.04");
  });

  it("accepts custom timeoutSeconds", () => {
    const runner = new EchoRunner({ timeoutSeconds: 60 });
    expect(runner.timeoutSeconds).toBe(60);
  });

  it("accepts custom memLimit", () => {
    const runner = new EchoRunner({ memLimit: "512m" });
    expect(runner.memLimit).toBe("512m");
  });

  it("accepts custom nanoCpus", () => {
    const runner = new EchoRunner({ nanoCpus: 2_000_000_000 });
    expect(runner.nanoCpus).toBe(2_000_000_000);
  });

  it("accepts subprocess mode", () => {
    const runner = new EchoRunner({ mode: "subprocess" });
    expect(runner.mode).toBe("subprocess");
  });

  it("accepts null ipcMode", () => {
    const runner = new EchoRunner({ ipcMode: null });
    expect(runner.ipcMode).toBeNull();
  });

  it("accepts explicit ipcMode string", () => {
    const runner = new EchoRunner({ ipcMode: "shareable" });
    expect(runner.ipcMode).toBe("shareable");
  });

  it("accepts null workspaceMountPath", () => {
    const runner = new EchoRunner({ workspaceMountPath: null });
    expect(runner.workspaceMountPath).toBeNull();
  });

  it("accepts host workspaceMountPath", () => {
    const runner = new EchoRunner({ workspaceMountPath: "host" });
    expect(runner.workspaceMountPath).toBe("host");
  });
});

// ============================================================================
// StreamRunnerBase.buildContainerCommand throws by default
// ============================================================================

describe("StreamRunnerBase.buildContainerCommand", () => {
  it("throws when not overridden", () => {
    const runner = new StreamRunnerBase();
    expect(() => runner.buildContainerCommand("code", {})).toThrow(
      "buildContainerCommand must be implemented by subclasses"
    );
  });
});

// ============================================================================
// StreamRunnerBase.wrapSubprocessCommand / cleanupSubprocessWrapper
// ============================================================================

describe("StreamRunnerBase.wrapSubprocessCommand", () => {
  it("returns the same command by default", () => {
    const runner = new EchoRunner();
    const [wrapped, cleanup] = runner.wrapSubprocessCommand(["echo", "hello"]);
    expect(wrapped).toEqual(["echo", "hello"]);
    expect(cleanup).toBeNull();
  });
});

describe("StreamRunnerBase.cleanupSubprocessWrapper", () => {
  it("is a no-op by default (does not throw)", () => {
    const runner = new EchoRunner();
    expect(() => runner.cleanupSubprocessWrapper(null)).not.toThrow();
    expect(() =>
      runner.cleanupSubprocessWrapper({ someData: true })
    ).not.toThrow();
  });
});

// ============================================================================
// StreamRunnerBase.buildContainerEnvironment
// ============================================================================

describe("StreamRunnerBase.buildContainerEnvironment", () => {
  it("returns empty object for empty input", () => {
    const runner = new EchoRunner();
    expect(runner.buildContainerEnvironment({})).toEqual({});
  });

  it("converts number values to strings", () => {
    const runner = new EchoRunner();
    const env = runner.buildContainerEnvironment({ PORT: 3000 });
    expect(env).toEqual({ PORT: "3000" });
  });

  it("converts boolean values to strings", () => {
    const runner = new EchoRunner();
    const env = runner.buildContainerEnvironment({ DEBUG: true });
    expect(env).toEqual({ DEBUG: "true" });
  });

  it("keeps string values as-is", () => {
    const runner = new EchoRunner();
    const env = runner.buildContainerEnvironment({ NAME: "Alice" });
    expect(env).toEqual({ NAME: "Alice" });
  });

  it("handles multiple entries", () => {
    const runner = new EchoRunner();
    const env = runner.buildContainerEnvironment({
      HOST: "localhost",
      PORT: 8080,
      DEBUG: false
    });
    expect(env).toEqual({ HOST: "localhost", PORT: "8080", DEBUG: "false" });
  });
});

// ============================================================================
// StreamRunnerBase.dockerImage
// ============================================================================

describe("StreamRunnerBase.dockerImage", () => {
  it("returns the configured image name", () => {
    const runner = new EchoRunner({ image: "node:20-alpine" });
    expect(runner.dockerImage()).toBe("node:20-alpine");
  });

  it("returns default image when none specified", () => {
    const runner = new EchoRunner();
    expect(runner.dockerImage()).toBe("bash:5.2");
  });
});

// ============================================================================
// StreamRunnerBase.getWorkspaceHostPath
// ============================================================================

describe("StreamRunnerBase.getWorkspaceHostPath", () => {
  it("returns null when no directory is provided", () => {
    const runner = new EchoRunner();
    expect(runner.getWorkspaceHostPath()).toBeNull();
  });

  it("returns null when empty string is provided", () => {
    const runner = new EchoRunner();
    expect(runner.getWorkspaceHostPath("")).toBeNull();
  });

  it("creates directory and returns resolved path", () => {
    const runner = new EchoRunner();
    const tmpDir = `/tmp/code-runner-test-${Date.now()}`;
    const result = runner.getWorkspaceHostPath(tmpDir);
    expect(result).toBe(tmpDir);
    expect(existsSync(tmpDir)).toBe(true);
    // cleanup
    rmdirSync(tmpDir);
  });

  it("returns path even when directory already exists", () => {
    const runner = new EchoRunner();
    const tmpDir = `/tmp/code-runner-test-existing-${Date.now()}`;
    // First call creates it
    runner.getWorkspaceHostPath(tmpDir);
    // Second call should still return the path
    const result = runner.getWorkspaceHostPath(tmpDir);
    expect(result).toBe(tmpDir);
    rmdirSync(tmpDir);
  });
});

// ============================================================================
// StreamRunnerBase.resolveExecutionWorkspacePath
// ============================================================================

describe("StreamRunnerBase.resolveExecutionWorkspacePath", () => {
  it("in docker mode without dir returns dockerWorkdir", () => {
    const runner = new EchoRunner({ mode: "docker", dockerWorkdir: "/mywork" });
    expect(runner.resolveExecutionWorkspacePath()).toBe("/mywork");
  });

  it("in docker mode with null dockerWorkdir returns null", () => {
    const runner = new EchoRunner({ mode: "docker", dockerWorkdir: null });
    expect(runner.resolveExecutionWorkspacePath()).toBeNull();
  });

  it("in subprocess mode without dir returns null", () => {
    const runner = new EchoRunner({ mode: "subprocess" });
    expect(runner.resolveExecutionWorkspacePath()).toBeNull();
  });

  it("in subprocess mode with dir returns resolved path", () => {
    const runner = new EchoRunner({ mode: "subprocess" });
    const tmpDir = `/tmp/code-runner-resolve-${Date.now()}`;
    const result = runner.resolveExecutionWorkspacePath(tmpDir);
    expect(result).toBe(tmpDir);
    rmdirSync(tmpDir);
  });
});

// ============================================================================
// StreamRunnerBase subprocess mode — JavaScript runner
// ============================================================================

describe("StreamRunnerBase subprocess mode (JavaScript)", () => {
  it("streams stdout output", async () => {
    const runner = new JavaScriptDockerRunner({
      mode: "subprocess",
      timeoutSeconds: 10
    });
    const outputs: Array<[string, string]> = [];
    for await (const item of runner.stream('console.log("hello world")', {})) {
      outputs.push(item);
    }
    expect(outputs).toContainEqual(["stdout", "hello world\n"]);
  });

  it("streams multiple stdout lines", async () => {
    const runner = new JavaScriptDockerRunner({
      mode: "subprocess",
      timeoutSeconds: 10
    });
    const outputs: Array<[string, string]> = [];
    for await (const item of runner.stream(
      'console.log("a"); console.log("b")',
      {}
    )) {
      outputs.push(item);
    }
    const lines = outputs.filter(([s]) => s === "stdout").map(([, v]) => v);
    expect(lines).toContain("a\n");
    expect(lines).toContain("b\n");
  });

  it("streams stderr output", async () => {
    const runner = new JavaScriptDockerRunner({
      mode: "subprocess",
      timeoutSeconds: 10
    });
    const outputs: Array<[string, string]> = [];
    for await (const item of runner.stream(
      'process.stderr.write("err msg\\n")',
      {}
    )) {
      outputs.push(item);
    }
    expect(outputs).toContainEqual(["stderr", "err msg\n"]);
  });

  it("throws ContainerFailureError on non-zero exit", async () => {
    const runner = new JavaScriptDockerRunner({
      mode: "subprocess",
      timeoutSeconds: 10
    });
    await expect(async () => {
      for await (const _ of runner.stream("process.exit(1)", {})) {
        // consume
      }
    }).rejects.toThrow(ContainerFailureError);
  });

  it("ContainerFailureError carries the exit code", async () => {
    const runner = new JavaScriptDockerRunner({
      mode: "subprocess",
      timeoutSeconds: 10
    });
    try {
      for await (const _ of runner.stream("process.exit(42)", {})) {
        // drain
      }
      expect.fail("Expected ContainerFailureError to be thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ContainerFailureError);
      expect((err as ContainerFailureError).exitCode).toBe(42);
    }
  });

  it("injects locals into subprocess execution", async () => {
    const runner = new JavaScriptDockerRunner({
      mode: "subprocess",
      timeoutSeconds: 10
    });
    const outputs: Array<[string, string]> = [];
    for await (const item of runner.stream("console.log(x)", { x: 123 })) {
      outputs.push(item);
    }
    expect(outputs).toContainEqual(["stdout", "123\n"]);
  });

  it("injects string locals correctly", async () => {
    const runner = new JavaScriptDockerRunner({
      mode: "subprocess",
      timeoutSeconds: 10
    });
    const outputs: Array<[string, string]> = [];
    for await (const item of runner.stream("console.log(name)", {
      name: "world"
    })) {
      outputs.push(item);
    }
    expect(outputs).toContainEqual(["stdout", "world\n"]);
  });

  it("collects no output for empty program", async () => {
    const runner = new JavaScriptDockerRunner({
      mode: "subprocess",
      timeoutSeconds: 10
    });
    const outputs: Array<[string, string]> = [];
    for await (const item of runner.stream("// no output", {})) {
      outputs.push(item);
    }
    expect(outputs).toHaveLength(0);
  });
});

// ============================================================================
// StreamRunnerBase subprocess mode — Bash runner
// ============================================================================

describe("StreamRunnerBase subprocess mode (Bash)", () => {
  it("streams stdout from bash echo", async () => {
    const runner = new BashDockerRunner({
      mode: "subprocess",
      timeoutSeconds: 10
    });
    const outputs: Array<[string, string]> = [];
    for await (const item of runner.stream('echo "bash output"', {})) {
      outputs.push(item);
    }
    expect(outputs).toContainEqual(["stdout", "bash output\n"]);
  });

  it("throws ContainerFailureError on exit 1", async () => {
    const runner = new BashDockerRunner({
      mode: "subprocess",
      timeoutSeconds: 10
    });
    await expect(async () => {
      for await (const _ of runner.stream("exit 1", {})) {
        // consume
      }
    }).rejects.toThrow(ContainerFailureError);
  });

  it("streams stderr from bash", async () => {
    const runner = new BashDockerRunner({
      mode: "subprocess",
      timeoutSeconds: 10
    });
    const outputs: Array<[string, string]> = [];
    for await (const item of runner.stream('echo "err line" >&2', {})) {
      outputs.push(item);
    }
    expect(outputs).toContainEqual(["stderr", "err line\n"]);
  });
});

// ============================================================================
// Timeout behavior
// ============================================================================

describe("StreamRunnerBase timeout", () => {
  it("kills subprocess when timeoutSeconds is exceeded", async () => {
    const runner = new BashDockerRunner({
      mode: "subprocess",
      timeoutSeconds: 0.5
    });
    await expect(async () => {
      for await (const _ of runner.stream("sleep 30", {})) {
        // would block without timeout
      }
    }).rejects.toThrow(ContainerFailureError);
  });
});

// ============================================================================
// stop()
// ============================================================================

describe("StreamRunnerBase.stop()", () => {
  it("does not throw when called with no active subprocess", () => {
    const runner = new JavaScriptDockerRunner({ mode: "subprocess" });
    expect(() => runner.stop()).not.toThrow();
  });

  it("does not throw when called multiple times", () => {
    const runner = new JavaScriptDockerRunner({ mode: "subprocess" });
    expect(() => {
      runner.stop();
      runner.stop();
    }).not.toThrow();
  });

  it("terminates an active subprocess", async () => {
    const runner = new BashDockerRunner({
      mode: "subprocess",
      timeoutSeconds: 60
    });

    let gotFirstLine = false;
    let caughtError: unknown = null;

    try {
      for await (const [, val] of runner.stream(
        'echo "started"; sleep 30',
        {}
      )) {
        if (val.includes("started")) {
          gotFirstLine = true;
          runner.stop();
          // After stop(), the next iteration should eventually throw or finish
        }
      }
    } catch (err) {
      caughtError = err;
    }

    expect(gotFirstLine).toBe(true);
    // stop() kills the process → non-zero exit → ContainerFailureError
    expect(caughtError).toBeInstanceOf(ContainerFailureError);
  });
});
