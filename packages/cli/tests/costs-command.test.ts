/**
 * Action-level tests for `nodetool costs` (src/commands/costs.ts).
 *
 * Mocks the Prediction model and the local-db bootstrap so the command's
 * aggregation, validation and output formatting are exercised without a DB.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { Command } from "commander";

const aggregateByUser = vi.fn();
const aggregateByProvider = vi.fn();
const aggregateByModel = vi.fn();
const paginate = vi.fn();

vi.mock("@nodetool-ai/models", () => ({
  Prediction: { aggregateByUser, aggregateByProvider, aggregateByModel, paginate }
}));

vi.mock("../src/commands/local-db.js", () => ({
  setupLocalDb: vi.fn().mockResolvedValue(undefined),
  LOCAL_USER_ID: "1"
}));

async function captureOutput(
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

async function buildProgram(): Promise<Command> {
  const { registerCostsCommands } = await import("../src/commands/costs.js");
  const program = new Command();
  program.exitOverride();
  registerCostsCommands(program);
  return program;
}

beforeEach(() => {
  aggregateByUser.mockReset();
  aggregateByProvider.mockReset();
  aggregateByModel.mockReset();
  paginate.mockReset();
});

describe("costs summary", () => {
  it("derives overall by summing provider aggregates, no aggregateByUser scan", async () => {
    aggregateByProvider.mockResolvedValueOnce([
      {
        provider: "openai",
        total_cost: 1.5,
        total_input_tokens: 200,
        total_output_tokens: 100,
        total_tokens: 300,
        call_count: 2
      },
      {
        provider: "anthropic",
        total_cost: 0.5,
        total_input_tokens: 50,
        total_output_tokens: 25,
        total_tokens: 75,
        call_count: 1
      }
    ]);
    aggregateByModel.mockResolvedValueOnce([]);
    const program = await buildProgram();
    const { stdout } = await captureOutput(() =>
      program.parseAsync(["node", "cli", "costs", "summary", "--json"])
    );
    const parsed = JSON.parse(stdout.trim());
    // 1.5 + 0.5 summed from the two provider rows.
    expect(parsed.overall.total_cost).toBe(2);
    expect(parsed.overall.call_count).toBe(3);
    expect(parsed.by_provider[0].provider).toBe("openai");
    expect(parsed).toHaveProperty("by_model");
    expect(aggregateByUser).not.toHaveBeenCalled();
  });
});

describe("costs list", () => {
  it("forwards --provider/--model/--limit to paginate", async () => {
    paginate.mockResolvedValueOnce([[], ""]);
    const program = await buildProgram();
    await captureOutput(() =>
      program.parseAsync([
        "node",
        "cli",
        "costs",
        "list",
        "--provider",
        "anthropic",
        "--model",
        "claude-sonnet-4-6",
        "--limit",
        "7"
      ])
    );
    expect(paginate).toHaveBeenCalledWith("1", {
      limit: 7,
      provider: "anthropic",
      model: "claude-sonnet-4-6"
    });
  });

  it("exits(1) on a non-numeric --limit before touching the DB", async () => {
    const program = await buildProgram();
    const { exitCode, stderr } = await captureOutput(() =>
      program.parseAsync(["node", "cli", "costs", "list", "--limit", "abc"])
    );
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Invalid --limit");
    expect(paginate).not.toHaveBeenCalled();
  });
});

describe("costs by-model", () => {
  it("passes the --provider filter through", async () => {
    aggregateByModel.mockResolvedValueOnce([]);
    const program = await buildProgram();
    await captureOutput(() =>
      program.parseAsync([
        "node",
        "cli",
        "costs",
        "by-model",
        "--provider",
        "openai",
        "--json"
      ])
    );
    expect(aggregateByModel).toHaveBeenCalledWith("1", { provider: "openai" });
  });
});
