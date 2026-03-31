import { promptForInstallLocation } from "../installer";
import { createIpcMainHandler } from "../ipc";
import { updateSettings } from "../settings";
import { BrowserWindow } from "electron";
import { getDefaultInstallLocation } from "../python";

jest.mock("../types.d", () => ({
  IpcChannels: {
    INSTALL_LOCATION_PROMPT: "install-location-prompt",
    INSTALL_TO_LOCATION: "install-to-location",
    SELECT_CUSTOM_LOCATION: "select-custom-location",
  },
}));

const browserWindowMock = { webContents: { send: jest.fn() } };

jest.mock("electron", () => ({
  BrowserWindow: { 
    getFocusedWindow: jest.fn(() => browserWindowMock),
    getAllWindows: jest.fn(() => [])
  },
  dialog: { showErrorBox: jest.fn() },
  app: { getPath: jest.fn().mockReturnValue("/tmp") },
}));

jest.mock("../ipc", () => ({
  createIpcMainHandler: jest.fn(),
}));

jest.mock("../settings", () => ({
  updateSettings: jest.fn(),
  getModelServiceStartupDefaults: jest.fn().mockReturnValue({
    startLlamaCppOnStartup: false,
  }),
}));

jest.mock("../python", () => ({
  getDefaultInstallLocation: jest.fn(),
  installRequiredPythonPackages: jest.fn(),
  runCommand: jest.fn(),
}));

describe("installer promptForInstallLocation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("sends prompt to renderer and resolves with location and modelBackend", async () => {
    (getDefaultInstallLocation as jest.Mock).mockReturnValue("/default/path");
    let handler: any;
    (createIpcMainHandler as jest.Mock).mockImplementation((_channel, fn) => {
      handler = fn;
    });

    const promise = promptForInstallLocation({
      location: "/default/path",
      modelBackend: "ollama",
    });

    expect(BrowserWindow.getFocusedWindow).toHaveBeenCalled();
    expect(browserWindowMock.webContents.send).toHaveBeenCalledWith(
      "install-location-prompt",
      { defaultPath: "/default/path" }
    );

    await handler({} as any, {
      location: "/chosen",
      modelBackend: "ollama",
      startLlamaCppOnStartup: false,
    });
    const result = await promise;
    expect(updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        CONDA_ENV: "/chosen",
        MODEL_BACKEND: "ollama",
      })
    );
    expect(result).toMatchObject({
      location: "/chosen",
      modelBackend: "ollama",
    });
  });

  it("registers install handler", async () => {
    (getDefaultInstallLocation as jest.Mock).mockReturnValue("/d");
    let handler: any;
    (createIpcMainHandler as jest.Mock).mockImplementation((_c, fn) => {
      handler = fn;
    });

    const promise = promptForInstallLocation();
    await handler({}, { location: "/loc", modelBackend: "ollama" });
    await promise;

    expect(createIpcMainHandler).toHaveBeenCalledWith(
      "install-to-location",
      expect.any(Function)
    );
  });

  it("rejects if no active window", async () => {
    (BrowserWindow.getFocusedWindow as jest.Mock).mockReturnValueOnce(null);

    await expect(promptForInstallLocation()).rejects.toThrow(
      "No active window found"
    );
  });
});
