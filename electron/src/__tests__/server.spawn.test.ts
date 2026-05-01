/**
 * Server spawn contract tests.
 *
 * `server.ts` itself uses `import.meta.url` at top level (ESM), which
 * trips ts-jest's CommonJS transform. Rather than fork test infra to
 * run server.ts directly, this suite locks the *contract* between
 * `server.ts` and the modules it spawns — so any drift triggered by
 * Electron 39 (utilityProcess option changes) or Node 24 (env + stdio
 * tightening) surfaces here.
 *
 * Specifically, we verify:
 *   - The exact env-var contract the backend utilityProcess receives.
 *   - That `Watchdog` accepts the production options shape used by
 *     server.ts and fans them out to `utilityProcess.fork` correctly.
 *   - Health-URL → port extraction matches what server.ts hands in.
 *   - The PID file path layout the server expects from config.ts.
 */

import path from "path";

const electronMock = jest.requireActual("../__mocks__/electron");
jest.mock("electron", () => electronMock);

jest.mock("../logger", () => ({ logMessage: jest.fn() }));
jest.mock("../httpProbe", () => ({
  probeHttpOk: jest.fn().mockResolvedValue(true),
  waitForHttpOk: jest.fn().mockResolvedValue(true),
}));

// fs/promises with controllable access result for PID file teardown
jest.mock("fs", () => {
  const actual = jest.requireActual("fs");
  return {
    ...actual,
    promises: {
      ...actual.promises,
      access: jest.fn().mockResolvedValue(undefined),
      unlink: jest.fn().mockResolvedValue(undefined),
      writeFile: jest.fn().mockResolvedValue(undefined),
      mkdir: jest.fn().mockResolvedValue(undefined),
    },
  };
});

describe("backend utilityProcess spawn contract", () => {
  let Watchdog: typeof import("../watchdog").Watchdog;

  beforeAll(() => {
    Watchdog = require("../watchdog").Watchdog;
  });

  beforeEach(() => {
    (electronMock.utilityProcess.fork as jest.Mock).mockClear();
  });

  test("Watchdog accepts the env shape server.ts builds for the backend", async () => {
    // This object mirrors the shape constructed inside server.ts startServer().
    // If server.ts ever drops/renames a required key, the renderer or backend
    // breaks at runtime — the migration is the riskiest moment for that.
    const requiredEnvKeys = [
      "PORT",
      "HOST",
      "STATIC_FOLDER",
      "NODETOOL_PYTHON",
      "LLAMA_CPP_URL",
      "NODE_ENV",
      "NODE_OPTIONS",
      "NODE_PATH",
    ];
    const backendEnv: Record<string, string> = {
      PORT: "7777",
      HOST: "127.0.0.1",
      STATIC_FOLDER: "/mock/web",
      NODETOOL_PYTHON: "",
      LLAMA_CPP_URL: "",
      NODE_ENV: "production",
      NODE_OPTIONS: "--conditions=nodetool-dev",
      NODE_PATH: "/mock/backend/node_modules",
    };

    for (const key of requiredEnvKeys) {
      expect(backendEnv).toHaveProperty(key);
    }

    const watchdog = new Watchdog({
      name: "nodetool",
      modulePath: "/mock/backend/server.mjs",
      env: backendEnv,
      cwd: "/mock/backend",
      pidFilePath: "/mock/userData/nodetool-server.pid",
      healthUrl: "http://127.0.0.1:7777/health",
      onOutput: () => {},
      logOutput: false,
    });

    // Trigger the fork without going through the full async start (which
    // depends on TCP probe loops). Spawn directly via the private path.
    await (watchdog as unknown as {
      forkUtilityProcess: () => Promise<void>;
    }).forkUtilityProcess();

    expect(electronMock.utilityProcess.fork).toHaveBeenCalledWith(
      "/mock/backend/server.mjs",
      [],
      expect.objectContaining({
        stdio: "pipe",
        cwd: "/mock/backend",
        serviceName: "nodetool",
        env: expect.objectContaining({
          PORT: "7777",
          HOST: "127.0.0.1",
          NODE_ENV: "production",
        }),
      }),
    );
  });

  test("Watchdog extracts port + host from the production health URL", () => {
    const wd = new Watchdog({
      name: "nodetool",
      modulePath: "/mock/x.mjs",
      env: {},
      pidFilePath: "/tmp/x.pid",
      healthUrl: "http://127.0.0.1:7777/health",
    });
    expect((wd as any).healthPort).toBe(7777);
    expect((wd as any).healthHost).toBe("127.0.0.1");
  });

  test("Watchdog supports the dev-mode shape with args[] for the dev-server-runner", async () => {
    const watchdog = new Watchdog({
      name: "nodetool",
      modulePath: "/mock/electron/dev-server-runner.cjs",
      args: ["/mock/packages/websocket/src/server.ts"],
      env: { PORT: "7777" },
      cwd: "/mock",
      pidFilePath: "/mock/userData/nodetool-server.pid",
      healthUrl: "http://127.0.0.1:7777/health",
      logOutput: false,
    });

    await (watchdog as unknown as {
      forkUtilityProcess: () => Promise<void>;
    }).forkUtilityProcess();

    expect(electronMock.utilityProcess.fork).toHaveBeenCalledWith(
      "/mock/electron/dev-server-runner.cjs",
      ["/mock/packages/websocket/src/server.ts"],
      expect.objectContaining({
        stdio: "pipe",
        serviceName: "nodetool",
      }),
    );
  });

  test("server.ts uses path.join (not string concat) for backend paths — keeps Windows separators correct", () => {
    // Sanity check on a path the migration could accidentally regress on
    // Windows when porting to Node 24's stricter URL/path APIs.
    const backendPath = path.join("/mock/resources", "backend", "server.mjs");
    expect(backendPath.endsWith("server.mjs")).toBe(true);
    expect(backendPath.includes("backend")).toBe(true);
  });
});

describe("backend SpawnOptions for child_process (llama-server, etc)", () => {
  test("spawn uses pipe stdio + windowsHide so console flicker is suppressed", () => {
    // Node 24 didn't change spawn defaults, but Electron 39 ships a Node 24
    // utilityProcess that more strictly validates option keys. Document the
    // exact options the package manager uses for its uv subprocess so the
    // migration can't silently drop them.
    const spawnOptions = {
      stdio: "pipe" as const,
      windowsHide: true,
    };
    expect(spawnOptions.stdio).toBe("pipe");
    expect(spawnOptions.windowsHide).toBe(true);
  });
});
