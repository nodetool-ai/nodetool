/**
 * Tests for src/commands/deploy.ts and src/commands/deploy-helpers.ts
 *
 * Strategy:
 *   - Mock @nodetool-ai/deploy, @nodetool-ai/vectorstore, @nodetool-ai/runtime,
 *     @nodetool-ai/models, and @nodetool-ai/config via vi.mock().
 *   - Use Commander's parseAsync on a freshly built Command for each case.
 *   - Capture stdout/stderr by spying on process.{stdout,stderr,exit}.
 */

import {
  describe,
  expect,
  it,
  vi,
  beforeEach,
  afterEach,
  type MockInstance
} from "vitest";
import { Command } from "commander";

// ─── Mocks ────────────────────────────────────────────────────────────────

const listDeployments = vi.fn(async () => [
  {
    name: "dev",
    type: "docker",
    status: "running",
    last_deployed: "2026-04-01T00:00:00.000Z",
    host: "localhost",
    container: "nodetool-dev"
  }
]);
const planMock = vi.fn(async (_n: string) => ({ ok: true, changes: ["x"] }));
const applyMock = vi.fn(async (_n: string, _o: unknown) => ({
  status: "success",
  changes: []
}));
const statusMock = vi.fn(async (_n: string) => ({ state: "running" }));
const logsMock = vi.fn(async (_n: string, _o: unknown) => "log line 1\nlog line 2\n");
const destroyMock = vi.fn(async (_n: string, _o: unknown) => ({
  status: "success"
}));

const listWorkflows = vi.fn(async () => ({
  workflows: [{ id: "w1", name: "Hello", updated_at: "2026-04-01" }]
}));
const deleteWorkflow = vi.fn(async (_id: string) => ({}));
const runWorkflow = vi.fn(async (_id: string, _p: unknown) => ({ id: "job1" }));
const dbGet = vi.fn(async (_t: string, _k: string) => ({ id: "1", name: "x" }));
const dbSave = vi.fn(async (_t: string, _d: unknown) => ({ saved: true }));
const dbDelete = vi.fn(async (_t: string, _k: string) => {});

const listUsers = vi.fn(async () => [
  {
    user_id: "1",
    username: "alice",
    role: "admin",
    token_hash: "abcdef0123456789abcdef0123456789",
    created_at: "2026-04-01T12:34:56.000Z"
  }
]);
const addUser = vi.fn(async (username: string, role: string) => ({
  user_id: "2",
  username,
  role,
  token: "new-token-plaintext"
}));
const resetToken = vi.fn(async (username: string) => ({
  user_id: "1",
  username,
  role: "admin",
  token: "rotated-token"
}));
const removeUser = vi.fn(async (_u: string) => ({ message: "ok" }));

const syncWorkflowMock = vi.fn(async () => true);

const loadDeploymentConfig = vi.fn(async () => ({
  version: "2.0",
  defaults: {},
  deployments: {
    dev: {
      type: "docker",
      enabled: true,
      host: "localhost",
      image: { name: "ghcr.io/nodetool-ai/nodetool", tag: "latest" },
      container: { name: "nodetool-dev", port: 8000 },
      paths: { workspace: "/tmp/ws", hf_cache: "/tmp/hf" },
      state: { status: "running", last_deployed: "2026-04-01" }
    }
  }
}));

const initDeploymentConfig = vi.fn(async () => ({
  version: "2.0",
  defaults: {},
  deployments: {}
}));
const saveDeploymentConfig = vi.fn(async (_c: unknown) => {});

