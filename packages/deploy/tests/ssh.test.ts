import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

// ---------------------------------------------------------------------------
// We need to mock ssh2 BEFORE importing ssh.ts. The source uses require("ssh2")
// lazily, so we mock the module at the vitest level. We also need to handle
// the CJS require interop.
// ---------------------------------------------------------------------------

// Mock helpers

function createMockChannel(opts?: {
  exitCode?: number;
  stdout?: string;
  stderr?: string;
}) {
  const { exitCode = 0, stdout = "", stderr = "" } = opts ?? {};
  const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
  const stderrListeners: Record<string, ((...args: unknown[]) => void)[]> = {};

  const channel = {
    on(event: string, listener: (...args: unknown[]) => void) {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(listener);
      if (event === "close") {
        Promise.resolve().then(() => {
          for (const fn of listeners["data"] ?? []) {
            fn(Buffer.from(stdout, "utf-8"));
          }
          for (const fn of stderrListeners["data"] ?? []) {
            fn(Buffer.from(stderr, "utf-8"));
          }
          for (const fn of listeners["close"] ?? []) {
            fn(exitCode);
          }
        });
      }
      return channel;
    },
    stderr: {
      on(event: string, listener: (...args: unknown[]) => void) {
        if (!stderrListeners[event]) stderrListeners[event] = [];
        stderrListeners[event].push(listener);
      }
    },
    close: vi.fn()
  };
  return channel;
}

function createMockSftp() {
  return {
    fastPut: vi.fn((_l: string, _r: string, cb: (err?: Error) => void) =>
      cb(undefined)
    ),
    fastGet: vi.fn((_r: string, _l: string, cb: (err?: Error) => void) =>
      cb(undefined)
    ),
    createWriteStream: vi.fn((_remotePath: string) => {
      const wsListeners: Record<string, ((...args: unknown[]) => void)[]> = {};
      return {
        on(event: string, listener: (...args: unknown[]) => void) {
          if (!wsListeners[event]) wsListeners[event] = [];
          wsListeners[event].push(listener);
          return this;
        },
        end(_content?: string, _enc?: string) {
          Promise.resolve().then(() => {
            for (const fn of wsListeners["close"] ?? []) fn();
          });
        }
      };
    }),
    stat: vi.fn((_r: string, cb: (err?: Error) => void) => cb(undefined)),
    chmod: vi.fn((_r: string, _m: number, cb: (err?: Error) => void) =>
      cb(undefined)
    ),
    mkdir: vi.fn((_r: string, _a: object, cb: (err?: Error) => void) =>
      cb(undefined)
    ),
    rmdir: vi.fn((_r: string, cb: (err?: Error) => void) => cb(undefined)),
    end: vi.fn()
  };
}

let currentClient: ReturnType<typeof createMockClientInternal>;
let currentSftp: ReturnType<typeof createMockSftp>;
let connectBehavior: "ready" | "error" = "ready";
let connectError: Error = new Error("ECONNREFUSED");

function createMockClientInternal() {
  const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
  const client = {
    on(event: string, listener: (...args: unknown[]) => void) {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(listener);
      return client;
    },
    connect: vi.fn((_config: unknown) => {
      Promise.resolve().then(() => {
        if (connectBehavior === "ready") {
          for (const fn of listeners["ready"] ?? []) fn();
        } else {
          for (const fn of listeners["error"] ?? []) fn(connectError);
        }
      });
    }),
    exec: vi.fn(
      (
        _command: string,
        cb: (err: Error | undefined, channel: unknown) => void
      ) => {
        const ch = createMockChannel({ stdout: "ok\n", exitCode: 0 });
        cb(undefined, ch);
      }
    ),
    sftp: vi.fn((cb: (err: Error | undefined, sftp: unknown) => void) => {
      currentSftp = createMockSftp();
      cb(undefined, currentSftp);
    }),
    end: vi.fn(),
    _sock: { writable: true }
  };
  return client;
}

// Mock node:fs
vi.mock("node:fs", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import("node:fs");
  return {
    ...actual,
    existsSync: vi.fn(actual.existsSync),
    readFileSync: vi.fn(actual.readFileSync),
    mkdirSync: vi.fn()
  };
});

