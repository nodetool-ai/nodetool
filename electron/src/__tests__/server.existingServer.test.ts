/**
 * Startup when port 7777 is already taken: the app only reuses a local server
 * that proves on /health it was started with this user's secret.
 */
import fs from "fs";
import os from "os";
import path from "path";

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
  access: jest.fn().mockResolvedValue(undefined),
  unlink: jest.fn().mockResolvedValue(undefined)
}));
jest.mock("child_process", () => ({ ...jest.requireActual("child_process"), execFileSync: jest.fn(() => "4242\n") }));
// Port 7777 is taken; every other port is free.
jest.mock("net", () => ({
  createServer: () => {
    let port = 0;
    const server = {
      listen: (p: number) => { port = p; return server; }, close: jest.fn(),
      once: (event: string, callback: () => void) => {
        if (event === (port === 7777 ? "error" : "listening")) queueMicrotask(callback);
        return server;
      }
    };
    return server;
  }
}));
jest.mock("../watchdog", () => ({ Watchdog: jest.fn() }));

type ServerModule = typeof import("../server");
type ProofModule = typeof import("../serverProof");
type StateModule = typeof import("../state");

const userData = fs.mkdtempSync(path.join(os.tmpdir(), "nodetool-proof-"));
const originalFetch = global.fetch;
const originalResourcesPath = process.resourcesPath;

/** How each port answers /health with the nonce it is sent. */
type Answer = "proof" | "no-proof" | "wrong-key";

function installHealth(proof: ProofModule, answers: Record<number, Answer>): void {
  global.fetch = jest.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const port = Number(url.port);
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const nonce = headers[proof.SERVER_PROOF_NONCE_HEADER];
    const answer = answers[port];
    const value =
      answer === "proof" ? proof.serverProofFor(proof.getServerProofSecret(), port, nonce)
        : answer === "wrong-key" ? proof.serverProofFor("b".repeat(64), port, nonce)
          : null;
    return {
      ok: answer !== undefined,
      headers: { get: (name: string) => (name === proof.SERVER_PROOF_HEADER ? value : null) },
    } as unknown as Response;
  }) as typeof fetch;
}

function load(): { server: ServerModule; proof: ProofModule; state: StateModule } {
  return { server: require("../server"), proof: require("../serverProof"), state: require("../state") };
}

beforeEach(() => {
  jest.resetModules();
  jest.mocked(electronMock.app.getPath).mockImplementation(() => userData);
  electronMock.app.isPackaged = true;
  Object.defineProperty(process, "resourcesPath", { value: "/mock/resources", configurable: true });
  jest.mocked(electronMock.dialog.showMessageBox).mockReset();
  const { Watchdog } = require("../watchdog");
  jest.mocked(Watchdog).mockReset();
  jest.mocked(Watchdog).mockImplementation(() => ({ start: jest.fn().mockResolvedValue(undefined), stopGracefully: jest.fn() }));
});

afterAll(() => {
  global.fetch = originalFetch;
  electronMock.app.isPackaged = false;
  Object.defineProperty(process, "resourcesPath", { value: originalResourcesPath, configurable: true });
  fs.rmSync(userData, { recursive: true, force: true });
});

function dialogButtons(): string[] {
  const calls = jest.mocked(electronMock.dialog.showMessageBox).mock.calls;
  expect(calls).toHaveLength(1);
  return (calls[0][0] as { buttons: string[] }).buttons;
}

test.each<Answer>(["no-proof", "wrong-key"])(
  "a listener that answers /health without a valid proof (%s) is not reused; the app starts its own server on another port",
  async (answer) => {
    const { server, proof, state } = load();
    installHealth(proof, { 7777: answer, 7778: "proof" });
    // "Start on Another Port"
    jest.mocked(electronMock.dialog.showMessageBox).mockResolvedValue({ response: 0 });

    await server.initializeBackendServer();

    expect(dialogButtons()).not.toContain("Use Existing Server");
    const { Watchdog } = require("../watchdog");
    expect(Watchdog).toHaveBeenCalledTimes(1);
    const env = jest.mocked(Watchdog).mock.calls[0][0].env as Record<string, string>;
    expect(env.PORT).toBe("7778");
    expect(env.NODETOOL_SERVER_PROOF_KEY).toBe(proof.getServerProofSecret());
    expect(state.serverState.serverPort).toBe(7778);
    expect(state.serverState.initialURL).toBe("http://127.0.0.1:7778");
    state.serverState.isStarted = true;
    expect(proof.trustedLocalOrigin()).toBe("http://127.0.0.1:7778");
  }
);

test("a listener that proves it was started by this app can be reused", async () => {
  const { server, proof, state } = load();
  installHealth(proof, { 7777: "proof" });
  // "Use Existing Server"
  jest.mocked(electronMock.dialog.showMessageBox).mockResolvedValue({ response: 1 });

  await server.initializeBackendServer();

  expect(dialogButtons()).toContain("Use Existing Server");
  const { Watchdog } = require("../watchdog");
  expect(Watchdog).not.toHaveBeenCalled();
  const { emitServerStarted } = require("../events");
  expect(emitServerStarted).toHaveBeenCalled();
  expect(state.serverState.serverPort).toBe(7777);
  state.serverState.isStarted = true;
  expect(proof.trustedLocalOrigin()).toBe("http://127.0.0.1:7777");
});

test("a started server that cannot prove itself is never reported as started", async () => {
  const { server, proof, state } = load();
  installHealth(proof, { 7777: "no-proof", 7778: "no-proof" });
  jest.mocked(electronMock.dialog.showMessageBox).mockResolvedValue({ response: 0 });
  const { emitServerStarted } = require("../events");
  jest.mocked(emitServerStarted).mockClear();

  await expect(server.initializeBackendServer()).rejects.toThrow("did not prove");

  expect(emitServerStarted).not.toHaveBeenCalled();
  state.serverState.isStarted = true;
  expect(proof.trustedLocalOrigin()).toBeNull();
});
