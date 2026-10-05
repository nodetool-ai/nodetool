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
 *
 * A caller that passes `onLine` asks the endpoint to stream the run: agent
 * text, tool calls and emits reach it while the script runs, and the promise
 * still settles with the result.
 */

import {
  SCRIPT_RUN_STREAM_CONTENT_TYPE,
  type ScriptStreamLine
} from "@nodetool-ai/app-runtime";
import type { RunJsScriptRequest } from "@nodetool-ai/protocol/api-schemas/js-scripts.js";
import { restFetch } from "../../lib/rest-fetch";
import type { JsScriptRunOutcome } from "../../stores/jsScript/JsScriptStore";
import { isString } from "../../utils/typePredicates";

interface ErrorBody {
  detail?: unknown;
}

/** Sees each line of a streamed run, except the result, as it arrives. */
export type ScriptStreamListener = (line: ScriptStreamLine) => void;

/** The request headers for a run, streamed when someone listens. */
export const scriptRunHeaders = (
  onLine?: ScriptStreamListener
): Record<string, string> =>
  onLine
    ? {
        "content-type": "application/json",
        accept: `${SCRIPT_RUN_STREAM_CONTENT_TYPE}, application/json`
      }
    : { "content-type": "application/json" };

const isStreamLine = (value: unknown): value is ScriptStreamLine =>
  typeof value === "object" &&
  value !== null &&
  isString((value as { type?: unknown }).type);

/**
 * Read a run's answer: one JSON body, or newline-delimited lines that end in
 * `{type: "result"}`. Each other line goes to `onLine` as it arrives. A
 * stream that ends with no result is a failed run, not a silent success.
 */
export async function readScriptRunBody(
  response: Response,
  onLine?: ScriptStreamListener
): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes(SCRIPT_RUN_STREAM_CONTENT_TYPE) || !response.body) {
    return response.json().catch(() => null);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffered = "";
  let result: unknown;
  const take = (text: string): void => {
    if (!text.trim()) {
      return;
    }
    const line: unknown = JSON.parse(text);
    if (!isStreamLine(line)) {
      return;
    }
    if (line.type === "result") {
      result = line.result;
    } else {
      onLine?.(line);
    }
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffered += decoder.decode(value, { stream: true });
    const lines = buffered.split("\n");
    buffered = lines.pop() ?? "";
    lines.forEach(take);
  }
  take(buffered + decoder.decode());
  if (result === undefined) {
    throw new Error("The script run ended without a result.");
  }
  return result;
}

export interface ScriptAppRunContext {
  app_run_id: string;
  instance_id?: string;
  traceparent?: string;
}

export async function runJsScript(
  scriptId: string,
  inputs: Record<string, unknown>,
  inputStreams?: Record<string, unknown[]>,
  scriptVersion?: number,
  onLine?: ScriptStreamListener,
  appRun?: ScriptAppRunContext
): Promise<JsScriptRunOutcome> {
  const request: RunJsScriptRequest & Partial<ScriptAppRunContext> = {
    inputs
  };
  if (appRun) {
    request.app_run_id = appRun.app_run_id;
    request.instance_id = appRun.instance_id;
  }
  if (inputStreams) {
    request.input_streams = inputStreams;
  }
  if (scriptVersion !== undefined) {
    request.script_version = scriptVersion;
  }
  const headers = scriptRunHeaders(onLine);
  if (appRun?.traceparent) { headers.traceparent = appRun.traceparent; }
  const response = await restFetch(
    `/api/js-scripts/${encodeURIComponent(scriptId)}/run`,
    {
      method: "POST",
      headers,
      body: JSON.stringify(request)
    }
  );

  const body = response.ok
    ? await readScriptRunBody(response, onLine)
    : await response.json().catch(() => null);

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
