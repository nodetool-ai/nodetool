import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerJtbdCommand } from "../jtbd.js";

const mocks = vi.hoisted(() => ({
  events: Array<string>(),
  buildConfiguredProviders: vi.fn(),
  createProviderStrict: vi.fn(),
  optimizeFromRun: vi.fn(),
  runJobSuite: vi.fn()
}));

vi.mock("@nodetool-ai/agents", () => ({
  JOBS_TO_BE_DONE: [
    {
      id: "job",
      difficulty: "smoke",
      surfaces: [],
      statement: "Test job",
      outcomeNames: []
    }
  ],
  optimizeFromRun: mocks.optimizeFromRun,
  runJobSuite: mocks.runJobSuite
}));

vi.mock("../../providers.js", () => ({
  buildConfiguredProviders: mocks.buildConfiguredProviders,
  createProviderStrict: mocks.createProviderStrict
}));

const originalExitCode = process.exitCode;

afterEach(() => {
  process.exitCode = originalExitCode;
});

beforeEach(() => {
  mocks.events.length = 0;
  mocks.buildConfiguredProviders.mockResolvedValue({});
  mocks.createProviderStrict.mockImplementation(async () => {
    mocks.events.push("provider");
    return {};
  });
  mocks.runJobSuite.mockImplementation(async () => {
    mocks.events.push("run");
    throw new Error("stop run");
  });
  mocks.optimizeFromRun.mockImplementation(async () => {
    mocks.events.push("optimize");
    throw new Error("stop optimize");
  });
});

function createProgram() {
  const initializeSecrets = vi.fn(async (): Promise<void> => {
    mocks.events.push("secrets");
  });
  const program = new Command();
  program.exitOverride();
  registerJtbdCommand(program, initializeSecrets);
  return { program, initializeSecrets };
}

describe("registerJtbdCommand", () => {
  it("initializes saved credentials before a JTBD run resolves its provider", async () => {
    const { program, initializeSecrets } = createProgram();

    await expect(
      program.parseAsync(
        [
          "node",
          "nodetool",
          "jtbd",
          "run",
          "--provider",
          "missing",
          "--model",
          "test"
        ],
        { from: "node" }
      )
    ).rejects.toThrow("stop run");

    expect(initializeSecrets).toHaveBeenCalledOnce();
    expect(mocks.events).toEqual(["secrets", "provider", "run"]);
  });

  it("initializes saved credentials before reviewing a JTBD bundle", async () => {
    const bundle = await mkdtemp(join(tmpdir(), "nodetool-jtbd-"));
    const runDir = join(bundle, "job");
    const { program, initializeSecrets } = createProgram();

    try {
      await mkdir(runDir);
      await writeFile(
        join(runDir, "report.json"),
        JSON.stringify({ achieved: false, friction: [], jobId: "job" })
      );

      await expect(
        program.parseAsync(
          [
            "node",
            "nodetool",
            "jtbd",
            "optimize",
            "--provider",
            "missing",
            "--model",
            "test",
            "--bundle",
            bundle
          ],
          { from: "node" }
        )
      ).rejects.toThrow("stop optimize");
    } finally {
      await rm(bundle, { recursive: true, force: true });
    }

    expect(initializeSecrets).toHaveBeenCalledOnce();
    expect(mocks.events).toEqual(["secrets", "provider", "optimize"]);
  });

  it("does not initialize saved credentials when listing JTBD jobs", async () => {
    const { program, initializeSecrets } = createProgram();

    await program.parseAsync(["node", "nodetool", "jtbd", "list"], {
      from: "node"
    });

    expect(initializeSecrets).not.toHaveBeenCalled();
  });
});
