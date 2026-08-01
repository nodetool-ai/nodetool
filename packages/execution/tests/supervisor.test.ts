/**
 * `ExecutionSessionOptions.supervisor` — the single integration point every
 * surface configures (docs/workflow-supervisor-design.md §7), plus the
 * reporting the CLI and the debug bundle print from it.
 *
 * Every verdict here comes from a scripted handle; no LLM is involved.
 */
import { describe, it, expect } from "vitest";
import type { Escalation, Intervention, Verdict } from "@nodetool-ai/protocol";
import type { DecisionOutcome, SupervisorHandle } from "@nodetool-ai/kernel";
import { ExecutionSession } from "../src/index.js";
import {
  collectExecutionSummary,
  formatInterventionLine,
  formatSupervisedSummary,
  summarizeInterventions
} from "../src/debug/index.js";

class ScriptedHandle implements SupervisorHandle {
  readonly seen: Escalation[] = [];
  closed = false;
  constructor(
    private readonly verdict: Verdict,
    private readonly costUsd = 0.01
  ) {}
  async decide(e: Escalation): Promise<DecisionOutcome> {
    this.seen.push(e);
    return { verdict: this.verdict, decidedBy: "agent", costUsd: this.costUsd };
  }
  close(): void {
    this.closed = true;
  }
}

const GRAPH = {
  nodes: [
    { id: "input", type: "test.Input", name: "x" },
    { id: "work", type: "test.Work", outputs: { value: "str" } },
    { id: "out", type: "nodetool.output.Output", name: "result" }
  ],
  edges: [
    {
      source: "input",
      sourceHandle: "value",
      target: "work",
      targetHandle: "a"
    },
    {
      source: "work",
      sourceHandle: "value",
      target: "out",
      targetHandle: "value"
    }
  ]
};

/** `work` throws; everything else echoes its inputs. */
const resolveExecutor = (node: { id: string }) =>
  node.id === "work"
    ? {
        async process(): Promise<Record<string, unknown>> {
          throw new Error("boom");
        }
      }
    : {
        async process(inputs: Record<string, unknown>) {
          return inputs;
        }
      };

async function run(supervisor?: SupervisorHandle) {
  const session = await ExecutionSession.create({
    graph: GRAPH,
    resolveExecutor,
    jobId: "supervisor-session-test",
    params: { x: "hi" },
    ...(supervisor ? { supervisor } : {})
  });
  return session.result;
}

describe("ExecutionSession — supervisor option", () => {
  it("forwards the handle so a skip verdict rescues a failing run", async () => {
    const handle = new ScriptedHandle({ action: "skip" });
    const result = await run(handle);

    expect(handle.seen).toHaveLength(1);
    expect(handle.seen[0]?.nodeId).toBe("work");
    expect(result.status).toBe("completed");
    expect(result.interventions).toHaveLength(1);
    expect(result.interventions?.[0]?.verdict.action).toBe("skip");
    expect(result.interventions?.[0]?.decidedBy).toBe("agent");
    expect(result.interventions?.[0]?.costUsd).toBeCloseTo(0.01);
  });

  it("a run without a supervisor is unchanged", async () => {
    const bare = await run();
    // No handle configured: nothing escalates, no interventions are recorded,
    // and the failure is the same failure as before supervision existed.
    expect(bare.status).toBe("failed");
    expect(bare.interventions).toBeUndefined();
    expect(
      (bare.messages ?? []).some((m) => m.type.startsWith("supervisor_"))
    ).toBe(false);
  });

  it("leaves the message stream of an unsupervised run byte-identical", async () => {
    const strip = (result: Awaited<ReturnType<typeof run>>) =>
      (result.messages ?? []).map((m) => m.type);

    const first = await run();
    const second = await run();
    expect(strip(first)).toEqual(strip(second));
  });
});

describe("interventions in the debug summary", () => {
  it("folds supervisor_decision messages into the shared summary", async () => {
    const result = await run(new ScriptedHandle({ action: "skip" }));
    const summary = collectExecutionSummary(result.messages ?? []);

    expect(summary.counts.interventions).toBe(1);
    expect(summary.interventions[0]?.escalation.nodeId).toBe("work");
    expect(summary.interventions[0]?.verdict.action).toBe("skip");
    expect(summary.interventions[0]?.decidedBy).toBe("agent");
  });

  it("reports no interventions for an unsupervised run", async () => {
    const result = await run();
    const summary = collectExecutionSummary(result.messages ?? []);
    expect(summary.interventions).toEqual([]);
    expect(summary.counts.interventions).toBe(0);
  });
});

describe("intervention reporting", () => {
  const intervention = (
    over: Partial<Intervention> = {},
    escalation: Partial<Escalation> = {}
  ): Intervention => ({
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
      emitted: false,
      ...escalation
    },
    verdict: { action: "skip" },
    decidedBy: "agent",
    costUsd: 0.01,
    ...over
  });

  it("rolls up actions, deciders and cost", () => {
    const summary = summarizeInterventions([
      intervention(),
      intervention({ verdict: { action: "retry" }, decidedBy: "sticky" }),
      intervention({ verdict: { action: "fail" }, costUsd: undefined })
    ]);
    expect(summary.decisions).toBe(3);
    expect(summary.agentDecisions).toBe(2);
    expect(summary.byAction.skip).toBe(1);
    expect(summary.byAction.retry).toBe(1);
    expect(summary.byDecider.sticky).toBe(1);
    expect(summary.costUsd).toBeCloseTo(0.02);
  });

  it("prints one shield line per decision, with the item key when there is one", () => {
    const line = formatInterventionLine(
      intervention({}, { invocationKey: "3" })
    );
    expect(line).toContain("⛨");
    expect(line).toContain("fetch [3]");
    expect(line).toContain("skipped");
    expect(line).toContain("HTTP 404");
    expect(line).toContain("agent");
  });

  it("prints a supervised summary line, with item counts when known", () => {
    const summary = summarizeInterventions([intervention(), intervention()]);
    expect(formatSupervisedSummary(summary)).toBe(
      "⛨ supervised: 2 skipped, 2 decisions, +$0.0200"
    );
    expect(
      formatSupervisedSummary(summary, { total: 200, produced: 198 })
    ).toContain("198/200 items");
  });
});