const mockedExistsSync = vi.mocked(fs.existsSync);
const mockedReadFileSync = vi.mocked(fs.readFileSync);
const mockedMkdirSync = vi.mocked(fs.mkdirSync);

// ---------------------------------------------------------------------------
// Import ssh module and patch the lazy-loaded ssh2 client constructor
// ---------------------------------------------------------------------------

import {
  SSHConnection,
  SSHConnectionError,
  SSHCommandError,
  withSSHConnection
} from "../src/ssh.js";
import type { SSHConnectionOptions } from "../src/ssh.js";

// The module caches _ClientCtor after first call to getClientCtor().
// We need to set it before any test calls connect(). We do this by
// accessing the module-level variable. Since it's not exported, we
// inject it by calling require("ssh2") ourselves through the module's
// internal mechanism: we just need to make sure require("ssh2") returns
// our mock. Let's patch it via the module's internal state.
//
// Alternative approach: we directly set the _ClientCtor by reaching into
// the module. But since that's a local variable, we can't. Instead, we
// override `require` or use Node's module cache.

// Inject our mock into Node's require cache for "ssh2"
const mockSsh2Module = {
  Client: class MockSSH2Client {
    constructor() {
      currentClient = createMockClientInternal();
      return currentClient as unknown;
    }
  }
};

// For CJS require() interop, inject into require.cache
// eslint-disable-next-line @typescript-eslint/no-require-imports
const resolvedSsh2Path = (() => {
  try {
    return require.resolve("ssh2");
  } catch {
    return null;
  }
})();

