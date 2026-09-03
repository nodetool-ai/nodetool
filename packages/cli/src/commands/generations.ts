/**
 * `nodetool generations` — the record of every media generation, from the
 * local DB, no server needed.
 *
 * One row per provider media call, opened before the call and closed with
 * its outcome (docs/media-generation-tracking-design.md). `list` and `get`
 * read the rows, `await` waits for one to settle, `cancel` closes a running
 * one, `reconcile` asks the provider what it billed, and `sweep` runs the
 * startup sweep plus one drain of the reconcile queue by hand. The same
 * five actions are the `generations` agent capabilities.
 */

import type { Command } from "commander";
import { Prediction, getSecret } from "@nodetool-ai/models";
import {
  drainReconcileQueue,
  reconcileGeneration,
  sweepInterruptedGenerations
} from "@nodetool-ai/execution";

import { asJson, printTable, printKv } from "./output.js";
import { setupLocalDb, LOCAL_USER_ID } from "./local-db.js";

const TERMINAL = new Set(["completed", "failed", "cancelled", "interrupted"]);

function fail(e: unknown): never {
  console.error(String(e instanceof Error ? e.message : e));
  process.exit(1);
}

function costCell(cost: number | null | undefined): string {
  return cost == null ? "unpriced" : `$${cost.toFixed(4)}`;
}

/** The row, in the shape `get_generation` answers with. */
function record(row: Prediction): Record<string, unknown> {
  const metadata = row.metadata ?? {};
  return {
    generation_id: row.id,
    status: row.status,
    provider: row.provider,
    model: row.model,
    capability: row.capability ?? null,
    cost: row.cost,
    currency: row.currency,
    billing_unit: row.billing_unit,
    quantity: row.quantity,
    unit_price: row.unit_price,
    price_source: metadata.price_source ?? null,
    asset_ids: row.asset_ids ?? [],
    started_at: row.started_at,
    completed_at: row.completed_at,
    duration_seconds: row.duration,
    generation_error: row.error,
    origin: {
      surface: row.surface ?? null,
      thread_id: row.thread_id ?? null,
      tool_call_id: row.tool_call_id ?? null,
      job_id: row.job_id ?? null,
      node_id: row.node_id,
      workflow_id: row.workflow_id
    },
    provider_request_id: row.provider_request_id,
    reconcile: {
      reconciled_at: row.reconciled_at ?? null,
      attempts: row.reconcile_attempts ?? 0,
      error: metadata.reconcile_error ?? null,
      next_at: metadata.reconcile_next_at ?? null
    },
    parameters: row.parameters
  };
}

function summaryRow(row: Prediction): Record<string, string> {
  return {
    id: row.id,
    status: row.status,
    provider: row.provider,
    model: row.model,
    capability: row.capability ?? "",
    cost: costCell(row.cost),
    assets: (row.asset_ids ?? []).join(","),
    started: row.started_at ?? row.created_at ?? ""
  };
}

const resolveSecret = (key: string, userId: string): Promise<string | null> =>
  getSecret(key, userId);

