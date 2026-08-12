/**
 * `POST /api/js-scripts/:id/run` — the non-tRPC run door.
 *
 * Real QuickJS sandbox, real model: the point is that a stored document's
 * body, ports and timeout are what executes, and that another user's script is
 * unreachable.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import {
  emptyJsScriptDocument,
  type JsScriptDocument
} from "@nodetool-ai/protocol/api-schemas/js-scripts.js";
import { JsScript, ModelObserver, initTestDb } from "@nodetool-ai/models";

import jsScriptsRoutes from "../src/routes/js-scripts.js";

const USER_ID = "user-1";

async function buildServer(userId: string | null): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorateRequest("userId", null);
  app.addHook("onRequest", async (req) => {
    req.userId = userId;
  });
  await app.register(jsScriptsRoutes, { apiOptions: {} });
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
}, 60_000);
