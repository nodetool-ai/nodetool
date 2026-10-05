/**
 * `POST /api/js-scripts/:id/run` — the non-tRPC run door.
 *
 * Real QuickJS sandbox, real model: the point is that a stored document's
 * body, ports and timeout are what executes, and that another user's script is
 * unreachable.
 */
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import * as agents from "@nodetool-ai/agents";
import {
  emptyJsScriptDocument,
  type JsScriptDocument
} from "@nodetool-ai/protocol/api-schemas/js-scripts.js";
import {
  Asset,
  createAppInstance,
  reserveAppRun,
  deleteAppRun,
  getAppRun,
  getAppInstance,
  JsScript,
  JsScriptVersion,
  ModelObserver,
  initTestDb
} from "@nodetool-ai/models";
import { FileStorageAdapter, type StorageAdapter } from "@nodetool-ai/storage";
import {
  BaseProvider,
  ProcessingContext,
  setDefaultModelInterfaces,
  type Message,
  type ProviderStreamItem
} from "@nodetool-ai/runtime";

import { createEmptyDocument } from "@nodetool-ai/app-runtime";
import jsScriptsRoutes from "../src/routes/js-scripts.js";
import { cancelAppRun } from "../src/lib/app-run-cancellation.js";

const USER_ID = "user-1";

async function buildServer(
  userId: string | null,
  storage?: StorageAdapter,
  exampleAppsDir?: string
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorateRequest("userId", null);
  app.addHook("onRequest", async (req) => {
    req.userId = userId;
  });
  await app.register(jsScriptsRoutes, {
    apiOptions: { exampleAppsDir },
    storage
  });
  await app.ready();
  return app;
}

async function seedScript(
  overrides: Partial<JsScriptDocument>,
  userId = USER_ID
): Promise<JsScript> {
  const script = new JsScript({
    user_id: userId,
    project_id: "p1",
    name: "Greeter",
    document: JSON.stringify({ ...emptyJsScriptDocument(), ...overrides })
  });
  await script.save();
  return script;
}

