/**
 * Unit tests for interactive escalation in the tool-loop eval harness:
 *   - `createEscalationChannel`: scripted-user matching, replies, transcript.
 *   - `checkEscalationExpectations`: pure scoring of the exchanges.
 *   - `runToolLoopEval` with an escalation case, driven by a scripted provider
 *     that either asks first or guesses — no network.
 *   - The shipped `WORKFLOW_ESCALATION_TOOL_LOOP_CASES` themselves: a golden
 *     transcript must score 1.00, so a case can't be unsatisfiable.
 */
import { describe, it, expect } from "vitest";
import {
  runToolLoopEval,
  formatToolLoopReport,
  createEscalationChannel,
  checkEscalationExpectations,
  createToolLoopBridge,
  scoreToolLoopChecks,
  countCriticalFailures,
  CRITICAL_FAILURE_SCORE_CAP,
  WORKFLOW_ESCALATION_TOOL_LOOP_CASES,
  TOOL_LOOP_NODE_CATALOG,
  type ToolLoopEvalCase,
  type ToolLoopFinalState,
  type EscalationTurn
} from "../src/index.js";
import type {
  BaseProvider,
  ProviderStreamItem,
  ProviderTool
} from "@nodetool-ai/runtime";

interface ScriptedCall {
  name: string;
  args: Record<string, unknown>;
}

/** Replays a fixed list of tool calls through the tools' `execute` closures. */
function createScriptedProvider(script: ScriptedCall[]): BaseProvider {
  return {
    provider: "scripted",
    hasToolSupport: async () => true,
    getTotalCost: () => 0,
    async *generateLoop(args: {
      tools?: ProviderTool[];
      signal?: AbortSignal;
    }): AsyncGenerator<ProviderStreamItem> {
      const toolMap = new Map((args.tools ?? []).map((t) => [t.name, t]));
      let seq = 0;
      for (const call of script) {
        if (args.signal?.aborted) break;
        const id = `call_${++seq}`;
        yield { id, name: call.name, args: call.args } as ProviderStreamItem;
        await toolMap.get(call.name)?.execute?.(call.args, id);
      }
      yield { type: "chunk", content: "", done: true } as ProviderStreamItem;
    }
  } as unknown as BaseProvider;
}

// --- createEscalationChannel -------------------------------------------------

describe("createEscalationChannel", () => {
  it("answers with the first matching reply and records the exchange", async () => {
    const channel = createEscalationChannel({
      replies: [
        { name: "names", when: /name/i, reply: "Call it 'article'." },
        { name: "catch-all", when: /./, reply: "never reached" }
      ]
    });

    const result = await channel.tool.execute({
      question: "What should I name the input?"
    });

    expect(result).toEqual({ ok: true, answer: "Call it 'article'." });
    expect(channel.turns()).toEqual<EscalationTurn[]>([
      {
        question: "What should I name the input?",
        reply: "Call it 'article'.",
        matched: "names"
      }
    ]);
  });

  it("matches keyword arrays against question, options and context", async () => {
    const channel = createEscalationChannel({
      replies: [{ name: "delete", when: ["delete", "fmt1"], reply: "Yes." }]
    });

    await channel.tool.execute({
      question: "Should I delete anything?",
      options: ["keep fmt1", "remove fmt1"]
    });

    expect(channel.turns()[0].matched).toBe("delete");
  });

  it("falls back and marks the turn unmatched when nothing matches", async () => {
    const channel = createEscalationChannel({
      replies: [{ name: "names", when: /name/i, reply: "article" }],
      fallback: "Just build it."
    });

    const result = await channel.tool.execute({ question: "Nice weather?" });

    expect(result).toEqual({ ok: true, answer: "Just build it." });
    expect(channel.turns()[0].matched).toBeNull();
  });

  it("matches a global regex on every turn, not every other one", async () => {
    const channel = createEscalationChannel({
      replies: [{ name: "names", when: /name/gi, reply: "article" }]
    });

    await channel.tool.execute({ question: "which name?" });
    await channel.tool.execute({ question: "and the output name?" });

    expect(channel.turns().map((t) => t.matched)).toEqual(["names", "names"]);
  });

  it("gives each run its own transcript", async () => {
    const config = { replies: [{ name: "a", when: /./, reply: "ok" }] };
    const first = createEscalationChannel(config);
    await first.tool.execute({ question: "q" });
    const second = createEscalationChannel(config);

    expect(first.turns()).toHaveLength(1);
    expect(second.turns()).toHaveLength(0);
  });
});

