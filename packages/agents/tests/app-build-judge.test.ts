/**
 * The Judge stage: what it is told, what it does with the answer, and what a
 * broken judge costs.
 *
 * Every case scripts the judge's reply instead of calling a model, so what is
 * asserted is the fail-closed rule and the routing — a not-achieved verdict has
 * to reach the Author as a complaint, and a judge that never answers has to
 * read as "not achieved" rather than as a pass.
 */

import { describe, it, expect, vi } from "vitest";
import type {
  BaseProvider,
  ProviderStreamItem,
  ProviderTool
} from "@nodetool-ai/runtime";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import type {
  AppServerRunInput,
  AppServerRunOutcome
} from "@nodetool-ai/execution/app-debug";
import { collectExecutionSummary } from "@nodetool-ai/execution/debug";
import { buildApp, type BuildAppOptions } from "../src/app-build/build.js";
import {
  judgeInteraction,
  parseJudgeAnswer,
  renderJudgePrompt,
  resolveJudgeModelSpec,
  runJudgeStage
} from "../src/app-build/judge.js";
import type { BuildSpec } from "../src/app-build/types.js";
import { createMockContext } from "./_helpers/mock-context.js";

// --- fixtures ---------------------------------------------------------------

const GRAPH = {
  nodes: [
    {
      id: "in1",
      type: "nodetool.input.StringInput",
      properties: { name: "prompt", value: "" }
    },
    {
      id: "out1",
      type: "nodetool.output.StringOutput",
      properties: { name: "text" }
    }
  ],
  edges: []
};

const registry = {
  has: () => true,
  getMetadata: () => undefined,
  validateNode: () => []
} as unknown as NodeRegistry;

const APP = "app-under-build";

const spec = (): BuildSpec => ({
  title: "Drafter",
  operations: [
    {
      id: "draft",
      objective: "",
      workflowId: "wf1",
      inputs: [{ name: "prompt", type: "string", example: "a haiku" }],
      outputs: [{ name: "text", type: "string" }],
      streaming: false
    }
  ],
  variables: [],
  widgets: [
    {
      role: "prompt-input",
      type: "TextInput",
      binding: "op:draft/in:prompt",
      label: "Prompt"
    },
    { role: "run-button", type: "Button", binding: "", label: "Draft it" },
    {
      role: "draft-output",
      type: "Markdown",
      binding: "op:draft/out:text",
      label: "Draft"
    }
  ],
  interactions: [
    {
      name: "draft-once",
      steps: [
        { set: { key: "prompt", value: "a haiku", operationId: "draft" } },
        { click: "run-button" }
      ],
      expect: [{ widget: "draft-output", check: "nonEmpty" }]
    }
  ]
});

const authorScript = () => [
  {
    name: "ui_app_add_operation",
    args: {
      application_id: APP,
      id: "draft",
      name: "draft",
      target_workflow_id: "wf-draft"
    }
  },
  {
    name: "ui_app_add_component",
    args: {
      application_id: APP,
      type: "TextInput",
      props: { label: "Prompt", binding: "op:draft/in:in1" }
    }
  },
  {
    name: "ui_app_add_component",
    args: {
      application_id: APP,
      type: "Markdown",
      props: { label: "Draft", binding: "op:draft/out:out1" }
    }
  },
  {
    name: "ui_app_add_component",
    args: {
      application_id: APP,
      type: "Button",
      props: {
        label: "Draft it",
        events: [{ trigger: "click", kind: "run", operationId: "draft" }]
      }
    }
  },
  { name: "ui_app_finish", args: { application_id: APP, summary: "a drafter" } }
];

interface ScriptedCall {
  name: string;
  args: Record<string, unknown>;
}

/** A judge answer, or a call that never resolves so the timeout decides. */
type JudgeReply = { text: string } | { hang: true };

/**
 * The builder: a tool-call script per round through `generateLoop`, plus the
 * judge's single `generateMessageTraced` call per interaction.
 */
