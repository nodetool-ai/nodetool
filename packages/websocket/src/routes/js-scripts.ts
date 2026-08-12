/**
 * JS script run endpoint — `POST /api/js-scripts/:id/run`.
 *
 * The web app reads and writes scripts over `/trpc/jsScripts.*`; this is the
 * one non-tRPC door, for the run/test console, mini apps, and the CLI harness.
 *
 * It executes the stored document through `runCodeBody` — the hermetic core
 * `run_code` and `test_code` already share — so a script run and a Code-node
 * authoring run are one execution path. The script's own envelope is what
 * applies: its declared packages, its declared secrets, and its timeout capped
 * at `JS_SCRIPT_MAX_TIMEOUT_SECONDS`. There is no toolbelt.
 *
 * The response is plain JSON. The design's streaming parity (`node_progress`
 * per `progress()`, per-emit output messages) lands with the mini-app
 * operation target in phase 3; nothing consuming this endpoint today needs it.
 */

import type { FastifyPluginAsync } from "fastify";
import { runCodeBody } from "@nodetool-ai/agents";
import { getSecret, JsScript } from "@nodetool-ai/models";
import { ProcessingContext } from "@nodetool-ai/runtime";
import {
  JS_SCRIPT_MAX_TIMEOUT_SECONDS,
  runJsScriptRequest,
  type RunJsScriptResponse
} from "@nodetool-ai/protocol/api-schemas/js-scripts.js";
import { bridge } from "../lib/bridge.js";
import { getUserId, type HttpApiOptions } from "../http-api.js";

interface RouteOptions {
  apiOptions: HttpApiOptions;
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data ?? null), {
    status,
    headers: { "content-type": "application/json" }
  });
}

async function readJsonBody(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) return {};
  try {
    return await request.json();
  } catch {
    return {};
  }
}

const jsScriptsRoutes: FastifyPluginAsync<RouteOptions> = async (app, opts) => {
  const { apiOptions } = opts;

  app.post("/api/js-scripts/:id/run", async (req, reply) => {
    const { id } = req.params as { id: string };
    await bridge(req, reply, async (request) => {
      const userId = getUserId(
        request,
        apiOptions.userIdHeader ?? "x-user-id"
      );
      const script = await JsScript.findById(id);
      // Scripts are per-user, like sketches and timelines: another owner's
      // script is an absence, not a refusal.
      if (!script || script.user_id !== userId) {
        return jsonResponse({ detail: "JS script not found" }, 404);
      }

      const parsedBody = runJsScriptRequest.safeParse(
        await readJsonBody(request)
      );
      if (!parsedBody.success) {
        return jsonResponse(
          { detail: parsedBody.error.issues[0]?.message ?? "Invalid body" },
          400
        );
      }

      const document = script.toDocument();
      const staged = parsedBody.data.input_streams;
      if (staged) {
        const declared = new Set(document.inputs.map((port) => port.name));
        const undeclared = Object.keys(staged).filter(
          (handle) => !declared.has(handle)
        );
        if (undeclared.length > 0) {
          return jsonResponse(
            {
              detail:
                `input_streams names ${undeclared.join(", ")}, which this ` +
                "script does not declare as inputs"
            },
            400
          );
        }
      }

      const context = new ProcessingContext({
        jobId: `js-script-${script.id}-${Date.now()}`,
        userId,
        secretResolver: getSecret
      });

      const result = await runCodeBody(context, {
        code: document.code,
        inputs: parsedBody.data.inputs,
        ...(staged ? { inputStreams: staged } : {}),
        packages: document.packages.map((pack) => pack.specifier),
        secrets: document.secrets,
        timeoutSeconds: Math.min(
          document.timeoutSeconds,
          JS_SCRIPT_MAX_TIMEOUT_SECONDS
        )
      });

      const body: RunJsScriptResponse = {
        ok: result.ok,
        ...(result.outputs !== undefined ? { outputs: result.outputs } : {}),
        ...(result.streamed !== undefined ? { streamed: result.streamed } : {}),
        logs: result.logs,
        ...(result.error !== undefined ? { error: result.error } : {}),
        duration_ms: result.duration_ms
      };
      return jsonResponse(body);
    });
  });
};

export default jsScriptsRoutes;