// --- checkEscalationExpectations ---------------------------------------------

describe("checkEscalationExpectations", () => {
  const turns: EscalationTurn[] = [
    { question: "which name?", reply: "article", matched: "names" },
    { question: "unrelated?", reply: "fallback", matched: null }
  ];
  const byName = (
    checks: Array<{ name: string; pass: boolean }>,
    name: string
  ): boolean => checks.find((c) => c.name === name)!.pass;

  it("scores ask counts, topics and off-script questions", () => {
    const checks = checkEscalationExpectations(turns, ["ask_user"], {
      minAsks: 1,
      maxAsks: 1,
      mustAsk: ["names", "budget"],
      allQuestionsMatched: true
    });

    expect(byName(checks, "asks>=1")).toBe(true);
    expect(byName(checks, "asks<=1")).toBe(false);
    expect(byName(checks, "asked:names")).toBe(true);
    expect(byName(checks, "asked:budget")).toBe(false);
    expect(byName(checks, "no-off-script-asks")).toBe(false);
  });

  it("requires the ask to precede the guarded tool", () => {
    const asked = checkEscalationExpectations(
      turns,
      ["ask_user", "ui_delete_node"],
      {
        askBefore: ["ui_delete_node"]
      }
    );
    expect(byName(asked, "ask-before:ui_delete_node")).toBe(true);

    const guessed = checkEscalationExpectations([], ["ui_delete_node"], {
      askBefore: ["ui_delete_node"]
    });
    expect(byName(guessed, "ask-before:ui_delete_node")).toBe(false);

    const tooLate = checkEscalationExpectations(
      turns,
      ["ui_delete_node", "ask_user"],
      {
        askBefore: ["ui_delete_node"]
      }
    );
    expect(byName(tooLate, "ask-before:ui_delete_node")).toBe(false);
  });

  it("passes ask-before when the guarded tool is never called", () => {
    const checks = checkEscalationExpectations([], ["ui_add_node"], {
      askBefore: ["ui_delete_node"]
    });
    expect(byName(checks, "ask-before:ui_delete_node")).toBe(true);
  });

  it("honors a renamed escalation tool", () => {
    const checks = checkEscalationExpectations(
      turns,
      ["consult", "ui_delete_node"],
      {
        toolName: "consult",
        askBefore: ["ui_delete_node"]
      }
    );
    expect(byName(checks, "ask-before:ui_delete_node")).toBe(true);
  });
});

// --- severity-weighted scoring -----------------------------------------------

