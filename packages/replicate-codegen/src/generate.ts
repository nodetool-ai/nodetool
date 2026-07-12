#!/usr/bin/env node
/**
 * CLI for generating the Replicate node manifest from OpenAPI schemas or
 * pre-extracted package metadata.
 *
 * Usage:
 *   npx tsx src/generate.ts --all [--strict] [--no-cache]
 *   npx tsx src/generate.ts --module image-generate [--strict]
 *   npx tsx src/generate.ts --from-metadata /path/to/nodetool-replicate.json
 */

import { parseArgs } from "node:util";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { SchemaFetcher } from "./schema-fetcher.js";
import { SchemaParser } from "./schema-parser.js";
import { NodeGenerator } from "./node-generator.js";
import { MetadataParser } from "./metadata-parser.js";
import type { PackageMetadata } from "./metadata-parser.js";
import { allConfigs } from "./configs/index.js";
import type { ModuleConfig, NodeSpec } from "./types.js";

const { values } = parseArgs({
  options: {
    module: { type: "string" },
    all: { type: "boolean", default: false },
    "no-cache": { type: "boolean", default: false },
    "from-metadata": { type: "string" },
    strict: { type: "boolean", default: false }
  }
});

interface GenerationFailure {
  modelId: string;
  error: unknown;
}