if (resolvedSsh2Path) {
  require.cache[resolvedSsh2Path] = {
    id: resolvedSsh2Path,
    filename: resolvedSsh2Path,
    loaded: true,
    exports: mockSsh2Module
  } as NodeModule;
} else {
  // ssh2 is not installed, so create a synthetic cache entry
  // We need to make require("ssh2") work by adding to Module._cache
  const Module = require("module");
  const m = new Module("ssh2");
  m.exports = mockSsh2Module;
  m.loaded = true;
  Module._cache["ssh2"] = m;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const baseOpts: SSHConnectionOptions = {
  host: "10.0.0.1",
  user: "ubuntu",
  password: "secret",
  port: 22,
  timeout: 5,
  retryAttempts: 1,
  retryDelay: 0
};

beforeEach(() => {
  connectBehavior = "ready";
});

describe("SSHConnectionError", () => {
  it("should have correct name and message", () => {
    const err = new SSHConnectionError("connection refused");
    expect(err.name).toBe("SSHConnectionError");
    expect(err.message).toBe("connection refused");
    expect(err).toBeInstanceOf(Error);
  });

  it("should be catchable as Error", () => {
    try {
      throw new SSHConnectionError("test");
    } catch (e) {
      expect(e).toBeInstanceOf(SSHConnectionError);
      expect(e).toBeInstanceOf(Error);
    }
  });
});

describe("SSHCommandError", () => {
  it("should store exitCode, stdout, stderr", () => {
    const err = new SSHCommandError("failed", 1, "out", "err");
    expect(err.name).toBe("SSHCommandError");
    expect(err.exitCode).toBe(1);
    expect(err.stdout).toBe("out");
    expect(err.stderr).toBe("err");
    expect(err).toBeInstanceOf(Error);
  });

  it("should store zero exitCode", () => {
    const err = new SSHCommandError("msg", 0, "", "");
    expect(err.exitCode).toBe(0);
  });

  it("should store negative exitCode (timeout)", () => {
    const err = new SSHCommandError("timeout", -1, "partial", "");
    expect(err.exitCode).toBe(-1);
    expect(err.stdout).toBe("partial");
  });
});

describe("SSHConnection constructor", () => {
  it("should set defaults", () => {
    const conn = new SSHConnection({ host: "h", user: "u" });
    expect(conn.host).toBe("h");
    expect(conn.user).toBe("u");
    expect(conn.port).toBe(22);
    expect(conn.timeout).toBe(30);
    expect(conn.retryAttempts).toBe(3);
    expect(conn.retryDelay).toBe(2.0);
    expect(conn.keyPath).toBeUndefined();
    expect(conn.password).toBeUndefined();
  });

  it("should accept custom options", () => {
    const conn = new SSHConnection(baseOpts);
    expect(conn.port).toBe(22);
    expect(conn.timeout).toBe(5);
    expect(conn.retryAttempts).toBe(1);
    expect(conn.retryDelay).toBe(0);
    expect(conn.password).toBe("secret");
  });

  it("should store keyPath", () => {
    const conn = new SSHConnection({
      host: "h",
      user: "u",
      keyPath: "/path/key"
    });
    expect(conn.keyPath).toBe("/path/key");
  });

  it("should store custom port", () => {
    const conn = new SSHConnection({ host: "h", user: "u", port: 2222 });
    expect(conn.port).toBe(2222);
  });
});

describe("SSHConnection.connect", () => {
  it("should connect successfully with password", async () => {
    const conn = new SSHConnection(baseOpts);
    await conn.connect();
    expect(currentClient.connect).toHaveBeenCalled();
    const config = currentClient.connect.mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(config.host).toBe("10.0.0.1");
    expect(config.username).toBe("ubuntu");
    expect(config.password).toBe("secret");
    conn.disconnect();
  });

  it("should set readyTimeout from timeout option", async () => {
    const conn = new SSHConnection({ ...baseOpts, timeout: 10 });
    await conn.connect();
    const config = currentClient.connect.mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(config.readyTimeout).toBe(10000);
    conn.disconnect();
  });

  it("should connect with SSH agent when no key or password", async () => {
    const original = process.env.SSH_AUTH_SOCK;
    process.env.SSH_AUTH_SOCK = "/tmp/ssh-agent.sock";
    const conn = new SSHConnection({
      host: "h",
      user: "u",
      retryAttempts: 1,
      retryDelay: 0
    });
    await conn.connect();
    const config = currentClient.connect.mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(config.agent).toBe("/tmp/ssh-agent.sock");
    process.env.SSH_AUTH_SOCK = original;
    conn.disconnect();
  });

  it("should throw SSHConnectionError when key file is missing", async () => {
    mockedExistsSync.mockReturnValue(false);
    const conn = new SSHConnection({
      ...baseOpts,
      password: undefined,
      keyPath: "/nonexistent/key"
    });
    await expect(conn.connect()).rejects.toThrow(SSHConnectionError);
    await expect(conn.connect()).rejects.toThrow("SSH key not found");
  });

  it("should read key file when it exists", async () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(Buffer.from("key-data"));
    const conn = new SSHConnection({
      ...baseOpts,
      password: undefined,
      keyPath: "/home/user/.ssh/id_rsa"
    });
    await conn.connect();
    const config = currentClient.connect.mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(config.privateKey).toEqual(Buffer.from("key-data"));
    conn.disconnect();
  });

  it("should expand ~ in key path", async () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(Buffer.from("key"));
    const conn = new SSHConnection({
      ...baseOpts,
      password: undefined,
      keyPath: "~/.ssh/id_rsa"
    });
    await conn.connect();
    const expectedPath = path.join(os.homedir(), ".ssh/id_rsa");
    expect(mockedExistsSync).toHaveBeenCalledWith(expectedPath);
    conn.disconnect();
  });

  it("should throw after all retry attempts fail", async () => {
    connectBehavior = "error";
    connectError = new Error("ECONNREFUSED");
    const conn = new SSHConnection({
      ...baseOpts,
      retryAttempts: 2,
      retryDelay: 0
    });
    await expect(conn.connect()).rejects.toThrow(SSHConnectionError);
  });

  it("should include host info in retry error message", async () => {
    connectBehavior = "error";
    const conn = new SSHConnection({
      ...baseOpts,
      retryAttempts: 1,
      retryDelay: 0
    });
    try {
      await conn.connect();
    } catch (e: unknown) {
      const err = e as SSHConnectionError;
      expect(err.message).toContain("ubuntu@10.0.0.1:22");
      expect(err.message).toContain("after 1 attempts");
    }
  });
});

