/**
 * Pure failure-diagnosis aggregator for `nodetool agent diagnose <job_id>`.
 *
 * When a run fails the cause is scattered across the job record, the structured
 * processing-message stream, and the OpenTelemetry trace. `diagnoseRun` folds
 * those three sources into one `DiagnosisReport` that names the failing
 * node/step, the error, the last `llm.chat`/`llm.stream` span at or before the
 * failure (with tokens, model, and a truncated response), a memory snapshot, and
 * a deterministic "likely fix locus" pointing at where to start.
 *
 * The function is pure and deterministic — it only reads its inputs and never
 * touches the filesystem, env, or clock. The CLI wiring in
 * `commands/agent.ts` gathers the real inputs and calls it. Keep all I/O out of
 * this module so it stays unit-testable under the CLI vitest stub setup, which
 * stubs every `@nodetool-ai/*` runtime package — only `import type` is used.
 */

import type { ProcessingMessage } from "@nodetool-ai/protocol";

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/** A failed run/job record, as returned by `jobs.get` (subset we read). */
export interface DiagnoseJob {
  id: string;
  status?: string;
  error?: string | null;
  workflowId?: string | null;
}

/**
 * One OpenTelemetry span, loosely typed. Structurally compatible with the debug
 * harness `TraceSpan`, but only the fields the diagnoser reads are required so
 * callers can pass either parsed JSONL lines or richer span objects.
 */
export interface TraceSpanLite {
  name: string;
  span_id?: string;
  parent_span_id?: string | null;
  start_time_ms?: number;
  end_time_ms?: number;
  attributes?: Record<string, unknown>;
  status?: { code?: string; message?: string };
}

/**
 * Everything `diagnoseRun` needs. Every field is optional so the diagnoser
 * degrades gracefully when a source is unavailable (it reports what was
 * missing rather than crashing).
 */