describe("scoreToolLoopChecks", () => {
  it("scores an all-pass run at 1 and an all-fail run at 0", () => {
    expect(
      scoreToolLoopChecks([
        { name: "a", pass: true, severity: "critical" },
        { name: "b", pass: true, severity: "advisory" }
      ])
    ).toBe(1);
    expect(
      scoreToolLoopChecks([{ name: "a", pass: false, severity: "advisory" }])
    ).toBe(0);
  });

  it("caps a run that missed a critical check below one that only overran a budget", () => {
    // Built the right thing, over the call ceiling.
    const wasteful = scoreToolLoopChecks([
      { name: "tool:ask_user", pass: true, severity: "critical" },
      { name: "state:built", pass: true, severity: "critical" },
      { name: "toolCalls<=18", pass: false, severity: "advisory" }
    ]);
    // Built the right thing but never asked — the behavior under test.
    const skippedTheAsk = scoreToolLoopChecks([
      { name: "tool:ask_user", pass: false, severity: "critical" },
      { name: "state:built", pass: true, severity: "critical" },
      { name: "toolCalls<=18", pass: true, severity: "advisory" }
    ]);

    expect(skippedTheAsk).toBeLessThanOrEqual(CRITICAL_FAILURE_SCORE_CAP);
    expect(wasteful).toBeGreaterThan(skippedTheAsk);
  });

  it("weighs critical checks above advisory ones", () => {
    const criticalMiss = scoreToolLoopChecks([
      { name: "a", pass: false, severity: "critical" },
      { name: "b", pass: true, severity: "critical" }
    ]);
    const advisoryMiss = scoreToolLoopChecks([
      { name: "a", pass: false, severity: "advisory" },
      { name: "b", pass: true, severity: "critical" }
    ]);
    expect(advisoryMiss).toBeGreaterThan(criticalMiss);
  });

  it("treats checks with no severity as standard, so other suites are unaffected", () => {
    expect(
      scoreToolLoopChecks([
        { name: "a", pass: true },
        { name: "b", pass: false }
      ])
    ).toBe(0.5);
  });

  it("counts only failing critical checks", () => {
    expect(
      countCriticalFailures([
        { name: "a", pass: false, severity: "critical" },
        { name: "b", pass: false, severity: "advisory" },
        { name: "c", pass: true, severity: "critical" }
      ])
    ).toBe(1);
  });
});

// --- runToolLoopEval with escalation -----------------------------------------

const ESCALATION_CASE: ToolLoopEvalCase<ToolLoopFinalState> = {
  id: "ask-then-build",
  description: "asks for the input name before adding nodes",
  objective: "Add a string input; I'll tell you what to name it.",
  createBridge: () =>
    createToolLoopBridge({ nodeMetadata: TOOL_LOOP_NODE_CATALOG }),
  escalation: {
    replies: [{ name: "names", when: /name/i, reply: "Name it 'article'." }]
  },
  expect: {
    requiredTools: ["ask_user", "ui_add_node"],
    noErrorResults: true,
    escalation: {
      minAsks: 1,
      maxAsks: 1,
      mustAsk: ["names"],
      allQuestionsMatched: true,
      askBefore: ["ui_add_node"]
    },
    finalState: [
      {
        name: "namedArticle",
        test: (s) => s.nodes[0]?.data.properties.name === "article"
      }
    ]
  }
};

const ADD_ARTICLE_INPUT: ScriptedCall = {
  name: "ui_add_node",
  args: {
    id: "in1",
    type: "nodetool.input.StringInput",
    position: { x: 0, y: 0 },
    properties: { name: "article" }
  }
};

