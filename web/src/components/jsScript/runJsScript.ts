/**
 * The one door the editor uses to execute a JS script:
 * `POST /api/js-scripts/:id/run`, the non-tRPC endpoint the run console, the
 * assistant tools, and the CLI harness share. Nothing runs in the browser — the
 * body only ever executes in the server's QuickJS sandbox.
 *
 * Application operations supply an immutable version. Editor runs use the saved
 * document when no version is supplied. Callers flush the live document
 * first (`flushJsScriptSave`); the endpoint still runs the saved row. A body
 * that reads its inputs with `stream` takes staged items instead of values:
 * they go in `input_streams`, one array per declared input.
 */

import type { RunJsScriptRequest } from "@nodetool-ai/protocol/api-schemas/js-scripts.js";
import { restFetch } from "../../lib/rest-fetch";
import type { JsScriptRunOutcome } from "../../stores/jsScript/JsScriptStore";
import { isString } from "../../utils/typePredicates";

interface ErrorBody {
  detail?: unknown;
}

export async function runJsScript(
  scriptId: string,
  inputs: Record<string, unknown>,
  inputStreams?: Record<string, unknown[]>,
  scriptVersion?: number
): Promise<JsScriptRunOutcome> {
  const request: RunJsScriptRequest = { inputs };
  if (inputStreams) {
    request.input_streams = inputStreams;
  }
  if (scriptVersion !== undefined) {
    request.script_version = scriptVersion;
  }
  const response = await restFetch(
    `/api/js-scripts/${encodeURIComponent(scriptId)}/run`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request)
    }
  );

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const detail = (body as ErrorBody | null)?.detail;
    throw new Error(
      isString(detail)
        ? detail
        : `The script run failed (HTTP ${response.status}).`
    );
  }

  return body as JsScriptRunOutcome;
}
