/**
 * The friction deriver is the half of the optimization loop that runs without a
 * model, so it is the half a test can pin. Each case here asserts both that a
 * signal fires and *who it blames* — sending a harness finding to the prompt is
 * the failure mode that wastes an optimizer round, and it is silent.
 */

import { describe, expect, it } from "vitest";
import { deriveFriction } from "../src/jtbd/friction.js";
import { defineJob, DEFAULT_JOB_SYSTEM_PROMPT } from "../src/jtbd/run.js";
import { JOBS_TO_BE_DONE, findJob } from "../src/jtbd/registry.js";
import { parseProposals, renderRunForReview } from "../src/jtbd/optimize.js";
import type { ToolLoopCallRecord } from "../src/app-build/tool-loop.js";
import type { JobRunReport } from "../src/jtbd/types.js";

const call = (
  over: Partial<ToolLoopCallRecord> & { name: string; index: number }
): ToolLoopCallRecord => ({
  args: {},
  result: "ok",
  isError: false,
  durationMs: 1,
  ...over
});

const derive = (calls: ToolLoopCallRecord[], achieved = true) =>
  deriveFriction({ job: {}, toolCalls: calls, achieved });

describe("deriveFriction", () => {
  it("blames the harness when one tool errors repeatedly", () => {
    const signals = derive([
      call({ name: "ui_add_node", index: 0, isError: true, result: { error: "bad type" } }),
      call({ name: "ui_add_node", index: 1, isError: true, result: { error: "bad type" } })
    ]);
    const signal = signals.find((s) => s.kind === "repeated-tool-error");
    expect(signal?.owner).toBe("harness");
    expect(signal?.severity).toBe("blocking");
    expect(signal?.tool).toBe("ui_add_node");
    // The verbatim error must survive into the evidence — an optimizer shown
    // only our summary is diagnosing the summary.
    expect(signal?.evidence).toContain("bad type");
  });

  it("does not fire on a single error — one bad call is a slip", () => {
    const signals = derive([
      call({ name: "ui_add_node", index: 0, isError: true, result: { error: "bad type" } })
    ]);
    expect(signals.some((s) => s.kind === "repeated-tool-error")).toBe(false);
  });

  it("blames the harness when the same call repeats unchanged", () => {
    const args = { id: "n1" };
    const signals = derive([
      call({ name: "ui_get_graph", index: 0, args }),
      call({ name: "ui_get_graph", index: 1, args }),
      call({ name: "ui_get_graph", index: 2, args })
    ]);
    const signal = signals.find((s) => s.kind === "repeated-identical-call");
    expect(signal?.owner).toBe("harness");
    expect(signal?.callIndices).toEqual([0, 1, 2]);
  });

  it("treats the same tool with different arguments as progress", () => {
    const signals = derive([
      call({ name: "ui_add_node", index: 0, args: { id: "a" } }),
      call({ name: "ui_add_node", index: 1, args: { id: "b" } }),
      call({ name: "ui_add_node", index: 2, args: { id: "c" } })
    ]);
    expect(signals.some((s) => s.kind === "repeated-identical-call")).toBe(false);
  });

  it("blames the prompt when the agent called nothing at all", () => {
    const signals = derive([], false);
    const signal = signals.find((s) => s.kind === "no-tool-calls");
    expect(signal?.owner).toBe("prompt");
    expect(signal?.severity).toBe("blocking");
  });

  it("leaves an over-budget run unattributed", () => {
    const calls = Array.from({ length: 12 }, (_, i) =>
      call({ name: "ui_add_node", index: i, args: { id: `n${i}` } })
    );
    const signals = deriveFriction({
      job: { expectedToolCalls: 5 },
      toolCalls: calls,
      achieved: true
    });
    const signal = signals.find((s) => s.kind === "over-budget");
    // Whether a long route is the prompt's fault or the tool surface's is
    // exactly the judgement this pure pass cannot make.
    expect(signal?.owner).toBe("unattributed");
  });

  it("records a failure that nothing else explains", () => {
    const signals = derive([call({ name: "ui_add_node", index: 0 })], false);
    expect(signals.some((s) => s.kind === "unexplained-failure")).toBe(true);
  });

  it("stays silent on a clean, achieved run", () => {
    const signals = derive([
      call({ name: "ui_add_node", index: 0, args: { id: "a" } }),
      call({ name: "ui_connect_nodes", index: 1, args: { from: "a" } })
    ]);
    expect(signals).toEqual([]);
  });

  it("orders blocking findings first", () => {
    const signals = deriveFriction({
      job: { expectedToolCalls: 1 },
      toolCalls: [
        call({ name: "t", index: 0, isError: true, result: { error: "x" } }),
        call({ name: "t", index: 1, isError: true, result: { error: "x" } }),
        call({ name: "u", index: 2 })
      ],
      achieved: true
    });
    expect(signals[0]?.severity).toBe("blocking");
  });
});

