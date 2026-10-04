/**
 * JS script run endpoint — `POST /api/js-scripts/:id/run`.
 *
 * The web app reads and writes scripts over `/trpc/jsScripts.*`; this is the
 * one non-tRPC door, for the run/test console, mini apps, and the CLI harness.
 *
 * It executes the stored document through `runCodeBody` — the same core
 * `run_code` and `test_code` already share — so a script run and a Code-node
 * run are one execution path. The script's own envelope is what applies: its
 * declared packages, its declared secrets, its timeout capped at
 * `JS_SCRIPT_MAX_TIMEOUT_SECONDS`, and the Code-node toolbelt.
 *
 * The response is plain JSON, unless the request accepts
 * `application/x-ndjson`. Then the run streams: one JSON line per agent
 * message (text, tool calls, progress) and per emit as they happen, and a
 * final `{type: "result"}` line with the body the JSON answer would carry.
 * A mini app asks for the stream, so an agent inside a script shows its work
 * while it runs instead of after.
 */

import { PassThrough } from "node:stream";
import type { FastifyPluginAsync } from "fastify";
import {
  SCRIPT_RUN_STREAM_CONTENT_TYPE,
  type ScriptStreamLine
} from "@nodetool-ai/app-runtime";
import { runCodeBody } from "@nodetool-ai/agents";
import {
  emptyDeclaredJsScriptOutputsError,
  missingDeclaredJsScriptOutputs
} from "@nodetool-ai/execution/js-script-debug";
import {
  createJsScriptResolver,
  getSecret,
  JsScript,
  Project
} from "@nodetool-ai/models";
import {
  PERMISSION_GATE_CONTEXT_KEY,
  ProcessingContext,
  headlessGate
} from "@nodetool-ai/runtime";
import type { ProcessingMessage } from "@nodetool-ai/protocol";
import {
  JS_SCRIPT_MAX_TIMEOUT_SECONDS,
  runJsScriptRequest,
  jsScriptDocument,
  type JsScriptDocument,
  type RunJsScriptRequest,
  type RunJsScriptResponse
} from "@nodetool-ai/protocol/api-schemas/js-scripts.js";
import type { StorageAdapter } from "@nodetool-ai/storage";
import { bridge, streamedResponse } from "../lib/bridge.js";
import type { HttpApiOptions } from "../http-api.js";
import { getUserId } from "../lib/user-id.js";
import { getExampleAppBundle } from "../lib/example-apps.js";
import { getAssetAdapter } from "../lib/storage.js";

interface RouteOptions {
  apiOptions: HttpApiOptions;
  storage?: StorageAdapter;
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data ?? null), {
    status,
    headers: { "content-type": "application/json" }
  });
}

/** A decoded JSON request body, before a schema validates its shape. */
type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/** The run messages a streamed run relays: what an agent inside it is doing. */
const RELAYED_MESSAGES: ReadonlySet<string> = new Set([
  "chunk",
  "tool_call_update",
  "tool_result_update",
  "planning_update",
  "task_update",
  "node_progress"
]);

const wantsStream = (request: Request): boolean =>
  (request.headers.get("accept") ?? "").includes(SCRIPT_RUN_STREAM_CONTENT_TYPE);

async function readJsonBody(request: Request): Promise<JsonValue> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) return {};
  try {
    return await request.json();
  } catch {
    return {};
  }
}

export async function handleJsScriptRun(
  request: Request,
  id: string,
  opts: RouteOptions
): Promise<Response> {
  const { apiOptions } = opts;
  const userId = getUserId(request, apiOptions.userIdHeader ?? "x-user-id");
  const script = await JsScript.findById(id);
  // Scripts are per-user, like sketches and timelines: another owner's
  // script is an absence, not a refusal.
  if (!script || script.user_id !== userId) {
    return jsonResponse({ detail: "JS script not found" }, 404);
  }

  const parsedBody = runJsScriptRequest.safeParse(await readJsonBody(request));
  if (!parsedBody.success) {
    return jsonResponse(
      { detail: parsedBody.error.issues[0]?.message ?? "Invalid body" },
      400
    );
  }

  let document: JsScriptDocument;
  if (parsedBody.data.script_version !== undefined) {
    const resolved = await createJsScriptResolver().resolve(
      { id: script.id, version: parsedBody.data.script_version },
      userId
    );
    if (!resolved) {
      return jsonResponse({ detail: "JS script version not found" }, 404);
    }
    const parsedDocument = jsScriptDocument.safeParse(resolved.document);
    if (!parsedDocument.success) {
      return jsonResponse(
        { detail: "Invalid JS script version document" },
        400
      );
    }
    document = parsedDocument.data;
  } else {
    document = script.toDocument();
  }
  return executeScriptDocument(
    userId,
    script.id,
    document,
    parsedBody.data,
    opts,
    wantsStream(request),
    script.project_id
  );
}