describe("POST /api/js-scripts/:id/run", () => {
  let app: FastifyInstance | null = null;

  beforeEach(() => initTestDb());
  afterEach(async () => {
    vi.restoreAllMocks();
    ModelObserver.clear();
    setDefaultModelInterfaces(null);
    await app?.close();
    app = null;
  });

  it("executes the reserved snapshot and settles instance state before replying", async () => {
    const script = await seedScript({
      code: 'await output("greeting", `hi ${inputs.who}`);',
      inputs: [{ name: "who", type: "str" }],
      outputs: [{ name: "greeting", type: "str" }]
    });
    const document = createEmptyDocument();
    document.variables = [
      { id: "answer", name: "Answer", scope: "instance", persist: true }
    ];
    document.operations = [
      {
        id: "greet",
        name: "Greet",
        workflowId: "",
        target: { kind: "script", scriptId: script.id, scriptVersion: 1 },
        inputs: { who: { from: "constant", value: "pinned" } },
        outputs: { greeting: { to: "variable", variableId: "answer" } },
        policy: "parallel"
      }
    ];
    const instance = await createAppInstance({
      userId: USER_ID,
      sourceId: "fixture",
      snapshot: {
        document,
        workflow_graphs: {},
        script_documents: { [script.id]: script.toDocument() }
      }
    });
    const reservation = await reserveAppRun({
      userId: USER_ID,
      instanceId: instance.id,
      operationId: "greet",
      invocationId: "request",
      origin: "ui"
    });
    if (!reservation.allowed) {
      throw new Error("Fixture reservation failed");
    }
    await script.update({
      document: JSON.stringify({
        ...script.toDocument(),
        code: 'await output("greeting", "changed head");'
      })
    });
    app = await buildServer(USER_ID);
    const payload = {
      app_run_id: reservation.run.id.slice(0, 12),
      instance_id: instance.id.slice(0, 12),
      inputs: { who: "untrusted override" }
    };
    const response = await app.inject({
      method: "POST",
      url: `/api/js-scripts/${script.id}/run`,
      payload
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      outputs: { greeting: "hi pinned" }
    });
    expect(await getAppRun(USER_ID, reservation.run.id)).toMatchObject({
      status: "completed",
      inputs: { who: "pinned" },
      outputs: {
        answer: "hi pinned",
        __app_outputs: { "greet:greeting": "hi pinned" }
      }
    });
    expect((await getAppInstance(USER_ID, instance.id))?.variables.answer).toBe(
      "hi pinned"
    );
    const retry = await app.inject({
      method: "POST",
      url: `/api/js-scripts/${script.id}/run`,
      payload
    });
    expect(retry.json()).toMatchObject({
      ok: true,
      outputs: { greeting: "hi pinned" }
    });
  });

  it("preserves completed script output when the run is deleted during execution", async () => {
    const script = await seedScript({
      code: 'await output("image", await image.toAsset(new Uint8Array([1,2,3]), {mimeType:"image/png"}));',
      outputs: [{ name: "image", type: "image" }]
    });
    const document = createEmptyDocument();
    document.operations = [
      {
        id: "generate",
        name: "Generate",
        workflowId: "",
        target: { kind: "script", scriptId: script.id, scriptVersion: 1 },
        inputs: {},
        outputs: {},
        policy: "parallel"
      }
    ];
    const instance = await createAppInstance({
      userId: USER_ID,
      sourceId: "deleted-fixture",
      snapshot: {
        document,
        workflow_graphs: {},
        script_documents: { [script.id]: script.toDocument() }
      }
    });
    const reservation = await reserveAppRun({
      userId: USER_ID,
      instanceId: instance.id,
      operationId: "generate",
      invocationId: "request",
      origin: "ui"
    });
    if (!reservation.allowed) {
      throw new Error("Fixture reservation failed");
    }
    setDefaultModelInterfaces({
      createAsset: async () => {
        await deleteAppRun(USER_ID, reservation.run.id);
        return { id: "retained-image" };
      }
    });
    app = await buildServer(USER_ID);
    const result = await app.inject({
      method: "POST",
      url: `/api/js-scripts/${script.id}/run`,
      payload: {
        app_run_id: reservation.run.id,
        instance_id: instance.id,
        inputs: {}
      }
    });
    expect(result.statusCode).toBe(200);
    expect(result.json()).toMatchObject({
      ok: true,
      outputs: { image: { asset_id: "retained-image" } }
    });
    expect(await getAppRun(USER_ID, reservation.run.id)).toBeNull();
  });

  it("cancels explicit owner requests and settles the authoritative run outcome", async () => {
    const script = await seedScript({
      code: 'for (let i=0;i<5;i++) { await sleep(5000); } await output("result", "late");',
      outputs: [{ name: "result", type: "str" }]
    });
    const document = createEmptyDocument();
    document.operations = [
      {
        id: "wait",
        name: "Wait",
        workflowId: "",
        target: { kind: "script", scriptId: script.id, scriptVersion: 1 },
        inputs: {},
        outputs: {},
        policy: "parallel"
      }
    ];
    const instance = await createAppInstance({
      userId: USER_ID,
      sourceId: "cancel-fixture",
      snapshot: {
        document,
        workflow_graphs: {},
        script_documents: { [script.id]: script.toDocument() }
      }
    });
    const reservation = await reserveAppRun({
      userId: USER_ID,
      instanceId: instance.id,
      operationId: "wait",
      invocationId: "cancel",
      origin: "ui"
    });
    if (!reservation.allowed) {
      throw new Error("Fixture reservation failed");
    }
    app = await buildServer(USER_ID);
    const execution = app.inject({
      method: "POST",
      url: `/api/js-scripts/${script.id}/run`,
      payload: {
        app_run_id: reservation.run.id,
        instance_id: instance.id,
        inputs: {}
      }
    });
    expect(cancelAppRun("foreign", reservation.run.id)).toBe(false);
    await vi.waitFor(() => {
      expect(cancelAppRun(USER_ID, reservation.run.id)).toBe(true);
    });
    const response = await execution;
    expect(response.statusCode).toBe(200);
    expect(response.json().ok).toBe(false);
    expect((await getAppRun(USER_ID, reservation.run.id))?.status).toBe(
      "cancelled"
    );
    expect(cancelAppRun(USER_ID, reservation.run.id)).toBe(false);
  });

  it("refuses foreign and mismatched app runs and records output-contract failures", async () => {
    const script = await seedScript({
      code: "return 1;",
      inputs: [],
      outputs: [{ name: "result", type: "int" }]
    });
    const document = createEmptyDocument();
    document.operations = [
      {
        id: "broken",
        name: "Broken",
        workflowId: "",
        target: { kind: "script", scriptId: script.id, scriptVersion: 1 },
        inputs: {},
        outputs: {},
        policy: "parallel"
      }
    ];
    const instance = await createAppInstance({
      userId: USER_ID,
      sourceId: "fixture",
      snapshot: {
        document,
        workflow_graphs: {},
        script_documents: { [script.id]: script.toDocument() }
      }
    });
    const reservation = await reserveAppRun({
      userId: USER_ID,
      instanceId: instance.id,
      operationId: "broken",
      invocationId: "request",
      origin: "ui"
    });
    if (!reservation.allowed) {
      throw new Error("Fixture reservation failed");
    }
    const payload = {
      app_run_id: reservation.run.id,
      instance_id: instance.id,
      inputs: {}
    };
    app = await buildServer("foreign");
    const foreign = await app.inject({
      method: "POST",
      url: `/api/js-scripts/${script.id}/run`,
      payload
    });
    expect(foreign.statusCode).toBe(404);
    await app.close();
    app = await buildServer(USER_ID);
    const mismatch = await app.inject({
      method: "POST",
      url: "/api/js-scripts/another-script/run",
      payload
    });
    expect(mismatch.statusCode).toBe(400);
    expect((await getAppRun(USER_ID, reservation.run.id))?.status).toBe(
      "running"
    );
    const result = await app.inject({
      method: "POST",
      url: `/api/js-scripts/${script.id}/run`,
      payload
    });
    expect(result.json().ok).toBe(false);
    expect((await getAppRun(USER_ID, reservation.run.id))?.status).toBe(
      "failed"
    );
  });

  it("runs a bundled example script without installing it and rejects unshipped keys", async () => {
    const dir = await mkdtemp(join(tmpdir(), "nodetool-example-script-"));
    try {
      await writeFile(
        join(dir, "greeter.app.json"),
        JSON.stringify({
          schemaVersion: 1,
          name: "Greeter",
          description: "A test app",
          app: createEmptyDocument(),
          workflows: [],
          scripts: [
            {
              key: "greet",
              name: "Greet",
              document: {
                ...emptyJsScriptDocument(),
                code: "await output('greeting', `hi ${inputs.who}`);",
                inputs: [{ name: "who", type: "str" }],
                outputs: [{ name: "greeting", type: "str" }]
              }
            }
          ]
        })
      );
      app = await buildServer(USER_ID, undefined, dir);
      const response = await app.inject({
        method: "POST",
        url: "/api/applications/examples/greeter/scripts/greet/run",
        payload: { inputs: { who: "world" } }
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        ok: true,
        outputs: { greeting: "hi world" }
      });
      expect(await JsScript.listByUser(USER_ID)).toEqual([]);
      const missing = await app.inject({
        method: "POST",
        url: "/api/applications/examples/greeter/scripts/missing/run",
        payload: {}
      });
      expect(missing.statusCode).toBe(404);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("runs a bundled example script in the user's personal project", async () => {
    const dir = await mkdtemp(join(tmpdir(), "nodetool-example-script-"));
    try {
      const asset = await Asset.create({
        user_id: USER_ID,
        name: "product.png",
        content_type: "image/png",
        parent_id: USER_ID,
        project_id: `personal:${USER_ID}`
      });
      await writeFile(
        join(dir, "reader.app.json"),
        JSON.stringify({
          schemaVersion: 1,
          name: "Reader",
          description: "A test app",
          app: createEmptyDocument(),
          workflows: [],
          scripts: [
            {
              key: "read",
              name: "Read",
              document: {
                ...emptyJsScriptDocument(),
                code: 'import { get_asset } from "@nodetool-ai/sandbox-nodetool/assets";\nconst found = await get_asset({ asset_id: inputs.id });\nawait output("name", found.name ?? found.error);',
                inputs: [{ name: "id", type: "str" }],
                outputs: [{ name: "name", type: "str" }]
              }
            }
          ]
        })
      );
      app = await buildServer(USER_ID, undefined, dir);
      const response = await app.inject({
        method: "POST",
        url: "/api/applications/examples/reader/scripts/read/run",
        payload: { inputs: { id: asset.id } }
      });
      expect(response.json()).toMatchObject({
        outputs: { name: "product.png" }
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("runs the stored body over the given inputs", async () => {
    const script = await seedScript({
      code: "await emit('greeting', `hi ${inputs.who}`);\nawait output('greeting', 'done');",
      inputs: [{ name: "who", type: "str" }],
      outputs: [{ name: "greeting", type: "str" }]
    });
    app = await buildServer(USER_ID);

    const response = await app.inject({
      method: "POST",
      url: `/api/js-scripts/${script.id}/run`,
      payload: { inputs: { who: "world" } }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(body.outputs).toEqual({ greeting: "done" });
    expect(body.streamed).toEqual([{ name: "greeting", value: "hi world" }]);
    expect(typeof body.duration_ms).toBe("number");
  });

  it("lets a script read an asset of the project the script belongs to", async () => {
    const asset = await Asset.create({
      user_id: USER_ID,
      name: "product.png",
      content_type: "image/png",
      parent_id: USER_ID,
      project_id: "p1"
    });
    const script = await seedScript({
      code:
        'import { get_asset } from "@nodetool-ai/sandbox-nodetool/assets";\n' +
        "const found = await get_asset({ asset_id: inputs.id });\n" +
        "await output('name', found.name ?? found.error);",
      inputs: [{ name: "id", type: "str" }],
      outputs: [{ name: "name", type: "str" }]
    });
    app = await buildServer(USER_ID);
    const response = await app.inject({
      method: "POST",
      url: `/api/js-scripts/${script.id}/run`,
      payload: { inputs: { id: asset.id } }
    });
    expect(response.json()).toMatchObject({ outputs: { name: "product.png" } });
  });

  it("streams agent text, tool calls and emits before the result when asked", async () => {
    // One scripted turn that calls a tool, then one that answers.
    const turns: ProviderStreamItem[][] = [
      [{ id: "call-1", name: "list_skills", args: {} }],
      [
        {
          type: "chunk",
          content: "Two skills.",
          content_type: "text",
          done: false
        }
      ]
    ];
    class ScriptedProvider extends BaseProvider {
      constructor() {
        super("scripted");
      }
      override async generateMessage(): Promise<Message> {
        throw new Error("Unused single-turn path.");
      }
      override async *generateMessages(): AsyncGenerator<ProviderStreamItem> {
        yield* turns.shift() ?? [];
      }
    }
    vi.spyOn(ProcessingContext.prototype, "getProvider").mockResolvedValue(
      new ScriptedProvider()
    );
    const script = await seedScript({
      code: `import { run_agent } from "@nodetool-ai/sandbox-nodetool/agents";
await emit("status", "starting");
const answer = await run_agent({prompt: "Count skills.", model: {provider: "scripted", id: "m"}, tools: ["list_skills"], label: "counter"});
await output("answer", answer.text);`,
      outputs: [
        { name: "answer", type: "str" },
        { name: "status", type: "str" }
      ]
    });
    app = await buildServer(USER_ID);

    const response = await app.inject({
      method: "POST",
      url: `/api/js-scripts/${script.id}/run`,
      headers: { accept: "application/x-ndjson" },
      payload: { inputs: {} }
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("application/x-ndjson");
    const lines = response.body
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    const kinds = lines.map((line) =>
      line.type === "message"
        ? `message:${(line.message as { type: string }).type}`
        : String(line.type)
    );
    expect(kinds).toEqual([
      "emit",
      "message:tool_call_update",
      "message:tool_result_update",
      "message:chunk",
      "result"
    ]);
    expect(lines[1].message).toMatchObject({
      node_id: "counter",
      name: "list_skills"
    });
    expect(lines[4].result).toMatchObject({
      ok: true,
      outputs: { answer: "Two skills." },
      streamed: [{ name: "status", value: "starting" }]
    });
    vi.restoreAllMocks();
  });

  it("runs an owned pinned version after the live script changes", async () => {
    const script = await seedScript({
      code: "await output('result', 'pinned');",
      outputs: [{ name: "result", type: "str" }]
    });
    const version = await JsScriptVersion.snapshot(script, {
      saveType: "manual"
    });
    script.document = JSON.stringify({
      ...script.toDocument(),
      code: "await output('result', 'latest');"
    });
    await script.save();
    app = await buildServer(USER_ID);
    const pinned = await app.inject({
      method: "POST",
      url: `/api/js-scripts/${script.id}/run`,
      payload: { script_version: version.version }
    });
    expect(pinned.statusCode).toBe(200);
    expect(pinned.json().outputs).toEqual({ result: "pinned" });
    const latest = await app.inject({
      method: "POST",
      url: `/api/js-scripts/${script.id}/run`,
      payload: {}
    });
    expect(latest.json().outputs).toEqual({ result: "latest" });
    const missing = await app.inject({
      method: "POST",
      url: `/api/js-scripts/${script.id}/run`,
      payload: { script_version: 999 }
    });
    expect(missing.statusCode).toBe(404);
  });

  it("fails closed for a malformed pinned snapshot", async () => {
    const script = await seedScript({
      code: "await output('result', 'live');",
      outputs: [{ name: "result", type: "str" }]
    });
    const version = await JsScriptVersion.snapshot(script, {
      saveType: "manual"
    });
    version.document = JSON.stringify({
      schemaVersion: 999,
      code: "await output('result', 'bad');"
    });
    await version.save();
    app = await buildServer(USER_ID);
    const response = await app.inject({
      method: "POST",
      url: `/api/js-scripts/${script.id}/run`,
      payload: { script_version: version.version }
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().detail).toBe("Invalid JS script version document");
  });

  it("rejects another owner's pinned version", async () => {
    const script = await seedScript(
      {
        code: "await output('result', 'secret');",
        outputs: [{ name: "result", type: "str" }]
      },
      "other-owner"
    );
    const version = await JsScriptVersion.snapshot(script, {
      saveType: "manual"
    });
    app = await buildServer(USER_ID);
    const response = await app.inject({
      method: "POST",
      url: `/api/js-scripts/${script.id}/run`,
      payload: { script_version: version.version }
    });
    expect(response.statusCode).toBe(404);
  });

  it("stages input_streams for a body that reads them with stream()", async () => {
    const script = await seedScript({
      code:
        "let total = 0;\nfor await (const n of stream('numbers')) {\n" +
        "  total += n;\n  await emit('running', total);\n}\n" +
        "await output('total', total);",
      inputs: [{ name: "numbers", type: "int" }],
      outputs: [
        { name: "running", type: "int" },
        { name: "total", type: "int" }
      ]
    });
    app = await buildServer(USER_ID);

    const response = await app.inject({
      method: "POST",
      url: `/api/js-scripts/${script.id}/run`,
      payload: { input_streams: { numbers: [1, 2, 3] } }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as Record<string, unknown>;
    expect(body.outputs).toEqual({ total: 6 });
    expect(body.streamed).toEqual([
      { name: "running", value: 1 },
      { name: "running", value: 3 },
      { name: "running", value: 6 }
    ]);
  });

  it("refuses input_streams naming an undeclared handle", async () => {
    const script = await seedScript({
      code: "for await (const n of stream('numbers')) { await emit('n', n); }",
      inputs: [{ name: "numbers", type: "int" }],
      outputs: [{ name: "n", type: "int" }]
    });
    app = await buildServer(USER_ID);

    const response = await app.inject({
      method: "POST",
      url: `/api/js-scripts/${script.id}/run`,
      payload: { input_streams: { nope: [1] } }
    });

    expect(response.statusCode).toBe(400);
    expect(String(response.json().detail)).toContain("nope");
  });

  it("does not fail a completed run when no outputs are declared", async () => {
    const script = await seedScript({
      code: "const unused = 1;"
    });
    app = await buildServer(USER_ID);

    const response = await app.inject({
      method: "POST",
      url: `/api/js-scripts/${script.id}/run`,
      payload: { inputs: {} }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as Record<string, unknown>;
    expect(body.ok).toBe(true);
  });

  it("fails a completed run that emits nothing against declared outputs", async () => {
    const script = await seedScript({
      code: "const unused = 1;",
      outputs: [
        { name: "palette", type: "list[str]" },
        { name: "hex", type: "str" }
      ]
    });
    app = await buildServer(USER_ID);

    const response = await app.inject({
      method: "POST",
      url: `/api/js-scripts/${script.id}/run`,
      payload: { inputs: {} }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as Record<string, unknown>;
    expect(body.ok).toBe(false);
    expect(String(body.error)).toContain("palette");
    expect(String(body.error)).toContain("hex");
    expect(String(body.error)).toContain("none of the declared outputs");
  });

  it("reports a body that throws instead of failing the request", async () => {
    const script = await seedScript({
      code: "throw new Error('boom');",
      outputs: [{ name: "out", type: "str" }]
    });
    app = await buildServer(USER_ID);

    const response = await app.inject({
      method: "POST",
      url: `/api/js-scripts/${script.id}/run`,
      payload: { inputs: {} }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as Record<string, unknown>;
    expect(body.ok).toBe(false);
    expect(String(body.error)).toContain("boom");
  });

  it.each([false, true])("does not serialize an unexpected thrown object's stack (stream=%s)", async (stream) => {
    const script = await seedScript({ code: 'await output("out", "ok");', outputs: [{ name: "out", type: "str" }] });
    const failure = {
      stack: "Error: host failure\n    at privateHandler (/srv/private/backend.js:42:7)",
      toString() { return this.stack; }
    };
    vi.spyOn(agents, "runCodeBody").mockRejectedValueOnce(failure);
    app = await buildServer(USER_ID);
    const response = await app.inject({
      method: "POST",
      url: `/api/js-scripts/${script.id}/run`,
      payload: { inputs: {} },
      ...(stream && { headers: { accept: "application/x-ndjson" } })
    });
    expect(response.statusCode).toBe(200);
    const body = stream ? JSON.parse(response.body.trim()).result : response.json();
    expect(body).toMatchObject({ ok: false, error: "Script execution failed" });
    expect(response.body).not.toContain("privateHandler");
    expect(response.body).not.toContain("backend.js");
  });

  it("gives the guest the Code-node toolbelt", async () => {
    const script = await seedScript({
      code:
        'await output("tools", typeof tools);\n' +
        'await output("list", typeof tools.list_js_scripts);',
      outputs: [
        { name: "tools", type: "str" },
        { name: "list", type: "str" }
      ]
    });
    app = await buildServer(USER_ID);

    const response = await app.inject({
      method: "POST",
      url: `/api/js-scripts/${script.id}/run`,
      payload: { inputs: {} }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      ok: boolean;
      outputs: Record<string, unknown>;
    };
    expect(body.ok).toBe(true);
    expect(body.outputs).toEqual({ tools: "object", list: "function" });
  });

  it("404s on another user's script", async () => {
    const script = await seedScript(
      { code: "await output('a', 1);" },
      "user-2"
    );
    app = await buildServer(USER_ID);

    const response = await app.inject({
      method: "POST",
      url: `/api/js-scripts/${script.id}/run`,
      payload: { inputs: {} }
    });
    expect(response.statusCode).toBe(404);
  });

  it("reads a video /api/storage ref the way extractFrame does", async () => {
    // Uploaded files arrive as /api/storage/<user>/<id>.bin. extractFrame
    // and media.bytes share that resolver.
    const dir = await mkdtemp(join(tmpdir(), "jsscript-video-"));
    try {
      const storage = new FileStorageAdapter(dir);
      const key = "1/87c6124bc9684facabb8cb3575dcb8ad.bin";
      const payload = new Uint8Array([1, 2, 3, 4, 5]);
      await storage.store(key, payload);
      const script = await seedScript({
        code:
          "const bytes = await media.bytes(inputs.video);\n" +
          'await output("size", bytes.length);',
        inputs: [{ name: "video", type: "video" }],
        outputs: [{ name: "size", type: "int" }]
      });
      app = await buildServer(USER_ID, storage);

      const response = await app.inject({
        method: "POST",
        url: `/api/js-scripts/${script.id}/run`,
        payload: {
          inputs: {
            video: { type: "video", uri: `/api/storage/${key}` }
          }
        }
      });

      expect(response.statusCode).toBe(200);
      const body = response.json() as {
        ok: boolean;
        error?: string;
        outputs?: Record<string, unknown>;
      };
      expect(body.error).toBeUndefined();
      expect(body.ok).toBe(true);
      expect(body.outputs).toEqual({ size: payload.length });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("promotes image.toAsset to an asset:// ref", async () => {
    setDefaultModelInterfaces({
      createAsset: async () => ({ id: "frame-1" })
    });
    const script = await seedScript({
      code: 'await output("image", await image.toAsset(new Uint8Array([1, 2, 3]), { mimeType: "image/png" }));',
      outputs: [{ name: "image", type: "image" }]
    });
    app = await buildServer(USER_ID);

    const response = await app.inject({
      method: "POST",
      url: `/api/js-scripts/${script.id}/run`,
      payload: { inputs: {} }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      ok: boolean;
      error?: string;
      outputs?: Record<string, unknown>;
    };
    expect(body.error).toBeUndefined();
    expect(body.ok).toBe(true);
    expect(body.outputs).toEqual({
      image: {
        type: "image",
        uri: "asset://frame-1",
        asset_id: "frame-1",
        mimeType: "image/png"
      }
    });
  });
}, 60_000);
