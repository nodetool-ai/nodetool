const electronMock = jest.requireActual("../__mocks__/electron");
jest.mock("electron", () => electronMock);
jest.mock("../logger", () => ({ logMessage: jest.fn(), LOG_FILE: "/mock/log" }));
jest.mock("../config", () => ({
  getOptionalNodeModulesPath: () => "/mock/optional",
  getPythonPath: () => "/mock/python", getProcessEnv: () => ({}),
  getLocalFileRootsEnv: () => "", PID_FILE_PATH: "/mock/backend.pid", webPath: "/mock/web"
}));
jest.mock("../events", () => ({
  emitBootMessage: jest.fn(), emitServerError: jest.fn(),
  emitServerStarted: jest.fn(), emitServerLog: jest.fn()
}));
jest.mock("../tray", () => ({ emitServerStateChanged: jest.fn() }));
jest.mock("../workflowWindow", () => ({ createWorkflowWindow: jest.fn() }));
jest.mock("../vaults", () => ({
  ensureActiveVaultDirs: jest.fn(), getActiveVaultEnv: () => ({}),
  getActiveVault: () => ({ name: "Default", id: "default" })
}));
jest.mock("../httpProbe", () => ({
  probeHttpOk: jest.fn().mockResolvedValue(false),
  waitForHttpOk: jest.fn().mockResolvedValue(undefined)
}));
jest.mock("fs/promises", () => ({
  readFile: jest.fn().mockRejectedValue(Object.assign(new Error("missing"), { code: "ENOENT" })),
  access: jest.fn().mockResolvedValue(undefined)
}));
jest.mock("net", () => ({
  createServer: () => {
    const server = {
      listen: () => server, close: jest.fn(),
      once: (event: string, callback: () => void) => {
        if (event === "listening") queueMicrotask(callback);
        return server;
      }
    };
    return server;
  }
}));
jest.mock("../watchdog", () => ({ Watchdog: jest.fn() }));

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

it("quit stops the spawned backend before startup readiness and prevents queued starts", async () => {
  const starting = deferred();
  const spawned = deferred();
  const stopGracefully = jest.fn().mockResolvedValue(undefined);
  const { Watchdog } = require("../watchdog");
  jest.mocked(Watchdog).mockImplementation(() => ({
    start: () => { spawned.resolve(); return starting.promise; }, stopGracefully
  }));
  const { initializeBackendServer, stopServer } = require("../server");
  const initial = initializeBackendServer();
  await spawned.promise;
  const queued = initializeBackendServer();
  const stopped = stopServer({ shutdown: true });
  await new Promise((resolve) => setImmediate(resolve));
  const stopCallsBeforeReady = stopGracefully.mock.calls.length;
  starting.resolve();
  await Promise.all([initial, queued, stopped]);
  expect(stopCallsBeforeReady).toBe(1);
  expect(Watchdog).toHaveBeenCalledTimes(1);
  const { emitServerStarted } = require("../events");
  expect(emitServerStarted).not.toHaveBeenCalled();
});