interface GeneratedSpecs {
  specs: NodeSpec[];
  failures: GenerationFailure[];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function fetchSpecsFromConfig(
  config: ModuleConfig,
  useCache: boolean
): Promise<GeneratedSpecs> {
  const fetcher = new SchemaFetcher();
  const parser = new SchemaParser();
  const generator = new NodeGenerator();
  const specs: NodeSpec[] = [];
  const failures: GenerationFailure[] = [];

  for (const modelId of Object.keys(config.configs)) {
    try {
      console.log(`  Fetching ${modelId}...`);
      const schema = await fetcher.fetchSchema(modelId, useCache);
      const spec = parser.parse(schema);
      spec.endpointId = modelId;
      const nodeConfig = config.configs[modelId];
      specs.push(nodeConfig ? generator.applyConfig(spec, nodeConfig) : spec);
    } catch (error) {
      failures.push({ modelId, error });
      console.error(`  ERROR: ${modelId}: ${errorMessage(error)}`);
    }
  }

  return { specs, failures };
}

function throwIfStrictFailures(
  strict: boolean,
  failures: GenerationFailure[]
): void {
  if (!strict || failures.length === 0) return;
  const details = failures
    .map(({ modelId, error }) => `  - ${modelId}: ${errorMessage(error)}`)
    .join("\n");
  throw new Error(
    `Replicate generation failed for ${failures.length} configured model(s):\n${details}`
  );
}

function requireReplicateToken(strict: boolean): void {
  if (!strict || process.env.REPLICATE_API_TOKEN) return;
  throw new Error(
    "REPLICATE_API_TOKEN is required for strict Replicate generation. Set it before running npm run generate:replicate."
  );
}

interface ManifestEntry {
  endpointId: string;
  className: string;
  moduleName: string;
  docstring: string;
  tags: string[];
  useCases: string[];
  outputType: string;
  inputFields: NodeSpec["inputFields"];
  outputFields: NodeSpec["outputFields"];
  enums: NodeSpec["enums"];
}

/**
 * Build a reverse lookup: className → { modelId, moduleDotName } from allConfigs.
 * Used by the --from-metadata path to match Python-extracted nodes back to TS configs.
 */
function buildConfigIndex(): Map<
  string,
  { modelId: string; moduleDotName: string }
> {
  const index = new Map<string, { modelId: string; moduleDotName: string }>();
  for (const [moduleDotName, modCfg] of Object.entries(allConfigs)) {
    for (const [modelId, nodeCfg] of Object.entries(modCfg.configs)) {
      if (nodeCfg.className) {
        index.set(nodeCfg.className, { modelId, moduleDotName });
      }
    }
  }
  return index;
}

async function generateManifestFromMetadata(
  metadataPath: string,
  outputPath: string
): Promise<void> {
  const raw = await readFile(metadataPath, "utf-8");
  const metadata: PackageMetadata = JSON.parse(raw);

  const metaParser = new MetadataParser();
  const generator = new NodeGenerator();
  const configIndex = buildConfigIndex();
  const moduleMap = metaParser.parseAll(metadata);

  const manifest: ManifestEntry[] = [];

  for (const [dashName, specs] of moduleMap) {
    const dotName = dashName.replace(/-/g, ".");
    const moduleConfig = allConfigs[dotName];
    if (!moduleConfig) continue;

    for (const spec of specs) {
      const indexEntry = configIndex.get(spec.className);
      let modelId = spec.endpointId;

      if (moduleConfig.configs[modelId]) {
        // Direct match by modelId
      } else if (indexEntry && moduleConfig.configs[indexEntry.modelId]) {
        modelId = indexEntry.modelId;
      } else {
        continue;
      }

      spec.endpointId = modelId;
      const nodeConfig = moduleConfig.configs[modelId];
      const applied = nodeConfig
        ? generator.applyConfig(spec, nodeConfig)
        : spec;

      if (manifest.some((m) => m.className === applied.className)) continue;

      manifest.push({
        endpointId: applied.endpointId,
        className: applied.className,
        moduleName: dashName,
        docstring: applied.docstring,
        tags: applied.tags,
        useCases: applied.useCases,
        outputType: nodeConfig?.returnType ?? applied.outputType,
        inputFields: applied.inputFields,
        outputFields: applied.outputFields,
        enums: applied.enums
      });
    }
  }

  await writeFile(outputPath, JSON.stringify(manifest, null, 2));
  console.log(`Wrote ${manifest.length} nodes to ${outputPath}`);
}

async function generateManifestFromConfigs(
  moduleEntries: Array<[string, ModuleConfig]>,
  outputPath: string,
  useCache: boolean,
  strict: boolean
): Promise<void> {
  const manifest: ManifestEntry[] = [];
  const failures: GenerationFailure[] = [];

  for (const [moduleDotName, config] of moduleEntries) {
    const moduleName = moduleDotName.replace(/\./g, "-");
    console.log(`\n=== ${moduleName} ===`);
    const generated = await fetchSpecsFromConfig(config, useCache);
    failures.push(...generated.failures);

    for (const spec of generated.specs) {
      if (manifest.some((entry) => entry.className === spec.className)) {
        continue;
      }
      manifest.push({
        endpointId: spec.endpointId,
        className: spec.className,
        moduleName,
        docstring: spec.docstring,
        tags: spec.tags,
        useCases: spec.useCases,
        outputType: spec.outputType,
        inputFields: spec.inputFields,
        outputFields: spec.outputFields,
        enums: spec.enums
      });
    }
  }

  throwIfStrictFailures(strict, failures);
  await writeFile(outputPath, JSON.stringify(manifest, null, 2));
  console.log(`Wrote ${manifest.length} nodes to ${outputPath}`);
}

async function main(): Promise<void> {
  const useCache = !values["no-cache"];
  const strict = values.strict!;
  requireReplicateToken(strict);
  const manifestPath = join(
    process.cwd(),
    "..",
    "replicate-nodes",
    "src",
    "replicate-manifest.json"
  );

  if (values["from-metadata"]) {
    await generateManifestFromMetadata(values["from-metadata"], manifestPath);
    return;
  }

  if (values.all) {
    await generateManifestFromConfigs(
      Object.entries(allConfigs),
      manifestPath,
      useCache,
      strict
    );
    return;
  }

  if (values.module) {
    const dotName = values.module.replace(/-/g, ".");
    const config = allConfigs[dotName] ?? allConfigs[values.module];
    if (!config) {
      console.error(`Unknown module: ${values.module}`);
      console.error(`Available: ${Object.keys(allConfigs).join(", ")}`);
      process.exit(1);
    }
    await generateManifestFromConfigs(
      [[dotName, config]],
      manifestPath,
      useCache,
      strict
    );
    return;
  }

  console.error(
    "Usage: --all | --module <name> | --from-metadata <path> [--strict] [--no-cache]"
  );
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
