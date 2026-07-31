/**
 * Unit tests for the code-gen eval harness (`src/evals/code-gen-*`): metrics
 * from the message stream, first-pass vs post-repair accounting, structural
 * scoring, and report formatting — scripted provider, no network. Mechanics
 * only; nothing here claims anything about model quality.
 */
import { describe, it, expect } from "vitest";
import {
  runCodeGenEval,
  formatCodeGenReport,
  checkCodeGenExpectations,
  CODE_GEN_EVAL_CASES,
  type CodeGenEvalCase
} from "../src/index.js";
import type {
  BaseProvider,
  ProviderStreamItem,
  ToolCall
} from "@nodetool-ai/runtime";
import type { CodeGenSubmission } from "@nodetool-ai/protocol/api-schemas/code-gen.js";

const STR = { type: "str" };
const INT = { type: "int" };
const LIST_STR = { type: "list", type_args: [STR] };

const GOOD_CODE = `const words = text.split(" ");\nreturn { words, count: words.length };`;

function submission(overrides: Partial<CodeGenSubmission> = {}) {
  return {
    title: "Split text into words",
    summary: "Splits the input text on whitespace and counts the words.",
    code: GOOD_CODE,
    inputs: [{ name: "text", type: STR }],
    outputs: [
      { name: "words", type: LIST_STR },
      { name: "count", type: INT }
    ],
    ...overrides
  };
}

/** Replays one scripted tool-call list per case, dispatching to the tool. */
function createScriptedProvider(perCase: ToolCall[][]): BaseProvider {
  let index = 0;
  return {
    provider: "scripted",
    hasToolSupport: async () => true,
    getTotalCost: () => 0,
    async *generateLoop(args: {
      tools?: Array<{
        name: string;
        execute?: (a: Record<string, unknown>, id?: string) => Promise<unknown>;
      }>;
      signal?: AbortSignal;
    }): AsyncGenerator<ProviderStreamItem> {
      const script = perCase[index] ?? [];
      index++;
      const tools = new Map((args.tools ?? []).map((t) => [t.name, t]));
      for (const call of script) {
        if (args.signal?.aborted) break;
        yield call as unknown as ProviderStreamItem;
        await tools.get(call.name)?.execute?.(call.args, call.id);
        if (args.signal?.aborted) break;
      }
      yield { type: "chunk", content: "", done: true };
    }
  } as unknown as BaseProvider;
}

const CASES: CodeGenEvalCase[] = [
  {
    id: "split",
    description: "splits text and counts the pieces",
    instruction: "Split the text into words and count them.",
    inputs: [{ name: "text", type: STR }],
    expect: {
      requiredOutputs: ["words", "count"],
      outputTypes: { count: ["int"] },
      minOutputs: 2,
      outputTypeKinds: ["list"]
    }
  }
];

describe("runCodeGenEval", () => {
  it("counts a first-round acceptance as first-pass", async () => {
    const provider = createScriptedProvider([
      [{ id: "1", name: "submit_code", args: submission() }]
    ]);

    const report = await runCodeGenEval({
      provider,
      model: "test-model",
      cases: CASES
    });

    const result = report.cases[0];
    expect(result.accepted).toBe(true);
    expect(result.firstPass).toBe(true);
    expect(result.repaired).toBe(false);
    expect(result.submitRounds).toBe(1);
    expect(result.toolCalls["submit_code"]).toBe(1);
    expect(result.outputs).toEqual(["words", "count"]);
    expect(result.score).toBe(1);
    expect(report.summary.firstPassRate).toBe(1);
    expect(report.summary.postRepairRate).toBe(1);
    expect(report.summary.repairRate).toBe(0);
  });

  it("separates post-repair acceptance from first-pass", async () => {
    // Round 1 drops a declared output; the tool rejects it and round 2 fixes it.
    const provider = createScriptedProvider([
      [
        {
          id: "1",
          name: "submit_code",
          args: submission({ code: `return { words: text.split(" ") };` })
        },
        { id: "2", name: "submit_code", args: submission() }
      ]
    ]);

    const report = await runCodeGenEval({
      provider,
      model: "test-model",
      cases: CASES
    });

    const result = report.cases[0];
    expect(result.accepted).toBe(true);
    expect(result.firstPass).toBe(false);
    expect(result.repaired).toBe(true);
    expect(result.submitRounds).toBe(2);
    expect(report.summary.firstPass).toBe(0);
    expect(report.summary.postRepair).toBe(1);
    expect(report.summary.firstPassRate).toBe(0);
    expect(report.summary.postRepairRate).toBe(1);
    expect(report.summary.repairRate).toBe(1);
  });

  it("scores a case with no accepted submission 0 and records the failure", async () => {
    const provider = createScriptedProvider([[]]);
    const report = await runCodeGenEval({
      provider,
      model: "test-model",
      cases: CASES
    });

    const result = report.cases[0];
    expect(result.accepted).toBe(false);
    expect(result.firstPass).toBe(false);
    expect(result.score).toBe(0);
    expect(result.error).toContain("no_valid_submission");
    expect(report.summary.postRepairRate).toBe(0);
  });

  it("formats both acceptance rates in the summary", async () => {
    const provider = createScriptedProvider([
      [{ id: "1", name: "submit_code", args: submission() }]
    ]);
    const report = await runCodeGenEval({
      provider,
      model: "test-model",
      cases: CASES
    });

    const text = formatCodeGenReport(report);
    expect(text).toContain("provider=scripted model=test-model");
    expect(text).toContain("first-pass 1/1 (100%)");
    expect(text).toContain("post-repair 1/1 (100%)");
  });
});

