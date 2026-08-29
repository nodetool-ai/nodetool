/**
 * `nodetool jtbd` must load the user's saved credentials before it resolves a
 * provider — otherwise a stored key is invisible and the command dies on a
 * provider it could have built.
 *
 * The collaborators arrive through `registerJtbdCommand`'s `deps` parameter, so
 * the fakes below are ordinary objects: nothing here mocks a module.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BaseProvider } from "@nodetool-ai/runtime";
import type { ErasedJob } from "@nodetool-ai/agents";
import { registerJtbdCommand, type JtbdDeps } from "../jtbd.js";

/** A job the registry would accept, doing nothing. */
const TEST_JOB: ErasedJob = {
  id: "job",
  statement: "Test job",
  surfaces: [],
  difficulty: "smoke",
  objective: "Do the test job",
  outcomeNames: [],
  start: () => ({ tools: [], grade: () => [] })
};

const originalExitCode = process.exitCode;

afterEach(() => {
  process.exitCode = originalExitCode;
});

let events: string[];

beforeEach(() => {
  events = [];
});

/**
 * The order the command touches its collaborators in is the whole assertion,
 * so every fake records itself and the run-ending ones throw: the test is about
 * what happened before the provider call, not about completing a suite.
 */
function createProgram() {
  const initializeSecrets = vi.fn(async (): Promise<void> => {
    events.push("secrets");
  });

  const deps: JtbdDeps = {
    loadAgents: async () => ({
      JOBS_TO_BE_DONE: [TEST_JOB],
      runJobSuite: async () => {
        events.push("run");
        throw new Error("stop run");
      },
      optimizeFromRun: async () => {
        events.push("optimize");
        throw new Error("stop optimize");
      },
      renderRunForReview: () => ""
    }),
    loadProviders: async () => ({
      createProviderStrict: async () => {
        events.push("provider");
        // SAFETY: the command only hands this to `runJobSuite`, which the fake
        // above throws out of before touching it.
        return {} as BaseProvider;
      },
      buildConfiguredProviders: async () => ({})
    })
  };

  const program = new Command();
  program.exitOverride();
  registerJtbdCommand(program, initializeSecrets, deps);
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
    expect(events).toEqual(["secrets", "provider", "run"]);
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
    expect(events).toEqual(["secrets", "provider", "optimize"]);
  });

  it("does not initialize saved credentials when listing JTBD jobs", async () => {
    const { program, initializeSecrets } = createProgram();

    await program.parseAsync(["node", "nodetool", "jtbd", "list"], {
      from: "node"
    });

    expect(initializeSecrets).not.toHaveBeenCalled();
  });
});
