/**
 * `nodetool errors` — inspect, export and sync the redacted error traces in
 * the local database.
 *
 * Reads `nodetool_error_traces` in-process, so it works without a running
 * server. Every row was redacted before it was stored; `export` prints
 * Markdown that can go straight into a bug report.
 */

import { writeFile } from "node:fs/promises";
import type { Command } from "commander";
import {
  formatErrorReport,
  getErrorTrace,
  listErrorTraces,
  pruneErrorTraces,
  summarizeErrorTraces,
  DEFAULT_ERROR_TRACE_RETENTION_DAYS,
  type ErrorTraceRow
} from "@nodetool-ai/models";

import { asJson, printKv, printTable } from "./output.js";
import { setupLocalDb, LOCAL_USER_ID } from "./local-db.js";

function fail(e: unknown): never {
  console.error(String(e instanceof Error ? e.message : e));
  process.exit(1);
}

function parseLimit(raw: string | undefined, fallback: number): number {
  const n = Number(raw ?? fallback);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function firstLine(text: string, max = 80): string {
  const line = text.split("\n")[0] ?? "";
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

async function findOrFail(id: string): Promise<ErrorTraceRow> {
  const result = await getErrorTrace(LOCAL_USER_ID, id);
  if (result.ok) return result.trace;
  return fail(
    result.reason === "ambiguous"
      ? `Trace id ${id} matches more than one trace; use the full id.`
      : `Error trace ${id} was not found.`
  );
}

export function registerErrorsCommands(program: Command): void {
  const errors = program
    .command("errors")
    .description("Inspect, export and sync redacted error traces");

  errors
    .command("list")
    .description("Recent errors, grouped by fingerprint unless --all")
    .option("--all", "List individual traces instead of groups")
    .option("--since <iso>", "Only traces at or after this time")
    .option("--fingerprint <fp>", "Only occurrences of one error group")
    .option("--limit <n>", "Maximum rows", "20")
    .option("--json", "Output as JSON")
    .action(
      async (opts: {
        all?: boolean;
        since?: string;
        fingerprint?: string;
        limit?: string;
        json?: boolean;
      }) => {
        try {
          await setupLocalDb();
          const limit = parseLimit(opts.limit, 20);
          if (!opts.all && !opts.fingerprint) {
            const groups = await summarizeErrorTraces(LOCAL_USER_ID, {
              since: opts.since,
              limit
            });
            if (opts.json) return asJson(groups);
            printTable(
              groups.map((g) => ({
                fingerprint: g.fingerprint,
                count: g.count,
                source: g.source,
                last_seen: g.last_seen,
                latest_id: g.latest_id,
                error: firstLine(`${g.error_type ?? "Error"}: ${g.message}`)
              }))
            );
            return;
          }
          const traces = await listErrorTraces(LOCAL_USER_ID, {
            since: opts.since,
            fingerprint: opts.fingerprint,
            limit
          });
          if (opts.json) return asJson(traces);
          printTable(
            traces.map((t) => ({
              id: t.id,
              created_at: t.created_at,
              source: t.source,
              error: firstLine(`${t.error_type ?? "Error"}: ${t.message}`)
            }))
          );
        } catch (e) {
          fail(e);
        }
      }
    );

  errors
    .command("show <id>")
    .description("One trace with its stack (full id or 12-character prefix)")
    .option("--json", "Output as JSON")
    .action(async (id: string, opts: { json?: boolean }) => {
      try {
        await setupLocalDb();
        const trace = await findOrFail(id);
        if (opts.json) return asJson(trace);
        printKv({
          id: trace.id,
          created_at: trace.created_at,
          source: trace.source,
          severity: trace.severity,
          fingerprint: trace.fingerprint,
          error_type: trace.error_type ?? "",
          message: trace.message,
          ...(trace.context ?? {})
        });
        if (trace.stack) console.log(`\n${trace.stack}`);
      } catch (e) {
        fail(e);
      }
    });

  errors
    .command("export [ids...]")
    .description("Markdown bug-report section for traces, a group, or recent errors")
    .option("--fingerprint <fp>", "Every recent occurrence of one error group")
    .option("--since <iso>", "Only traces at or after this time")
    .option("--limit <n>", "Maximum traces", "10")
    .option("-o, --out <file>", "Write the report to a file")
    .action(
      async (
        ids: string[],
        opts: { fingerprint?: string; since?: string; limit?: string; out?: string }
      ) => {
        try {
          await setupLocalDb();
          const traces =
            ids.length > 0
              ? await Promise.all(ids.map(findOrFail))
              : await listErrorTraces(LOCAL_USER_ID, {
                  fingerprint: opts.fingerprint,
                  since: opts.since,
                  limit: parseLimit(opts.limit, 10)
                });
          const markdown = formatErrorReport(traces);
          if (opts.out) {
            await writeFile(opts.out, markdown, "utf8");
            console.error(`Wrote ${traces.length} trace(s) to ${opts.out}`);
          } else {
            console.log(markdown);
          }
        } catch (e) {
          fail(e);
        }
      }
    );

  errors
    .command("sync")
    .description(
      "Push unsynced traces to NODETOOL_ERROR_TRACE_SYNC_URL with NODETOOL_ERROR_TRACE_SYNC_TOKEN"
    )
    .action(async () => {
      try {
        const { errorTraceSyncConfig, syncErrorTraces } = await import(
          "@nodetool-ai/websocket/error-traces"
        );
        const config = errorTraceSyncConfig();
        if (!config) {
          fail(
            "Error trace sync is off. Set NODETOOL_ERROR_TRACE_SYNC_URL (https) " +
              "and NODETOOL_ERROR_TRACE_SYNC_TOKEN to an access token."
          );
        }
        await setupLocalDb();
        const result = await syncErrorTraces(config);
        if (result.error) fail(`Pushed ${result.pushed}, then: ${result.error}`);
        console.log(`Pushed ${result.pushed} trace(s) to ${config.url}`);
      } catch (e) {
        fail(e);
      }
    });

  errors
    .command("prune")
    .description("Delete traces older than the retention window")
    .option(
      "--days <n>",
      "Retention in days",
      String(DEFAULT_ERROR_TRACE_RETENTION_DAYS)
    )
    .action(async (opts: { days?: string }) => {
      try {
        await setupLocalDb();
        const removed = await pruneErrorTraces(
          parseLimit(opts.days, DEFAULT_ERROR_TRACE_RETENTION_DAYS)
        );
        console.log(`Removed ${removed} trace(s)`);
      } catch (e) {
        fail(e);
      }
    });
}
