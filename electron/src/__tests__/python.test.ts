import * as config from "../config";

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

jest.mock("electron", () => ({
  app: {
    getPath: jest.fn().mockReturnValue("/tmp"),
    getVersion: jest.fn().mockReturnValue("0.6.3-rc.42"),
  },
  dialog: {
    showErrorBox: jest.fn(),
  },
}));

jest.mock("@nodetool-ai/runtime-install", () => ({
  getInstalledPythonPackageVersion: jest.fn(),
  canImportNodeToolWorker: jest.fn(),
  installRequiredPythonPackages: jest.fn(),
}));

const desktopHost = { platform: "linux" };
jest.mock("../runtimeHost", () => ({
  getDesktopRuntimeHost: () => desktopHost,
}));

jest.mock("../logger", () => ({
  logMessage: jest.fn(),
  LOG_FILE: "/tmp/nodetool.log",
}));

// The real config module; only the toolchain lookups are stubbed.
jest.spyOn(config, "getNodePath").mockReturnValue("/conda/bin/node");
jest.spyOn(config, "getPythonPath").mockReturnValue("/conda/bin/python");
jest.spyOn(config, "getUVPath").mockReturnValue("/conda/bin/uv");

const { promises: fsPromises } = jest.requireMock("fs") as {
  promises: { access: jest.Mock };
};
const runtimeInstall = jest.requireMock("@nodetool-ai/runtime-install") as {
  getInstalledPythonPackageVersion: jest.Mock;
  canImportNodeToolWorker: jest.Mock;
  installRequiredPythonPackages: jest.Mock;
};

describe("python environment helpers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.NT_ELECTRON_DEV_MODE;
    fsPromises.access.mockResolvedValue(undefined);
  });

  it("accepts an environment when nodetool-core is installed and nodetool.worker is importable", async () => {
    runtimeInstall.getInstalledPythonPackageVersion.mockResolvedValue("0.7.0");
    runtimeInstall.canImportNodeToolWorker.mockResolvedValue(true);

    await expect(isCondaEnvironmentInstalled()).resolves.toBe(true);
    expect(runtimeInstall.getInstalledPythonPackageVersion).toHaveBeenCalledWith(
      desktopHost,
      "/conda/bin/python",
      "nodetool-core"
    );
    expect(runtimeInstall.canImportNodeToolWorker).toHaveBeenCalledWith(
      desktopHost,
      "/conda/bin/python"
    );
  });

  it("treats the environment as incomplete when a toolchain binary is missing", async () => {
    fsPromises.access.mockImplementation(async (file: string) => {
      if (file === "/conda/bin/uv") {
        throw new Error("ENOENT");
      }
    });

    await expect(isCondaEnvironmentInstalled()).resolves.toBe(false);
    expect(runtimeInstall.getInstalledPythonPackageVersion).not.toHaveBeenCalled();
  });

  it("treats the environment as incomplete when nodetool-core is missing", async () => {
    runtimeInstall.getInstalledPythonPackageVersion.mockResolvedValue(null);

    await expect(isCondaEnvironmentInstalled()).resolves.toBe(false);
    expect(runtimeInstall.canImportNodeToolWorker).not.toHaveBeenCalled();
  });

  it("treats the environment as incomplete when nodetool.worker import fails", async () => {
    runtimeInstall.getInstalledPythonPackageVersion.mockResolvedValue("0.6.3rc42");
    runtimeInstall.canImportNodeToolWorker.mockResolvedValue(false);

    await expect(isCondaEnvironmentInstalled()).resolves.toBe(false);
  });

  it("installs the required packages through the desktop runtime host", async () => {
    await installRequiredPythonPackages(["nodetool-ai/nodetool-huggingface"]);

    expect(runtimeInstall.installRequiredPythonPackages).toHaveBeenCalledWith(
      desktopHost,
      ["nodetool-ai/nodetool-huggingface"]
    );
  });
});
