/**
 * The `errors` module's specs — data only, no implementation. See
 * `jobs.specs.ts` for why specs live apart from their implementations.
 */

import type { CapabilitySpec } from "./types.js";

const SOURCES = ["server", "trpc", "http", "job", "web", "electron", "agent", "cli"];

export const listErrorTracesSpec: CapabilitySpec = {
  name: "list_error_traces",
  description:
    "List the user's recorded error traces: server failures, failed " +
    "workflow runs and client crashes. Traces are redacted before storage " +
    "(no credentials, emails, IPs or prompt content). By default returns " +
    "groups of identical errors (by fingerprint) with counts and first/last " +
    "seen; pass grouped=false for individual traces, newest first. Use " +
    "get_error_trace for the full stack.",
  inputSchema: {
    type: "object",
    properties: {
      grouped: {
        type: "boolean",
        description: "Group identical errors by fingerprint",
        default: true
      },
      since: {
        type: "string",
        description: "Only traces at or after this ISO-8601 time"
      },
      source: {
        type: "string",
        enum: SOURCES,
        description: "Only traces from this source"
      },
      fingerprint: {
        type: "string",
        description: "Only occurrences of this error group"
      },
      limit: {
        type: "number",
        description: "Maximum groups or traces to return",
        default: 20
      }
    },
    required: []
  },
  category: "read",
  userMessage: () => "Listing error traces"
};

export const getErrorTraceSpec: CapabilitySpec = {
  name: "get_error_trace",
  description:
    "Get one redacted error trace with its stack and context (job, " +
    "workflow, route, HTTP status). Accepts the full id or its 12-character " +
    "prefix.",
  inputSchema: {
    type: "object",
    properties: {
      trace_id: { type: "string", description: "The trace id" }
    },
    required: ["trace_id"]
  },
  category: "read",
  userMessage: (params) => `Getting error trace ${params["trace_id"]}`
};

export const exportErrorReportSpec: CapabilitySpec = {
  name: "export_error_report",
  description:
    "Render redacted error traces as Markdown for a bug report. Name traces " +
    "by id, or select one error group by fingerprint, or everything since a " +
    "time; with none of these, the most recent traces. Returns the Markdown " +
    "and the trace ids it covers.",
  inputSchema: {
    type: "object",
    properties: {
      trace_ids: {
        type: "array",
        items: { type: "string" },
        description: "Trace ids (full or 12-character prefix)"
      },
      fingerprint: {
        type: "string",
        description: "Every recent occurrence of this error group"
      },
      since: {
        type: "string",
        description: "Only traces at or after this ISO-8601 time"
      },
      limit: {
        type: "number",
        description: "Maximum traces in the report",
        default: 10
      }
    },
    required: []
  },
  category: "read",
  userMessage: () => "Exporting an error report"
};

/** Every spec this module declares, in declaration order. */
export const errorsSpecs: readonly CapabilitySpec[] = [
  listErrorTracesSpec,
  getErrorTraceSpec,
  exportErrorReportSpec
];