describe("runToolLoopEval with an escalation channel", () => {
  it("scores a run that asks first and uses the answer", async () => {
    const report = await runToolLoopEval({
      provider: createScriptedProvider([
        {
          name: "ask_user",
          args: { question: "What should I name the input?" }
        },
        ADD_ARTICLE_INPUT
      ]),
      model: "test-model",
      cases: [ESCALATION_CASE]
    });

    const result = report.cases[0];
    expect(result.accepted).toBe(true);
    expect(result.score).toBe(1);
    expect(result.toolCalls.ask_user).toBe(1);
  });

  it("fails the escalation checks when the model guesses instead of asking", async () => {
    const report = await runToolLoopEval({
      provider: createScriptedProvider([ADD_ARTICLE_INPUT]),
      model: "test-model",
      cases: [ESCALATION_CASE]
    });

    const failed = report.cases[0].checks
      .filter((c) => !c.pass)
      .map((c) => c.name);
    expect(failed).toEqual(
      expect.arrayContaining([
        "tool:ask_user",
        "asks>=1",
        "asked:names",
        "ask-before:ui_add_node"
      ])
    );
    expect(report.cases[0].score).toBeLessThan(1);
  });

  it("marks critical failures in the formatted report and summary", async () => {
    const report = await runToolLoopEval({
      provider: createScriptedProvider([ADD_ARTICLE_INPUT]),
      model: "test-model",
      cases: [ESCALATION_CASE]
    });
    const text = formatToolLoopReport(report);

    expect(text).toContain("[critical] tool:ask_user");
    expect(text).toContain("critical-clean 0%");
    expect(report.summary.criticalCleanRate).toBe(0);
  });

  it("flags an off-script question and hands back the fallback answer", async () => {
    const report = await runToolLoopEval({
      provider: createScriptedProvider([
        { name: "ask_user", args: { question: "Is the weather nice?" } },
        ADD_ARTICLE_INPUT
      ]),
      model: "test-model",
      cases: [ESCALATION_CASE]
    });

    const failed = report.cases[0].checks
      .filter((c) => !c.pass)
      .map((c) => c.name);
    expect(failed).toContain("no-off-script-asks");
    expect(failed).toContain("asked:names");
  });

  it("leaves cases without an escalation config untouched", async () => {
    const plainCase: ToolLoopEvalCase<ToolLoopFinalState> = {
      ...ESCALATION_CASE,
      id: "plain",
      escalation: undefined,
      expect: { requiredTools: ["ui_add_node"], noErrorResults: true }
    };
    const report = await runToolLoopEval({
      provider: createScriptedProvider([ADD_ARTICLE_INPUT]),
      model: "test-model",
      cases: [plainCase]
    });

    expect(report.cases[0].score).toBe(1);
    expect(report.cases[0].toolCalls.ask_user).toBeUndefined();
  });
});

// --- the shipped suite -------------------------------------------------------

