/**
 * `nodetool costs` — inspect LLM/provider spend tracked in the local DB.
 *
 * Reads the local SQLite `predictions` table directly (in-process), so it works
 * without a running server. Every LLM call NodeTool makes is recorded as a
 * Prediction with token counts and cost; these commands aggregate them.
 */

import type { Command } from "commander";
import { Prediction } from "@nodetool-ai/models";

import { asJson, printTable, printKv } from "./output.js";
import { setupLocalDb, LOCAL_USER_ID } from "./local-db.js";

function fail(e: unknown): never {
  console.error(String(e instanceof Error ? e.message : e));
  process.exit(1);
}

function usd(n: number | null | undefined): string {
  return `$${(n ?? 0).toFixed(4)}`;
}

export function registerCostsCommands(program: Command): void {
  const costs = program
    .command("costs")
    .description("Inspect tracked LLM/provider spend");

  costs
    .command("summary")
    .description("Overall spend plus per-provider and per-model breakdowns")
    .option("--json", "Output as JSON")
    .action(async (opts: { json?: boolean }) => {
      try {
        await setupLocalDb();
        const [byProvider, byModel] = await Promise.all([
          Prediction.aggregateByProvider(LOCAL_USER_ID),
          Prediction.aggregateByModel(LOCAL_USER_ID)
        ]);
        // Derive the overall totals by summing the provider aggregates rather
        // than issuing a third full-table scan (aggregateByUser).
        const overall = byProvider.reduce(
          (acc, p) => ({
            total_cost: acc.total_cost + p.total_cost,
            total_input_tokens: acc.total_input_tokens + p.total_input_tokens,
            total_output_tokens: acc.total_output_tokens + p.total_output_tokens,
            total_tokens: acc.total_tokens + p.total_tokens,
            call_count: acc.call_count + p.call_count
          }),
          {
            total_cost: 0,
            total_input_tokens: 0,
            total_output_tokens: 0,
            total_tokens: 0,
            call_count: 0
          }
        );
        if (opts.json) {
          asJson({ overall, by_provider: byProvider, by_model: byModel });
          return;
        }
        console.log("\nOverall");
        printKv({
          total_cost: usd(overall.total_cost),
          total_tokens: overall.total_tokens,
          calls: overall.call_count
        });
        console.log("\nBy provider");
        printTable(
          byProvider.map((p) => ({
            provider: p.provider,
            cost: usd(p.total_cost),
            tokens: p.total_tokens,
            calls: p.call_count
          }))
        );
        console.log("\nBy model");
        printTable(
          byModel.map((m) => ({
            provider: m.provider,
            model: m.model,
            cost: usd(m.total_cost),
            tokens: m.total_tokens,
            calls: m.call_count
          }))
        );
        console.log();
      } catch (e) {
        fail(e);
      }
    });

  costs
    .command("list")
    .description("List recent LLM calls with cost and token counts")
    .option("--provider <name>", "Filter by provider")
    .option("--model <id>", "Filter by model")
    .option("--limit <n>", "Max results", "50")
    .option("--json", "Output as JSON")
    .action(
      async (opts: {
        provider?: string;
        model?: string;
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
          const [calls] = await Prediction.paginate(LOCAL_USER_ID, {
            limit,
            ...(opts.provider ? { provider: opts.provider } : {}),
            ...(opts.model ? { model: opts.model } : {})
          });
          if (opts.json) {
            asJson(calls);
            return;
          }
          printTable(
            calls.map((c) => ({
              created_at: c.created_at ?? "",
              provider: c.provider,
              model: c.model,
              cost: usd(c.cost),
              in: c.input_tokens ?? "",
              out: c.output_tokens ?? ""
            }))
          );
        } catch (e) {
          fail(e);
        }
      }
    );

  costs
    .command("by-provider")
    .description("Aggregate spend grouped by provider")
    .option("--json", "Output as JSON")
    .action(async (opts: { json?: boolean }) => {
      try {
        await setupLocalDb();
        const data = await Prediction.aggregateByProvider(LOCAL_USER_ID);
        if (opts.json) {
          asJson(data);
          return;
        }
        printTable(
          data.map((p) => ({
            provider: p.provider,
            cost: usd(p.total_cost),
            input_tokens: p.total_input_tokens,
            output_tokens: p.total_output_tokens,
            calls: p.call_count
          }))
        );
      } catch (e) {
        fail(e);
      }
    });

  costs
    .command("by-model")
    .description("Aggregate spend grouped by model")
    .option("--provider <name>", "Filter by provider")
    .option("--json", "Output as JSON")
    .action(async (opts: { provider?: string; json?: boolean }) => {
      try {
        await setupLocalDb();
        const data = await Prediction.aggregateByModel(
          LOCAL_USER_ID,
          opts.provider ? { provider: opts.provider } : {}
        );
        if (opts.json) {
          asJson(data);
          return;
        }
        printTable(
          data.map((m) => ({
            provider: m.provider,
            model: m.model,
            cost: usd(m.total_cost),
            input_tokens: m.total_input_tokens,
            output_tokens: m.total_output_tokens,
            calls: m.call_count
          }))
        );
      } catch (e) {
        fail(e);
      }
    });
}