describe("SSHConnection.disconnect", () => {
  it("should close client", async () => {
    const conn = new SSHConnection(baseOpts);
    await conn.connect();
    const client = currentClient;
    conn.disconnect();
    expect(client.end).toHaveBeenCalled();
  });

  it("should close sftp if open", async () => {
    const conn = new SSHConnection(baseOpts);
    await conn.connect();
    // Trigger sftp creation by accessing private method
    const getSftp = (
      conn as unknown as { getSftp(): Promise<unknown> }
    ).getSftp.bind(conn);
    await getSftp();
    const sftp = currentSftp;
    conn.disconnect();
    expect(sftp.end).toHaveBeenCalled();
  });

  it("should be safe when not connected", () => {
    const conn = new SSHConnection(baseOpts);
    expect(() => conn.disconnect()).not.toThrow();
  });

  it("should be safe to call twice", async () => {
    const conn = new SSHConnection(baseOpts);
    await conn.connect();
    conn.disconnect();
    expect(() => conn.disconnect()).not.toThrow();
  });
});

describe("SSHConnection.isConnected", () => {
  it("should return false before connect", () => {
    const conn = new SSHConnection(baseOpts);
    expect(conn.isConnected()).toBe(false);
  });

  it("should return true after connect (writable socket)", async () => {
    const conn = new SSHConnection(baseOpts);
    await conn.connect();
    expect(conn.isConnected()).toBe(true);
    conn.disconnect();
  });

  it("should return false after disconnect", async () => {
    const conn = new SSHConnection(baseOpts);
    await conn.connect();
    conn.disconnect();
    expect(conn.isConnected()).toBe(false);
  });
});

describe("SSHConnection.execute", () => {
  let conn: SSHConnection;

  beforeEach(async () => {
    connectBehavior = "ready";
    conn = new SSHConnection(baseOpts);
    await conn.connect();
  });

  afterEach(() => {
    conn.disconnect();
  });

  it("should return [exitCode, stdout, stderr] on success", async () => {
    currentClient.exec.mockImplementation(
      (_cmd: string, cb: (err: Error | undefined, ch: unknown) => void) => {
        cb(
          undefined,
          createMockChannel({ exitCode: 0, stdout: "hello\n", stderr: "" })
        );
      }
    );
    const [code, out, err] = await conn.execute("echo hello");
    expect(code).toBe(0);
    expect(out).toBe("hello\n");
    expect(err).toBe("");
  });

  it("should throw SSHCommandError when check=true and exit code != 0", async () => {
    currentClient.exec.mockImplementation(
      (_cmd: string, cb: (err: Error | undefined, ch: unknown) => void) => {
        cb(
          undefined,
          createMockChannel({ exitCode: 1, stdout: "", stderr: "not found" })
        );
      }
    );
    await expect(conn.execute("bad-cmd")).rejects.toThrow(SSHCommandError);
  });

  it("should include stderr in SSHCommandError", async () => {
    currentClient.exec.mockImplementation(
      (_cmd: string, cb: (err: Error | undefined, ch: unknown) => void) => {
        cb(
          undefined,
          createMockChannel({
            exitCode: 1,
            stdout: "partial",
            stderr: "error detail"
          })
        );
      }
    );
    try {
      await conn.execute("cmd");
    } catch (e) {
      const err = e as SSHCommandError;
      expect(err.exitCode).toBe(1);
      expect(err.stderr).toBe("error detail");
      expect(err.stdout).toBe("partial");
    }
  });

  it("should return non-zero exit code when check=false", async () => {
    currentClient.exec.mockImplementation(
      (_cmd: string, cb: (err: Error | undefined, ch: unknown) => void) => {
        cb(
          undefined,
          createMockChannel({ exitCode: 2, stdout: "partial", stderr: "warn" })
        );
      }
    );
    const [code, out, err] = await conn.execute("cmd", { check: false });
    expect(code).toBe(2);
    expect(out).toBe("partial");
    expect(err).toBe("warn");
  });

  it("should throw SSHConnectionError when exec returns error", async () => {
    currentClient.exec.mockImplementation(
      (_cmd: string, cb: (err: Error | undefined, ch: unknown) => void) => {
        cb(new Error("channel open failed"), null as unknown);
      }
    );
    await expect(conn.execute("cmd")).rejects.toThrow(SSHConnectionError);
  });

  it("should handle timeout", async () => {
    currentClient.exec.mockImplementation(
      (_cmd: string, cb: (err: Error | undefined, ch: unknown) => void) => {
        // Create a channel that never fires close
        const ch = {
          on(_event: string, _listener: Function) {
            return ch;
          },
          stderr: { on(_event: string, _listener: Function) {} },
          close: vi.fn()
        };
        cb(undefined, ch);
      }
    );
    await expect(conn.execute("sleep 100", { timeout: 0.05 })).rejects.toThrow(
      SSHCommandError
    );
  });

  it("should include timeout info in error", async () => {
    currentClient.exec.mockImplementation(
      (_cmd: string, cb: (err: Error | undefined, ch: unknown) => void) => {
        const ch = {
          on(_event: string, _listener: Function) {
            return ch;
          },
          stderr: { on(_event: string, _listener: Function) {} },
          close: vi.fn()
        };
        cb(undefined, ch);
      }
    );
    try {
      await conn.execute("sleep 100", { timeout: 0.05 });
    } catch (e) {
      const err = e as SSHCommandError;
      expect(err.message).toContain("timed out");
      expect(err.exitCode).toBe(-1);
    }
  });
});

