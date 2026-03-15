#!/usr/bin/env node
/**
 * CLI for generating Replicate node TypeScript classes from OpenAPI schemas.
 *
 * Usage:
 *   npx tsx src/generate.ts --all
 *   npx tsx src/generate.ts --module image-generate
 *   npx tsx src/generate.ts --all --no-cache
 *   npx tsx src/generate.ts --all --output-dir ../replicate-nodes/src/generated
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
    all: { type: "boolean", default: false },
    "no-cache": { type: "boolean", default: false },
    "output-dir": {
      type: "string",
      default: join(process.cwd(), "..", "replicate-nodes", "src", "generated"),
    },
  },
});

async function generateModule(
  moduleName: string,
  config: ModuleConfig,
  outputDir: string,
  useCache: boolean,
): Promise<number> {
  const fetcher = new SchemaFetcher();
  const parser = new SchemaParser();
  const generator = new NodeGenerator();

  const specs: { spec: ReturnType<SchemaParser["parse"]>; modelId: string }[] = [];
  for (const modelId of Object.keys(config.configs)) {
    try {
      console.log(`  Fetching ${modelId}...`);
      const schema = await fetcher.fetchSchema(modelId, useCache);
      const spec = parser.parse(schema);
      // Apply config overrides
      const nodeConfig = config.configs[modelId];
      const applied = nodeConfig ? generator.applyConfig(spec, nodeConfig) : spec;
      specs.push({ spec: applied, modelId });
    } catch (e) {
      console.error(`  ERROR: ${modelId}: ${e}`);
    }
  }

  if (specs.length === 0) return 0;

  const moduleCode = generator.generateModule(
    moduleName.replace(/-/g, "_"),
    specs.map((s) => s.spec),
    config,
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
      const dashName = name.replace(/\./g, "-");
      console.log(`\n=== ${dashName} ===`);
      total += await generateModule(dashName, config, outputDir, useCache);
    }
    console.log(`\nTotal: ${total} nodes generated`);
  } else if (values.module) {
    const dotName = values.module.replace(/-/g, ".");
    const config = allConfigs[dotName] ?? allConfigs[values.module];
    if (!config) {
      console.error(`Unknown module: ${values.module}`);
      console.error(`Available: ${Object.keys(allConfigs).join(", ")}`);
      process.exit(1);
    }
    const dashName = values.module.replace(/\./g, "-");
    await generateModule(dashName, config, outputDir, useCache);
  } else {
    console.error("Usage: --module <name> | --all");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