async function executeScriptDocument(
  userId: string,
  id: string,
  document: JsScriptDocument,
  input: RunJsScriptRequest,
  opts: RouteOptions,
  stream = false,
  projectId?: string | null
): Promise<Response> {
  const staged = input.input_streams;
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

  const lines = stream ? new PassThrough() : null;
  const send = (line: ScriptStreamLine): void => {
    lines?.write(`${JSON.stringify(line)}\n`);
  };
  const context = new ProcessingContext({
    jobId: `js-script-${id}-${Date.now()}`,
    userId,
    // A script works in its own project: without it the run falls into the
    // "default" project and cannot see the assets and documents it belongs with.
    ...(projectId && { projectId }),
    secretResolver: getSecret,
    storage: opts.storage ?? getAssetAdapter(),
    ...(lines && {
      onMessage: (message: ProcessingMessage) => {
        if (RELAYED_MESSAGES.has(message.type)) {
          send({ type: "message", message: { ...message } });
        }
      }
    })
  });
  context.set(PERMISSION_GATE_CONTEXT_KEY, headlessGate("JS script run"));

  const runOptions: Parameters<typeof runCodeBody>[1] = {
    code: document.code,
    inputs: input.inputs,
    secrets: document.secrets,
    timeoutSeconds: Math.min(
      document.timeoutSeconds,
      JS_SCRIPT_MAX_TIMEOUT_SECONDS
    ),
    withToolbelt: true
  };
  if (staged) {
    runOptions.inputStreams = staged;
  }
  if (lines) {
    runOptions.onEmit = (name, value) => send({ type: "emit", name, value });
    // The run continues after the response starts. The result line ends it.
    void runCodeBody(context, runOptions).then(
      (result) => {
        send({ type: "result", result: scriptRunBody(document, result) });
        lines.end();
      },
      (error: unknown) => {
        send({
          type: "result",
          result: {
            ok: false,
            logs: [],
            error: error instanceof Error ? error.message : String(error),
            duration_ms: 0
          }
        });
        lines.end();
      }
    );
    return streamedResponse(lines, {
      status: 200,
      headers: {
        "content-type": SCRIPT_RUN_STREAM_CONTENT_TYPE,
        "cache-control": "no-store"
      }
    });
  }
  return jsonResponse(
    scriptRunBody(document, await runCodeBody(context, runOptions))
  );
}

/** The response body for one finished run, checked against the declared outputs. */
function scriptRunBody(
  document: JsScriptDocument,
  result: Awaited<ReturnType<typeof runCodeBody>>
): RunJsScriptResponse {
  // A declared-output script that finishes with `outputs: {}` is a
  // failed contract, not a 500 — same shape as a body that throws.
  const missing = result.ok
    ? missingDeclaredJsScriptOutputs(document.outputs, result.outputs)
    : [];
  const failedEmptyBag = missing.length > 0;
  const body: RunJsScriptResponse = {
    ok: failedEmptyBag ? false : result.ok,
    logs: result.logs,
    duration_ms: result.duration_ms
  };
  if (result.outputs !== undefined) {
    body.outputs = result.outputs;
  }
  if (result.streamed !== undefined) {
    body.streamed = result.streamed;
  }
  if (failedEmptyBag) {
    body.error = emptyDeclaredJsScriptOutputsError(missing);
  } else if (result.error !== undefined) {
    body.error = result.error;
  }
  return body;
}

export async function handleExampleAppScriptRun(
  request: Request,
  slug: string,
  key: string,
  opts: RouteOptions
): Promise<Response> {
  const userId = getUserId(request, opts.apiOptions.userIdHeader ?? "x-user-id");
  const script = getExampleAppBundle(opts.apiOptions, slug)?.scripts.find((item) => item.key === key);
  if (!script) {
    return jsonResponse({ detail: "Example app script not found" }, 404);
  }
  const parsed = runJsScriptRequest.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return jsonResponse({ detail: "Invalid script inputs" }, 400);
  }
  // An example has no project of its own, so it runs in the user's personal
  // project: where their uploads land and where the example saves its work.
  await Project.ensurePersonal(userId);
  return executeScriptDocument(userId, `example-${slug}-${key}`, jsScriptDocument.parse(script.document), parsed.data, opts, wantsStream(request), `personal:${userId}`);
}

const jsScriptsRoutes: FastifyPluginAsync<RouteOptions> = async (app, opts) => {
  app.post("/api/applications/examples/:slug/scripts/:key/run", async (req, reply) => {
    const { slug, key } = req.params as { slug: string; key: string };
    await bridge(req, reply, (request) => handleExampleAppScriptRun(request, slug, key, opts));
    // A streamed run is still being sent when bridge returns.
    return reply;
  });
  app.post("/api/js-scripts/:id/run", async (req, reply) => {
    const { id } = req.params as { id: string };
    await bridge(req, reply, (request) => handleJsScriptRun(request, id, opts));
    return reply;
  });
};

export default jsScriptsRoutes;
