/**
 * The `errors` capability module: read the caller's redacted error traces
 * from `nodetool_error_traces` and render them for a bug report.
 *
 * Every read is scoped to the run's user id. Redaction happened before the
 * rows were stored (`@nodetool-ai/models` `redactErrorTrace`), so what these
 * return is safe to show the model and to paste into an issue.
 * `@nodetool-ai/models` is imported inside each implementation, so loading
 * this module costs nothing.
 */

import { userIdOf } from "../tools/mcp-tool-support.js";
import type { CapabilityExport, CapabilityModule } from "./types.js";
import {
  exportErrorReportSpec,
  getErrorTraceSpec,
  listErrorTracesSpec
} from "./errors.specs.js";
import { isString } from "../utils/type-guards.js";

const MAX_LIMIT = 200;
const MAX_REPORT_TRACES = 50;

function limitOf(value: unknown, fallback: number, max: number): number {
  const n = Number(value ?? fallback);
  return Number.isFinite(n) ? Math.min(Math.max(1, Math.floor(n)), max) : fallback;
}

function optionalString(value: unknown): string | undefined {
  return isString(value) && value.trim() ? value.trim() : undefined;
}

const listErrorTraces: CapabilityExport = {
  spec: listErrorTracesSpec,
  impl: async (run, params) => {
    const models = await import("@nodetool-ai/models");
    const userId = userIdOf(run.context);
    const since = optionalString(params["since"]);
    const limit = limitOf(params["limit"], 20, MAX_LIMIT);
    const source = optionalString(params["source"]);
    if (source && !models.isErrorTraceSource(source)) {
      return { error: `Unknown source "${source}".` };
    }
    const fingerprint = optionalString(params["fingerprint"]);
    if (params["grouped"] !== false && !fingerprint && !source) {
      const groups = await models.summarizeErrorTraces(userId, { since, limit });
      return { groups };
    }
    const traces = await models.listErrorTraces(userId, {
      since,
      limit,
      fingerprint,
      source: source && models.isErrorTraceSource(source) ? source : undefined
    });
    // A listing omits stacks; get_error_trace reads one in full.
    return {
      traces: traces.map(({ stack: _stack, user_id: _user, ...rest }) => rest)
    };
  }
};

const getErrorTrace: CapabilityExport = {
  spec: getErrorTraceSpec,
  impl: async (run, params) => {
    const { getErrorTrace: find } = await import("@nodetool-ai/models");
    const id = String(params["trace_id"] ?? "");
    const result = await find(userIdOf(run.context), id);
    if (!result.ok) {
      return {
        error:
          result.reason === "ambiguous"
            ? `Trace id ${id} matches more than one trace; use the full id.`
            : `Error trace ${id} was not found.`
      };
    }
    const { user_id: _user, ...trace } = result.trace;
    return trace;
  }
};

const exportErrorReport: CapabilityExport = {
  spec: exportErrorReportSpec,
  impl: async (run, params) => {
    const models = await import("@nodetool-ai/models");
    const userId = userIdOf(run.context);
    const ids = Array.isArray(params["trace_ids"])
      ? params["trace_ids"].filter(isString).slice(0, MAX_REPORT_TRACES)
      : [];
    let traces: Awaited<ReturnType<typeof models.listErrorTraces>>;
    if (ids.length > 0) {
      traces = [];
      for (const id of ids) {
        const result = await models.getErrorTrace(userId, id);
        if (result.ok) traces.push(result.trace);
      }
    } else {
      traces = await models.listErrorTraces(userId, {
        fingerprint: optionalString(params["fingerprint"]),
        since: optionalString(params["since"]),
        limit: limitOf(params["limit"], 10, MAX_REPORT_TRACES)
      });
    }
    return {
      markdown: models.formatErrorReport(traces),
      trace_ids: traces.map((trace) => trace.id)
    };
  }
};

/** Every error-trace capability, in declaration order. */
export const ERROR_CAPABILITIES: readonly CapabilityExport[] = [
  listErrorTraces,
  getErrorTrace,
  exportErrorReport
];

export const module: CapabilityModule = {
  module: "errors",
  exports: ERROR_CAPABILITIES
};

export { listErrorTraces, getErrorTrace, exportErrorReport };
