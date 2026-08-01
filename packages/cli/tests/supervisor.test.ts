import { describe, expect, it, vi, beforeEach } from "vitest";

const created: Array<Record<string, unknown>> = [];

vi.mock("@nodetool-ai/models", () => ({
  Prediction: {
    create: async (row: Record<string, unknown>) => {
      created.push(row);
      return row;
    }
  }
}));

import {
  DEFAULT_SUPERVISOR_MODEL,
  parseModelSpec,
  parseSupervisorFlags,
  printSupervisedSummary,
  recordSupervisorCost
} from "../src/supervisor.js";
import type { Intervention } from "@nodetool-ai/protocol";

describe("parseSupervisorFlags", () => {
  beforeEach(() => {
    delete process.env.NODETOOL_SUPERVISOR_MODEL;
  });

  it("returns null when the run is unsupervised", () => {
    expect(parseSupervisorFlags({})).toBeNull();
  });

  it("maps every flag onto the bounds the handle is built with", () => {
    expect(
      parseSupervisorFlags({
        supervise: true,
        maxDecisions: "4",
        maxRetries: "1",
        supervisorCostCap: "0.25",
        supervisorModel: "openai/gpt-5.4-mini"
      })
    ).toEqual({
      modelSpec: "openai/gpt-5.4-mini",
      maxDecisions: 4,
      maxRetriesPerNode: 1,
      maxCostUsd: 0.25
    });
  });

  it("leaves omitted bounds unset so the kernel and agent defaults apply", () => {
    expect(parseSupervisorFlags({ supervise: true })).toEqual({
      modelSpec: DEFAULT_SUPERVISOR_MODEL
    });
  });

  it("honors NODETOOL_SUPERVISOR_MODEL when no model flag is given", () => {
    process.env.NODETOOL_SUPERVISOR_MODEL = "ollama/qwen-3.5:4b";
    expect(parseSupervisorFlags({ supervise: true })?.modelSpec).toBe(
      "ollama/qwen-3.5:4b"
    );
  });

  it("rejects bounds passed without --supervise", () => {
    expect(() => parseSupervisorFlags({ maxDecisions: "3" })).toThrow(
      /without --supervise/
    );
  });

  it("rejects non-numeric bounds", () => {
    expect(() =>
      parseSupervisorFlags({ supervise: true, maxDecisions: "lots" })
    ).toThrow(/--max-decisions/);
    expect(() =>
      parseSupervisorFlags({ supervise: true, supervisorCostCap: "-1" })
    ).toThrow(/--supervisor-cost-cap/);
  });
});

describe("parseModelSpec", () => {
  const known = (id: string) => ["anthropic", "openrouter"].includes(id);

  it("splits provider from model", () => {
    expect(parseModelSpec("anthropic/claude-sonnet-4-6", known)).toEqual({
      providerId: "anthropic",
      model: "claude-sonnet-4-6"
    });
  });

  it("keeps slashes that belong to the model id", () => {
    expect(parseModelSpec("openrouter/openai/gpt-5.4-mini", known)).toEqual({
      providerId: "openrouter",
      model: "openai/gpt-5.4-mini"
    });
  });

  it("rejects a bare model id and an unregistered provider", () => {
    expect(() => parseModelSpec("claude-sonnet-4-6", known)).toThrow(
      /<provider>\/<model>/
    );
    expect(() => parseModelSpec("nope/some-model", known)).toThrow(
      /<provider>\/<model>/
    );
  });
});

function intervention(costUsd: number | undefined): Intervention {
  return {
    escalation: {
      nodeId: "fetch",
      nodeType: "test.Fetch",
      correlationLineage: [],
      invocationKey: "",
      allowedActions: ["skip", "fail"],
      detail: "HTTP 404",
      inputs: {},
      declaredOutputs: {},
      attempt: 1,
      spentCostUsd: 0,
      createdAssets: false,
      retrySafe: false,
      emitted: false
    },
    verdict: { action: "skip" },
    decidedBy: "agent",
    ...(costUsd === undefined ? {} : { costUsd })
  };
}

describe("recordSupervisorCost", () => {
  beforeEach(() => {
    created.length = 0;
  });

  it("writes one ledger row per billable decision, tagged supervisor", async () => {
    const written = await recordSupervisorCost({
      interventions: [intervention(0.012), intervention(undefined)],
      jobId: "job-1",
      workflowId: "wf-1",
      userId: "1",
      providerId: "anthropic",
      model: "claude-sonnet-4-6"
    });

    expect(written).toBe(1);
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      user_id: "1",
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      node_id: "fetch",
      node_type: "supervisor",
      workflow_id: "wf-1",
      cost: 0.012,
      status: "completed"
    });
    expect(created[0].metadata).toMatchObject({
      kind: "supervisor",
      job_id: "job-1",
      decided_by: "agent",
      verdict: "skip"
    });
  });

  it("writes nothing when no decision cost money", async () => {
    const written = await recordSupervisorCost({
      interventions: [intervention(0)],
      jobId: "job-1",
      workflowId: null,
      userId: "1",
      providerId: "anthropic",
      model: "claude-sonnet-4-6"
    });
    expect(written).toBe(0);
    expect(created).toHaveLength(0);
  });
});

describe("printSupervisedSummary", () => {
  it("prints nothing for a run with no interventions", () => {
    const lines: string[] = [];
    printSupervisedSummary([], (line) => lines.push(line));
    expect(lines).toEqual([]);
  });

  it("prints the supervised line for a run with interventions", () => {
    const lines: string[] = [];
    printSupervisedSummary([intervention(0.01)], (line) => lines.push(line));
    expect(lines).toEqual(["⛨ supervised: 1 skipped, 1 decision, +$0.0100"]);
  });
});
