jest.mock("../logger", () => ({
  logMessage: jest.fn()
}));

jest.mock("../vaults", () => ({
  setActiveVaultId: jest.fn()
}));

jest.mock("../server", () => ({
  initializeBackendServer: jest.fn().mockResolvedValue(undefined),
  stopServer: jest.fn().mockResolvedValue(undefined)
}));

jest.mock("../shortcuts", () => ({
  setupWorkflowShortcuts: jest.fn().mockResolvedValue(undefined)
}));

jest.mock("../window", () => ({
  reloadMainWindow: jest.fn()
}));

import { applyVaultSwitch } from "../vaultSwitch";
import { setActiveVaultId } from "../vaults";
import { initializeBackendServer, stopServer } from "../server";
import { setupWorkflowShortcuts } from "../shortcuts";
import { reloadMainWindow } from "../window";
import { logMessage } from "../logger";

describe("applyVaultSwitch", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("persists the vault id", async () => {
    const promise = applyVaultSwitch("vault-42");
    await jest.advanceTimersByTimeAsync(300);
    await promise;

    expect(setActiveVaultId).toHaveBeenCalledWith("vault-42");
  });

  it("logs the switch", async () => {
    const promise = applyVaultSwitch("vault-42");
    await jest.advanceTimersByTimeAsync(300);
    await promise;

    expect(logMessage).toHaveBeenCalledWith(
      expect.stringContaining("vault-42")
    );
  });

  it("stops the server", async () => {
    const promise = applyVaultSwitch("vault-42");
    await jest.advanceTimersByTimeAsync(300);
    await promise;

    expect(stopServer).toHaveBeenCalled();
  });

  it("does not restart the backend before the delay elapses", async () => {
    const promise = applyVaultSwitch("vault-42");

    expect(initializeBackendServer).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(300);
    await promise;

    expect(initializeBackendServer).toHaveBeenCalled();
  });

  it("re-registers workflow shortcuts", async () => {
    const promise = applyVaultSwitch("vault-42");
    await jest.advanceTimersByTimeAsync(300);
    await promise;

    expect(setupWorkflowShortcuts).toHaveBeenCalled();
  });

  it("reloads the main window", async () => {
    const promise = applyVaultSwitch("vault-42");
    await jest.advanceTimersByTimeAsync(300);
    await promise;

    expect(reloadMainWindow).toHaveBeenCalled();
  });

  it("calls all steps in the correct order", async () => {
    const order: string[] = [];
    (setActiveVaultId as jest.Mock).mockImplementation(() => order.push("setVault"));
    (stopServer as jest.Mock).mockImplementation(async () => order.push("stop"));
    (initializeBackendServer as jest.Mock).mockImplementation(async () => order.push("start"));
    (setupWorkflowShortcuts as jest.Mock).mockImplementation(async () => order.push("shortcuts"));
    (reloadMainWindow as jest.Mock).mockImplementation(() => order.push("reload"));

    const promise = applyVaultSwitch("v1");
    await jest.advanceTimersByTimeAsync(300);
    await promise;

    expect(order).toEqual(["setVault", "stop", "start", "shortcuts", "reload"]);
  });
});
