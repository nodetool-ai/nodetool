import { setTimeout as delay } from "node:timers/promises";
import type { Command } from "commander";
import { TRPCClientError } from "@trpc/client";
import { listRuns, getRun, getRunTrace, getRunLogs, readRunUpdates } from "@nodetool-ai/execution";
import {
  runGetOptionsSchema, runListOptionsSchema, runTraceOptionsSchema, runLogsOptionsSchema, runUpdatesOptionsSchema, TRACE_SPAN_LIMIT, TRACE_EVENT_LIMIT,
  type RunGetOptions, type RunListOptions, type RunTraceOptions, type RunLogsOptions, type RunUpdatesOptions,
  type ListRunsResult, type GetRunResult, type GetRunTraceResult, type GetRunLogsResult, type RunUpdatesResult,
  type StoredRunTraceUpdate, type RunTraceRegistration, type TraceRecord, type RunReaderFlags
} from "@nodetool-ai/protocol";
import { createApiClient } from "../api-client.js";
import { printCommandError } from "../command-errors.js";
import { asJson, printKv, printTable } from "./output.js";

export interface RunsCommandDependencies { ensureDb: () => Promise<void>; localUserId: string; }
interface OutputOptions { json?: boolean; apiUrl?: string; }
interface ShowOptions extends OutputOptions { includeContent?: boolean; }
interface ListOptions extends OutputOptions {
  kind?: string; appId?: string; instanceId?: string; workflowId?: string; threadId?: string;
  status?: string; origin?: string; since?: string; until?: string; limit: string; cursor?: string;
}
interface TraceOptions extends OutputOptions { depth: string; focus?: string; name?: string; errorsOnly?: boolean; limit: string; includeContent?: boolean; }
interface LogsOptions extends OutputOptions { level?: string; source?: string; span?: string; sinceMs?: string; untilMs?: string; limit: string; cursor?: string; includeContent?: boolean; }
interface TailOptions extends OutputOptions { cursor: string; limit: string; pollInterval: string; timeout?: string; includeContent?: boolean; }
type TailFrame =
  | ({ type: "resnapshot"; run_id: string; after_cursor: number; cursor: number; resnapshot_required: boolean; limited: boolean } & RunReaderFlags)
  | ({ type: "span" } & StoredRunTraceUpdate)
  | { type: "event"; run_id: string; span_id: string; cursor: number; event: TraceRecord["events"][number] }
  | { type: "terminal"; run: RunTraceRegistration; cursor: number; trace_settled: boolean }
  | { type: "gap"; cursor: number; reason: "terminal_trace_incomplete" | "dedup_limit" }
  | { type: "reconnecting" | "interrupted"; cursor: number };
interface RunsReader {
  list: (options: RunListOptions) => Promise<ListRunsResult>;
  get: (id: string, options: RunGetOptions) => Promise<GetRunResult>;
  trace: (id: string, options: RunTraceOptions) => Promise<GetRunTraceResult>;
  logs: (id: string, options: RunLogsOptions) => Promise<GetRunLogsResult>;
  updates: (id: string, options: RunUpdatesOptions, signal?: AbortSignal) => Promise<RunUpdatesResult>;
}
const TERMINAL_DRAIN_IDLE_MS = 1_000;
const TERMINAL_DRAIN_MAX_MS = 5_000;