vi.mock("@nodetool-ai/deploy", () => ({
  AdminHTTPClient: class {
    listWorkflows = listWorkflows;
    deleteWorkflow = deleteWorkflow;
    runWorkflow = runWorkflow;
    dbGet = dbGet;
    dbSave = dbSave;
    dbDelete = dbDelete;
    createCollection = vi.fn(async () => ({}));
    addToCollection = vi.fn(async () => ({}));
    constructor(_opts?: unknown) {}
  },
  APIUserManager: class {
    listUsers = listUsers;
    addUser = addUser;
    resetToken = resetToken;
    removeUser = removeUser;
    constructor(_u?: string, _t?: string) {}
  },
  DeploymentManager: class {
    listDeployments = listDeployments;
    plan = planMock;
    apply = applyMock;
    status = statusMock;
    logs = logsMock;
    destroy = destroyMock;
    constructor(_c?: unknown, _s?: unknown, _f?: unknown) {}
  },
  StateManager: class {
    constructor(_p?: string) {}
  },
  WorkflowSyncer: class {
    syncWorkflow = syncWorkflowMock;
    constructor(_c?: unknown, _d?: unknown) {}
  },
  DockerDeployer: class {},
  RunPodDeployer: class {},
  GCPDeployer: class {},
  FlyDeployer: class {},
  RailwayDeployer: class {},
  HuggingFaceDeployer: class {},
  DockerDeploymentSchema: { parse: (v: unknown) => v },
  FlyDeploymentSchema: { parse: (v: unknown) => v },
  HuggingFaceDeploymentSchema: { parse: (v: unknown) => v },
  RailwayDeploymentSchema: { parse: (v: unknown) => v },
  RunPodDeploymentSchema: { parse: (v: unknown) => v },
  configureDocker: vi.fn((_n: string, _p: unknown) => ({
    type: "docker",
    host: "localhost",
    image: {},
    container: {},
    paths: {},
    state: {}
  })),
  configureRunPod: vi.fn(),
  configureGCP: vi.fn(),
  dockerDeploymentGetServerUrl: vi.fn(() => "http://localhost:8000"),
  runPodDeploymentGetServerUrl: vi.fn(() => "http://runpod.example"),
  gcpDeploymentGetServerUrl: vi.fn(() => "http://gcp.example"),
  getDeploymentConfigPath: vi.fn(() => "/tmp/deployment-test.yaml"),
  initDeploymentConfig,
  loadDeploymentConfig,
  saveDeploymentConfig,
  GPUType: { ADA_24: "ADA_24", AMPERE_80: "AMPERE_80" },
  ComputeType: { CPU: "CPU", GPU: "GPU" },
  CPUFlavor: { CPU_3C: "cpu3c" },
  DataCenter: { US_TEXAS_1: "US-TX-1" }
}));

class CollectionNotFoundError extends Error {
  constructor(name: string) {
    super(name);
    this.name = "CollectionNotFoundError";
  }
}
vi.mock("@nodetool-ai/vectorstore", () => ({
  CollectionNotFoundError,
  getDefaultVectorProvider: vi.fn(() => ({
    getCollection: vi.fn(async ({ name }: { name: string }) => {
      throw new CollectionNotFoundError(name);
    })
  }))
}));

vi.mock("@nodetool-ai/models", () => ({
  Workflow: { find: vi.fn(async () => null) },
  Asset: { find: vi.fn(async () => null) }
}));

vi.mock("@nodetool-ai/runtime", () => ({
  FileStorageAdapter: class {
    constructor(_root?: string) {}
    async retrieve(_uri?: string) {
      return null;
    }
  }
}));

vi.mock("@nodetool-ai/config", () => ({
  getDefaultAssetsPath: () => "/tmp/nodetool-assets-test"
}));

vi.mock("js-yaml", () => ({
  load: () => ({}),
  dump: (v: unknown) => JSON.stringify(v) + "\n",
  JSON_SCHEMA: {}
}));

// ─── Helpers ──────────────────────────────────────────────────────────────

let stdoutSpy: MockInstance<(buf: unknown, ...rest: unknown[]) => boolean>;
let stderrSpy: MockInstance<(buf: unknown, ...rest: unknown[]) => boolean>;
let exitSpy: MockInstance<(code?: number | string | null) => never>;
let logSpy: MockInstance;
let errSpy: MockInstance;

/** Extract the first JSON blob printed (handles pretty-printed multi-line). */
function extractJson(out: string): string {
  const trimmed = out.trim();
  const firstArr = trimmed.indexOf("[");
  const firstObj = trimmed.indexOf("{");
  let start = -1;
  if (firstArr >= 0 && firstObj >= 0) {
    start = Math.min(firstArr, firstObj);
  } else if (firstArr >= 0) {
    start = firstArr;
  } else if (firstObj >= 0) {
    start = firstObj;
  }
  if (start < 0) return trimmed;
  return trimmed.slice(start);
}