describe("the job registry", () => {
  it("defines a surfaced output as workflow completion in the default prompt", () => {
    expect(DEFAULT_JOB_SYSTEM_PROMPT).toContain("nodetool.output.*");
  });

  it("includes the explainer storyboard job", () => {
    const job = findJob("explainer-storyboard-from-brief");
    expect(job?.surfaces).toEqual(["storyboard"]);
    expect(job?.systemPrompt).toContain("[Lumen Style]");
    expect(job?.outcomeNames).toEqual([
      "teaching-arc",
      "runtime-budget",
      "entity-consistency",
      "truthful-proof",
      "savable"
    ]);
  });

  it("gives every job a JTBD statement with a stated purpose", () => {
    for (const job of JOBS_TO_BE_DONE) {
      // "so I can ..." is what the optimizer judges achievement against; a job
      // that only names a task gives it nothing to judge.
      expect(job.statement, job.id).toMatch(/so I can/i);
    }
  });

  it("grades every job on at least one outcome", () => {
    for (const job of JOBS_TO_BE_DONE) {
      expect(job.outcomeNames.length, job.id).toBeGreaterThan(0);
    }
  });

  it("keeps job ids unique", () => {
    const ids = JOBS_TO_BE_DONE.map((j) => j.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("never names a tool in an objective — the route is what is under test", () => {
    for (const job of JOBS_TO_BE_DONE) {
      expect(job.objective, job.id).not.toMatch(/\bui_[a-z_]+/);
    }
  });

  it("builds a fresh, non-empty world per run", () => {
    for (const job of JOBS_TO_BE_DONE) {
      const first = job.start();
      const second = job.start();
      expect(first.tools.length, job.id).toBeGreaterThan(0);
      expect(second.tools, job.id).not.toBe(first.tools);
    }
  });

  it("fails its own outcome checks on an untouched world", () => {
    // A job whose checks pass before the agent does anything is measuring
    // nothing. This is the check-can-fail rule, applied to the catalogue.
    for (const job of JOBS_TO_BE_DONE) {
      const graded = job.start().grade();
      expect(graded.some((o) => !o.passed), job.id).toBe(true);
    }
  });

  it("finds a job by id", () => {
    expect(findJob("workflow-from-prompt")?.id).toBe("workflow-from-prompt");
    expect(findJob("no-such-job")).toBeUndefined();
  });
});

describe("defineJob", () => {
  it("counts a check that throws as failed, never as a crashed run", () => {
    const job = defineJob({
      id: "throws",
      statement: "When x, I want y, so I can z.",
      surfaces: [],
      difficulty: "smoke",
      objective: "do it",
      createBridge: () => ({ tools: [], finalState: () => ({}) }),
      outcomes: [
        {
          name: "boom",
          describe: "explodes",
          test: () => {
            throw new Error("boom");
          }
        }
      ]
    });
    expect(job.start().grade()).toEqual([
      { name: "boom", describe: "explodes", passed: false }
    ]);
  });
});

describe("the optimizer's inputs and outputs", () => {
  const report: JobRunReport = {
    jobId: "j",
    statement: "When x, I want y, so I can z.",
    provider: "test",
    model: "m",
    startedAt: new Date().toISOString(),
    skipped: false,
    completed: true,
    achieved: false,
    outcomes: [{ name: "wired", describe: "is wired", passed: false }],
    transcript: [
      { role: "system", content: DEFAULT_JOB_SYSTEM_PROMPT },
      { role: "user", content: "build it" },
      { role: "assistant", content: "I will add a node." }
    ],
    toolCalls: [
      call({ name: "ui_add_node", index: 0, isError: true, result: { error: "no such type" } })
    ],
    friction: [],
    totalToolCalls: 1,
    durationMs: 5,
    costUsd: 0
  };

  it("shows the reviewer the prompt, the agent's words, and the raw results", () => {
    const rendered = renderRunForReview(report);
    expect(rendered).toContain(DEFAULT_JOB_SYSTEM_PROMPT);
    expect(rendered).toContain("I will add a node.");
    expect(rendered).toContain("no such type");
    expect(rendered).toContain("NOT ACHIEVED");
  });

  it("parses proposals out of a fenced answer", () => {
    const proposals = parseProposals(
      '```json\n{"proposals":[{"target":"a.ts","owner":"harness","diagnosis":"d","change":"c","evidence":["e"],"confidence":0.8}]}\n```'
    );
    expect(proposals).toHaveLength(1);
    expect(proposals[0]?.target).toBe("a.ts");
    expect(proposals[0]?.owner).toBe("harness");
  });

  it("drops a proposal that names no target or change", () => {
    const proposals = parseProposals('{"proposals":[{"diagnosis":"vague"}]}');
    expect(proposals).toEqual([]);
  });

  it("falls back to unattributed rather than trusting a bad owner", () => {
    const proposals = parseProposals(
      '{"proposals":[{"target":"a","owner":"whatever","diagnosis":"d","change":"c"}]}'
    );
    expect(proposals[0]?.owner).toBe("unattributed");
  });

  it("throws on an answer carrying no JSON", () => {
    expect(() => parseProposals("I think it went fine.")).toThrow();
  });
});
