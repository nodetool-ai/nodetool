import { describe, it, expect } from "vitest";
import { ScriptedProvider } from "@nodetool-ai/runtime";
import {
  runSubtaskEval,
  checkSubtaskExpectations,
  SUBTASK_EVAL_CASES,
  type SubtaskEvalCase,
  type SubtaskObservation
} from "../src/index.js";

/** Build an observation with sensible empties, overridden per test. */
function obs(partial: Partial<SubtaskObservation>): SubtaskObservation {
  return {
    parentTools: new Set(),
    childTools: new Set(),
    allTools: new Set(),
    spawns: [],
    maxDepth: 0,
    storeKeys: new Set(),
    answer: "",
    subtaskResults: [],
    ...partial
  };
}

describe("checkSubtaskExpectations", () => {
  it("passes when the child ran the required tool at depth >= 1", () => {
    const checks = checkSubtaskExpectations(
      obs({
        parentTools: new Set(["run_subtask"]),
        childTools: new Set(["calculate"]),
        allTools: new Set(["run_subtask", "calculate"]),
        spawns: [{ description: "compute", failed: false, errorCode: null, resultText: "4183" }],
        maxDepth: 1,
        answer: "the answer is 4183"
      }),
      {
        requiredParentTools: ["run_subtask"],
        requiredChildTools: ["calculate"],
        minSubtasks: 1,
        minDepth: 1,
        noSubtaskErrors: true,
        answerContains: ["4183"]
      }
    );
    expect(checks.every((c) => c.pass)).toBe(true);
  });

  it("fails a required child tool the parent ran itself (depth 0)", () => {
    const checks = checkSubtaskExpectations(
      obs({
        parentTools: new Set(["run_subtask", "calculate"]),
        childTools: new Set(),
        allTools: new Set(["run_subtask", "calculate"]),
        maxDepth: 0
      }),
      { requiredChildTools: ["calculate"] }
    );
    const child = checks.find((c) => c.name === "child:calculate");
    expect(child?.pass).toBe(false);
  });

  it("flags a spawned subtask that failed", () => {
    const checks = checkSubtaskExpectations(
      obs({
        spawns: [
          { description: "x", failed: true, errorCode: "subtask_failed", resultText: "" }
        ]
      }),
      { noSubtaskErrors: true }
    );
    const c = checks.find((c) => c.name === "no-subtask-errors");
    expect(c?.pass).toBe(false);
    expect(c?.detail).toContain("subtask_failed");
  });

  it("checks store keys and forbidden tools", () => {
    const checks = checkSubtaskExpectations(
      obs({ allTools: new Set(["kv_write"]), storeKeys: new Set(["gem"]) }),
      { requiredStoreKeys: ["gem"], forbiddenTools: ["kv_write"] }
    );
    expect(checks.find((c) => c.name === "store:gem")?.pass).toBe(true);
    expect(checks.find((c) => c.name === "not-tool:kv_write")?.pass).toBe(
      false
    );
  });
});

describe("runSubtaskEval (scripted provider, end-to-end)", () => {
  it("drives a real parent->child delegation and captures depth-1 tool use", async () => {
    // Flat call sequence, dispatched in order across the shared provider
    // instance used by BOTH the parent StepExecutor and the child spawned by
    // run_subtask: parent delegates → child calls calculate → child finalizes
    // → parent finalizes.
    const provider = new ScriptedProvider([
      () => [
        {
          type: "tool_call",
          name: "run_subtask",
          args: {
            description: "compute product",
            prompt: "Multiply 47 by 89 with the calculate tool and report it."
          }
        }
      ],
      () => [
        {
          type: "tool_call",
          name: "calculate",
          args: { a: 47, op: "multiply", b: 89 }
        }
      ],
      () => [{ type: "chunk", content: "The product is 4183.", done: true }],
      () => [{ type: "chunk", content: "The result is 4183.", done: true }]
    ]);

    const computeCase = SUBTASK_EVAL_CASES.find(
      (c) => c.id === "delegate-compute"
    ) as SubtaskEvalCase;

    const report = await runSubtaskEval({
      provider,
      model: "fake",
      providers: { fake: provider },
      cases: [computeCase]
    });

    expect(report.cases).toHaveLength(1);
    const result = report.cases[0];
    expect(result.accepted).toBe(true);
    expect(result.subtasks).toBe(1);
    expect(result.maxDepth).toBe(1);
    // Every structural expectation held.
    expect(result.checks.every((c) => c.pass)).toBe(true);
    expect(result.score).toBe(1);
    expect(report.summary.successRate).toBe(1);
  });

  it("skips a case flagged needsModelProviders when none are configured", async () => {
    const provider = new ScriptedProvider([
      () => [{ type: "chunk", content: "x", done: true }]
    ]);
    const syntheticCase: SubtaskEvalCase = {
      id: "needs-providers",
      description: "synthetic",
      objective: "do a thing",
      needsModelProviders: true,
      expect: {}
    };
    const report = await runSubtaskEval({
      provider,
      model: "fake",
      cases: [syntheticCase]
    });
    expect(report.cases[0].skipped).toBe(true);
    expect(report.summary.skipped).toBe(1);
  });
});