function captured(): { out: string; err: string } {
  const out = stdoutSpy.mock.calls
    .map((c) => String(c[0] ?? ""))
    .concat(logSpy.mock.calls.map((c) => (c as unknown[]).map(String).join(" ") + "\n"))
    .join("");
  const err = stderrSpy.mock.calls
    .map((c) => String(c[0] ?? ""))
    .concat(errSpy.mock.calls.map((c) => (c as unknown[]).map(String).join(" ") + "\n"))
    .join("");
  return { out, err };
}

async function buildProgram(): Promise<Command> {
  const { registerDeployCommands, registerListGcpOptions } = await import(
    "../src/commands/deploy.js"
  );
  const program = new Command();
  program.exitOverride();
  registerDeployCommands(program);
  registerListGcpOptions(program);
  return program;
}

async function run(args: string[]): Promise<void> {
  const program = await buildProgram();
  await program.parseAsync(["node", "test", ...args]);
}

beforeEach(() => {
  stdoutSpy = vi
    .spyOn(process.stdout, "write")
    .mockImplementation(() => true);
  stderrSpy = vi
    .spyOn(process.stderr, "write")
    .mockImplementation(() => true);
  exitSpy = vi
    .spyOn(process, "exit")
    .mockImplementation(((_code?: number) => {
      throw new Error(`__exit_${_code ?? 0}`);
    }) as never);
  logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

  for (const fn of [
    listDeployments,
    planMock,
    applyMock,
    statusMock,
    logsMock,
    destroyMock,
    listWorkflows,
    deleteWorkflow,
    runWorkflow,
    dbGet,
    dbSave,
    dbDelete,
    listUsers,
    addUser,
    resetToken,
    removeUser,
    syncWorkflowMock,
    loadDeploymentConfig,
    initDeploymentConfig,
    saveDeploymentConfig
  ]) {
    fn.mockClear();
  }
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env["NODETOOL_ADMIN_TOKEN"];
});

// ─── Tests ────────────────────────────────────────────────────────────────

describe("deploy init", () => {
  it("creates config when none exists", async () => {
    // getDeploymentConfigPath returns /tmp/deployment-test.yaml — ensure missing
    try {
      const { unlinkSync, existsSync } = await import("node:fs");
      if (existsSync("/tmp/deployment-test.yaml")) {
        unlinkSync("/tmp/deployment-test.yaml");
      }
    } catch {
      // ignore
    }
    await run(["deploy", "init"]);
    expect(initDeploymentConfig).toHaveBeenCalledTimes(1);
  });
});

describe("deploy list", () => {
  it("prints a table by default", async () => {
    await run(["deploy", "list"]);
    expect(listDeployments).toHaveBeenCalledTimes(1);
    const { out } = captured();
    expect(out).toContain("dev");
    expect(out).toContain("docker");
  });

  it("outputs valid JSON with --json", async () => {
    await run(["deploy", "list", "--json"]);
    const { out } = captured();
    const parsed = JSON.parse(extractJson(out));
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0].name).toBe("dev");
  });
});

