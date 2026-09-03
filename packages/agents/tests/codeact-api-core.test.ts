/**
 * Core `nodetool.*` API eval cases — scripted provider, real QuickJS sandbox,
 * real prelude, fake belt. The hand-written actions call `nodetool.*` only, so
 * a mismatch between what a wrapper sends and what a tool expects fails here.
 */
import { describe, it, expect } from "vitest";
import { runCodeActEval } from "../src/evals/codeact-eval.js";
import {
  CODEACT_API_CORE_CASES,
  createCoreApiTools
} from "../src/evals/codeact-api-core.js";
import { createCodeActRecorder } from "../src/evals/codeact-cases.js";
import { NODETOOL_API_NAMESPACE_TOOLS } from "../src/codeact/nodetool-api.js";
import type {
  BaseProvider,
  ProviderStreamItem,
  ToolCall
} from "@nodetool-ai/runtime";

/** Provider that answers each case with a scripted list of code actions. */
function createScriptedLoopProvider(actionsByCall: string[][]): BaseProvider {
  let call = 0;
  return {
    provider: "fake",
    hasToolSupport: async () => true,
    getTotalCost: () => 0,
    async *generateLoop(args: {
      tools?: Array<{
        name: string;
        execute?: (a: Record<string, unknown>) => Promise<string | unknown>;
      }>;
      signal?: AbortSignal;
    }): AsyncGenerator<ProviderStreamItem> {
      const actions = actionsByCall[call++] ?? [];
      const toolMap = new Map((args.tools ?? []).map((t) => [t.name, t]));
      let idx = 0;
      for (const code of actions) {
        if (args.signal?.aborted) break;
        const tc: ToolCall = {
          id: `tc_${call}_${idx++}`,
          name: "execute_code",
          args: { code }
        };
        yield tc;
        const tool = toolMap.get(tc.name);
        const content = tool?.execute ? await tool.execute(tc.args) : "";
        yield {
          type: "message",
          message: {
            role: "tool",
            toolCallId: tc.id,
            content:
              typeof content === "string" ? content : JSON.stringify(content)
          }
        };
      }
      yield { type: "chunk", content: "", done: true };
    }
  } as unknown as BaseProvider;
}

const SOLUTIONS: Record<string, string[]> = {
  "api-graph-build-and-run": [
    `import { workflow } from "@nodetool-ai/sandbox-dsl";
     import { stringInput } from "@nodetool-ai/sandbox-dsl/nodetool.input";
     import { concat } from "@nodetool-ai/sandbox-dsl/nodetool.text";
     import { output } from "@nodetool-ai/sandbox-dsl/nodetool.output";
     await nodetool.nodes.search(["string input", "concat text", "output"]);
     const name = stringInput({ name: "name" });
     const joined = concat({ a: name.output(), b: ", welcome aboard!" });
     const graph = workflow(
       output({ name: "greeting", value: joined.output() })
     );
     const check = await nodetool.workflows.validate(graph);
     if (!check.ok)
       throw new Error(check.issues.map((i) => i.message).join("; "));
     const saved = await nodetool.workflows.create("Greeter", graph);
     const run = await nodetool.workflows.run(saved.id, { name: "Ada" });
     await finish({ greeting: run.outputs.greeting });`
  ],
  "api-probe-node-then-wire": [
    `import { workflow } from "@nodetool-ai/sandbox-dsl";
     import { stringInput } from "@nodetool-ai/sandbox-dsl/nodetool.input";
     import { template } from "@nodetool-ai/sandbox-dsl/nodetool.text";
     import { output } from "@nodetool-ai/sandbox-dsl/nodetool.output";
     await nodetool.nodes.search("render a text template");
     await nodetool.nodes.info("nodetool.text.Template");
     const probe = await nodetool.nodes.run("nodetool.text.Template", {
       string: "{{title}} — a field report",
       title: "Hello World"
     });
     const title = stringInput({ name: "title" });
     const line = template({
       string: "{{title}} — a field report",
       title: title.output()
     });
     const graph = workflow(output({ name: "line", value: line.output() }));
     const saved = await nodetool.workflows.create("Field report", graph);
     const run = await nodetool.workflows.run(saved.id, {
       title: "Fox In Snow"
     });
     await finish({ probe: probe.output, line: run.outputs.line });`
  ],
  "api-pick-model-and-batch-images": [
    `const catalog = await nodetool.models.list({ limit: 1000 });
     const providers = [...new Set((catalog.results || []).map((m) => m.provider))];
     const model = await nodetool.models.pick("text_to_image");
     const shots = [
       "a red fox in snow",
       "a fox by a river",
       "a fox on a rooftop"
     ];
     const runs = await nodetool.batch(
       shots,
       (prompt) => nodetool.media.generateImage(prompt, model),
       { concurrency: 2 }
     );
     const failed = runs.filter((r) => !r.ok);
     if (failed.length > 0) throw new Error(failed[0].error);
     await finish({
       provider: model.provider,
       model: model.model_id,
       uris: runs.map((r) => r.value.asset_uri)
     });`
  ],
  "api-generate-then-critique": [
    `const brief = "a red fox in deep snow";
     const imageModel = await nodetool.models.pick("text_to_image");
     const visionModel = await nodetool.models.pick("generate_message");
     const image = await nodetool.media.generateImage(brief, imageModel);
     const critique = await nodetool.media.critique(
       image.asset_uri,
       brief,
       visionModel
     );
     await finish({
       asset_uri: image.asset_uri,
       verdict: critique.verdict,
       score: critique.score
     });`
  ],
  "api-background-job-wait": [
    `const listed = await nodetool.workflows.list({});
     const wf = listed.workflows.filter((w) => w.name === "Shout Line")[0];
     const job = await nodetool.workflows.start(wf.id, { line: "ship it" });
     const settled = await nodetool.jobs.wait(job.id, {
       pollMs: 1000,
       timeoutMs: 60000
     });
     await finish({
       status: settled.status,
       shout: settled.outputs.shout
     });`
  ],
  "api-generation-cost": [
    `const listed = await nodetool.generations.list({ status: "completed" });
     const image = listed.generations.filter(
       (g) => g.capability === "text_to_image"
     )[0];
     const record = await nodetool.generations.get(image.generation_id);
     await finish({
       generation_id: record.generation_id,
       cost: record.cost,
       asset_id: record.asset_ids[0]
     });`
  ],
  "api-batch-existing-workflow": [
    `const listed = await nodetool.workflows.list({});
     const wf = listed.workflows.filter((w) => w.name === "Shout Line")[0];
     const runs = await nodetool.batch(
       ["alpha", "beta", "gamma"],
       (line) => nodetool.workflows.run(wf.id, { line: line }),
       { concurrency: 3 }
     );
     await finish({ shouts: runs.map((r) => r.value.outputs.shout) });`
  ],
  "api-interactive-escalation": [
    `const listed = await nodetool.workflows.list({});
     const wf = listed.workflows.filter((w) => w.name === "Greeting Builder")[0];
     const parked = await nodetool.workflows.run(
       wf.id,
       { name: "Ada" },
       { interactive: true }
     );
     const report = await nodetool.workflows.resolve(
       parked.session_id,
       parked.escalation.id,
       "retry"
     );
     await finish({
       greeting: report.outputs.greeting,
       action: report.interventions[0].action
     });`
  ],
  "api-delegate-subtask": [
    `const answer = await nodetool.agents.run(
       "Add these numbers and reply with JSON {\\"sum\\": N}: 12, 30 and 5."
     );
     await finish({ sum: answer.result.sum });`
  ],
  "api-asset-round-trip": [
    `const saved = await nodetool.assets.save("run-notes.txt", {
       content: "fox: ok",
       content_type: "text/plain"
     });
     const hits = await nodetool.assets.search("run-notes");
     const read = await nodetool.assets.read(hits.results[0].name);
     await finish({ asset_id: saved.id, content: read.content });`
  ]
};

