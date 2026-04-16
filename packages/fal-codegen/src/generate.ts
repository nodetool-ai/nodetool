#!/usr/bin/env node
/**
 * CLI for generating FAL node manifest from OpenAPI schemas.
 *
 * Usage:
 *   npx tsx src/generate.ts
 *   npx tsx src/generate.ts --no-cache
 *   npx tsx src/generate.ts --output fal-manifest.json
 */

import { parseArgs } from "node:util";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { SchemaFetcher } from "./schema-fetcher.js";
import { SchemaParser } from "./schema-parser.js";
import { NodeGenerator } from "./node-generator.js";
import { allConfigs } from "./configs/index.js";
import type { NodeSpec } from "./types.js";

const { values } = parseArgs({
  options: {
    "no-cache": { type: "boolean", default: false },
    output: {
      type: "string",
      default: join(process.cwd(), "..", "fal-nodes", "src", "fal-manifest.json")
    }
  }
});

async function main(): Promise<void> {
  const useCache = !values["no-cache"];
  const outputPath = values.output!;

  const fetcher = new SchemaFetcher();
  const parser = new SchemaParser();
  const generator = new NodeGenerator();

  const allSpecs: Array<NodeSpec & { moduleName: string }> = [];

  for (const [name, config] of Object.entries(allConfigs)) {
    const dashName = name.replace(/_/g, "-");
    console.log(`\n=== ${dashName} ===`);

    for (const endpointId of Object.keys(config.configs)) {
      try {
        console.log(`  Fetching ${endpointId}...`);
        const schema = await fetcher.fetchSchema(endpointId, useCache);
        const spec = parser.parse(schema);
        const nodeConfig = config.configs[endpointId];
        const applied = nodeConfig
          ? generator.applyConfig(spec, nodeConfig)
          : spec;
        allSpecs.push({ ...applied, moduleName: name });
      } catch (e) {
        console.error(`  ERROR: ${endpointId}: ${e}`);
      }
    }
  }

  await writeFile(outputPath, JSON.stringify(allSpecs, null, 2));
  console.log(`\nWrote ${allSpecs.length} specs to ${outputPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