describe("SSHConnection.executeScript", () => {
  let conn: SSHConnection;

  beforeEach(async () => {
    connectBehavior = "ready";
    conn = new SSHConnection(baseOpts);
    await conn.connect();
  });

  afterEach(() => {
    conn.disconnect();
  });

  it("should wrap script in bash -c", async () => {
    let capturedCmd = "";
    currentClient.exec.mockImplementation(
      (cmd: string, cb: (err: Error | undefined, ch: unknown) => void) => {
        capturedCmd = cmd;
        cb(undefined, createMockChannel({ exitCode: 0, stdout: "done" }));
      }
    );
    await conn.executeScript("echo hello\necho world");
    expect(capturedCmd).toContain("bash -c");
  });

  it("should escape single quotes in script", async () => {
    let capturedCmd = "";
    currentClient.exec.mockImplementation(
      (cmd: string, cb: (err: Error | undefined, ch: unknown) => void) => {
        capturedCmd = cmd;
        cb(undefined, createMockChannel({ exitCode: 0 }));
      }
    );
    await conn.executeScript("echo 'quoted'");
    expect(capturedCmd).toContain("'\\''");
  });
});

describe("SSHConnection SFTP operations", () => {
  let conn: SSHConnection;

  beforeEach(async () => {
    connectBehavior = "ready";
    conn = new SSHConnection(baseOpts);
    await conn.connect();
  });

  afterEach(() => {
    conn.disconnect();
  });

  it("uploadFile should call fastPut", async () => {
    mockedExistsSync.mockReturnValue(true);
    await conn.uploadFile("/local/file.txt", "/remote/file.txt");
    expect(currentSftp.fastPut).toHaveBeenCalledWith(
      "/local/file.txt",
      "/remote/file.txt",
      expect.any(Function)
    );
  });

  it("uploadFile should throw when local file missing", async () => {
    mockedExistsSync.mockReturnValue(false);
    await expect(
      conn.uploadFile("/missing/file.txt", "/remote/file.txt")
    ).rejects.toThrow("Local file not found");
  });

  it("uploadFile should chmod when mode provided", async () => {
    mockedExistsSync.mockReturnValue(true);
    await conn.uploadFile("/local/file.txt", "/remote/file.txt", 0o755);
    expect(currentSftp.chmod).toHaveBeenCalledWith(
      "/remote/file.txt",
      0o755,
      expect.any(Function)
    );
  });

  it("uploadFile should not chmod when mode not provided", async () => {
    mockedExistsSync.mockReturnValue(true);
    await conn.uploadFile("/local/file.txt", "/remote/file.txt");
    expect(currentSftp.chmod).not.toHaveBeenCalled();
  });

  it("uploadString should write string content", async () => {
    await conn.uploadString("hello world", "/remote/test.txt");
    expect(currentSftp.createWriteStream).toHaveBeenCalledWith(
      "/remote/test.txt"
    );
  });

  it("uploadString should chmod when mode provided", async () => {
    await conn.uploadString("data", "/remote/script.sh", 0o755);
    expect(currentSftp.chmod).toHaveBeenCalledWith(
      "/remote/script.sh",
      0o755,
      expect.any(Function)
    );
  });

  it("downloadFile should call fastGet", async () => {
    await conn.downloadFile("/remote/file.txt", "/local/file.txt");
    expect(currentSftp.fastGet).toHaveBeenCalledWith(
      "/remote/file.txt",
      "/local/file.txt",
      expect.any(Function)
    );
  });

  it("downloadFile should create local directory", async () => {
    await conn.downloadFile("/remote/file.txt", "/local/deep/dir/file.txt");
    expect(mockedMkdirSync).toHaveBeenCalledWith("/local/deep/dir", {
      recursive: true
    });
  });

  it("fileExists should return true when file exists", async () => {
    const result = await conn.fileExists("/remote/file.txt");
    expect(result).toBe(true);
  });

  it("fileExists should return false when stat fails", async () => {
    // Trigger sftp creation
    await conn.fileExists("/remote/something.txt");
    currentSftp.stat.mockImplementation(
      (_p: string, cb: (err?: Error) => void) => cb(new Error("ENOENT"))
    );
    const result = await conn.fileExists("/remote/missing.txt");
    expect(result).toBe(false);
  });

  it("mkdir should create directory with parents", async () => {
    await conn.mkdir("/a/b/c");
    expect(currentSftp.mkdir).toHaveBeenCalled();
    // Should be called for a, a/b, a/b/c
    expect(currentSftp.mkdir.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it("mkdir without parents should call mkdir once", async () => {
    await conn.mkdir("/single", 0o755, false);
    expect(currentSftp.mkdir).toHaveBeenCalledTimes(1);
  });

  it("rmdir non-recursive should call sftp rmdir", async () => {
    await conn.rmdir("/dir", false);
    expect(currentSftp.rmdir).toHaveBeenCalledWith(
      "/dir",
      expect.any(Function)
    );
  });

  it("rmdir recursive should execute rm -rf", async () => {
    let capturedCmd = "";
    currentClient.exec.mockImplementation(
      (cmd: string, cb: (err: Error | undefined, ch: unknown) => void) => {
        capturedCmd = cmd;
        cb(undefined, createMockChannel({ exitCode: 0 }));
      }
    );
    await conn.rmdir("/dir", true);
    expect(capturedCmd).toContain("rm -rf");
    expect(capturedCmd).toContain("/dir");
  });

  it("rmdir recursive should escape single quotes in path", async () => {
    let capturedCmd = "";
    currentClient.exec.mockImplementation(
      (cmd: string, cb: (err: Error | undefined, ch: unknown) => void) => {
        capturedCmd = cmd;
        cb(undefined, createMockChannel({ exitCode: 0 }));
      }
    );
    await conn.rmdir("/dir/it's", true);
    expect(capturedCmd).toContain("'\\''");
  });
});

describe("SSHConnection.ensureConnected", () => {
  it("should reconnect if not connected", async () => {
    const conn = new SSHConnection(baseOpts);
    await conn.ensureConnected();
    expect(currentClient.connect).toHaveBeenCalled();
    conn.disconnect();
  });

  it("should not reconnect if already connected", async () => {
    const conn = new SSHConnection(baseOpts);
    await conn.connect();
    const callCount = currentClient.connect.mock.calls.length;
    await conn.ensureConnected();
    expect(currentClient.connect.mock.calls.length).toBe(callCount);
    conn.disconnect();
  });
});

describe("withSSHConnection", () => {
  it("should connect, run callback, and disconnect", async () => {
    const result = await withSSHConnection(baseOpts, async (ssh) => {
      expect(ssh).toBeInstanceOf(SSHConnection);
      return "result";
    });
    expect(result).toBe("result");
  });

  it("should disconnect even if callback throws", async () => {
    await expect(
      withSSHConnection(baseOpts, async () => {
        throw new Error("callback error");
      })
    ).rejects.toThrow("callback error");
  });

  it("should pass options to SSHConnection", async () => {
    await withSSHConnection(
      { ...baseOpts, port: 2222, timeout: 10 },
      async (ssh) => {
        expect(ssh.port).toBe(2222);
        expect(ssh.timeout).toBe(10);
      }
    );
  });

  it("should return value from callback", async () => {
    const result = await withSSHConnection(baseOpts, async () => {
      return { key: "value" };
    });
    expect(result).toEqual({ key: "value" });
  });

  it("should propagate async errors from callback", async () => {
    await expect(
      withSSHConnection(baseOpts, async () => {
        await Promise.reject(new Error("async fail"));
      })
    ).rejects.toThrow("async fail");
  });
});