export interface DiagnoseInputs {
  job?: DiagnoseJob;
  /** Processing messages from the run (e.g. a bundle's messages.jsonl). */
  messages?: ReadonlyArray<ProcessingMessage | Record<string, unknown>>;
  /** Trace spans (e.g. a parsed trace.jsonl). */
  spans?: ReadonlyArray<TraceSpanLite>;
  /** A memory/state snapshot captured at failure. */
  memory?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Report shape
// ---------------------------------------------------------------------------

/** The node or step the run failed on. */
export interface FailureSite {
  /** Where the failure was identified. */
  kind: "node" | "step" | "job" | "unknown";
  /** Node id, when a failing node was found. */
  nodeId: string | null;
  /** Node type, when known (e.g. "nodetool.text.Concatenate"). */
  nodeType: string | null;
  /** Node display name, when known. */
  nodeName: string | null;
  /** Step id, when the failure came from an agent step. */
  stepId: string | null;
  /** Step instructions/title, when known. */
  stepLabel: string | null;
}

/** Summary of the last LLM call before the failure. */
export interface LastLlmSummary {
  /** Span name — "llm.chat" or "llm.stream". */
  name: string;
  provider: string | null;
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  costUsd: number | null;
  /** Truncated `llm.response.content` from the span attributes. */
  responsePreview: string | null;
  durationMs: number | null;
  /** Span status code, when present (e.g. "ERROR"). */
  statusCode: string | null;
}

/** Compact view of the memory/state snapshot at failure. */
export interface MemorySnapshot {
  /** Number of top-level keys. */
  keyCount: number;
  /** Top-level keys (capped). */
  keys: string[];
  /** Per-key one-line value previews (capped, truncated). */
  preview: Record<string, string>;
}

/** A heuristic pointer at where to start fixing. */
export interface FixLocus {
  /** One-line, human-readable starting point. */
  summary: string;
  /** Failing node type, when derivable. */
  nodeType: string | null;
  /** Model implicated by the last LLM call, when derivable. */
  model: string | null;
  /** Concrete hints (prompt/model/file references) extracted from the error. */
  hints: string[];
}

export interface DiagnosisReport {
  /** True when no failure could be identified from any source. */
  ok: boolean;
  jobId: string | null;
  jobStatus: string | null;
  /** The node/step the run failed on. */
  failure: FailureSite;
  /** The failure message, normalized to a single string. */
  error: string | null;
  /** The last llm.chat/llm.stream span at or before the failure. */
  lastLlm: LastLlmSummary | null;
  /** Memory/state snapshot summary, when a snapshot was supplied. */
  memory: MemorySnapshot | null;
  /** Where to start fixing. Null only when there's no failure. */
  fixLocus: FixLocus | null;
  /** Sources that were absent — surfaced so callers see partial coverage. */
  missing: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const RESPONSE_PREVIEW_MAX = 500;
const VALUE_PREVIEW_MAX = 120;
const MEMORY_KEY_LIMIT = 40;

const FAILED_NODE_STATUSES = new Set(["error", "failed"]);
/** Job statuses that mean the run did not succeed. */
const FAILED_JOB_STATUSES = new Set(["failed", "error", "cancelled"]);
const LLM_SPAN_NAMES = new Set(["llm.chat", "llm.stream"]);

function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function truncate(s: string, max: number): string {
  const oneLine = s.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? `${oneLine.slice(0, max)}…[${oneLine.length} chars]` : oneLine;
}

/** First non-empty string among the candidates. */
function firstString(...candidates: unknown[]): string | null {
  for (const c of candidates) {
    const s = str(c);
    if (s && s.trim().length > 0) return s;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Failing node/step + error from the message stream
// ---------------------------------------------------------------------------

interface MessageFindings {
  failure: FailureSite;
  error: string | null;
  /** End time (ms) of the failure, used to pick the last preceding LLM span. */
  failedAtMs: number | null;
  found: boolean;
}

const NO_SITE: FailureSite = {
  kind: "unknown",
  nodeId: null,
  nodeType: null,
  nodeName: null,
  stepId: null,
  stepLabel: null
};

/**
 * Scan the message stream for the first failure. A failing `node_update`
 * (status error/failed) wins; otherwise a failed `task_update`/`step_result`
 * (an agent step); otherwise a top-level `error` message. The scan keeps the
 * earliest failure so the report points at the root cause, not a downstream
 * cascade.
 */
function scanMessages(
  messages: ReadonlyArray<ProcessingMessage | Record<string, unknown>>
): MessageFindings {
  let nodeFailure: FailureSite | null = null;
  let nodeError: string | null = null;
  let stepFailure: FailureSite | null = null;
  let stepError: string | null = null;
  let topError: string | null = null;
  let jobError: string | null = null;

  for (const raw of messages) {
    const msg = raw as Record<string, unknown>;
    switch (msg.type) {
      case "node_update": {
        const status = str(msg.status);
        if (status && FAILED_NODE_STATUSES.has(status) && !nodeFailure) {
          nodeFailure = {
            kind: "node",
            nodeId: str(msg.node_id),
            nodeType: str(msg.node_type),
            nodeName: str(msg.node_name),
            stepId: null,
            stepLabel: null
          };
          nodeError = firstString(msg.error) ?? status;
        }
        break;
      }
      case "task_update": {
        const event = str(msg.event);
        const task = (msg.task as Record<string, unknown>) ?? {};
        const step = (msg.step as Record<string, unknown>) ?? {};
        const failed =
          event === "step_failed" ||
          str(step.status) === "failed" ||
          str(task.status) === "failed";
        if (failed && !stepFailure) {
          stepFailure = {
            kind: "step",
            nodeId: str(msg.node_id),
            nodeType: null,
            nodeName: firstString(task.title, task.name),
            stepId: firstString(step.id),
            stepLabel: firstString(step.instructions, step.name, task.title)
          };
          stepError = firstString(step.error, task.error);
        }
        break;
      }
      case "step_result": {
        const stepErr = firstString(msg.error);
        if (stepErr && !stepFailure) {
          const step = (msg.step as Record<string, unknown>) ?? {};
          stepFailure = {
            kind: "step",
            nodeId: null,
            nodeType: null,
            nodeName: null,
            stepId: firstString(step.id),
            stepLabel: firstString(step.instructions, step.name)
          };
          stepError = stepErr;
        }
        break;
      }
      case "job_update": {
        const status = str(msg.status);
        if (status && FAILED_JOB_STATUSES.has(status)) {
          jobError ??= firstString(msg.error, msg.message);
        }
        break;
      }
      case "error": {
        topError ??= firstString(msg.message);
        break;
      }
      default:
        break;
    }
  }

  // Precedence: a failing node is the most specific locus, then an agent step,
  // then a job/top-level error with no attributable node.
  if (nodeFailure) {
    return {
      failure: nodeFailure,
      error: nodeError ?? stepError ?? topError ?? jobError,
      failedAtMs: null,
      found: true
    };
  }
  if (stepFailure) {
    return {
      failure: stepFailure,
      error: stepError ?? topError ?? jobError,
      failedAtMs: null,
      found: true
    };
  }
  const looseError = topError ?? jobError;
  if (looseError) {
    return {
      failure: { ...NO_SITE, kind: "job" },
      error: looseError,
      failedAtMs: null,
      found: true
    };
  }
  return { failure: NO_SITE, error: null, failedAtMs: null, found: false };
}

// ---------------------------------------------------------------------------
// Last LLM span at/before the failure
// ---------------------------------------------------------------------------

function spanAttr(span: TraceSpanLite, key: string): unknown {
  return span.attributes ? span.attributes[key] : undefined;
}

/**
 * Pick the last `llm.chat`/`llm.stream` span that started at or before the
 * failure. When no failure time is known, the last LLM span in trace order is
 * used. Ties on start time resolve to the later end time (and otherwise the
 * later position in the array), so the most recent call wins deterministically.
 */
function selectLastLlmSpan(
  spans: ReadonlyArray<TraceSpanLite>,
  failedAtMs: number | null
): TraceSpanLite | null {
  let best: TraceSpanLite | null = null;
  let bestStart = Number.NEGATIVE_INFINITY;
  let bestEnd = Number.NEGATIVE_INFINITY;

  for (const span of spans) {
    if (!LLM_SPAN_NAMES.has(span.name)) continue;
    const start = num(span.start_time_ms);
    if (failedAtMs !== null && start !== null && start > failedAtMs) continue;
    const startKey = start ?? Number.NEGATIVE_INFINITY;
    const endKey = num(span.end_time_ms) ?? startKey;
    // `>=` so a later array position with an equal key still wins (trace order).
    if (best === null || startKey > bestStart || (startKey === bestStart && endKey >= bestEnd)) {
      best = span;
      bestStart = startKey;
      bestEnd = endKey;
    }
  }
  return best;
}

function summarizeLlmSpan(span: TraceSpanLite): LastLlmSummary {
  const provider =
    firstString(spanAttr(span, "gen_ai.system"), spanAttr(span, "agent.provider")) ?? null;
  const model =
    firstString(
      spanAttr(span, "gen_ai.request.model"),
      spanAttr(span, "gen_ai.response.model"),
      spanAttr(span, "agent.model")
    ) ?? null;
  const responseRaw = str(spanAttr(span, "llm.response.content"));
  const start = num(span.start_time_ms);
  const end = num(span.end_time_ms);
  return {
    name: span.name,
    provider,
    model,
    inputTokens: num(spanAttr(span, "gen_ai.usage.input_tokens")),
    outputTokens: num(spanAttr(span, "gen_ai.usage.output_tokens")),
    totalTokens: num(spanAttr(span, "gen_ai.usage.total_tokens")),
    costUsd: num(spanAttr(span, "gen_ai.usage.cost_usd")),
    responsePreview: responseRaw ? truncate(responseRaw, RESPONSE_PREVIEW_MAX) : null,
    durationMs: start !== null && end !== null ? end - start : null,
    statusCode: span.status?.code ?? null
  };
}

// ---------------------------------------------------------------------------
// Memory snapshot
// ---------------------------------------------------------------------------

function summarizeMemory(memory: Record<string, unknown>): MemorySnapshot {
  const keys = Object.keys(memory);
  const shown = keys.slice(0, MEMORY_KEY_LIMIT);
  const preview: Record<string, string> = {};
  for (const k of shown) {
    const v = memory[k];
    let s: string;
    if (typeof v === "string") s = v;
    else if (v === null || v === undefined) s = String(v);
    else if (typeof v === "object") s = Array.isArray(v) ? `array(${v.length})` : "{…}";
    else s = String(v);
    preview[k] = truncate(s, VALUE_PREVIEW_MAX);
  }
  return { keyCount: keys.length, keys: shown, preview };
}

// ---------------------------------------------------------------------------
// Fix locus heuristic
// ---------------------------------------------------------------------------

/** Extract concrete file/prompt/model hints from an error string. */
function extractHints(error: string | null, model: string | null): string[] {
  const hints: string[] = [];
  if (!error) return hints;
  const lower = error.toLowerCase();

  // File path references (./foo.ts, /abs/path, src/x.json).
  const fileMatch = error.match(/(?:\.{0,2}\/)?[\w.-]+\/[\w./-]+\.\w+/);
  if (fileMatch) hints.push(`file: ${fileMatch[0]}`);

  if (/\bprompt\b/.test(lower) || /system\s*prompt/.test(lower)) {
    hints.push("prompt: review the node/agent prompt");
  }
  if (/\bmodel\b/.test(lower) || /\bcontext\s*length\b/.test(lower) || /\btoken/.test(lower)) {
    hints.push(model ? `model: ${model}` : "model: check the model id/limits");
  }
  if (/\bapi[\s_-]?key\b/.test(lower) || /unauthorized|401|forbidden|403/.test(lower)) {
    hints.push("auth: missing/invalid API key or permissions");
  }
  if (/timeout|timed out|etimedout/.test(lower)) {
    hints.push("timeout: increase the run/request timeout or retry");
  }
  if (/rate.?limit|429/.test(lower)) {
    hints.push("rate-limit: back off or lower concurrency");
  }
  return hints;
}

function buildFixLocus(
  failure: FailureSite,
  error: string | null,
  lastLlm: LastLlmSummary | null
): FixLocus {
  const model = lastLlm?.model ?? null;
  const hints = extractHints(error, model);

  const where =
    failure.kind === "node"
      ? `node ${failure.nodeName ?? failure.nodeId ?? "?"}` +
        (failure.nodeType ? ` (${failure.nodeType})` : "")
      : failure.kind === "step"
        ? `agent step ${failure.stepLabel ?? failure.stepId ?? "?"}`
        : failure.kind === "job"
          ? "the job (no node attributed)"
          : "the run";

  const errPart = error ? ` — ${truncate(error, 160)}` : "";
  const summary = `Start at ${where}${errPart}`;

  return {
    summary,
    nodeType: failure.nodeType,
    model,
    hints
  };
}

// ---------------------------------------------------------------------------
// diagnoseRun
// ---------------------------------------------------------------------------

/**
 * Aggregate a failed run's job record, message stream, and trace spans into a
 * single `DiagnosisReport`. Deterministic and side-effect-free.
 */
export function diagnoseRun(inputs: DiagnoseInputs): DiagnosisReport {
  const { job, messages, spans, memory } = inputs;
  const missing: string[] = [];

  // ---- Failure site + error -------------------------------------------------
  let findings: MessageFindings = { failure: NO_SITE, error: null, failedAtMs: null, found: false };
  if (messages && messages.length > 0) {
    findings = scanMessages(messages);
  } else {
    missing.push("messages");
  }

  // The job record can supply (or override-fill) the error and status even when
  // the message stream named the failing node.
  const jobStatus = job?.status ?? null;
  const jobError = firstString(job?.error);
  const jobFailed = jobStatus ? FAILED_JOB_STATUSES.has(jobStatus) : false;

  let { failure, error } = findings;
  let found = findings.found;

  if (!found && (jobFailed || jobError)) {
    failure = { ...NO_SITE, kind: "job" };
    error = jobError;
    found = true;
  } else if (found && !error && jobError) {
    error = jobError;
  }

  if (!job) missing.push("job");

  // ---- Last LLM span --------------------------------------------------------
  let lastLlm: LastLlmSummary | null = null;
  if (spans && spans.length > 0) {
    const span = selectLastLlmSpan(spans, findings.failedAtMs);
    if (span) lastLlm = summarizeLlmSpan(span);
    else missing.push("llm-span");
  } else {
    missing.push("trace");
  }

  // ---- Memory snapshot ------------------------------------------------------
  let memorySnapshot: MemorySnapshot | null = null;
  if (memory && Object.keys(memory).length > 0) {
    memorySnapshot = summarizeMemory(memory);
  } else {
    missing.push("memory");
  }

  // ---- Verdict --------------------------------------------------------------
  const ok = !found;
  const fixLocus = ok ? null : buildFixLocus(failure, error, lastLlm);

  return {
    ok,
    jobId: job?.id ?? null,
    jobStatus,
    failure: ok ? NO_SITE : failure,
    error: ok ? null : error,
    lastLlm,
    memory: memorySnapshot,
    fixLocus,
    missing
  };
}

// ---------------------------------------------------------------------------
// Human-readable rendering
// ---------------------------------------------------------------------------

/**
 * Render a `DiagnosisReport` as a plain-text block for the terminal. Kept here
 * (not in the CLI command) so the formatting is unit-testable and dependency-
 * free; the command adds color separately if desired.
 */
export function renderDiagnosis(report: DiagnosisReport): string {
  const lines: string[] = [];
  const id = report.jobId ?? "(unknown job)";

  if (report.ok) {
    lines.push(`✓ No failure detected for ${id}.`);
    if (report.jobStatus) lines.push(`  status: ${report.jobStatus}`);
    if (report.missing.length > 0) {
      lines.push(`  sources missing: ${report.missing.join(", ")}`);
    }
    return lines.join("\n");
  }

  lines.push(`✗ Diagnosis for ${id}${report.jobStatus ? ` (${report.jobStatus})` : ""}`);

  const f = report.failure;
  const site =
    f.kind === "node"
      ? `node ${f.nodeName ?? f.nodeId ?? "?"}${f.nodeType ? ` [${f.nodeType}]` : ""}`
      : f.kind === "step"
        ? `step ${f.stepLabel ?? f.stepId ?? "?"}`
        : f.kind === "job"
          ? "job (no node attributed)"
          : "unknown";
  lines.push(`  failure: ${site}`);
  lines.push(`  error:   ${report.error ?? "(none reported)"}`);

  if (report.lastLlm) {
    const l = report.lastLlm;
    const tok =
      l.inputTokens !== null || l.outputTokens !== null
        ? ` tokens=${l.inputTokens ?? "?"}/${l.outputTokens ?? "?"}`
        : "";
    lines.push(
      `  last LLM (${l.name}): ${l.provider ?? "?"}/${l.model ?? "?"}${tok}` +
        (l.statusCode ? ` status=${l.statusCode}` : "")
    );
    if (l.responsePreview) lines.push(`    response: ${l.responsePreview}`);
  } else {
    lines.push("  last LLM: (no trace span available)");
  }

  if (report.memory) {
    lines.push(`  memory: ${report.memory.keyCount} key(s): ${report.memory.keys.join(", ")}`);
  }

  if (report.fixLocus) {
    lines.push(`  → ${report.fixLocus.summary}`);
    for (const hint of report.fixLocus.hints) lines.push(`    • ${hint}`);
  }

  if (report.missing.length > 0) {
    lines.push(`  sources missing: ${report.missing.join(", ")}`);
  }

  return lines.join("\n");
}