describe("WORKFLOW_ESCALATION_TOOL_LOOP_CASES", () => {
  it("has unique ids and needs no live registry", () => {
    const ids = WORKFLOW_ESCALATION_TOOL_LOOP_CASES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const evalCase of WORKFLOW_ESCALATION_TOOL_LOOP_CASES) {
      expect(evalCase.escalation).toBeDefined();
      expect(evalCase.createBridge().tools.length).toBeGreaterThan(0);
    }
  });

  it("rejects a node type borrowed from Object.prototype", () => {
    const predicate = WORKFLOW_ESCALATION_TOOL_LOOP_CASES.find(
      (c) => c.id === "escalate-missing-capability"
    )!.expect.finalState!.find((p) => p.name === "noInventedNodeTypes")!;

    expect(
      predicate.test({
        nodes: [
          {
            id: "n1",
            type: "toString",
            position: { x: 0, y: 0 },
            data: { properties: {} }
          }
        ],
        edges: []
      })
    ).toBe(false);
  });

  it("scores a golden transcript of ask-for-missing-names at 1.00", async () => {
    const evalCase = WORKFLOW_ESCALATION_TOOL_LOOP_CASES.find(
      (c) => c.id === "ask-for-missing-names"
    )!;
    const report = await runToolLoopEval({
      provider: createScriptedProvider([
        { name: "ui_search_nodes", args: { query: "input" } },
        {
          name: "ask_user",
          args: {
            question: "What names should the input and output use?",
            options: ["you pick", "tell me"]
          }
        },
        {
          name: "ui_add_node",
          args: {
            id: "in1",
            type: "nodetool.input.StringInput",
            position: { x: 0, y: 0 },
            properties: { name: "article" }
          }
        },
        {
          name: "ui_add_node",
          args: {
            id: "agent1",
            type: "nodetool.agents.Agent",
            position: { x: 240, y: 0 },
            properties: { prompt: "Summarize the input." }
          }
        },
        {
          name: "ui_add_node",
          args: {
            id: "out1",
            type: "nodetool.output.StringOutput",
            position: { x: 480, y: 0 },
            properties: { name: "digest" }
          }
        },
        {
          name: "ui_connect_nodes",
          args: {
            source_node_id: "in1",
            source_handle: "output",
            target_node_id: "agent1",
            target_handle: "input"
          }
        },
        {
          name: "ui_connect_nodes",
          args: {
            source_node_id: "agent1",
            source_handle: "output",
            target_node_id: "out1",
            target_handle: "value"
          }
        }
      ]),
      model: "test-model",
      cases: [evalCase]
    });

    const failed = report.cases[0].checks.filter((c) => !c.pass);
    expect(failed.map((c) => `${c.name}: ${c.detail ?? ""}`)).toEqual([]);
    expect(report.cases[0].score).toBe(1);
  });

  it("scores a golden transcript of confirm-before-delete at 1.00", async () => {
    const evalCase = WORKFLOW_ESCALATION_TOOL_LOOP_CASES.find(
      (c) => c.id === "confirm-before-delete"
    )!;
    const report = await runToolLoopEval({
      provider: createScriptedProvider([
        { name: "ui_get_graph", args: {} },
        {
          name: "ask_user",
          args: {
            question:
              "May I delete fmt1 and concat1? Nothing else would change."
          }
        },
        { name: "ui_delete_node", args: { node_id: "fmt1" } },
        { name: "ui_delete_node", args: { node_id: "concat1" } }
      ]),
      model: "test-model",
      cases: [evalCase]
    });

    const failed = report.cases[0].checks.filter((c) => !c.pass);
    expect(failed.map((c) => `${c.name}: ${c.detail ?? ""}`)).toEqual([]);
  });

  it("scores a golden transcript of ask-which-step at 1.00", async () => {
    const evalCase = WORKFLOW_ESCALATION_TOOL_LOOP_CASES.find(
      (c) => c.id === "ask-which-step"
    )!;
    const report = await runToolLoopEval({
      provider: createScriptedProvider([
        { name: "ui_search_nodes", args: { query: "text" } },
        {
          name: "ask_user",
          args: { question: "Format Text or Concat for this step?" }
        },
        {
          name: "ui_add_node",
          args: {
            id: "fmt1",
            type: "nodetool.text.FormatText",
            position: { x: 320, y: 100 },
            properties: { template: "Summary: {{text}}" }
          }
        },
        {
          name: "ui_connect_nodes",
          args: {
            source_node_id: "in1",
            source_handle: "output",
            target_node_id: "fmt1",
            target_handle: "text"
          }
        }
      ]),
      model: "test-model",
      cases: [evalCase]
    });

    const failed = report.cases[0].checks.filter((c) => !c.pass);
    expect(failed.map((c) => `${c.name}: ${c.detail ?? ""}`)).toEqual([]);
  });

  it("scores a golden transcript of escalate-missing-capability at 1.00", async () => {
    const evalCase = WORKFLOW_ESCALATION_TOOL_LOOP_CASES.find(
      (c) => c.id === "escalate-missing-capability"
    )!;
    const report = await runToolLoopEval({
      provider: createScriptedProvider([
        { name: "ui_search_nodes", args: { query: "image" } },
        {
          name: "ask_user",
          args: {
            question:
              "There is no image-generation node in this editor. How should I proceed?"
          }
        },
        {
          name: "ui_add_node",
          args: {
            id: "in1",
            type: "nodetool.input.StringInput",
            position: { x: 0, y: 0 },
            properties: { name: "prompt" }
          }
        },
        {
          name: "ui_add_node",
          args: {
            id: "agent1",
            type: "nodetool.agents.Agent",
            position: { x: 240, y: 0 },
            properties: { prompt: "Describe the image this prompt asks for." }
          }
        },
        {
          name: "ui_add_node",
          args: {
            id: "out1",
            type: "nodetool.output.StringOutput",
            position: { x: 480, y: 0 },
            properties: { name: "description" }
          }
        },
        {
          name: "ui_connect_nodes",
          args: {
            source_node_id: "in1",
            source_handle: "output",
            target_node_id: "agent1",
            target_handle: "input"
          }
        },
        {
          name: "ui_connect_nodes",
          args: {
            source_node_id: "agent1",
            source_handle: "output",
            target_node_id: "out1",
            target_handle: "value"
          }
        }
      ]),
      model: "test-model",
      cases: [evalCase]
    });

    const failed = report.cases[0].checks.filter((c) => !c.pass);
    expect(failed.map((c) => `${c.name}: ${c.detail ?? ""}`)).toEqual([]);
  });

  it("scores a golden transcript of no-escalation-needed at 1.00", async () => {
    const evalCase = WORKFLOW_ESCALATION_TOOL_LOOP_CASES.find(
      (c) => c.id === "no-escalation-needed"
    )!;
    const report = await runToolLoopEval({
      provider: createScriptedProvider([
        {
          name: "ui_add_node",
          args: {
            id: "in1",
            type: "nodetool.input.StringInput",
            position: { x: 0, y: 0 },
            properties: { name: "text" }
          }
        },
        {
          name: "ui_add_node",
          args: {
            id: "agent1",
            type: "nodetool.agents.Agent",
            position: { x: 240, y: 0 },
            properties: { prompt: "Summarize the input in one sentence." }
          }
        },
        {
          name: "ui_add_node",
          args: {
            id: "out1",
            type: "nodetool.output.StringOutput",
            position: { x: 480, y: 0 },
            properties: { name: "summary" }
          }
        },
        {
          name: "ui_connect_nodes",
          args: {
            source_node_id: "in1",
            source_handle: "output",
            target_node_id: "agent1",
            target_handle: "input"
          }
        },
        {
          name: "ui_connect_nodes",
          args: {
            source_node_id: "agent1",
            source_handle: "output",
            target_node_id: "out1",
            target_handle: "value"
          }
        }
      ]),
      model: "test-model",
      cases: [evalCase]
    });

    const failed = report.cases[0].checks.filter((c) => !c.pass);
    expect(failed.map((c) => `${c.name}: ${c.detail ?? ""}`)).toEqual([]);
  });

  it("fails no-escalation-needed when the model asks anyway", async () => {
    const evalCase = WORKFLOW_ESCALATION_TOOL_LOOP_CASES.find(
      (c) => c.id === "no-escalation-needed"
    )!;
    const report = await runToolLoopEval({
      provider: createScriptedProvider([
        { name: "ask_user", args: { question: "Should I really build this?" } }
      ]),
      model: "test-model",
      cases: [evalCase]
    });

    expect(
      report.cases[0].checks.filter((c) => !c.pass).map((c) => c.name)
    ).toContain("not-tool:ask_user");
  });

  it("fails confirm-before-delete when the model deletes without asking", async () => {
    const evalCase = WORKFLOW_ESCALATION_TOOL_LOOP_CASES.find(
      (c) => c.id === "confirm-before-delete"
    )!;
    const report = await runToolLoopEval({
      provider: createScriptedProvider([
        { name: "ui_delete_node", args: { node_id: "fmt1" } },
        { name: "ui_delete_node", args: { node_id: "concat1" } }
      ]),
      model: "test-model",
      cases: [evalCase]
    });

    const failed = report.cases[0].checks
      .filter((c) => !c.pass)
      .map((c) => c.name);
    expect(failed).toContain("ask-before:ui_delete_node");
    expect(failed).toContain("asked:delete-confirmation");
    // This is the transcript a live sonnet run produced: it deleted the right
    // nodes and left the main chain intact, so every state predicate passes.
    // The score must still land at or below the cap — the case exists to
    // measure the ask, and credit for the graph cannot outweigh missing it.
    expect(report.cases[0].score).toBeLessThanOrEqual(
      CRITICAL_FAILURE_SCORE_CAP
    );
    expect(report.cases[0].criticalFailures).toBeGreaterThan(0);
  });
});
