/**
 * `POST /api/applications/debug` — the server surface of the mini-app debug
 * harness.
 *
 * The simulation itself is covered in `packages/execution`; what these cases
 * hold is the server's half of it: a draft posted inline is graded without ever
 * being saved, a static check costs one round trip and names the wiring it
 * cannot resolve, a run goes through the shared kernel runner, and an
 * application id nobody owns is a miss rather than someone else's app.
 */

import { beforeEach, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { Application, initTestDb, Workflow } from "@nodetool-ai/models";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";

import applicationsRoutes from "../src/routes/applications.js";
import type { AppDebugDeps } from "../src/lib/app-debug-service.js";
import { handleDebugSessionRequest } from "../src/http-api.js";

const USER_ID = "user-1";

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

/** A registry whose two node types echo the input through the graph. */
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

/** The same registry, slow enough that a cancel can reach a live run. */
const slowRegistry = {
  ...registry,
  resolve: () => ({
    async process(ins: Record<string, unknown>): Promise<Record<string, unknown>> {
      await new Promise((resolve) => setTimeout(resolve, 300));
      return { output: ins["value"] ?? "a drafted note" };
    }
  })
} as unknown as NodeRegistry;

/** A draft the assistant would be holding: one operation, three widgets. */
const document = (outputBinding = "op:main/out:out1") => ({
  schemaVersion: 3,
  ui: {
    root: { props: { title: "Drafter" } },
    content: [
      {
        type: "TextInput",
        props: { id: "TextInput-1", label: "Prompt", binding: "op:main/in:in1" }
      },
      {
        type: "Markdown",
        props: { id: "Markdown-1", label: "Draft", binding: outputBinding }
      },
      {
        type: "Button",
        props: {
          id: "Button-1",
          label: "Draft it",
          events: [{ trigger: "click", kind: "run", operationId: "main" }]
        }
      }
    ],
    zones: {}
  },
  operations: [
    {
      id: "main",
      name: "Run",
      workflowId: "wf1",
      inputs: {},
      outputs: {},
      policy: "replace"
    }
  ],
  resources: [],
  variables: []
});

async function buildServer(deps: AppDebugDeps = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorateRequest("userId", null);
  app.addHook("onRequest", async (req) => {
    req.userId = USER_ID;
  });
  await app.register(applicationsRoutes, {
    apiOptions: { registry },
    appDebug: { registry, ...deps }
  });
  await app.ready();
  return app;
}

async function postDebug(
  app: FastifyInstance,
  payload: Record<string, unknown>
) {
  return app.inject({
    method: "POST",
    url: "/api/applications/debug",
    headers: { "content-type": "application/json" },
    payload
  });
}

/** Read a session until it stops reporting `running`. */
async function pollUntilSettled(
  sessionId: string
): Promise<Record<string, unknown>> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const res = await handleDebugSessionRequest(
      new Request("http://localhost/x", { headers: { "x-user-id": USER_ID } }),
      sessionId,
      null
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    if (body.status !== "running") return body;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("session never settled");
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

describe("POST /api/applications/debug", () => {
  it("grades an inline draft statically, without running it", async () => {
    const app = await buildServer();
    const res = await postDebug(app, { document: document(), run: false });
    await app.close();

    expect(res.statusCode).toBe(200);
    const body = res.json() as Record<string, unknown>;
    expect(body.status).toBe("completed");
    expect(typeof body.session_id).toBe("string");
    expect(body.app).toEqual({ title: "Drafter", widgetCount: 3 });
    const verdict = body.verdict as { ok: boolean; headline: string };
    expect(verdict.ok).toBe(true);
    expect(verdict.headline).toContain("static check only");
    expect(body.invocations).toEqual([]);
    const widgets = body.widgets as Array<{ id: string; binding: string }>;
    expect(widgets.map((w) => w.id)).toEqual([
      "TextInput-1",
      "Markdown-1",
      "Button-1"
    ]);
    // The full report stays on the server; a chat turn gets the summary.
    expect(body).not.toHaveProperty("runs");
    expect(body).not.toHaveProperty("spec");
  });

  it("names a binding the workflow cannot resolve", async () => {
    const app = await buildServer();
    // A guessed bare name — what an assistant writes when it binds without
    // asking `ui_app_get_binding_targets` what the workflow actually has.
    const res = await postDebug(app, { document: document("draft"), run: false });
    await app.close();

    expect(res.statusCode).toBe(200);
    const body = res.json() as Record<string, unknown>;
    expect(body.status).toBe("failed");
    const verdict = body.verdict as { ok: boolean; issues: string[] };
    expect(verdict.ok).toBe(false);
    expect(verdict.issues.join(" ")).toContain(
      'Markdown "Markdown-1": bound to "draft"'
    );
  });

  it("runs the draft on the kernel and reports what each widget shows", async () => {
    const app = await buildServer();
    const res = await postDebug(app, {
      document: document(),
      params: { prompt: "a haiku" }
    });
    await app.close();

    expect(res.statusCode).toBe(200);
    const body = res.json() as Record<string, unknown>;
    const verdict = body.verdict as { ok: boolean; issues: string[] };
    expect(verdict.issues).toEqual([]);
    expect(verdict.ok).toBe(true);
    const invocations = body.invocations as Array<{
      operationId: string;
      status: string;
    }>;
    expect(invocations).toHaveLength(1);
    expect(invocations[0]).toMatchObject({ operationId: "main" });
    const draft = (body.widgets as Array<{ id: string; hasValue: boolean }>).find(
      (w) => w.id === "Markdown-1"
    );
    expect(draft?.hasValue).toBe(true);
  });

  it("reports a document that is not an application document", async () => {
    const app = await buildServer();
    const res = await postDebug(app, { document: { nope: true }, run: false });
    await app.close();

    expect(res.statusCode).toBe(200);
    const body = res.json() as Record<string, unknown>;
    const verdict = body.verdict as { ok: boolean; issues: string[] };
    expect(verdict.ok).toBe(false);
    expect(verdict.issues.join(" ")).toContain("document posted");
  });

  it("debugs a saved application by id", async () => {
    await Application.create<Application>({
      id: "app-1",
      user_id: USER_ID,
      name: "Drafter",
      document: JSON.stringify(document())
    });
    const app = await buildServer();
    const res = await postDebug(app, { application_id: "app-1", run: false });
    await app.close();

    expect(res.statusCode).toBe(200);
    const body = res.json() as Record<string, unknown>;
    expect((body.verdict as { ok: boolean }).ok).toBe(true);
    expect(body.target).toMatchObject({ ref: "app-1", source: "application" });
  });

  it("404s on an application id the user does not own", async () => {
    await Application.create<Application>({
      id: "app-other",
      user_id: "someone-else",
      name: "Not yours",
      document: JSON.stringify(document())
    });
    const app = await buildServer();
    const mine = await postDebug(app, { application_id: "app-other" });
    const missing = await postDebug(app, { application_id: "app-nope" });
    await app.close();

    expect(mine.statusCode).toBe(404);
    expect(missing.statusCode).toBe(404);
    expect(missing.body).toContain("app-nope");
  });

  it("fronts a polled run with a session that settles with the report", async () => {
    const app = await buildServer();
    const started = await postDebug(app, { document: document(), poll: true });
    expect(started.statusCode).toBe(200);
    const pending = started.json() as Record<string, unknown>;
    expect(pending.status).toBe("running");

    const body = await pollUntilSettled(pending.session_id as string);
    await app.close();

    expect(body.status).toBe("completed");
    expect((body.verdict as { ok: boolean }).ok).toBe(true);
  });

  it("cancels a polled run and settles the session as failed", async () => {
    // A run that is still going when the cancel lands — a settled run would
    // report its own verdict and the cancel would be a no-op.
    const app = await buildServer({ registry: slowRegistry });
    const started = await postDebug(app, { document: document(), poll: true });
    const sessionId = (started.json() as Record<string, unknown>)
      .session_id as string;

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
    const body = (await cancelled.json()) as Record<string, unknown>;
    expect(body.status).toBe("failed");
    expect((body.verdict as { ok: boolean }).ok).toBe(false);
    expect(String(body.error)).toContain("cancelled");
  });

  it("rejects a request with neither application_id nor document", async () => {
    const app = await buildServer();
    const res = await postDebug(app, { run: false });
    await app.close();

    expect(res.statusCode).toBe(400);
    expect(res.body).toContain("application_id or a document");
  });

  it("rejects a request carrying both", async () => {
    const app = await buildServer();
    const res = await postDebug(app, {
      application_id: "app-1",
      document: document(),
      run: false
    });
    await app.close();

    expect(res.statusCode).toBe(400);
    expect(res.body).toContain("not both");
  });
});