async function reader(apiUrl: string | undefined, deps: RunsCommandDependencies): Promise<RunsReader> {
  if (apiUrl) {
    const client = createApiClient(apiUrl);
    return {
      list: (options) => client.runs.list.query(options), get: (id, options) => client.runs.get.query({ id, ...options }),
      trace: (id, options) => client.runs.trace.query({ id, ...options }),
      logs: (id, options) => client.runs.logs.query({ id, ...options }),
      updates: (id, options, signal) => client.runs.updates.query({ id, ...options }, { signal })
    };
  }
  await deps.ensureDb();
  return {
    list: (options) => listRuns(deps.localUserId, options), get: (id, options) => getRun(deps.localUserId, id, options),
    trace: (id, options) => getRunTrace(deps.localUserId, id, options),
    logs: (id, options) => getRunLogs(deps.localUserId, id, options),
    updates: (id, options) => readRunUpdates(deps.localUserId, id, options)
  };
}
function integer(value: string, option: string, minimum: number, maximum: number): number {
  const parsed = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${option} must be an integer between ${minimum} and ${maximum}`);
  }
  return parsed;
}
function fail(error: unknown, json?: boolean): void { printCommandError(error, json); process.exitCode = 1; }
function common(command: Command): Command {
  return command.option("--api-url <url>", "Read a server instead of the local database", process.env["NODETOOL_API_URL"])
    .option("--json", "JSON result; tail emits NDJSON");
}

/** Follow coalesced durable snapshots. Event frames are emitted once per stable identity. */
async function tail(reader: RunsReader, id: string, options: TailOptions): Promise<void> {
  let cursor = integer(options.cursor, "--cursor", 0, Number.MAX_SAFE_INTEGER);
  const limit = integer(options.limit, "--limit", 1, 500);
  const interval = integer(options.pollInterval, "--poll-interval", 10, 5_000);
  const timeout = options.timeout === undefined ? null : integer(options.timeout, "--timeout", 1, 86_400) * 1_000;
  const controller = new AbortController();
  const interrupt = (): void => { controller.abort("interrupt"); };
  process.once("SIGINT", interrupt);
  const timer = timeout === null ? null : setTimeout(() => { controller.abort("timeout"); }, timeout);
  const seenSpans = new Map<string, number>(); const seenEvents = new Set<string>();
  const emit = (value: TailFrame, text: string): void => {
    if (options.json) { console.log(JSON.stringify(value)); } else { console.log(text); }
  };
  let first = true;
  let terminalDrainStarted: number | null = null;
  let lastProgressAt = Date.now();
  let dedupLimitReported = false;
  const dedupLimit = (): void => {
    if (dedupLimitReported) { return; }
    dedupLimitReported = true;
    emit({ type: "gap", cursor, reason: "dedup_limit" }, "Deduplication capacity reached. Later replay may repeat records.");
  };
  try {
    while (!controller.signal.aborted) {
      let page: RunUpdatesResult;
      try {
        page = await reader.updates(id, runUpdatesOptionsSchema.parse({ cursor, limit, include_content: options.includeContent ?? false }), controller.signal);
      } catch (error) {
        if (!options.apiUrl || !(error instanceof TRPCClientError) || error.data) { throw error; }
        emit({ type: "reconnecting", cursor }, `Connection lost. Retrying from cursor ${cursor}.`);
        await delay(interval, undefined, { signal: controller.signal });
        continue;
      }
      controller.signal.throwIfAborted();
      if (first || page.records.length > 0) {
        emit({ type: "resnapshot", run_id: page.run.id, after_cursor: cursor, cursor: page.cursor, resnapshot_required: page.resnapshot_required,
          content_state: page.content_state, content_expired: page.content_expired, truncated: page.truncated, incomplete: page.incomplete, limited: page.limited },
        `Run ${page.run.id}: latest snapshots after cursor ${cursor} (intermediate updates may be coalesced).`);
        first = false;
      }
      for (const update of page.records) {
        if ((seenSpans.get(update.record.span_id) ?? -1) >= update.cursor) { continue; }
        if (seenSpans.has(update.record.span_id) || seenSpans.size < TRACE_SPAN_LIMIT + 1) { seenSpans.set(update.record.span_id, update.cursor); }
        else { dedupLimit(); }
        emit({ type: "span", ...update }, `${update.cursor} ${update.record.name} ${update.record.span_id} ${update.record.status.code}`);
        for (const [index, event] of update.record.events.entries()) {
          const eventId = event.id ?? `${update.record.span_id}:${index}`;
          const key = `${update.record.span_id}:${eventId}`;
          if (seenEvents.has(key)) { continue; }
          if (seenEvents.size < TRACE_EVENT_LIMIT) { seenEvents.add(key); } else { dedupLimit(); }
          emit({ type: "event", run_id: update.run_id, span_id: update.record.span_id, cursor: update.cursor, event: { ...event, id: eventId } },
            `${event.time_ms} ${event.name} ${JSON.stringify(event.attributes ?? {})}`);
        }
      }
      if (page.cursor > cursor) { lastProgressAt = Date.now(); }
      cursor = Math.max(cursor, page.cursor);
      if (page.has_more) { continue; }
      if (page.run.status !== "running") {
        const now = Date.now();
        if (terminalDrainStarted === null) { terminalDrainStarted = now; lastProgressAt = now; }
        if (page.trace_settled || now - lastProgressAt >= TERMINAL_DRAIN_IDLE_MS || now - terminalDrainStarted >= TERMINAL_DRAIN_MAX_MS) {
          if (!page.trace_settled) { emit({ type: "gap", cursor, reason: "terminal_trace_incomplete" }, "Run ended before all final span snapshots were stored. Resume from this cursor to check later."); }
          emit({ type: "terminal", run: page.run, cursor, trace_settled: page.trace_settled }, `Run ${page.run.id} ${page.run.status}. Cursor ${cursor}.`);
          return;
        }
      }
      await delay(interval, undefined, { signal: controller.signal });
    }
  } catch (error) {
    if (!controller.signal.aborted) { throw error; }
  } finally {
    process.removeListener("SIGINT", interrupt);
    if (timer !== null) { clearTimeout(timer); }
  }
  if (controller.signal.reason === "interrupt") {
    emit({ type: "interrupted", cursor }, `Stopped following at cursor ${cursor}.`); process.exitCode = 130;
    return;
  }
  throw new Error(`Timed out following run ${id} at cursor ${cursor}`);
}

export function registerRunsCommands(program: Command, deps: RunsCommandDependencies): void {
  const runs = program.command("runs").description("Inspect durable app runs, workflow jobs and chat turns");
  common(runs.command("list").description("List owned runs, newest first")
    .option("--kind <kind>", "app, workflow or chat").option("--app-id <id>", "App filter")
    .option("--instance-id <id>", "Instance filter").option("--workflow-id <id>", "Workflow filter")
    .option("--thread-id <id>", "Chat thread filter").option("--status <status>", "running, completed, failed or cancelled")
    .option("--origin <origin>", "ui, agent, cli, debug or public").option("--since <iso>", "Inclusive start time")
    .option("--until <iso>", "Exclusive end time").option("--limit <n>", "Results, 1–100", "20")
    .option("--cursor <cursor>", "Opaque next_cursor from the previous page"))
    .action(async (options: ListOptions) => {
      try {
        const query = runListOptionsSchema.parse({ kind: options.kind, app_id: options.appId, instance_id: options.instanceId,
          workflow_id: options.workflowId, thread_id: options.threadId, status: options.status, origin: options.origin,
          since: options.since, until: options.until, limit: integer(options.limit, "--limit", 1, 100), cursor: options.cursor });
        const result = await (await reader(options.apiUrl, deps)).list(query);
        if (options.json) { asJson(result); } else { printTable(result.runs, ["id", "kind", "status", "origin", "started_at", "cost_usd"]); if (result.next_cursor) { console.log(`next_cursor: ${result.next_cursor}`); } }
      } catch (error) { fail(error, options.json); }
    });
  common(runs.command("show <id>").description("Read the run and bounded diagnostic summary")
    .option("--include-content", "Read capped app run inputs and outputs"))
    .action(async (id: string, options: ShowOptions) => {
      try {
        const query = runGetOptionsSchema.parse({ include_content: options.includeContent ?? false });
        const result = await (await reader(options.apiUrl, deps)).get(id, query);
        if (options.json) { asJson(result); return; }
        printKv({ id: result.run.id, kind: result.run.kind, status: result.run.status, error: result.run.error,
          cost_usd: result.run.cost_usd, first_failed_span_id: result.summary.first_failed_span_id,
          content_state: result.summary.content_state, truncated: result.summary.truncated, incomplete: result.summary.incomplete });
        if (result.summary.failure_path.length > 0) { printTable(result.summary.failure_path, ["span_id", "name", "status", "duration_ms", "error"]); }
        if (options.includeContent && result.run.app) { asJson(result.run.app); }
      } catch (error) { fail(error, options.json); }
    });
  common(runs.command("trace <id>").description("Read the span tree")
    .option("--depth <n>", "Tree depth, 0–64", "4").option("--focus <span-id>", "Focus a full 16-character span ID")
    .option("--name <name>", "Span name filter").option("--errors-only", "Only failed spans and their ancestors")
    .option("--limit <n>", "Spans, 1–500", "100").option("--include-content", "Read capped content on the focused span"))
    .action(async (id: string, options: TraceOptions) => {
      try {
        const query = runTraceOptionsSchema.parse({ depth: integer(options.depth, "--depth", 0, 64), focus_span_id: options.focus,
          name: options.name, errors_only: options.errorsOnly ?? false, limit: integer(options.limit, "--limit", 1, 500), include_content: options.includeContent ?? false });
        const result = await (await reader(options.apiUrl, deps)).trace(id, query);
        if (options.json) { asJson(result); } else {
          printTable(result.nodes.map(({ record, depth }) => ({ span_id: record.span_id, name: `${"  ".repeat(depth)}${record.name}`, status: record.status.code, duration_ms: record.duration_ms })));
          printKv({ content_state: result.content_state, truncated: result.truncated, incomplete: result.incomplete, limited: result.limited });
          if (options.includeContent) { asJson(result.nodes.map(({ record }) => record)); }
        }
      } catch (error) { fail(error, options.json); }
    });
  common(runs.command("logs <id>").description("Read stored span events, oldest first")
    .option("--level <level>", "Log level filter").option("--source <source>", "Source filter").option("--span <span-id>", "Full span ID filter")
    .option("--since-ms <time>", "Inclusive event timestamp in milliseconds").option("--until-ms <time>", "Exclusive event timestamp in milliseconds")
    .option("--limit <n>", "Events, 1–500", "100").option("--cursor <cursor>", "Opaque next_cursor from previous page")
    .option("--include-content", "Read capped event content"))
    .action(async (id: string, options: LogsOptions) => {
      try {
        const query = runLogsOptionsSchema.parse({ level: options.level, source: options.source, span_id: options.span,
          since_ms: options.sinceMs === undefined ? undefined : Number(options.sinceMs), until_ms: options.untilMs === undefined ? undefined : Number(options.untilMs),
          limit: integer(options.limit, "--limit", 1, 500), cursor: options.cursor, include_content: options.includeContent ?? false });
        const result = await (await reader(options.apiUrl, deps)).logs(id, query);
        if (options.json) { asJson(result); } else {
          printTable(result.logs.map((event) => ({ ...event, attributes: JSON.stringify(event.attributes) })), ["time_ms", "level", "source", "span_id", "name", "attributes"]);
          printKv({ content_state: result.content_state, truncated: result.truncated, incomplete: result.incomplete, limited: result.limited });
          if (result.next_cursor) { console.log(`next_cursor: ${result.next_cursor}`); }
        }
      } catch (error) { fail(error, options.json); }
    });
  common(runs.command("tail <id>").description("Follow durable span snapshots and events until the run ends")
    .option("--cursor <n>", "Resume after a durable cursor", "0").option("--limit <n>", "Snapshots per page, 1–500", "100")
    .option("--poll-interval <ms>", "Polling interval, 10–5000 ms", "250").option("--timeout <seconds>", "Stop waiting after 1–86400 seconds")
    .option("--include-content", "Read capped owner content"))
    .action(async (id: string, options: TailOptions) => {
      try { await tail(await reader(options.apiUrl, deps), id, options); }
      catch (error) {
        if (options.json) { console.log(JSON.stringify({ type: "error", error: error instanceof Error ? error.message : String(error) })); process.exitCode = 1; }
        else { fail(error); }
      }
    });
}
