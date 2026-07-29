import * as fs from "fs";
import * as path from "path";
import { app, shell } from "electron";

jest.mock("fs", () => ({ existsSync: jest.fn() }));

jest.mock("electron", () => ({
  app: { isPackaged: false },
  shell: {
    openPath: jest.fn().mockResolvedValue(""),
    showItemInFolder: jest.fn()
  }
}));

jest.mock("../logger", () => ({
  logMessage: jest.fn()
}));

import { getMcpBundlePath, installMcpBundle } from "../mcpBundle";

const mockedShell = shell as jest.Mocked<typeof shell>;
const mockedApp = app as unknown as { isPackaged: boolean };
const mockedExistsSync = fs.existsSync as jest.Mock;

describe("getMcpBundlePath", () => {
  const originalResourcesPath = process.resourcesPath;

  afterEach(() => {
    mockedApp.isPackaged = false;
    (process as { resourcesPath: string }).resourcesPath =
      originalResourcesPath;
  });

  it("resolves to the repo dist bundle in dev", () => {
    mockedApp.isPackaged = false;
    expect(getMcpBundlePath().endsWith(path.join("dist", "nodetool.mcpb"))).toBe(
      true
    );
  });

  it("resolves to a packaged resource when packaged", () => {
    mockedApp.isPackaged = true;
    (process as { resourcesPath: string }).resourcesPath = "/app/resources";
    expect(getMcpBundlePath()).toBe(
      path.join("/app/resources", "mcpb", "nodetool.mcpb")
    );
  });
});

describe("installMcpBundle", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedShell.openPath.mockResolvedValue("");
  });

  it("reports the bundle is missing without opening anything", async () => {
    mockedExistsSync.mockReturnValue(false);
    const result = await installMcpBundle();
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
    expect(mockedShell.openPath).not.toHaveBeenCalled();
    expect(mockedShell.showItemInFolder).not.toHaveBeenCalled();
  });

  it("opens the bundle with the default handler when present", async () => {
    mockedExistsSync.mockReturnValue(true);
    mockedShell.openPath.mockResolvedValue("");
    const result = await installMcpBundle();
    expect(result).toMatchObject({ ok: true, opened: true, revealed: false });
    expect(mockedShell.openPath).toHaveBeenCalledTimes(1);
    expect(mockedShell.showItemInFolder).not.toHaveBeenCalled();
  });

  it("reveals the bundle when no handler is registered", async () => {
    mockedExistsSync.mockReturnValue(true);
    mockedShell.openPath.mockResolvedValue("no application set");
    const result = await installMcpBundle();
    expect(result).toMatchObject({ ok: true, opened: false, revealed: true });
    expect(result.error).toBe("no application set");
    expect(mockedShell.showItemInFolder).toHaveBeenCalledTimes(1);
  });
});