export function registerGenerationsCommands(program: Command): void {
  const generations = program
    .command("generations")
    .description("Inspect, wait on, cancel and reconcile media generations");

  generations
    .command("list")
    .description("List generations, newest first")
    .option("--status <status>", "running, completed, failed, cancelled, interrupted")
    .option("--provider <name>", "Filter by provider")
    .option("--capability <name>", "Filter by capability, e.g. text_to_video")
    .option("--thread-id <id>", "Only generations a chat thread asked for")
    .option("--job-id <id>", "Only generations a workflow run asked for")
    .option("--since <iso>", "Only generations created at or after this time")
    .option("--limit <n>", "Max results", "50")
    .option("--json", "Output as JSON")
    .action(
      async (opts: {
        status?: string;
        provider?: string;
        capability?: string;
        threadId?: string;
        jobId?: string;
        since?: string;
        limit: string;
        json?: boolean;
      }) => {
        const limit = Number.parseInt(opts.limit, 10);
        if (!Number.isFinite(limit) || limit <= 0) {
          console.error(`Invalid --limit value: ${opts.limit}`);
          process.exit(1);
        }
        try {
          await setupLocalDb();
          const [rows, next] = await Prediction.listGenerations(LOCAL_USER_ID, {
            status: opts.status,
            provider: opts.provider,
            capability: opts.capability,
            threadId: opts.threadId,
            jobId: opts.jobId,
            since: opts.since,
            limit
          });
          if (opts.json) {
            asJson({ generations: rows.map(record), next: next || null });
            return;
          }
          if (rows.length === 0) {
            console.log("No generations recorded.");
            return;
          }
          printTable(rows.map(summaryRow));
        } catch (e) {
          fail(e);
        }
      }
    );

  generations
    .command("get <generation_id>")
    .description("Read one generation in full")
    .option("--json", "Output as JSON")
    .action(async (id: string, opts: { json?: boolean }) => {
      try {
        await setupLocalDb();
        const row = await Prediction.findForUser(LOCAL_USER_ID, id);
        if (!row) fail(`Generation ${id} was not found.`);
        const rec = record(row);
        if (opts.json) {
          asJson(rec);
          return;
        }
        printKv(rec as Record<string, unknown>);
      } catch (e) {
        fail(e);
      }
    });

  generations
    .command("await <generation_id>")
    .description("Wait for a generation to settle, polling the row")
    .option("--timeout <seconds>", "How long to wait", "300")
    .option("--json", "Output as JSON")
    .action(async (id: string, opts: { timeout: string; json?: boolean }) => {
      const timeoutMs = Math.max(1, Number.parseInt(opts.timeout, 10) || 300) * 1000;
      try {
        await setupLocalDb();
        const deadline = Date.now() + timeoutMs;
        let row = await Prediction.findForUser(LOCAL_USER_ID, id);
        if (!row) fail(`Generation ${id} was not found.`);
        while (!TERMINAL.has(row.status) && Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, 2_000));
          row = (await Prediction.findForUser(LOCAL_USER_ID, id)) ?? row;
        }
        const rec = record(row);
        if (opts.json) {
          asJson(rec);
        } else {
          printKv(rec as Record<string, unknown>);
        }
        // The exit code is the verdict: a generation still running when the
        // wait ran out is not a settled one.
        process.exit(TERMINAL.has(row.status) ? 0 : 1);
      } catch (e) {
        fail(e);
      }
    });

  generations
    .command("cancel <generation_id>")
    .description("Close a running generation as cancelled")
    .option("--json", "Output as JSON")
    .action(async (id: string, opts: { json?: boolean }) => {
      try {
        await setupLocalDb();
        const cancelled = await Prediction.markCancelledIfRunning(id, LOCAL_USER_ID);
        const result = { generation_id: id, cancelled };
        if (opts.json) asJson(result);
        else
          console.log(
            cancelled
              ? `Generation ${id} cancelled. A call running in a server process finishes on its own; the record is closed.`
              : `Generation ${id} is not running — it already settled, or it does not exist.`
          );
        process.exit(cancelled ? 0 : 1);
      } catch (e) {
        fail(e);
      }
    });

  generations
    .command("reconcile <generation_id>")
    .description("Ask the provider what it billed, by request id, and update the row")
    .option("--json", "Output as JSON")
    .action(async (id: string, opts: { json?: boolean }) => {
      try {
        await setupLocalDb();
        const outcome = await reconcileGeneration(id, LOCAL_USER_ID, (key) =>
          resolveSecret(key, LOCAL_USER_ID)
        );
        if (!outcome.found) fail(`Generation ${id} was not found.`);
        const result = {
          generation_id: id,
          before: outcome.before,
          after: outcome.after,
          reconciled: outcome.reconciled,
          reason: outcome.reason ?? null
        };
        if (opts.json) asJson(result);
        else printKv(result);
        process.exit(outcome.reconciled ? 0 : 1);
      } catch (e) {
        fail(e);
      }
    });

  generations
    .command("sweep")
    .description(
      "Close running rows older than now as interrupted, then drain the reconcile queue once"
    )
    .option("--json", "Output as JSON")
    .action(async (opts: { json?: boolean }) => {
      try {
        await setupLocalDb();
        // Nothing is running in this process, so every open row is orphaned.
        const interrupted = await sweepInterruptedGenerations(new Date().toISOString());
        const reconciled = await drainReconcileQueue(resolveSecret);
        const result = { interrupted, reconcile_attempts: reconciled };
        if (opts.json) asJson(result);
        else printKv(result);
      } catch (e) {
        fail(e);
      }
    });
}
