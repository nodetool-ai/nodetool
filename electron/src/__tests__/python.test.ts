import { EventEmitter } from "events";

import {
  installRequiredPythonPackages,
  isCondaEnvironmentInstalled,
} from "../python";

jest.mock("fs", () => ({
  promises: {
    access: jest.fn(),
  },
  constants: {
    W_OK: 2,
  },
}));

jest.mock("child_process", () => ({
  spawn: jest.fn(),
}));

jest.mock("electron", () => ({
  app: {
    getPath: jest.fn().mockReturnValue("/tmp"),
    getVersion: jest.fn().mockReturnValue("0.6.3-rc.42"),
  },
  dialog: {
    showErrorBox: jest.fn(),
  },
}));

jest.mock("../config", () => ({
  getNodePath: jest.fn().mockReturnValue("/conda/bin/node"),
  getPythonPath: jest.fn().mockReturnValue("/conda/bin/python"),
  getUVPath: jest.fn().mockReturnValue("/conda/bin/uv"),
  getProcessEnv: jest.fn().mockReturnValue({}),
}));

jest.mock("../logger", () => ({
  logMessage: jest.fn(),
  LOG_FILE: "/tmp/nodetool.log",
}));

jest.mock("../utils", () => ({
  checkPermissions: jest.fn(),
  fileExists: jest.fn().mockResolvedValue(true),
}));

jest.mock("../events", () => ({
  emitBootMessage: jest.fn(),
  emitServerLog: jest.fn(),
}));

jest.mock("../torchPlatformCache", () => ({
  getTorchIndexUrl: jest.fn().mockReturnValue(null),
}));

jest.mock("@nodetool/runtime", () => ({
  MIN_NODETOOL_CORE_VERSION: "0.7.0rc8",
}));

const { promises: fsPromises } = jest.requireMock("fs") as {
  promises: { access: jest.Mock };
};
const { spawn } = jest.requireMock("child_process") as {
  spawn: jest.Mock;
};

function createMockProcess(exitCode: number, stdoutText?: string) {
  const proc = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    stdin: {
      write: jest.Mock;
      end: jest.Mock;
    };
  };

  Object.assign(proc, {
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
    stdin: {
      write: jest.fn(),
      end: jest.fn(),
    },
  });

  process.nextTick(() => {
    if (stdoutText !== undefined) {
      proc.stdout.emit("data", Buffer.from(stdoutText));
    }
    proc.emit("exit", exitCode);
  });

  return proc;
}

describe("python environment helpers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.NT_ELECTRON_DEV_MODE;
    fsPromises.access.mockResolvedValue(undefined);
  });

  it("accepts an environment when nodetool-core is installed and nodetool.worker is importable", async () => {
    spawn
      .mockImplementationOnce(() => createMockProcess(0, "0.7.0rc8\n"))
      .mockImplementationOnce(() => createMockProcess(0));

    await expect(isCondaEnvironmentInstalled()).resolves.toBe(true);
    expect(spawn).toHaveBeenNthCalledWith(
      1,
      "/conda/bin/python",
      expect.arrayContaining(["-c"]),
      expect.objectContaining({
        stdio: ["ignore", "pipe", "ignore"],
      })
    );
    expect(spawn).toHaveBeenNthCalledWith(
      2,
      "/conda/bin/python",
      ["-c", "import nodetool.worker"],
      expect.objectContaining({
        stdio: "ignore",
      })
    );
  });

  it("accepts an older nodetool-core install (runtime protocol check handles compatibility)", async () => {
    // App version 0.6.3-rc.42 in mock, installed core 0.6.3rc40 — mismatched
    // but still considered installed. The runtime bridge handshake decides
    // whether the protocol is actually compatible.
    spawn
      .mockImplementationOnce(() => createMockProcess(0, "0.6.3rc40\n"))
      .mockImplementationOnce(() => createMockProcess(0));

    await expect(isCondaEnvironmentInstalled()).resolves.toBe(true);
  });

  it("treats the environment as incomplete when nodetool-core is missing", async () => {
    spawn.mockImplementationOnce(() => createMockProcess(2));

    await expect(isCondaEnvironmentInstalled()).resolves.toBe(false);
  });

  it("treats the environment as incomplete when nodetool.worker import fails", async () => {
    spawn
      .mockImplementationOnce(() => createMockProcess(0, "0.6.3rc42\n"))
      .mockImplementationOnce(() => createMockProcess(1));

    await expect(isCondaEnvironmentInstalled()).resolves.toBe(false);
  });

  it("installs nodetool-core with >=MIN pin and additional node packages unpinned (uv resolves via pyproject)", async () => {
    spawn.mockImplementation(() => createMockProcess(0));

    await installRequiredPythonPackages(["nodetool-ai/nodetool-huggingface"]);

    expect(spawn).toHaveBeenCalledWith(
      "/conda/bin/uv",
      expect.arrayContaining([
        "pip",
        "install",
        "--prerelease=allow",
        "--system",
        "nodetool-core>=0.7.0rc8",
        "nodetool-huggingface",
      ]),
      expect.objectContaining({
        stdio: "pipe",
      })
    );

    const argv = spawn.mock.calls[0][1] as string[];
    expect(argv).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/^nodetool-huggingface==/)])
    );
  });
});