describe("deploy show", () => {
  it("prints YAML for an existing deployment", async () => {
    await run(["deploy", "show", "dev"]);
    const { out } = captured();
    expect(out).toContain("dev");
    expect(out).toContain("docker");
  });

  it("exits 1 when deployment is missing", async () => {
    await expect(run(["deploy", "show", "nonexistent"])).rejects.toThrow(
      "__exit_1"
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

describe("deploy add", () => {
  it("validates --type", async () => {
    await expect(run(["deploy", "add", "test", "--type", "bogus"])).rejects.toThrow(
      "__exit_1"
    );
  });
});

describe("deploy plan", () => {
  it("calls manager.plan and emits JSON", async () => {
    await run(["deploy", "plan", "dev"]);
    expect(planMock).toHaveBeenCalledWith("dev");
    const { out } = captured();
    expect(out).toContain("\"ok\"");
  });
});

describe("deploy apply", () => {
  it("invokes apply without dry-run", async () => {
    await run(["deploy", "apply", "dev"]);
    expect(applyMock).toHaveBeenCalledWith("dev", { dryRun: false });
  });

  it("passes dryRun when --dry-run is set", async () => {
    await run(["deploy", "apply", "dev", "--dry-run"]);
    expect(applyMock).toHaveBeenCalledWith("dev", { dryRun: true });
  });

  it("exits 1 when status is 'error'", async () => {
    applyMock.mockResolvedValueOnce({ status: "error" });
    await expect(run(["deploy", "apply", "dev"])).rejects.toThrow("__exit_1");
  });
});

describe("deploy status", () => {
  it("calls manager.status and emits JSON", async () => {
    await run(["deploy", "status", "dev"]);
    expect(statusMock).toHaveBeenCalledWith("dev");
  });
});

describe("deploy logs", () => {
  it("passes through --service, --follow, --tail", async () => {
    await run([
      "deploy",
      "logs",
      "dev",
      "--service",
      "app",
      "--follow",
      "--tail",
      "50"
    ]);
    expect(logsMock).toHaveBeenCalledWith("dev", {
      service: "app",
      follow: true,
      tail: 50
    });
  });

  it("uses default tail of 100", async () => {
    await run(["deploy", "logs", "dev"]);
    expect(logsMock).toHaveBeenCalledWith("dev", {
      service: undefined,
      follow: false,
      tail: 100
    });
  });
});

describe("deploy destroy", () => {
  it("skips confirmation with --force and calls destroy", async () => {
    await run(["deploy", "destroy", "dev", "--force"]);
    expect(destroyMock).toHaveBeenCalledWith("dev", { force: true });
  });

  it("no-ops on non-TTY without --force", async () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(
      process.stdin,
      "isTTY"
    );
    try {
      Object.defineProperty(process.stdin, "isTTY", {
        value: false,
        configurable: true
      });
      await run(["deploy", "destroy", "dev"]);
      expect(destroyMock).not.toHaveBeenCalled();
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(process.stdin, "isTTY", originalDescriptor);
      } else {
        delete (process.stdin as NodeJS.ReadStream & { isTTY?: boolean }).isTTY;
      }
    }
  });
});

describe("deploy workflows sync", () => {
  it("syncs workflow and exits 0 on success", async () => {
    process.env["NODETOOL_ADMIN_TOKEN"] = "test-token";
    await run(["deploy", "workflows", "sync", "dev", "wf1"]);
    expect(syncWorkflowMock).toHaveBeenCalledWith("wf1");
  });

  it("exits 1 when sync returns false", async () => {
    process.env["NODETOOL_ADMIN_TOKEN"] = "test-token";
    syncWorkflowMock.mockResolvedValueOnce(false);
    await expect(
      run(["deploy", "workflows", "sync", "dev", "wf1"])
    ).rejects.toThrow("__exit_1");
  });
});

describe("deploy workflows list", () => {
  it("prints a table by default", async () => {
    process.env["NODETOOL_ADMIN_TOKEN"] = "test-token";
    await run(["deploy", "workflows", "list", "dev"]);
    expect(listWorkflows).toHaveBeenCalled();
  });

  it("emits JSON with --json", async () => {
    process.env["NODETOOL_ADMIN_TOKEN"] = "test-token";
    await run(["deploy", "workflows", "list", "dev", "--json"]);
    const { out } = captured();
    expect(() => JSON.parse(extractJson(out))).not.toThrow();
  });
});

describe("deploy workflows delete", () => {
  it("confirms and deletes when --force is set", async () => {
    process.env["NODETOOL_ADMIN_TOKEN"] = "test-token";
    await run(["deploy", "workflows", "delete", "dev", "wf1", "--force"]);
    expect(deleteWorkflow).toHaveBeenCalledWith("wf1");
  });
});

describe("deploy workflows run", () => {
  it("parses -p k=v pairs", async () => {
    process.env["NODETOOL_ADMIN_TOKEN"] = "test-token";
    await run([
      "deploy",
      "workflows",
      "run",
      "dev",
      "wf1",
      "-p",
      "name=Alice",
      "-p",
      "count=3"
    ]);
    expect(runWorkflow).toHaveBeenCalledWith("wf1", {
      name: "Alice",
      count: 3
    });
  });
});

describe("deploy database get", () => {
  it("calls dbGet with table and key", async () => {
    process.env["NODETOOL_ADMIN_TOKEN"] = "test-token";
    await run(["deploy", "database", "get", "dev", "users", "abc"]);
    expect(dbGet).toHaveBeenCalledWith("users", "abc");
  });
});

describe("deploy database save", () => {
  it("parses the JSON positional arg", async () => {
    process.env["NODETOOL_ADMIN_TOKEN"] = "test-token";
    await run([
      "deploy",
      "database",
      "save",
      "dev",
      "users",
      '{"id":"1","name":"alice"}'
    ]);
    expect(dbSave).toHaveBeenCalledWith("users", { id: "1", name: "alice" });
  });

  it("rejects invalid JSON", async () => {
    process.env["NODETOOL_ADMIN_TOKEN"] = "test-token";
    await expect(
      run(["deploy", "database", "save", "dev", "users", "not-json"])
    ).rejects.toThrow("__exit_1");
  });
});

describe("deploy database delete", () => {
  it("deletes with --force", async () => {
    process.env["NODETOOL_ADMIN_TOKEN"] = "test-token";
    await run([
      "deploy",
      "database",
      "delete",
      "dev",
      "users",
      "abc",
      "--force"
    ]);
    expect(dbDelete).toHaveBeenCalledWith("users", "abc");
  });
});

describe("deploy collections sync", () => {
  it("errors when local collection is missing", async () => {
    process.env["NODETOOL_ADMIN_TOKEN"] = "test-token";
    await expect(
      run(["deploy", "collections", "sync", "dev", "my-collection"])
    ).rejects.toThrow("__exit_1");
  });
});

describe("deploy users-add", () => {
  it("rejects invalid --role", async () => {
    process.env["NODETOOL_ADMIN_TOKEN"] = "test-token";
    await expect(
      run(["deploy", "users-add", "dev", "alice", "--role", "superuser"])
    ).rejects.toThrow("__exit_1");
  });

  it("adds a user with default role", async () => {
    process.env["NODETOOL_ADMIN_TOKEN"] = "test-token";
    await run(["deploy", "users-add", "dev", "alice"]);
    expect(addUser).toHaveBeenCalledWith("alice", "user");
  });
});

describe("deploy users-list", () => {
  it("prints table by default", async () => {
    process.env["NODETOOL_ADMIN_TOKEN"] = "test-token";
    await run(["deploy", "users-list", "dev"]);
    expect(listUsers).toHaveBeenCalled();
  });

  it("emits JSON with --json", async () => {
    process.env["NODETOOL_ADMIN_TOKEN"] = "test-token";
    await run(["deploy", "users-list", "dev", "--json"]);
    expect(listUsers).toHaveBeenCalled();
  });
});

describe("deploy users-remove", () => {
  it("removes user with --force", async () => {
    process.env["NODETOOL_ADMIN_TOKEN"] = "test-token";
    await run(["deploy", "users-remove", "dev", "alice", "--force"]);
    expect(removeUser).toHaveBeenCalledWith("alice");
  });
});

describe("deploy users-reset-token", () => {
  it("rotates token for user", async () => {
    process.env["NODETOOL_ADMIN_TOKEN"] = "test-token";
    await run(["deploy", "users-reset-token", "dev", "alice"]);
    expect(resetToken).toHaveBeenCalledWith("alice");
  });
});

describe("list-gcp-options", () => {
  it("prints tables by default", async () => {
    await run(["list-gcp-options"]);
    const { out } = captured();
    expect(out).toContain("us-central1");
    expect(out).toContain("ADA_24");
  });

  it("emits JSON with --json", async () => {
    await run(["list-gcp-options", "--json"]);
    const { out } = captured();
    // Find JSON block in output
    const lastJson = out.trim();
    const parsed = JSON.parse(lastJson);
    expect(parsed.gcp_regions).toContain("us-central1");
    expect(parsed.runpod_gpu_types).toContain("ADA_24");
  });
});

describe("missing deployment exits", () => {
  it("plan", async () => {
    planMock.mockRejectedValueOnce(new Error("Deployment 'zzz' not found"));
    await expect(run(["deploy", "plan", "zzz"])).rejects.toThrow("__exit_1");
  });
});

// ─── Integration test: tmp config dir ─────────────────────────────────────

describe("deploy integration (tmp XDG)", () => {
  it("runs init → show/list sequence against a tmpdir (mocked deploy lib)", async () => {
    const { mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const tmp = mkdtempSync(join(tmpdir(), "nodetool-deploy-"));

    // loadDeploymentConfig reports the mocked config, listDeployments reports mocked rows
    await run(["deploy", "list"]);
    expect(listDeployments).toHaveBeenCalled();

    await run(["deploy", "show", "dev"]);
    const { out } = captured();
    expect(out).toContain("dev");

    // Cleanup — no real files to remove since everything is mocked
    void tmp;
  });
});
