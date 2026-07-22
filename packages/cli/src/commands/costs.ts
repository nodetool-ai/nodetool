/**
 * `nodetool costs` — inspect LLM/provider spend tracked in the local DB.
 *
 * Reads the tRPC `costs` router on a running server (default
 * http://localhost:7777). Every LLM call NodeTool makes is recorded as a
 * Prediction with token counts and cost; these commands aggregate them.
 */

import type { Command } from "commander";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "@nodetool-ai/websocket/trpc";

import { asJson, printTable, printKv } from "./deploy-helpers.js";

const DEFAULT_API_URL =
  process.env["NODETOOL_API_URL"] ?? "http://localhost:7777";

function apiClient(apiUrl: string) {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${apiUrl}/trpc`,
        methodOverride: "POST"
      })
    ]
  });
}

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
    .option("--api-url <url>", "API base URL", DEFAULT_API_URL)
    .option("--json", "Output as JSON")
    .action(async (opts: { apiUrl: string; json?: boolean }) => {
      try {
        const data = await apiClient(opts.apiUrl).costs.summary.query();
        if (opts.json) {
          asJson(data);
          return;
        }
        console.log("\nOverall");
        printKv({
          total_cost: usd(data.overall.total_cost),
          total_tokens: data.overall.total_tokens,
          calls: data.overall.call_count
        });
        console.log("\nBy provider");
        printTable(
          data.by_provider.map((p) => ({
            provider: p.provider,
            cost: usd(p.total_cost),
            tokens: p.total_tokens,
            calls: p.call_count
          }))
        );
        console.log("\nBy model");
        printTable(
          data.by_model.map((m) => ({
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
    .option("--api-url <url>", "API base URL", DEFAULT_API_URL)
    .option("--json", "Output as JSON")
    .action(
      async (opts: {
        apiUrl: string;
        provider?: string;
        model?: string;
        limit: string;
        json?: boolean;
      }) => {
        try {
          const data = await apiClient(opts.apiUrl).costs.list.query({
            limit: Number.parseInt(opts.limit, 10),
            ...(opts.provider ? { provider: opts.provider } : {}),
            ...(opts.model ? { model: opts.model } : {})
          });
          if (opts.json) {
            asJson(data);
            return;
          }
          printTable(
            data.calls.map((c) => ({
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
    .option("--api-url <url>", "API base URL", DEFAULT_API_URL)
    .option("--json", "Output as JSON")
    .action(async (opts: { apiUrl: string; json?: boolean }) => {
      try {
        const data =
          await apiClient(opts.apiUrl).costs.aggregateByProvider.query();
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
    .option("--api-url <url>", "API base URL", DEFAULT_API_URL)
    .option("--json", "Output as JSON")
    .action(
      async (opts: { apiUrl: string; provider?: string; json?: boolean }) => {
        try {
          const data = await apiClient(opts.apiUrl).costs.aggregateByModel.query(
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
      }
    );
}
