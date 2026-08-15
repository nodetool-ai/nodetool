/**
 * `POST /api/js-scripts/:id/run` — the non-tRPC run door.
 *
 * Real QuickJS sandbox, real model: the point is that a stored document's
 * body, ports and timeout are what executes, and that another user's script is
 * unreachable.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import {
  emptyJsScriptDocument,
  type JsScriptDocument
} from "@nodetool-ai/protocol/api-schemas/js-scripts.js";
import { JsScript, ModelObserver, initTestDb } from "@nodetool-ai/models";
import { FileStorageAdapter, type StorageAdapter } from "@nodetool-ai/storage";
import { setDefaultModelInterfaces } from "@nodetool-ai/runtime";

import jsScriptsRoutes from "../src/routes/js-scripts.js";

const USER_ID = "user-1";

async function buildServer(
  userId: string | null,
  storage?: StorageAdapter
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorateRequest("userId", null);
  app.addHook("onRequest", async (req) => {
    req.userId = userId;
  });
  await app.register(jsScriptsRoutes, { apiOptions: {}, storage });
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
    ModelObserver.clear();
    setDefaultModelInterfaces(null);
    await app?.close();
    app = null;
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
    const script = await seedScript({ code: "await output('a', 1);" }, "user-2");
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
      code:
        'await output("image", await image.toAsset(new Uint8Array([1, 2, 3]), { mimeType: "image/png" }));',
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
