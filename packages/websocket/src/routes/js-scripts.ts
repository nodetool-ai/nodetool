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
  createInstanceState,
  resolveOperationParams,
  operationTarget,
  parseApplicationDocument,
  stateKey,
  type OperationBinding,
  type ResourceRef,
  SCRIPT_RUN_STREAM_CONTENT_TYPE,
  type ScriptStreamLine
} from "@nodetool-ai/app-runtime";
import { runCodeBody } from "@nodetool-ai/agents";
import {
  createFalGenerationLifecycleHooks,
  attachRunCostLedger
} from "@nodetool-ai/execution";
import { scriptOperationInvocation } from "@nodetool-ai/execution/app-debug";
import type { AppRunRecord } from "@nodetool-ai/protocol/api-schemas/app-runs.js";
import {
  emptyDeclaredJsScriptOutputsError,
  missingDeclaredJsScriptOutputs
} from "@nodetool-ai/execution/js-script-debug";
import {
  AppRunError,
  getAppRun,
  getAppInstance,
  claimAppRun,
  setAppRunInputs,
  settleAppRun,
  reconcileAppRunCost,
  createJsScriptResolver,
  getSecret,
  JsScript,
  Project
} from "@nodetool-ai/models";
import {
  PERMISSION_GATE_CONTEXT_KEY,
  ProcessingContext,
  headlessGate,
  inAppRunCostAccount
} from "@nodetool-ai/runtime";
import { isRecord } from "@nodetool-ai/protocol";
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
import { getInstanceId } from "../lib/instance-id.js";
import { registerAppRunCancellation } from "../lib/app-run-cancellation.js";
import { getUserId, type HttpApiOptions } from "../http-api.js";
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
  (request.headers.get("accept") ?? "").includes(
    SCRIPT_RUN_STREAM_CONTENT_TYPE
  );

