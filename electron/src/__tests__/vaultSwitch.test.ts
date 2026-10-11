jest.mock("../logger", () => ({
  logMessage: jest.fn()
}));

jest.mock("../vaults", () => ({
  setActiveVaultId: jest.fn()
}));

jest.mock("../server", () => ({
  restartServer: jest.fn().mockResolvedValue(undefined)
}));

jest.mock("../shortcuts", () => ({
  setupWorkflowShortcuts: jest.fn().mockResolvedValue(undefined)
}));

jest.mock("../window", () => ({
  reloadMainWindow: jest.fn()
}));

import { applyVaultSwitch } from "../vaultSwitch";
import { setActiveVaultId } from "../vaults";
import { restartServer } from "../server";
import { setupWorkflowShortcuts } from "../shortcuts";
import { reloadMainWindow } from "../window";
import { logMessage } from "../logger";

describe("applyVaultSwitch", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("persists the vault id", async () => {
    await applyVaultSwitch("vault-42");

    expect(setActiveVaultId).toHaveBeenCalledWith("vault-42");
  });

  it("logs the switch", async () => {
    await applyVaultSwitch("vault-42");

    expect(logMessage).toHaveBeenCalledWith(
      expect.stringContaining("vault-42")
    );
  });

  it("restarts the backend", async () => {
    await applyVaultSwitch("vault-42");

    expect(restartServer).toHaveBeenCalled();
  });

  it("re-registers workflow shortcuts", async () => {
    await applyVaultSwitch("vault-42");

    expect(setupWorkflowShortcuts).toHaveBeenCalled();
  });

  it("reloads the main window", async () => {
    await applyVaultSwitch("vault-42");

    expect(reloadMainWindow).toHaveBeenCalled();
  });

  it("calls all steps in the correct order", async () => {
    const order: string[] = [];
    jest.mocked(setActiveVaultId).mockImplementation(() => order.push("setVault"));
    jest.mocked(restartServer).mockImplementation(async () => {
      order.push("restart");
    });
    jest.mocked(setupWorkflowShortcuts).mockImplementation(async () => order.push("shortcuts"));
    jest.mocked(reloadMainWindow).mockImplementation(() => order.push("reload"));

    await applyVaultSwitch("v1");

    expect(order).toEqual(["setVault", "restart", "shortcuts", "reload"]);
  });
});
