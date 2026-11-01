/**
 * `nodetool workflows examples`: list the example workflows shipped with the
 * CLI, and save one as a file that `nodetool run` accepts.
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Command } from "commander";
import { z } from "zod";
import { shippedWorkflowExamplesDir } from "@nodetool-ai/project-services/example-workflows";
import { printCommandError } from "@nodetool-ai/pack-manager/command-errors";
import { asJson, printTable } from "@nodetool-ai/cli-common/commands/output";

interface ExampleNode {
  type?: string;
  data?: Record<string, unknown>;
  properties?: Record<string, unknown>;
}

interface ExampleFile {
  name?: string;
  description?: string;
  tags?: string[];
  graph?: { nodes?: ExampleNode[]; edges?: unknown[] };
}

export interface ExampleSummary {
  name: string;
  description: string;
  tags: string[];
  /** Providers the example calls, or "a model" to pick. Empty means no API key. */
  providers: string[];
  file: string;
}

/** A property that selects a model: `{type: "language_model", provider, id}`. */
const MODEL_FIELD = z.object({ provider: z.string(), type: z.string().optional() });

/** Shown when an example has a model field the user must fill in. */
export const UNSET_MODEL = "a model";

/** Providers named by a node's model properties or its namespace. */
export function exampleProviders(nodes: readonly ExampleNode[]): string[] {
  const providers = new Set<string>();
  for (const node of nodes) {
    const values = { ...(node.data ?? {}), ...(node.properties ?? {}) };
    for (const value of Object.values(values)) {
      const model = MODEL_FIELD.safeParse(value);
      if (!model.success) continue;
      const { provider, type } = model.data;
      if (provider && provider !== "empty") {
        providers.add(provider);
      } else if (type?.endsWith("_model")) {
        // The example leaves the model for the user to pick.
        providers.add(UNSET_MODEL);
      }
    }
    const namespace = node.type?.split(".")[0];
    if (namespace && ["fal", "replicate", "openai", "anthropic", "gemini", "kie", "elevenlabs", "minimax"].includes(namespace)) {
      providers.add(namespace);
    }
  }
  return [...providers].sort();
}

export function readExamples(dir: string): ExampleSummary[] {
  const summaries: ExampleSummary[] = [];
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".json")).sort()) {
    try {
      const example = JSON.parse(readFileSync(join(dir, file), "utf8")) as ExampleFile;
      summaries.push({
        name: example.name ?? file.replace(/\.json$/, ""),
        description: example.description ?? "",
        tags: (example.tags ?? []).filter((tag) => tag !== "example"),
        providers: exampleProviders(example.graph?.nodes ?? []),
        file
      });
    } catch {
      // A file that does not parse is not an example; skip it.
    }
  }
  return summaries;
}

function examplesDir(): string {
  const dir = shippedWorkflowExamplesDir();
  if (!dir) {
    throw new Error("No example workflows are installed with this CLI.");
  }
  return dir;
}

export function registerExamplesCommand(workflows: Command): void {
  const examples = workflows
    .command("examples")
    .description("List the example workflows shipped with the CLI")
    .option("--search <text>", "Only examples whose name, description or tags contain the text")
    .option("--no-keys", "Only examples that need no model and no API key")
    .option("--provider <id>", "Only examples that call this provider")
    .option("--json", "Output as JSON")
    .action((opts: { search?: string; keys: boolean; provider?: string; json?: boolean }) => {
      try {
        const query = opts.search?.toLowerCase();
        const rows = readExamples(examplesDir()).filter((example) => {
          if (!opts.keys && example.providers.length > 0) return false;
          if (opts.provider && !example.providers.includes(opts.provider)) return false;
          if (!query) return true;
          return `${example.name} ${example.description} ${example.tags.join(" ")}`.toLowerCase().includes(query);
        });
        if (opts.json) {
          asJson(rows);
          return;
        }
        printTable(rows.map((example) => ({
          name: example.name,
          needs: example.providers.join(", ") || "nothing",
          tags: example.tags.join(", ")
        })));
        console.log(`\n${rows.length} example(s). Save one with: nodetool workflows examples get "<name>" -o wf.json`);
      } catch (error) {
        process.exit(printCommandError(error));
      }
    });

  examples
    .command("get <name>")
    .description("Save an example as a workflow file for `nodetool run` and `nodetool validate`")
    .option("-o, --output <file>", "Write to this file instead of stdout")
    .action((name: string, opts: { output?: string }) => {
      try {
        const dir = examplesDir();
        const lower = name.toLowerCase();
        const matches = readExamples(dir).filter(
          (example) => example.name.toLowerCase() === lower || example.file.toLowerCase() === lower
        );
        const found = matches[0];
        if (!found) {
          throw new Error(`No example named "${name}". List them with: nodetool workflows examples`);
        }
        const example = JSON.parse(readFileSync(join(dir, found.file), "utf8")) as ExampleFile;
        const text = `${JSON.stringify({ name: example.name, description: example.description, graph: example.graph }, null, 2)}\n`;
        if (opts.output) {
          writeFileSync(opts.output, text);
          console.log(opts.output);
        } else {
          process.stdout.write(text);
        }
      } catch (error) {
        process.exit(printCommandError(error));
      }
    });
}
