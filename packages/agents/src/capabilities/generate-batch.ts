/**
 * `generate_batch`: many media generations in one call, with one progress
 * report a client shows as a bar.
 *
 * Each request runs through `run.invoke`, so it is gated and recorded exactly
 * like a direct call to its tool. After every change the call emits a
 * `generation_batch_update` with the state of all requests. The message names
 * the call's own tool-call id, so a client puts the bar on that call's row.
 */
import type {
  GenerationBatchItem,
  GenerationBatchUpdate
} from "@nodetool-ai/protocol";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { randomUUID } from "node:crypto";
import { clampConcurrency, mapWithConcurrency } from "./concurrency.js";
import {
  BATCH_GENERATION_TOOLS,
  MAX_BATCH_REQUESTS,
  generateBatchSpec
} from "./media.specs.js";
import type { CapabilityExport } from "./types.js";
import { userIdOf } from "../tools/mcp-tool-support.js";
import { isNonEmptyString, isRecord, isString } from "../utils/type-guards.js";

type BatchTool = (typeof BATCH_GENERATION_TOOLS)[number];

/** Seconds a request is expected to take when its model has no history. */
const DEFAULT_ESTIMATE_SECONDS: Record<BatchTool, number> = {
  generate_image: 20,
  edit_image: 25,
  generate_video: 120,
  animate_image: 120,
  generate_speech: 15,
  generate_music: 60
};

/** Past generations of one model read to estimate its run time. */
const HISTORY_ROWS = 50;

interface Request {
  tool: BatchTool;
  label: string;
  args: Record<string, unknown>;
}

const isBatchTool = (value: unknown): value is BatchTool =>
  (BATCH_GENERATION_TOOLS as readonly unknown[]).includes(value);

const modelRef = (
  args: Record<string, unknown>
): { provider: string | null; model: string | null } => {
  const model = args["model"];
  if (isRecord(model)) {
    const ref = isRecord(model["ref"]) ? model["ref"] : model;
    return {
      provider: isString(ref["provider"]) ? ref["provider"] : null,
      model: isString(ref["id"]) ? ref["id"] : null
    };
  }
  return {
    provider: isString(args["provider"]) ? args["provider"] : null,
    model: isString(model) ? model : null
  };
};

const promptOf = (args: Record<string, unknown>): string | null => {
  const text = args["prompt"] ?? args["text"];
  return isNonEmptyString(text) ? text : null;
};

/** The requests, or an error naming the first bad one. */
export function parseRequests(value: unknown): Request[] | { error: string } {
  if (!Array.isArray(value) || value.length === 0) {
    return { error: "requests must be a non-empty array" };
  }
  if (value.length > MAX_BATCH_REQUESTS) {
    return {
      error: `requests holds ${value.length} items; the most one call accepts is ${MAX_BATCH_REQUESTS}`
    };
  }
  const requests: Request[] = [];
  for (const [index, raw] of value.entries()) {
    if (!isRecord(raw) || !isBatchTool(raw["tool"]) || !isRecord(raw["args"])) {
      return {
        error: `requests[${index}] needs a tool (one of ${BATCH_GENERATION_TOOLS.join(", ")}) and an args object`
      };
    }
    const label = isNonEmptyString(raw["label"])
      ? raw["label"].trim()
      : `${raw["tool"].replace(/_/g, " ")} ${index + 1}`;
    requests.push({ tool: raw["tool"], label, args: raw["args"] });
  }
  return requests;
}

/**
 * The median run time of a model's recent completed generations, in seconds,
 * or null when it has none. A lookup failure counts as no history.
 */
async function historicalSeconds(
  context: ProcessingContext,
  provider: string,
  model: string
): Promise<number | null> {
  try {
    const { Prediction } = await import("@nodetool-ai/models");
    const [rows] = await Prediction.listGenerations(userIdOf(context), {
      provider,
      status: "completed",
      limit: HISTORY_ROWS
    });
    const seconds = rows
      .filter((row) => row.model === model && row.created_at && row.completed_at)
      .map((row) => (Date.parse(row.completed_at!) - Date.parse(row.created_at!)) / 1000)
      .filter((value) => Number.isFinite(value) && value > 0)
      .sort((a, b) => a - b);
    if (seconds.length === 0) return null;
    return Math.round(seconds[Math.floor(seconds.length / 2)]!);
  } catch {
    return null;
  }
}

