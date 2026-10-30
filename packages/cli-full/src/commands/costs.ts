/**
 * `nodetool costs` — inspect provider spend tracked in the local DB.
 *
 * Reads the local SQLite `predictions` table directly (in-process), so it works
 * without a running server. Every provider call NodeTool makes is recorded as a
 * Prediction — LLM calls with token counts, image/video/audio generation with
 * the billing unit, quantity and unit price behind the charge.
 *
 * A call whose model is in no price catalog is still recorded, with a null
 * cost. It shows up in `list` and is counted as `unpriced` in the aggregates,
 * so an unknown price reads as unknown rather than as free.
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

/** A cost cell that tells an unpriced call apart from a genuinely free one. */
function costCell(cost: number | null | undefined): string {
  return cost == null ? "unpriced" : usd(cost);
}

/** The units behind a unit-billed charge, e.g. "5 × seconds @ $0.2050". */
function unitsCell(call: {
  quantity: number | null;
  billing_unit: string | null;
  unit_price: number | null;
}): string {
  if (call.billing_unit == null && call.unit_price == null) return "";
  const quantity = call.quantity ?? 1;
  const unit = call.billing_unit ?? "run";
  const price = call.unit_price == null ? "" : ` @ ${usd(call.unit_price)}`;
  return `${quantity} × ${unit}${price}`;
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
            total_output_tokens:
              acc.total_output_tokens + p.total_output_tokens,
            total_tokens: acc.total_tokens + p.total_tokens,
            call_count: acc.call_count + p.call_count,
            unpriced_count: acc.unpriced_count + p.unpriced_count
          }),
          {
            total_cost: 0,
            total_input_tokens: 0,
            total_output_tokens: 0,
            total_tokens: 0,
            call_count: 0,
            unpriced_count: 0
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
          calls: overall.call_count,
          unpriced_calls: overall.unpriced_count
        });
        if (overall.unpriced_count > 0) {
          console.log(
            `\n${overall.unpriced_count} call(s) ran on a model no price ` +
              `catalog covers, so the total above is a lower bound. ` +
              `Run \`nodetool costs list\` to see them.`
          );
        }
        console.log("\nBy provider");
        printTable(
          byProvider.map((p) => ({
            provider: p.provider,
            cost: usd(p.total_cost),
            tokens: p.total_tokens,
            calls: p.call_count,
            unpriced: p.unpriced_count
          }))
        );
        console.log("\nBy model");
        printTable(
          byModel.map((m) => ({
            provider: m.provider,
            model: m.model,
            cost: usd(m.total_cost),
            tokens: m.total_tokens,
            calls: m.call_count,
            unpriced: m.unpriced_count
          }))
        );
        console.log();
      } catch (e) {
        fail(e);
      }
    });

  costs
    .command("list")
    .description("List recent provider calls with cost, tokens and billed units")
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
          const page: Parameters<typeof Prediction.paginate>[1] = { limit };
          if (opts.provider) {
            page.provider = opts.provider;
          }
          if (opts.model) {
            page.model = opts.model;
          }
          const [calls] = await Prediction.paginate(LOCAL_USER_ID, page);
          if (opts.json) {
            asJson(calls);
            return;
          }
          printTable(
            calls.map((c) => ({
              created_at: c.created_at ?? "",
              provider: c.provider,
              model: c.model,
              cost: costCell(c.cost),
              in: c.input_tokens ?? "",
              out: c.output_tokens ?? "",
              units: unitsCell(c)
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
            calls: p.call_count,
            unpriced: p.unpriced_count
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
            calls: m.call_count,
            unpriced: m.unpriced_count
          }))
        );
      } catch (e) {
        fail(e);
      }
    });
}
