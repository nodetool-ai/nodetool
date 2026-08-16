/**
 * The one door the editor uses to execute a JS script:
 * `POST /api/js-scripts/:id/run`, the non-tRPC endpoint the run console, the
 * assistant tools, and the CLI harness share. Nothing runs in the browser — the
 * body only ever executes in the server's QuickJS sandbox.
 *
 * The endpoint runs the *saved* document. Callers flush the live document
 * first (`flushJsScriptSave`); the endpoint still runs the saved row. A body
 * that reads its inputs with `stream` takes staged items instead of values:
 * they go in `input_streams`, one array per declared input.
 */

import { restFetch } from "../../lib/rest-fetch";
import type { JsScriptRunOutcome } from "../../stores/jsScript/JsScriptStore";

interface ErrorBody {
  detail?: unknown;
}

export async function runJsScript(
  scriptId: string,
  inputs: Record<string, unknown>,
  inputStreams?: Record<string, unknown[]>
): Promise<JsScriptRunOutcome> {
  const response = await restFetch(
    `/api/js-scripts/${encodeURIComponent(scriptId)}/run`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      // `input_streams` rides along only when the caller staged items.
      body: JSON.stringify(
        inputStreams ? { inputs, input_streams: inputStreams } : { inputs }
      )
    }
  );

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const detail = (body as ErrorBody | null)?.detail;
    throw new Error(
      typeof detail === "string"
        ? detail
        : `The script run failed (HTTP ${response.status}).`
    );
  }

  return body as JsScriptRunOutcome;
}
