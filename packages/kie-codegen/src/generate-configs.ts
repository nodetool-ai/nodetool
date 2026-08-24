#!/usr/bin/env tsx
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { KieSchemaFetcher } from "./schema-fetcher.js";
import { parseKieSchema } from "./schema-parser.js";
import { writeKieConfigs } from "./config-writer.js";
import type { NodeConfig } from "./types.js";

interface GenerateKieConfigsOptions {
  useCache?: boolean;
  limit?: number;
}

export async function generateKieConfigs(
  options: GenerateKieConfigsOptions = {}
): Promise<NodeConfig[]> {
  const useCache = options.useCache ?? true;
  const fetcher = new KieSchemaFetcher();

  const llms = await fetcher.fetchLlms(useCache);
  const entries = fetcher.parseLlmsEntries(llms);
  const selectedEntries = Number.isFinite(options.limit)
    ? entries.slice(0, options.limit)
    : entries;
  const nodes: NodeConfig[] = [];
  const seenClassNames = new Map<string, number>();
  const seenSignatures = new Set<string>();
  const failures: string[] = [];

  for (const entry of selectedEntries) {
    try {
      console.log(`Fetching ${entry.title}...`);
      const markdown = await fetcher.fetchDocsPage(entry.url, useCache);
      const node = parseKieSchema(markdown, entry);
      if (!node) {
        continue;
      }

      // Some models are documented twice (an English page and a page with a
      // Chinese title under the same /en/ URL space). Same model, same inputs —
      // keep the first and skip the copy.
      const signature = `${node.modelId}|${node.fields.map((f) => f.name).join(",")}`;
      if (seenSignatures.has(signature)) {
        continue;
      }
      seenSignatures.add(signature);

      const count = seenClassNames.get(node.className) ?? 0;
      seenClassNames.set(node.className, count + 1);
      if (count > 0) {
        node.className = `${node.className}${count + 1}`;
      }

      nodes.push(node);
    } catch (error) {
      failures.push(
        `${entry.url}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  await writeKieConfigs(nodes);

  const byType = nodes.reduce<Record<string, number>>((acc, node) => {
    acc[node.outputType] = (acc[node.outputType] ?? 0) + 1;
    return acc;
  }, {});

  console.log(
    `\nWrote ${nodes.length} KIE config nodes: image=${byType.image ?? 0}, audio=${byType.audio ?? 0}, video=${byType.video ?? 0}`
  );
  if (failures.length) {
    console.log(`Skipped ${failures.length} docs pages with errors:`);
    for (const failure of failures) {
      console.log(`  ${failure}`);
    }
  }
  return nodes;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({
    options: {
      "no-cache": { type: "boolean", default: false },
      limit: { type: "string" }
    }
  });
  await generateKieConfigs({
    useCache: !values["no-cache"],
    limit: values.limit ? Number(values.limit) : undefined
  });
}
