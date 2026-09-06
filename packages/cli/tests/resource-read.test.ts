/**
 * Action-level tests for `workflows|jobs|assets list|get`
 * (src/commands/resource-read.ts).
 *
 * Two properties these commands used to get wrong:
 *  - `--json` emitted whatever shape the chosen source happened to have, so the
 *    key set changed depending on whether NODETOOL_API_URL was set.
 *  - a failure printed `String(e)` to stderr and nothing to stdout, so an agent
 *    running with `--json` had nothing to parse.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { Command } from "commander";

const workflowPaginate = vi.fn();
const workflowFind = vi.fn();
const jobPaginate = vi.fn();
const jobFind = vi.fn();
const assetPaginate = vi.fn();
const assetFind = vi.fn();

vi.mock("@nodetool-ai/models", () => ({
  Workflow: { paginate: workflowPaginate, find: workflowFind },
  Job: { paginate: jobPaginate, find: jobFind },
  Asset: { paginate: assetPaginate, find: assetFind }
}));

const remoteClient = {
  workflows: { list: { query: vi.fn() }, get: { query: vi.fn() } },
  jobs: { list: { query: vi.fn() }, get: { query: vi.fn() } },
  assets: { list: { query: vi.fn() }, get: { query: vi.fn() } }
};

vi.mock("../src/api-client.js", () => ({
  createApiClient: () => remoteClient
}));

async function capture(
  fn: () => Promise<void> | void
): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  let stdout = "";
  let stderr = "";
  let exitCode: number | null = null;
  const origLog = console.log;
  const origErr = console.error;
  const origExit = process.exit;
  console.log = (...args: unknown[]) => {
    stdout += args.map(String).join(" ") + "\n";
  };
  console.error = (...args: unknown[]) => {
    stderr += args.map(String).join(" ") + "\n";
  };
  process.exit = ((code?: number) => {
    exitCode = code ?? 0;
    throw new Error(`__EXIT__${code ?? 0}`);
  }) as typeof process.exit;
  try {
    await fn();
  } catch (e) {
    if (!(e instanceof Error) || !e.message.startsWith("__EXIT__")) throw e;
  } finally {
    console.log = origLog;
    console.error = origErr;
    process.exit = origExit;
  }
  return { stdout, stderr, exitCode };
}

const ensureDb = vi.fn();

async function run(argv: string[]): ReturnType<typeof capture> {
  const { registerResourceReadCommands } = await import(
    "../src/commands/resource-read.js"
  );
  const program = new Command();
  program.exitOverride();
  const parents = {
    workflows: program.command("workflows"),
    jobs: program.command("jobs"),
    assets: program.command("assets")
  };
  registerResourceReadCommands(parents, { ensureDb, localUserId: "1" });
  return capture(() => program.parseAsync(argv, { from: "user" }));
}

/** A row as the local Drizzle model hands it back: every column, blobs included. */
const localJob = {
  id: "j1",
  user_id: "1",
  job_type: "workflow",
  workflow_id: "w1",
  status: "completed",
  name: "nightly",
  graph: { nodes: [], edges: [] },
  logs: [{ line: "hi" }],
  worker_id: null,
  heartbeat_at: null,
  started_at: "2024-01-01T00:00:00Z",
  finished_at: "2024-01-01T00:01:00Z",
  completed_at: "2024-01-01T00:01:00Z",
  failed_at: null,
  error: null,
  error_message: null,
  cost: 0.5,
  retry_count: 0,
  max_retries: 3,
  version: 0,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:01:00Z"
};

/** The same job as the server's `jobResponse` schema declares it. */
const remoteJob = {
  id: "j1",
  user_id: "1",
  job_type: "workflow",
  status: "completed",
  name: "nightly",
  workflow_id: "w1",
  started_at: "2024-01-01T00:00:00Z",
  finished_at: "2024-01-01T00:01:00Z",
  error: null,
  cost: 0.5
};

beforeEach(() => {
  vi.resetModules();
  delete process.env["NODETOOL_API_URL"];
  ensureDb.mockReset();
  for (const fn of [
    workflowPaginate,
    workflowFind,
    jobPaginate,
    jobFind,
    assetPaginate,
    assetFind
  ]) {
    fn.mockReset();
  }
  remoteClient.jobs.list.query.mockReset();
  remoteClient.jobs.get.query.mockReset();
  remoteClient.workflows.get.query.mockReset();
  remoteClient.assets.get.query.mockReset();
});

describe("--json emits one row shape regardless of source", () => {
  it("jobs list agrees between the local database and a server", async () => {
    jobPaginate.mockResolvedValue([[localJob], null]);
    const local = await run(["jobs", "list", "--json"]);

    remoteClient.jobs.list.query.mockResolvedValue({ jobs: [remoteJob] });
    const remote = await run(["jobs", "list", "--json", "--api-url", "http://x"]);

    const localRows = JSON.parse(local.stdout) as Record<string, unknown>[];
    const remoteRows = JSON.parse(remote.stdout) as Record<string, unknown>[];
    expect(Object.keys(localRows[0]!).sort()).toEqual(
      Object.keys(remoteRows[0]!).sort()
    );
    expect(localRows[0]).toEqual(remoteRows[0]);
  });

  it("jobs list --json drops the local graph and logs blobs", async () => {
    jobPaginate.mockResolvedValue([[localJob], null]);
    const { stdout } = await run(["jobs", "list", "--json"]);
    const rows = JSON.parse(stdout) as Record<string, unknown>[];
    expect(rows[0]).not.toHaveProperty("graph");
    expect(rows[0]).not.toHaveProperty("logs");
    expect(rows[0]!["status"]).toBe("completed");
  });

  it("workflows get --json keeps the graph", async () => {
    workflowFind.mockResolvedValue({
      id: "w1",
      user_id: "1",
      name: "demo",
      description: "d",
      graph: { nodes: [{ id: "n1" }], edges: [] },
      updated_at: "2024-01-01T00:00:00Z"
    });
    const { stdout } = await run(["workflows", "get", "w1", "--json"]);
    const doc = JSON.parse(stdout) as Record<string, unknown>;
    expect(doc["graph"]).toEqual({ nodes: [{ id: "n1" }], edges: [] });
    expect(doc).not.toHaveProperty("user_id");
  });
});

describe("failures are reported in the format the caller asked for", () => {
  it("puts a parseable error on stdout under --json and exits 1", async () => {
    jobPaginate.mockRejectedValue(new Error("database is locked"));
    const { stdout, stderr, exitCode } = await run(["jobs", "list", "--json"]);
    expect(exitCode).toBe(1);
    expect(JSON.parse(stdout)).toEqual({ error: "database is locked" });
    expect(stderr).toContain("database is locked");
  });

  it("prints the message without the Error: prefix on the table path", async () => {
    jobFind.mockResolvedValue(null);
    const { stderr, exitCode } = await run(["jobs", "get", "j9"]);
    expect(exitCode).toBe(1);
    expect(stderr.trim()).toBe("Job not found: j9");
  });
});

describe("assets get", () => {
  it("does not print a url column no source can fill", async () => {
    assetFind.mockResolvedValue({
      id: "a1",
      user_id: "1",
      name: "pic.png",
      content_type: "image/png",
      size: 12,
      created_at: "2024-01-01T00:00:00Z"
    });
    const { stdout } = await run(["assets", "get", "a1"]);
    expect(stdout).toContain("pic.png");
    expect(stdout).not.toContain("url");
  });
});