async function readJsonBody(request: Request): Promise<JsonValue> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return {};
  }
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
  const parsedBody = runJsScriptRequest.safeParse(await readJsonBody(request));
  if (!parsedBody.success) {
    return jsonResponse(
      { detail: parsedBody.error.issues[0]?.message ?? "Invalid body" },
      400
    );
  }
  const appRun = await resolveAppScriptRun(userId, parsedBody.data, [id]);
  if (appRun instanceof Response) {
    return appRun;
  }
  if (appRun) {
    const sourceScript = await JsScript.findById(id);
    const projectId =
      sourceScript?.user_id === userId
        ? sourceScript.project_id
        : `personal:${userId}`;
    if (!sourceScript) {
      await Project.ensurePersonal(userId);
    }
    return executeScriptDocument(
      userId,
      id,
      appRun.document,
      parsedBody.data,
      opts,
      wantsStream(request),
      projectId,
      appRun
    );
  }
  const script = await JsScript.findById(id);
  // Scripts are per-user, like sketches and timelines: another owner's
  // script is an absence, not a refusal.
  if (!script || script.user_id !== userId) {
    return jsonResponse({ detail: "JS script not found" }, 404);
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
  ...args: Parameters<typeof executeScriptDocumentInner>
): Promise<Response> {
  try {
    return await executeScriptDocumentInner(...args);
  } catch (error) {
    const [userId, , , , , , , appRun] = args;
    if (!appRun) {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    await settleAppRunIfPresent(userId, appRun.run.id, {
      status: "failed",
      error: message
    });
    return jsonResponse({
      ok: false,
      logs: [],
      error: message,
      duration_ms: 0
    });
  }
}

async function executeScriptDocumentInner(
  userId: string,
  id: string,
  document: JsScriptDocument,
  input: RunJsScriptRequest,
  opts: RouteOptions,
  stream = false,
  projectId?: string | null,
  appRun?: AppScriptRun
): Promise<Response> {
  if (appRun && appRun.run.status !== "running") {
    return jsonResponse(replayedAppScriptResult(appRun));
  }
  if (appRun && !(await claimAppRun(userId, appRun.run.id, getInstanceId()))) {
    return jsonResponse({ detail: "App operation is already executing" }, 409);
  }
  if (appRun) {
    const state = createInstanceState();
    state.variables = { ...appRun.variables };
    for (const port of document.inputs) {
      state.inputs[
        stateKey({
          kind: "input",
          operationId: appRun.operation.id,
          nodeId: port.name
        })
      ] = {
        value: input.inputs[port.name] ?? input.input_streams?.[port.name]?.[0],
        dirty: true,
        revision: 0
      };
    }
    const resolved = resolveOperationParams({
      operation: appRun.operation,
      state,
      inputNodeIds: document.inputs.map((port) => port.name),
      inputName: (id) => id,
      resourceRef: (id) => {
        const port = Object.entries(appRun.operation.inputs).find(
          ([, mapping]) =>
            mapping.from === "resource" && mapping.resourceBindingId === id
        )?.[0];
        const value = port ? input.inputs[port] : undefined;
        return appResourceRef(value);
      }
    });
    await setAppRunInputs(userId, appRun.run.id, resolved);
    const invocation = scriptOperationInvocation(document, resolved);
    input = {
      ...input,
      inputs: invocation.inputs,
      input_streams: invocation.inputStreams
    };
  }
  const staged = input.input_streams;
  if (staged) {
    const declared = new Set(document.inputs.map((port) => port.name));
    const undeclared = Object.keys(staged).filter(
      (handle) => !declared.has(handle)
    );
    if (undeclared.length > 0) {
      if (appRun) {
        await settleAppRunIfPresent(userId, appRun.run.id, {
          status: "failed",
          error: "Script inputs name undeclared ports"
        });
      }
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
    jobId: appRun?.run.id ?? `js-script-${id}-${Date.now()}`,
    ...(appRun && {
      appRunContext: {
        userId,
        instanceId: appRun.run.instance_id,
        appRunId: appRun.run.id,
        traceId: appRun.run.trace_id,
        origin: appRun.run.origin
      },
      generationLifecycle: createFalGenerationLifecycleHooks({
        userId,
        jobId: appRun.run.id,
        appRunContext: {
          userId,
          instanceId: appRun.run.instance_id,
          appRunId: appRun.run.id,
          traceId: appRun.run.trace_id,
          origin: appRun.run.origin
        }
      })
    }),
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
      JS_SCRIPT_MAX_TIMEOUT_SECONDS,
      appRun?.operation.timeoutMs === undefined
        ? JS_SCRIPT_MAX_TIMEOUT_SECONDS
        : Math.max(1, Math.floor(appRun.operation.timeoutMs / 1000))
    ),
    withToolbelt: true
  };
  if (staged) {
    runOptions.inputStreams = staged;
  }
  if (lines) {
    runOptions.onEmit = (name, value) => send({ type: "emit", name, value });
  }
  const cancellation = new AbortController();
  if (appRun) {
    context.signal = cancellation.signal;
  }
  const ledger = appRun
    ? attachRunCostLedger(context, {
        userId,
        workflowId: null,
        appRunContext: context.appRunContext ?? undefined,
        resolveSecret: (key) => context.getSecret(key)
      })
    : null;
  const execute = async (): Promise<RunJsScriptResponse> => {
    let body: RunJsScriptResponse;
    const unregisterCancellation = appRun
      ? registerAppRunCancellation(userId, appRun.run.id, () => {
          cancellation.abort(new Error("App run cancelled"));
        })
      : null;
    try {
      body = scriptRunBody(
        document,
        await inAppRunCostAccount(context.appRunCostAccount, () =>
          runCodeBody(context, runOptions)
        )
      );
    } catch (error) {
      body = {
        ok: false,
        logs: [],
        error: error instanceof Error ? error.message : String(error),
        duration_ms: 0
      };
    } finally {
      unregisterCancellation?.();
      await ledger?.settled();
      ledger?.();
    }
    if (appRun) {
      const outputs: Record<string, unknown> = {};
      const slots: Record<string, unknown> = {};
      for (const [name, value] of Object.entries(body.outputs ?? {})) {
        const mapping = appRun.operation.outputs[name];
        if (mapping?.to === "variable") {
          outputs[mapping.variableId] = value;
        }
        slots[`${appRun.operation.id}:${name}`] = value;
      }
      outputs["__app_outputs"] = slots;
      const settlement: Parameters<typeof settleAppRun>[2] = {
        status: body.ok
          ? "completed"
          : context.signal.aborted
            ? "cancelled"
            : "failed",
        outputs,
        documents: context.getAppRunDocuments(),
        error: body.error,
        secretValues: [...context.getResolvedSecretValues()]
      };
      const knownLlmUsd = context.getAppRunLlmCost();
      if (knownLlmUsd !== null) {
        settlement.knownLlmUsd = knownLlmUsd;
      }
      await settleAppRunIfPresent(userId, appRun.run.id, settlement);
      await reconcileAppRunCost(userId, appRun.run.id);
    }
    return body;
  };
  if (lines) {
    void execute().then(
      (result) => {
        send({ type: "result", result });
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
  return jsonResponse(await execute());
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
  const userId = getUserId(
    request,
    opts.apiOptions.userIdHeader ?? "x-user-id"
  );
  const parsed = runJsScriptRequest.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return jsonResponse({ detail: "Invalid script inputs" }, 400);
  }
  const appRun = await resolveAppScriptRun(
    userId,
    parsed.data,
    [key, `example-${slug}-${key}`],
    `example-app:${slug}`
  );
  if (appRun instanceof Response) {
    return appRun;
  }
  if (appRun) {
    await Project.ensurePersonal(userId);
    return executeScriptDocument(
      userId,
      `example-${slug}-${key}`,
      appRun.document,
      parsed.data,
      opts,
      wantsStream(request),
      `personal:${userId}`,
      appRun
    );
  }
  const script = getExampleAppBundle(opts.apiOptions, slug)?.scripts.find(
    (item) => item.key === key
  );
  if (!script) {
    return jsonResponse({ detail: "Example app script not found" }, 404);
  }
  // An example has no project of its own, so it runs in the user's personal
  // project: where their uploads land and where the example saves its work.
  await Project.ensurePersonal(userId);
  return executeScriptDocument(
    userId,
    `example-${slug}-${key}`,
    jsScriptDocument.parse(script.document),
    parsed.data,
    opts,
    wantsStream(request),
    `personal:${userId}`
  );
}

interface AppScriptRun {
  readonly run: AppRunRecord;
  readonly operation: OperationBinding;
  readonly document: JsScriptDocument;
  readonly variables: Readonly<Record<string, unknown>>;
}

async function resolveAppScriptRun(
  userId: string,
  input: RunJsScriptRequest,
  targetIds: readonly string[],
  exampleSource?: string
): Promise<AppScriptRun | Response | null> {
  if (!input.app_run_id || !input.instance_id) {
    return null;
  }
  const [run, instance] = await Promise.all([
    getAppRun(userId, input.app_run_id),
    getAppInstance(userId, input.instance_id)
  ]);
  if (!run || !instance || run.instance_id !== instance.id || !run.snapshot) {
    return jsonResponse({ detail: "App run not found" }, 404);
  }
  if (
    exampleSource &&
    instance.source_id !== exampleSource &&
    !instance.source_id.startsWith(`${exampleSource}:`)
  ) {
    return jsonResponse(
      { detail: "App run does not belong to this example" },
      400
    );
  }
  const parsedDocument = parseApplicationDocument(run.snapshot.document);
  const operation = parsedDocument?.operations.find(
    (entry) => entry.id === run.operation_id
  );
  const target = operation ? operationTarget(operation) : null;
  if (
    !operation ||
    target?.kind !== "script" ||
    !targetIds.includes(target.scriptId)
  ) {
    return jsonResponse(
      { detail: "Script does not match the reserved app operation" },
      400
    );
  }
  const document = jsScriptDocument.safeParse(
    run.snapshot.script_documents[target.scriptId]
  );
  if (!document.success) {
    await settleAppRun(userId, run.id, {
      status: "failed",
      error: "Pinned script document is missing"
    });
    return jsonResponse({ detail: "Pinned script document is missing" }, 400);
  }
  return {
    run,
    operation,
    document: document.data,
    variables: instance.variables
  };
}

function appResourceRef(value: unknown): ResourceRef | undefined {
  if (
    !value ||
    typeof value !== "object" ||
    !("kind" in value) ||
    !("id" in value) ||
    typeof value.id !== "string"
  ) {
    return undefined;
  }
  const kind = value.kind;
  if (
    kind !== "asset" &&
    kind !== "timeline" &&
    kind !== "storyboard" &&
    kind !== "sketch"
  ) {
    return undefined;
  }
  const ref: ResourceRef = { kind, id: value.id };
  if ("revision" in value && typeof value.revision === "number") {
    ref.revision = value.revision;
  }
  return ref;
}

function replayedAppScriptResult(appRun: AppScriptRun): RunJsScriptResponse {
  const outputs: Record<string, unknown> = {};
  const slots = appRun.run.outputs?.["__app_outputs"];
  if (isRecord(slots)) {
    for (const port of appRun.document.outputs) {
      const slot = slots[`${appRun.operation.id}:${port.name}`];
      if (slot !== undefined) {
        outputs[port.name] = slot;
      }
    }
  }
  const result: RunJsScriptResponse = {
    ok: appRun.run.status === "completed",
    outputs,
    logs: [],
    duration_ms: 0
  };
  if (appRun.run.error) {
    result.error = appRun.run.error;
  }
  return result;
}

const jsScriptsRoutes: FastifyPluginAsync<RouteOptions> = async (app, opts) => {
  app.post(
    "/api/applications/examples/:slug/scripts/:key/run",
    async (req, reply) => {
      const { slug, key } = req.params as { slug: string; key: string };
      await bridge(req, reply, (request) =>
        handleExampleAppScriptRun(request, slug, key, opts)
      );
      // A streamed run is still being sent when bridge returns.
      return reply;
    }
  );
  app.post("/api/js-scripts/:id/run", async (req, reply) => {
    const { id } = req.params as { id: string };
    await bridge(req, reply, (request) => handleJsScriptRun(request, id, opts));
    return reply;
  });
};

export default jsScriptsRoutes;

async function settleAppRunIfPresent(
  userId: string,
  runId: string,
  settlement: Parameters<typeof settleAppRun>[2]
): Promise<void> {
  try {
    await settleAppRun(userId, runId, settlement);
  } catch (error) {
    if (!(error instanceof AppRunError) || error.code !== "not_found") {
      throw error;
    }
  }
}
