/**
 * `nodetool models recommended` — enhanced filtering over the curated list.
 *
 * By default reads `RECOMMENDED_MODELS` locally (no server needed). Pass
 * `--check-servers` to defer to the tRPC endpoint, which also probes local
 * server reachability (ollama, llama_cpp).
 */

import type { Command } from "commander";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "@nodetool-ai/websocket/trpc";
import {
  RECOMMENDED_MODELS,
  type RecommendedUnifiedModel
} from "@nodetool-ai/runtime";
import type { UnifiedModel } from "@nodetool-ai/protocol";

import { asJson, printTable } from "./deploy-helpers.js";

// ---------------------------------------------------------------------------
// Category filters
// ---------------------------------------------------------------------------

type Modality = RecommendedUnifiedModel["modality"];
type Task = NonNullable<RecommendedUnifiedModel["task"]>;

interface CategoryFilter {
  modality?: Modality;
  task?: Task;
}

const CATEGORY_FILTERS: Record<string, CategoryFilter> = {
  all: {},
  image: { modality: "image" },
  "image-text-to-image": { modality: "image", task: "text_to_image" },
  "image-image-to-image": { modality: "image", task: "image_to_image" },
  language: { modality: "language" },
  "language-text-generation": {
    modality: "language",
    task: "text_generation"
  },
  "language-embedding": { modality: "language", task: "embedding" },
  asr: { modality: "asr" },
  tts: { modality: "tts" },
  "video-text-to-video": { modality: "video", task: "text_to_video" },
  "video-image-to-video": { modality: "video", task: "image_to_video" }
};

const VALID_CATEGORIES = Object.keys(CATEGORY_FILTERS);
const VALID_SYSTEMS = ["darwin", "linux", "windows"] as const;
type SupportedSystem = (typeof VALID_SYSTEMS)[number];

function filterByCategory(
  rows: RecommendedUnifiedModel[],
  category: string
): RecommendedUnifiedModel[] {
  const filter = CATEGORY_FILTERS[category];
  if (!filter) return rows;
  return rows.filter((m) => {
    if (filter.modality && m.modality !== filter.modality) return false;
    if (filter.task && m.task !== filter.task) return false;
    return true;
  });
}

function filterBySystem(
  rows: RecommendedUnifiedModel[],
  system: SupportedSystem
): RecommendedUnifiedModel[] {
  return rows.filter(
    (m) => !m.supported_systems || m.supported_systems.includes(system)
  );
}

// ---------------------------------------------------------------------------
// Row rendering
// ---------------------------------------------------------------------------

function modelRow(m: Record<string, unknown>): Record<string, unknown> {
  return {
    id: m["id"],
    name: m["name"],
    provider: m["provider"] ?? "",
    type: m["type"] ?? "",
    repo_id: m["repo_id"] ?? ""
  };
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

function parseLimit(raw: unknown): number | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  const parsed = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    console.error(`Invalid --limit value: ${String(raw)}`);
    process.exit(1);
  }
  return parsed;
}

export function registerRecommendedCommand(models: Command): void {
  models
    .command("recommended")
    .description("List recommended models")
    .option(
      "--api-url <url>",
      "API base URL (only used with --check-servers)",
      process.env["NODETOOL_API_URL"] ?? "http://localhost:7777"
    )
    .option(
      "--category <category>",
      `Filter by category: ${VALID_CATEGORIES.join(", ")}`,
      "all"
    )
    .option(
      "--system <system>",
      `Filter to a platform: ${VALID_SYSTEMS.join(", ")}`
    )
    .option("--limit <n>", "Cap the number of results")
    .option(
      "--check-servers",
      "Check availability on local servers via the API (requires --api-url)"
    )
    .option("--json", "Output as JSON")
    .action(
      async (opts: {
        apiUrl: string;
        category: string;
        system?: string;
        limit?: string;
        checkServers?: boolean;
        json?: boolean;
      }) => {
        if (!(opts.category in CATEGORY_FILTERS)) {
          console.error(
            `Invalid --category '${opts.category}'. Valid values: ${VALID_CATEGORIES.join(", ")}`
          );
          process.exit(1);
        }

        if (
          opts.system !== undefined &&
          !VALID_SYSTEMS.includes(opts.system as SupportedSystem)
        ) {
          console.error(
            `Invalid --system '${opts.system}'. Valid values: ${VALID_SYSTEMS.join(", ")}`
          );
          process.exit(1);
        }

        const limit = parseLimit(opts.limit);

        try {
          let rows: RecommendedUnifiedModel[];
          if (opts.checkServers) {
            const client = createTRPCClient<AppRouter>({
              links: [
                httpBatchLink({
                  url: `${opts.apiUrl}/trpc`,
                  transformer: superjson
                })
              ]
            });
            const remote = (await client.models.recommended.query({
              check_servers: true
            })) as unknown as UnifiedModel[];
            rows = remote as RecommendedUnifiedModel[];
          } else {
            rows = [...RECOMMENDED_MODELS];
          }

          rows = filterByCategory(rows, opts.category);
          if (opts.system) {
            rows = filterBySystem(rows, opts.system as SupportedSystem);
          }
          if (limit) rows = rows.slice(0, limit);

          if (opts.json) {
            asJson(rows);
            return;
          }
          printTable(
            (rows as unknown as Record<string, unknown>[]).map(modelRow)
          );
        } catch (e) {
          console.error(String(e instanceof Error ? e.message : e));
          process.exit(1);
        }
      }
    );
}
