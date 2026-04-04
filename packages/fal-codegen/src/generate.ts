#!/usr/bin/env node
/**
 * CLI for generating FAL node TypeScript classes from OpenAPI schemas.
 *
 * Usage:
 *   npx tsx src/generate.ts --all
 *   npx tsx src/generate.ts --module text-to-image
 *   npx tsx src/generate.ts --endpoint fal-ai/flux/dev
 *   npx tsx src/generate.ts --all --no-cache
 *   npx tsx src/generate.ts --all --output-dir ../fal-nodes/src/generated
 */

import { parseArgs } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { SchemaFetcher } from "./schema-fetcher.js";
import { SchemaParser } from "./schema-parser.js";
import { NodeGenerator } from "./node-generator.js";
import { allConfigs } from "./configs/index.js";
import type { ModuleConfig } from "./types.js";

const { values } = parseArgs({
  options: {
    module: { type: "string" },
    endpoint: { type: "string" },
    all: { type: "boolean", default: false },
    "no-cache": { type: "boolean", default: false },
    "output-dir": {
      type: "string",
      default: join(process.cwd(), "..", "fal-nodes", "src", "generated")
    }
  }
});

async function generateModule(
  moduleName: string,
  config: ModuleConfig,
  outputDir: string,
  useCache: boolean
): Promise<number> {
  const fetcher = new SchemaFetcher();
  const parser = new SchemaParser();
  const generator = new NodeGenerator();

  const specs: {
    spec: ReturnType<SchemaParser["parse"]>;
    endpointId: string;
  }[] = [];
  for (const endpointId of Object.keys(config.configs)) {
    try {
      console.log(`  Fetching ${endpointId}...`);
      const schema = await fetcher.fetchSchema(endpointId, useCache);
      const spec = parser.parse(schema);
      // Apply config overrides
      const nodeConfig = config.configs[endpointId];
      const applied = nodeConfig
        ? generator.applyConfig(spec, nodeConfig)
        : spec;
      specs.push({ spec: applied, endpointId });
    } catch (e) {
      console.error(`  ERROR: ${endpointId}: ${e}`);
    }
  }

  if (specs.length === 0) return 0;

  const moduleCode = generator.generateModule(
    moduleName.replace(/-/g, "_"),
    specs.map((s) => s.spec),
    config
  );

  await mkdir(outputDir, { recursive: true });
  const outFile = join(outputDir, `${moduleName}.ts`);
  await writeFile(outFile, moduleCode);
  console.log(`  Wrote ${specs.length} nodes to ${outFile}`);
  return specs.length;
}

async function main(): Promise<void> {
  const outputDir = values["output-dir"]!;
  const useCache = !values["no-cache"];

  if (values.all) {
    let total = 0;
    for (const [name, config] of Object.entries(allConfigs)) {
      const dashName = name.replace(/_/g, "-");
      console.log(`\n=== ${dashName} ===`);
      total += await generateModule(dashName, config, outputDir, useCache);
    }
    console.log(`\nTotal: ${total} nodes generated`);
  } else if (values.module) {
    const moduleName = values.module.replace(/-/g, "_");
    const config = allConfigs[moduleName] ?? allConfigs[values.module];
    if (!config) {
      console.error(`Unknown module: ${values.module}`);
      console.error(`Available: ${Object.keys(allConfigs).join(", ")}`);
      process.exit(1);
    }
    await generateModule(values.module, config, outputDir, useCache);
  } else if (values.endpoint) {
    const fetcher = new SchemaFetcher();
    const parser = new SchemaParser();
    const generator = new NodeGenerator();
    const schema = await fetcher.fetchSchema(values.endpoint, useCache);
    const spec = parser.parse(schema);
    const code = generator.generate(spec, "standalone");
    const outFile = join(outputDir, `${spec.className.toLowerCase()}.ts`);
    await mkdir(outputDir, { recursive: true });
    await writeFile(outFile, code);
    console.log(`Wrote ${outFile}`);
  } else {
    console.error("Usage: --module <name> | --endpoint <id> | --all");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
