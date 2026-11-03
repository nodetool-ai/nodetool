import { registerPresetCommands } from "./commands/presets.js";
import {initializeCliRuntime} from "@nodetool-ai/cli-common/runtime-env";
import {configureCliPackHost} from "@nodetool-ai/pack-manager/packs/host";
import { Command, InvalidArgumentError } from "commander";
import { listAllModels, listConfiguredProviderInfo, listOllamaModels, listProviderModels, closePythonProviders } from "@nodetool-ai/cli-providers";
import { setupLocalDb } from "@nodetool-ai/cli-local/local-db";
import { readCachedHfModels, searchCachedHfModels } from "@nodetool-ai/huggingface";
import { asJson, printTable } from "@nodetool-ai/cli-common/commands/output";
import { printCommandError } from "@nodetool-ai/pack-manager/command-errors";
import { registerRecommendedCommand } from "./commands/models-recommended.js";
import { registerHfCommands } from "./commands/models-hf.js";
import { createApiClient } from "./api-client.js";
export function createProgram(): Command {
const program = new Command().name("nodetool");
registerPresetCommands(program);
const models = program.command("models").description("Model management");

const modelKinds = [
  "llm",
  "image",
  "tts",
  "asr",
  "video",
  "embedding"
] as const;

type ModelRowInput = {
  id?: unknown;
  name?: unknown;
  provider?: unknown;
  type?: unknown;
  repo_id?: unknown;
};

function modelRow(m: ModelRowInput) {
  return {
    id: m["id"],
    name: m["name"],
    provider: m["provider"] ?? "",
    type: m["type"] ?? "",
    repo_id: m["repo_id"] ?? ""
  };
}

models
  .command("list")
  .description(
    "List all models (recommended + provider + HF cached); local by default, --api-url for remote"
  )
  .option(
    "--api-url <url>",
    "Query a remote server instead of local providers/cache",
    process.env["NODETOOL_API_URL"]
  )
  .option("--provider <id>", "Filter models by provider", (value: string): string => {
    if (value.length > 128 || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(value)) {
      throw new InvalidArgumentError("Provider must be an identifier of 1 to 128 characters");
    }
    return value;
  })
  .option("--json", "Output as JSON")
  .action(async (opts) => {
    try {
      let rows: ModelRowInput[];
      if (opts.apiUrl) {
        const client = createApiClient(opts.apiUrl);
        rows = await client.models.all.query();
      } else {
        await setupLocalDb();
        rows = await listAllModels();
      }
      if (opts.provider) {
        rows = rows.filter((model) => model.provider === opts.provider);
      }
      if (opts.json) {
        asJson(rows);
        return;
      }
      printTable(rows.map(modelRow));
    } catch (e) {
      process.exit(printCommandError(e, opts.json));
    }
  });

models
  .command("providers [provider]")
  .description("List configured providers and their capabilities")
  .option("--json", "Output as JSON")
  .action(async (provider: string | undefined, opts) => {
    await setupLocalDb();
    try {
      const all = await listConfiguredProviderInfo();
      const data = provider ? all.filter((item) => item.provider === provider) : all;
      if (opts.json) {
        asJson(data);
        return;
      }
      printTable(
        data.map((p) => ({
          provider: p.provider,
          capabilities: p.capabilities.join(", ")
        }))
      );
    } catch (e) {
      process.exit(printCommandError(e, opts.json));
    }
  });

registerRecommendedCommand(models);
registerHfCommands(models);

models
  .command("ollama")
  .description(
    "List Ollama models (queries the local daemon; --api-url for remote)"
  )
  .option(
    "--api-url <url>",
    "Query a remote server instead of the local Ollama daemon",
    process.env["NODETOOL_API_URL"]
  )
  .option("--json", "Output as JSON")
  .action(async (opts) => {
    try {
      let rows: ModelRowInput[];
      if (opts.apiUrl) {
        const client = createApiClient(opts.apiUrl);
        rows = await client.models.ollama.query();
      } else {
        await setupLocalDb();
        rows = await listOllamaModels();
      }
      if (opts.json) {
        asJson(rows);
        return;
      }
      printTable(rows.map(modelRow));
    } catch (e) {
      process.exit(printCommandError(e, opts.json));
    }
  });

models
  .command("huggingface")
  .description(
    "List HuggingFace cached models (scans the local cache; --api-url for remote)"
  )
  .option(
    "--api-url <url>",
    "Query a remote server instead of the local HuggingFace cache",
    process.env["NODETOOL_API_URL"]
  )
  .option("--query <q>", "Search query")
  .option("--type <t>", "Filter by HF model type")
  .option("--json", "Output as JSON")
  .action(async (opts) => {
    try {
      let rows: ModelRowInput[];
      if (opts.apiUrl) {
        const client = createApiClient(opts.apiUrl);
        if (opts.query || opts.type) {
          type SearchFields = { query?: string; type?: string };
          const search: SearchFields = {};
          if (opts.query) {
            search.query = String(opts.query);
          }
          if (opts.type) {
            search.type = String(opts.type);
          }
          rows = await client.models.huggingfaceSearch.query(search);
        } else {
          rows = await client.models.huggingfaceList.query();
        }
      } else if (opts.query || opts.type) {
        // Wrap a bare query in wildcards so it matches as a substring, the same
        // normalization the server's huggingfaceSearch applies.
        const rawQuery = opts.query ? String(opts.query) : undefined;
        const query =
          rawQuery && !rawQuery.includes("*") ? `*${rawQuery}*` : rawQuery;
        rows = await searchCachedHfModels(
          query ? [query] : undefined,
          opts.type ? [String(opts.type)] : undefined
        );
      } else {
        rows = await readCachedHfModels();
      }
      if (opts.json) {
        asJson(rows);
        return;
      }
      printTable(rows.map(modelRow));
    } catch (e) {
      process.exit(printCommandError(e, opts.json));
    }
  });

models
  .command("by-provider <provider>")
  .description(
    `List models for a provider. --kind one of: ${modelKinds.join(", ")}`
  )
  .option("--kind <kind>", "Model kind", "llm")
  .option("--json", "Output as JSON")
  .action(async (provider, opts) => {
    const kind = modelKinds.find((candidate) => candidate === opts.kind);
    if (!kind) {
      console.error(
        `Invalid --kind '${opts.kind}'. Must be one of: ${modelKinds.join(", ")}`
      );
      process.exit(1);
    }
    await setupLocalDb();
    try {
      const rows = await listProviderModels(provider, kind);
      if (opts.json) {
        asJson(rows);
        return;
      }
      printTable(rows.map(modelRow));
    } catch (e) {
      process.exit(printCommandError(e, opts.json));
    }
  });

return program;
}
export async function run(argv: readonly string[]): Promise<void> {
 initializeCliRuntime(import.meta.url);
 configureCliPackHost(import.meta.url);
 try {
   const args = argv[0] === "providers" && argv[1] === "info"
     ? ["models", "providers", ...argv.slice(2)] : [...argv];
   await createProgram().parseAsync(args, { from: "user" });
 } finally {
   await closePythonProviders();
 }
}
export const feature = { descriptor: { id: "cli-models", apiVersion: 1, requires: [], capabilities: ["cli:models"] }, run };
export default feature;