describe("checkCodeGenExpectations", () => {
  const evalCase = CASES[0];

  it("passes a submission that matches the case", () => {
    const checks = checkCodeGenExpectations(
      submission() as CodeGenSubmission,
      evalCase
    );
    expect(checks.filter((c) => !c.pass)).toEqual([]);
  });

  it("flags an input the dialog never offered", () => {
    const checks = checkCodeGenExpectations(
      submission({
        inputs: [
          { name: "text", type: STR },
          { name: "separator", type: STR }
        ]
      }) as CodeGenSubmission,
      evalCase
    );
    const check = checks.find((c) => c.name === "inputs-offered");
    expect(check?.pass).toBe(false);
    expect(check?.detail).toContain("separator");
  });

  it("flags a return path that drops a declared output", () => {
    const checks = checkCodeGenExpectations(
      submission({
        code: `if (!text) return { words: [], count: 0 };\nreturn { words: text.split(" ") };`
      }) as CodeGenSubmission,
      evalCase
    );
    expect(checks.find((c) => c.name === "outputs-assigned")?.pass).toBe(false);
  });

  it("flags a library the sandbox does not have", () => {
    const checks = checkCodeGenExpectations(
      submission({
        code: `const words = _.words(text);\nreturn { words, count: words.length };`
      }) as CodeGenSubmission,
      evalCase
    );
    const check = checks.find((c) => c.name === "no-invented-apis");
    expect(check?.pass).toBe(false);
    expect(check?.detail).toContain("_");
  });

  it("accepts sandbox bridges and locally bound names", () => {
    const checks = checkCodeGenExpectations(
      submission({
        code:
          `const rows = await data.parseCsv(text);\n` +
          `const words = rows.map((row) => JSON.stringify(row));\n` +
          `return { words, count: words.length };`
      }) as CodeGenSubmission,
      evalCase
    );
    expect(checks.find((c) => c.name === "no-invented-apis")?.pass).toBe(true);
  });

  it("flags streaming-only surface used unasked", () => {
    const checks = checkCodeGenExpectations(
      submission({
        code: `state.seen = (state.seen ?? 0) + 1;\nconst words = text.split(" ");\nreturn { words, count: words.length };`
      }) as CodeGenSubmission,
      evalCase
    );
    expect(checks.find((c) => c.name === "no-streaming-surface")?.pass).toBe(
      false
    );
  });

  it("checks the expected output of a destination-handle case", () => {
    const seedCase: CodeGenEvalCase = {
      id: "seed",
      description: "seeded from a destination handle",
      instruction: "Produce the month names.",
      expectedOutput: { name: "months", type: LIST_STR },
      expect: {}
    };
    const checks = checkCodeGenExpectations(
      submission({
        code: `return { names: ["January"] };`,
        inputs: [],
        outputs: [{ name: "names", type: LIST_STR }]
      }) as CodeGenSubmission,
      seedCase
    );
    expect(checks.find((c) => c.name === "expected-output")?.pass).toBe(false);
  });
});

describe("CODE_GEN_EVAL_CASES", () => {
  it("has unique ids and covers the authoring shapes the plan names", () => {
    const ids = CODE_GEN_EVAL_CASES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of [
      "reshape",
      "merge-join",
      "compute-derive",
      "extract-parse",
      "split",
      "format-render",
      "validate",
      "seed"
    ]) {
      expect(ids).toContain(id);
    }
  });

  it("offers every case either inputs or an expected output", () => {
    for (const c of CODE_GEN_EVAL_CASES) {
      expect(
        (c.inputs?.length ?? 0) > 0 || c.expectedOutput !== undefined
      ).toBe(true);
    }
  });
});
