/**
 * `POST /api/applications/build` — the server surface of the mini-app build
 * harness.
 *
 * The build itself is covered in `packages/agents`; what these cases hold is
 * the server's half of it: a scripted provider drives a real build through the
 * route and comes back as a `BuildReport` whose bundle is offered rather than
 * installed, a polled build is cancellable over HTTP and settles as failed,
 * and the tool an agent reaches for is on the editor-chat toolbelt.
 */

import { beforeEach, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { getAllMcpTools } from "@nodetool-ai/agents";
import { initTestDb, Workflow } from "@nodetool-ai/models";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import type {
  BaseProvider,
  ProviderStreamItem,
  ProviderTool
} from "@nodetool-ai/runtime";

import applicationsRoutes from "../src/routes/applications.js";
import type { AppBuildDeps } from "../src/lib/app-build-service.js";
import { handleDebugSessionRequest } from "../src/http-api.js";

const USER_ID = "user-1";
const APP = "app-under-build";

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
  edges: [
    {
      source: "in1",
      sourceHandle: "output",
      target: "out1",
      targetHandle: "value"
    }
  ]
};

/** A registry whose two node types echo a constant through the graph. */
const registry = {
  has: () => true,
  resolve: () => ({
    async process(ins: Record<string, unknown>): Promise<Record<string, unknown>> {
      return { output: ins["value"] ?? "a drafted note" };
    }
  }),
  getClass: () => undefined,
  resolveMetadata: () => undefined,
  getMetadata: () => undefined,
  listMetadata: () => [],
  validateNode: () => []
} as unknown as NodeRegistry;

const spec = () => ({
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

interface ScriptedCall {
  name: string;
  args: Record<string, unknown>;
}

/** Replays one scripted list of tool calls per turn, as `generateLoop` does. */
function scriptedProvider(
  scripts: ScriptedCall[][],
  hooks: { beforeTurn?: (signal?: AbortSignal) => Promise<void> } = {}
): BaseProvider {
  let turn = 0;
  const provider = {
    provider: "scripted",
    hasToolSupport: async () => true,
    getTotalCost: () => 0,
    // The judge stage grades each interaction with one structured call.
    generateMessageTraced: async () => ({
      role: "assistant",
      content: JSON.stringify({
        achieved: true,
        confidence: 1,
        reasons: ["the draft widget shows generated text"]
      })
    }),
    async *generateLoop(args: {
      tools?: ProviderTool[];
      signal?: AbortSignal;
    }): AsyncGenerator<ProviderStreamItem> {
      await hooks.beforeTurn?.(args.signal);
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
  return provider as unknown as BaseProvider;
}

/** The tool calls that author the app the spec above describes. */
const authorScript = (): ScriptedCall[] => [
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
  {
    name: "ui_app_finish",
    args: { application_id: APP, summary: "a drafting app" }
  }
];

async function buildServer(deps: AppBuildDeps): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorateRequest("userId", null);
  app.addHook("onRequest", async (req) => {
    req.userId = USER_ID;
  });
  await app.register(applicationsRoutes, {
    apiOptions: { registry },
    appBuild: { registry, loadProviders: async () => ({}), ...deps }
  });
  await app.ready();
  return app;
}

async function postBuild(
  app: FastifyInstance,
  payload: Record<string, unknown>
) {
  return app.inject({
    method: "POST",
    url: "/api/applications/build",
    headers: { "content-type": "application/json" },
    payload
  });
}

beforeEach(async () => {
  await initTestDb();
  await Workflow.create<Workflow>({
    id: "wf1",
    user_id: USER_ID,
    name: "Drafter workflow",
    graph: GRAPH
  });
});

describe("POST /api/applications/build", () => {
  it("runs a build with the request's provider and returns the report", async () => {
    const app = await buildServer({
      createProvider: async () => scriptedProvider([authorScript()])
    });
    const res = await postBuild(app, {
      spec: spec(),
      provider: "scripted",
      model: "m"
    });
    await app.close();

    expect(res.statusCode).toBe(200);
    const report = res.json() as Record<string, unknown>;
    expect(typeof report.build_id).toBe("string");
    expect(typeof report.session_id).toBe("string");
    const stages = report.stages as Array<{ stage: string }>;
    expect(stages.map((s) => s.stage).slice(0, 5)).toEqual([
      "spec",
      "plan",
      "author",
      "check",
      "run"
    ]);
    const verdict = report.verdict as { ok: boolean; reason: string };
    expect(verdict.reason).toBe("green on the first pass");
    expect(verdict.ok).toBe(true);
    expect(report.status).toBe("completed");
    // The bundle rides along with instructions, and nothing installed it.
    const bundle = report.bundle as { workflows: Array<{ key: string }> };
    expect(bundle.workflows.map((w) => w.key)).toEqual(["wf-draft"]);
    expect(String(report.install)).toContain("import-bundle");
  });

  it("rejects a build with neither prompt nor spec", async () => {
    const app = await buildServer({
      createProvider: async () => scriptedProvider([[]])
    });
    const res = await postBuild(app, { provider: "scripted", model: "m" });
    await app.close();

    expect(res.statusCode).toBe(400);
    expect(res.body).toContain("prompt or a spec");
  });

  it("rejects a build with no provider or model", async () => {
    const app = await buildServer({
      createProvider: async () => scriptedProvider([[]])
    });
    const res = await postBuild(app, { prompt: "a drafting app" });
    await app.close();

    expect(res.statusCode).toBe(400);
    expect(res.body).toContain("provider and a model");
  });

  it("cancels a polled build over HTTP and reports it as failed", async () => {
    let released: (() => void) | null = null;
    const blocked = new Promise<void>((resolve) => {
      released = resolve;
    });
    let sawAbort = false;
    const app = await buildServer({
      createProvider: async () =>
        scriptedProvider([authorScript()], {
          beforeTurn: async (signal) => {
            released?.();
            await new Promise<void>((resolve) => {
              if (signal?.aborted) return resolve();
              signal?.addEventListener("abort", () => resolve(), { once: true });
            });
            sawAbort = signal?.aborted === true;
          }
        })
    });

    const started = await postBuild(app, {
      spec: spec(),
      provider: "scripted",
      model: "m",
      poll: true
    });
    expect(started.statusCode).toBe(200);
    const pending = started.json() as Record<string, unknown>;
    expect(pending.status).toBe("running");
    const sessionId = pending.session_id as string;

    // The build is inside the author turn — cancel reaches a live provider call.
    await blocked;
    const cancelled = await handleDebugSessionRequest(
      new Request("http://localhost/x", {
        method: "POST",
        headers: { "x-user-id": USER_ID }
      }),
      sessionId,
      "cancel"
    );
    await app.close();

    expect(cancelled.status).toBe(200);
    const report = (await cancelled.json()) as Record<string, unknown>;
    expect(sawAbort).toBe(true);
    expect(report.session_id).toBe(sessionId);
    expect(report.status).toBe("failed");
    expect((report.verdict as { ok: boolean }).ok).toBe(false);
    expect((report.verdict as { reason: string }).reason).toContain("cancelled");
    expect(report.bundle).toBeNull();
  });
});

describe("the app-build agent tool", () => {
  it("is gone — an agent builds an app with the ui_app_* tools", () => {
    const names = getAllMcpTools().map((t) => t.name);
    expect(names).not.toContain("build_app");
    expect(names).toContain("debug_app");
  });
});