async function estimates(
  context: ProcessingContext,
  requests: readonly Request[]
): Promise<number[]> {
  const cache = new Map<string, Promise<number | null>>();
  return Promise.all(
    requests.map(async (request) => {
      const { provider, model } = modelRef(request.args);
      if (provider && model) {
        const key = `${provider}\n${model}`;
        if (!cache.has(key)) cache.set(key, historicalSeconds(context, provider, model));
        const seconds = await cache.get(key)!;
        if (seconds !== null) return seconds;
      }
      return DEFAULT_ESTIMATE_SECONDS[request.tool];
    })
  );
}

/** The error text of a tool result, or null when it succeeded. */
const resultError = (result: unknown): string | null => {
  if (!isRecord(result)) return null;
  const error = result["error"];
  if (isNonEmptyString(error)) return error;
  if (isRecord(error) && isNonEmptyString(error["message"])) return error["message"];
  return null;
};

const resultUri = (result: unknown): string | null => {
  if (!isRecord(result)) return null;
  for (const key of ["asset_uri", "uri", "url", "path"]) {
    if (isNonEmptyString(result[key])) return result[key];
  }
  return null;
};

const generateBatch: CapabilityExport = {
  spec: generateBatchSpec,
  impl: async (run, params) => {
    const requests = parseRequests(params["requests"]);
    if ("error" in requests) return requests;
    const concurrency = clampConcurrency(params["concurrency"]);
    const callId = isNonEmptyString(params["_tool_call_id"])
      ? params["_tool_call_id"]
      : randomUUID();
    const seconds = await estimates(run.context, requests);
    const items: GenerationBatchItem[] = requests.map((request, index) => {
      const { provider, model } = modelRef(request.args);
      return {
        id: String(index + 1),
        label: request.label,
        tool: request.tool,
        provider,
        model,
        prompt: promptOf(request.args),
        status: "queued",
        estimate_seconds: seconds[index]!
      };
    });
    const report = (): void => {
      const update: GenerationBatchUpdate = {
        type: "generation_batch_update",
        tool_call_id: callId,
        concurrency,
        items: items.map((item) => ({ ...item }))
      };
      run.context.emit(update);
    };
    report();

    const results = await mapWithConcurrency(
      requests.map((request, index) => ({ request, index })),
      concurrency,
      async ({ request, index }) => {
        const item = items[index]!;
        if (run.signal?.aborted) {
          Object.assign(item, { status: "failed", error: "cancelled", finished_at: Date.now() });
          report();
          return { error: "cancelled" } as unknown;
        }
        Object.assign(item, { status: "running", started_at: Date.now() });
        report();
        let result: unknown;
        try {
          result = await run.invoke(request.tool, request.args);
        } catch (e) {
          result = { error: e instanceof Error ? e.message : String(e) };
        }
        const error = resultError(result);
        item.finished_at = Date.now();
        if (error) {
          Object.assign(item, { status: "failed", error });
        } else {
          item.status = "completed";
          item.uri = resultUri(result);
          if (isRecord(result) && isString(result["type"])) item.media_type = result["type"];
        }
        report();
        return result;
      }
    );

    const failed = items.filter((item) => item.status === "failed").length;
    return {
      completed: items.length - failed,
      failed,
      results: items.map((item, index) => {
        const entry: Record<string, unknown> = {
          label: item.label,
          tool: item.tool,
          status: item.status,
          seconds:
            item.started_at != null && item.finished_at != null
              ? Math.round((item.finished_at - item.started_at) / 1000)
              : null
        };
        if (item.uri) entry["uri"] = item.uri;
        if (item.error) entry["error"] = item.error;
        const raw = results[index];
        if (isRecord(raw) && isString(raw["asset_id"])) entry["asset_id"] = raw["asset_id"];
        return entry;
      }),
      // The final state, so a client can draw the bar again after a reload.
      batch: { concurrency, items }
    };
  }
};

export { generateBatch };