const CORE_NAMESPACES = [
  "workflows",
  "nodes",
  "models",
  "media",
  "jobs",
  "assets",
  "agents"
] as const;

describe("codeact core-API eval cases", () => {
  it("every case is satisfiable by a scripted run and scores 1.0", async () => {
    const provider = createScriptedLoopProvider(
      CODEACT_API_CORE_CASES.map((c) => SOLUTIONS[c.id] ?? [])
    );

    const report = await runCodeActEval({
      provider,
      model: "scripted",
      cases: CODEACT_API_CORE_CASES
    });

    for (const result of report.cases) {
      expect(
        result.accepted,
        `${result.caseId}: ${JSON.stringify(result.checks)}`
      ).toBe(true);
      expect(result.score).toBe(1);
    }
    expect(report.summary.successRate).toBe(1);
  }, 180_000);

  it("scores a fabricated result as a failed check", async () => {
    const provider = createScriptedLoopProvider([
      [`await finish({ greeting: "nope" });`]
    ]);
    const report = await runCodeActEval({
      provider,
      model: "scripted",
      cases: [CODEACT_API_CORE_CASES[0]]
    });
    expect(report.cases[0].accepted).toBe(false);
    expect(report.cases[0].checks.some((c) => !c.pass)).toBe(true);
  }, 60_000);
});

describe("core-API toolbelt", () => {
  const beltNames = () =>
    new Set(createCoreApiTools(createCodeActRecorder()).map((t) => t.name));

  it("carries every belt tool of every core namespace", () => {
    const names = beltNames();
    for (const namespace of CORE_NAMESPACES) {
      for (const tool of NODETOOL_API_NAMESPACE_TOOLS[namespace]) {
        expect(names.has(tool), `${namespace}: missing ${tool}`).toBe(true);
      }
    }
  });

  it("carries every tool the cases require, and claims real namespaces", () => {
    const names = beltNames();
    for (const evalCase of CODEACT_API_CORE_CASES) {
      for (const tool of evalCase.expect.requiredTools ?? []) {
        expect(names.has(tool), `${evalCase.id}: missing ${tool}`).toBe(true);
      }
      expect(evalCase.namespaces?.length ?? 0).toBeGreaterThan(0);
      for (const namespace of evalCase.namespaces ?? []) {
        expect(
          Object.keys(NODETOOL_API_NAMESPACE_TOOLS),
          `${evalCase.id}: unknown namespace ${namespace}`
        ).toContain(namespace);
      }
      expect(evalCase.createTools).toBe(createCoreApiTools);
    }
  });

  it("builds a fresh world per call", () => {
    const first = createCoreApiTools(createCodeActRecorder());
    const second = createCoreApiTools(createCodeActRecorder());
    expect(first[0]).not.toBe(second[0]);
  });

  it("collectively covers every core namespace", () => {
    const claimed = new Set(
      CODEACT_API_CORE_CASES.flatMap((c) => [...(c.namespaces ?? [])])
    );
    for (const namespace of CORE_NAMESPACES) {
      expect(claimed.has(namespace), `no case exercises ${namespace}`).toBe(
        true
      );
    }
  });
});