function scriptedProvider(
  scripts: ScriptedCall[][],
  judgeReplies: JudgeReply[]
): BaseProvider & { judgeCalls: number; judgePrompts: string[] } {
  let turn = 0;
  let judgeCalls = 0;
  const provider = {
    provider: "scripted",
    judgeCalls: 0,
    judgePrompts: [] as string[],
    hasToolSupport: async () => true,
    getTotalCost: () => 0,
    async generateMessageTraced(args: {
      messages: Array<{ role: string; content: unknown }>;
      signal?: AbortSignal;
    }) {
      const index = judgeCalls++;
      provider.judgeCalls = judgeCalls;
      provider.judgePrompts.push(String(args.messages[1]?.content ?? ""));
      const reply = judgeReplies[Math.min(index, judgeReplies.length - 1)];
      if (!reply || "hang" in reply) {
        return new Promise((_resolve, reject) => {
          args.signal?.addEventListener("abort", () =>
            reject(new Error("aborted"))
          );
        });
      }
      return { role: "assistant", content: reply.text };
    },
    async *generateLoop(args: {
      tools?: ProviderTool[];
      signal?: AbortSignal;
    }): AsyncGenerator<ProviderStreamItem> {
      const script = scripts[Math.min(turn, scripts.length - 1)] ?? [];
      turn += 1;
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
  };
  return provider as unknown as BaseProvider & {
    judgeCalls: number;
    judgePrompts: string[];
  };
}

const stubRunner = () =>
  vi.fn(async (_input: AppServerRunInput): Promise<AppServerRunOutcome> => {
    const messages = [
      {
        type: "output_update",
        node_id: "out1",
        output_name: "output",
        value: "a drafted note"
      },
      { type: "job_update", status: "completed" }
    ];
    const summary = collectExecutionSummary(messages);
    summary.status = "completed";
    return {
      report: {
        surface: "server",
        ok: true,
        status: "completed",
        error: null,
        durationMs: 3,
        summary,
        trace: null
      },
      rawMessages: messages as never[]
    };
  });

function options(
  provider: BaseProvider,
  overrides: Partial<BuildAppOptions> = {}
): BuildAppOptions {
  return {
    spec: spec(),
    prompt: "an app that drafts a note from a prompt",
    provider,
    model: "m",
    context: createMockContext(),
    registry,
    runOnServer: stubRunner(),
    loadWorkflow: async (id: string) =>
      id === "wf1" ? { graph: GRAPH, name: "Drafter workflow" } : null,
    ...overrides
  };
}

const achieved = (reason = "the draft widget shows a drafted note"): JudgeReply => ({
  text: `{"achieved": true, "confidence": 0.9, "reasons": ["${reason}"]}`
});

// --- tests ------------------------------------------------------------------

describe("judge stage in a build", () => {
  it("passes the app when every interaction is judged achieved", async () => {
    const provider = scriptedProvider([authorScript()], [achieved()]);
    const report = await buildApp(options(provider));

    expect(report.verdict.ok).toBe(true);
    expect(provider.judgeCalls).toBe(1);
    expect(report.judge?.model).toBe("scripted/m");
    expect(report.judge?.interactions[0]).toMatchObject({
      interaction: "draft-once",
      achieved: true,
      confidence: 0.9
    });
    // The judge ran, so the verdict no longer disclaims the intent check.
    expect(report.verdict.notSimulated.join(" ")).not.toMatch(/judge/i);
    // It saw the intent, the steps, and what the widgets ended up showing.
    const prompt = provider.judgePrompts[0] ?? "";
    expect(prompt).toContain("an app that drafts a note from a prompt");
    expect(prompt).toContain("draft-once");
    expect(prompt).toContain("a drafted note");
  });

  it("fails a Check+Run-green app the judge says misses the intent", async () => {
    const provider = scriptedProvider(
      [authorScript()],
      [
        {
          text: '{"achieved": false, "confidence": 0.8, "reasons": ["the Draft widget echoes the prompt instead of a draft"]}'
        }
      ]
    );
    const report = await buildApp(options(provider, { maxRepairs: 0 }));

    expect(report.verdict.ok).toBe(false);
    expect(report.bundle).toBeNull();
    const complaint = report.repairs[report.repairs.length - 1];
    expect(complaint?.issues.map((i) => i.code)).toContain("goal_not_achieved");
    expect(complaint?.issues[0]?.message).toContain("echoes the prompt");
    expect(report.judge?.interactions[0]?.achieved).toBe(false);
  });

  it("routes the judge's reasons to the author, which repairs and passes", async () => {
    const provider = scriptedProvider(
      [
        authorScript(),
        [
          {
            name: "ui_app_update_component",
            args: {
              application_id: APP,
              id: "Markdown-2",
              props: { label: "Draft", binding: "op:draft/out:out1" }
            }
          },
          {
            name: "ui_app_finish",
            args: { application_id: APP, summary: "clearer draft widget" }
          }
        ]
      ],
      [
        {
          text: '{"achieved": false, "confidence": 0.7, "reasons": ["the draft is not labelled, so a user cannot tell what it is"]}'
        },
        achieved()
      ]
    );
    const report = await buildApp(options(provider, { maxRepairs: 1 }));

    expect(report.verdict.ok).toBe(true);
    expect(report.verdict.reason).toBe("green after 1 repair round(s)");
    expect(provider.judgeCalls).toBe(2);
    expect(report.repairs[0]?.issues[0]?.message).toContain("not labelled");
  });

  it("counts a judge that never answers as not achieved", async () => {
    const provider = scriptedProvider([authorScript()], [{ hang: true }]);
    const report = await buildApp(
      options(provider, { maxRepairs: 0, judge: { timeoutMs: 20 } })
    );

    expect(report.verdict.ok).toBe(false);
    expect(report.judge?.interactions[0]?.achieved).toBe(false);
    expect(report.judge?.interactions[0]?.reasons.join(" ")).toMatch(
      /did not answer within 20ms/
    );
  });

  it("counts an unparseable answer as not achieved", async () => {
    const provider = scriptedProvider(
      [authorScript()],
      [{ text: "looks fine to me" }]
    );
    const report = await buildApp(options(provider, { maxRepairs: 0 }));

    expect(report.verdict.ok).toBe(false);
    expect(report.judge?.interactions[0]?.reasons.join(" ")).toMatch(
      /not parseable/
    );
  });

  it("never calls the judge on the deterministic path", async () => {
    const provider = scriptedProvider([authorScript()], []);
    const report = await buildApp(
      options(provider, { judge: { enabled: false } })
    );

    expect(report.verdict.ok).toBe(true);
    expect(provider.judgeCalls).toBe(0);
    expect(report.judge).toBeNull();
    // Skipped, and the verdict says so rather than implying a score.
    expect(report.verdict.notSimulated.join(" ")).toMatch(
      /judge stage did not run/
    );
    const judgeStage = report.stages.find((s) => s.stage === "judge");
    expect(judgeStage?.status).toBe("skipped");
  });
});

describe("runJudgeStage", () => {
  it("reports the model that actually judged", async () => {
    const provider = scriptedProvider([], [achieved()]);
    const { judge, record } = await runJudgeStage({
      spec: spec(),
      interactions: [
        {
          interaction: {
            name: "draft-once",
            steps: [],
            expect: [],
            derived: false,
            addedSteps: []
          },
          widgets: [
            { widget: "draft-output", type: "Markdown", value: "a note" }
          ]
        }
      ],
      provider,
      model: "judge-model",
      round: 0
    });

    expect(judge.model).toBe("scripted/judge-model");
    expect(record.status).toBe("ok");
    expect(record.detail).toBe("1 interaction(s), 0 not achieved");
  });
});

describe("parseJudgeAnswer", () => {
  it("accepts a verdict wrapped in prose or a fenced block", () => {
    expect(
      parseJudgeAnswer(
        'Here is my verdict:\n```json\n{"achieved": false, "confidence": 2, "reasons": ["empty"]}\n```'
      )
    ).toEqual({ achieved: false, confidence: 1, reasons: ["empty"] });
  });

  it("rejects an answer with no verdict in it", () => {
    expect(parseJudgeAnswer('{"confidence": 1}')).toBeNull();
    expect(parseJudgeAnswer("no json here")).toBeNull();
  });

  it("keeps a verdict that gave no usable reason readable", () => {
    expect(parseJudgeAnswer('{"achieved": true}')).toEqual({
      achieved: true,
      confidence: 0,
      reasons: ["(no reason given)"]
    });
  });
});

describe("judgeInteraction", () => {
  it("times out on a provider that ignores the abort signal", async () => {
    const deaf = {
      provider: "deaf",
      getTotalCost: () => 0,
      // No abort listener: without a race the await would never resolve and the
      // fail-closed verdict would never be produced.
      generateMessageTraced: () => new Promise(() => {})
    } as unknown as BaseProvider;

    const verdict = await judgeInteraction({
      spec: spec(),
      provider: deaf,
      model: "m",
      timeoutMs: 20,
      input: {
        interaction: {
          name: "draft-once",
          steps: [{ click: "run-button" }],
          expect: [],
          derived: false,
          addedSteps: []
        },
        widgets: []
      }
    });

    expect(verdict.achieved).toBe(false);
    expect(verdict.reasons.join(" ")).toMatch(/did not answer within 20ms/);
  });
});

describe("resolveJudgeModelSpec", () => {
  const builder = { builderProviderId: "anthropic", builderModel: "claude-sonnet-4-6" };

  it("prefers an available model the builder did not use", () => {
    const resolved = resolveJudgeModelSpec({
      ...builder,
      isAvailable: (id) => id === "anthropic" || id === "openai",
      env: {}
    });
    expect(resolved).toMatchObject({
      providerId: "openai",
      sameAsBuilder: false
    });
  });

  it("falls back to the builder when nothing else is configured", () => {
    const resolved = resolveJudgeModelSpec({ ...builder, env: {} });
    expect(resolved).toEqual({
      spec: "anthropic/claude-sonnet-4-6",
      providerId: "anthropic",
      model: "claude-sonnet-4-6",
      sameAsBuilder: true
    });
  });

  it("takes the explicit flag over the environment", () => {
    const resolved = resolveJudgeModelSpec({
      ...builder,
      explicit: "openai/gpt-5.4",
      isAvailable: (id) => id === "anthropic" || id === "openai",
      env: { NODETOOL_APP_JUDGE_MODEL: "gemini/gemini-2.5-flash" }
    });
    expect(resolved.spec).toBe("openai/gpt-5.4");
  });

  it("reads the environment when no flag is given", () => {
    const resolved = resolveJudgeModelSpec({
      ...builder,
      isAvailable: (id) => id === "anthropic" || id === "gemini",
      env: { NODETOOL_APP_JUDGE_MODEL: "gemini/gemini-2.5-flash" }
    });
    expect(resolved).toMatchObject({
      providerId: "gemini",
      model: "gemini-2.5-flash"
    });
  });

  it("reads a bare model id as one on the builder's provider", () => {
    const resolved = resolveJudgeModelSpec({
      ...builder,
      explicit: "claude-haiku-4-5",
      env: {}
    });
    expect(resolved).toMatchObject({
      providerId: "anthropic",
      model: "claude-haiku-4-5",
      sameAsBuilder: false
    });
  });
});

describe("renderJudgePrompt", () => {
  it("names the widget, its label, and what it shows", () => {
    const prompt = renderJudgePrompt(
      spec(),
      {
        interaction: {
          name: "draft-once",
          steps: [{ click: "run-button" }],
          expect: [],
          derived: false,
          addedSteps: []
        },
        widgets: [
          {
            widget: "draft-output",
            type: "Markdown",
            label: "Draft",
            value: "a drafted note"
          }
        ]
      },
      "draft me a note"
    );
    expect(prompt).toContain("draft me a note");
    expect(prompt).toContain('- draft-output (Markdown "Draft"): "a drafted note"');
    expect(prompt).toContain('{"click":"run-button"}');
  });
});
