/**
 * `nodetool projects migrate --yes` (src/commands/projects.ts): the exit code
 * and the message when the migration could not finish.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";

const runMigrationToEnd = vi.fn();
const getMigrationStatus = vi.fn();
const readMigrationStatus = vi.fn();
const buildMigrationPlan = vi.fn();

vi.mock("@nodetool-ai/cli-local/local-db", () => ({
  LOCAL_USER_ID: "1",
  setupLocalDb: vi.fn(async () => undefined)
}));

vi.mock("@nodetool-ai/project-services/project-folder-migration", () => ({
  runMigrationToEnd,
  buildMigrationPlan,
  getMigrationStatus,
  readMigrationStatus
}));

const { registerProjectCommands } = await import("../src/commands/projects.js");

function status(state: string, done: number, total: number) {
  return {
    applies: true,
    state,
    location: "/projects",
    progress: { done, total, phase: null, current_project: null },
    failures: [],
    failure_count: 0,
    dismissed: false
  };
}

async function migrate(...args: string[]): Promise<{ out: string; err: string }> {
  return command("--yes", ...args);
}

async function command(...args: string[]): Promise<{ out: string; err: string }> {
  const out: string[] = [];
  const err: string[] = [];
  vi.spyOn(console, "log").mockImplementation((line: unknown) => {
    out.push(String(line));
  });
  vi.spyOn(console, "error").mockImplementation((line: unknown) => {
    err.push(String(line));
  });
  const program = new Command();
  registerProjectCommands(program);
  await program.parseAsync(["node", "nodetool", "projects", "migrate", ...args]);
  return { out: out.join("\n"), err: err.join("\n") };
}

afterEach(() => {
  process.exitCode = undefined;
  vi.restoreAllMocks();
  runMigrationToEnd.mockReset();
  getMigrationStatus.mockReset();
  readMigrationStatus.mockReset();
  buildMigrationPlan.mockReset();
});

describe("nodetool projects migrate --yes", () => {
  it("exits with 0 when the migration is done", async () => {
    runMigrationToEnd.mockResolvedValue(status("done", 1, 1));

    const { out } = await migrate();

    expect(out).toContain("done: 1 of 1 files moved");
    expect(process.exitCode).toBeUndefined();
  });

  it("exits with 1 and says to run again while files still wait", async () => {
    runMigrationToEnd.mockResolvedValue(status("confirmed", 0, 1));

    const { err } = await migrate();

    expect(err).toMatch(/run .*again/i);
    expect(process.exitCode).toBe(1);
  });

  it("exits with 1 for an unfinished migration with --json", async () => {
    runMigrationToEnd.mockResolvedValue(status("confirmed", 0, 1));

    await migrate("--json");

    expect(process.exitCode).toBe(1);
  });
});

describe("nodetool projects migrate", () => {
  it("previews with a status read that changes nothing", async () => {
    buildMigrationPlan.mockResolvedValue({
      projects: 1,
      assets: 1,
      workflows: 0,
      timelines: 0,
      extra_workspaces: [],
      location: { path: "/projects", is_default: true, permission_prompt: false, error: null }
    });
    readMigrationStatus.mockResolvedValue(status("not_started", 0, 0));

    await command("--json");

    expect(readMigrationStatus).toHaveBeenCalled();
    expect(getMigrationStatus).not.toHaveBeenCalled();
    expect(runMigrationToEnd).not.toHaveBeenCalled();
  });

  it("exits with 1 when a finished migration lists failures", async () => {
    runMigrationToEnd.mockResolvedValue({ ...status("done", 1, 2), failure_count: 1 });

    await migrate("--json");

    expect(process.exitCode).toBe(1);
  });
});
