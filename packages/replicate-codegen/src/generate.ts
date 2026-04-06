#!/usr/bin/env node
/**
 * CLI for generating Replicate node TypeScript classes from OpenAPI schemas.
 *
 * Usage:
 *   npx tsx src/generate.ts --all
 *   npx tsx src/generate.ts --module image-generate
 *   npx tsx src/generate.ts --all --no-cache
 *   npx tsx src/generate.ts --all --output-dir ../replicate-nodes/src/generated
 *   npx tsx src/generate.ts --from-metadata /path/to/nodetool-replicate.json
 */

import { parseArgs } from "node:util";
import { mkdir, readFile, writeFile } from "node:fs/promises";
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
    manifest: { type: "boolean", default: false },
    "output-dir": {
      type: "string",
      default: join(process.cwd(), "..", "replicate-nodes", "src", "generated")
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

  const specs: { spec: ReturnType<SchemaParser["parse"]>; modelId: string }[] =
    [];
  for (const modelId of Object.keys(config.configs)) {
    try {
      console.log(`  Fetching ${modelId}...`);
      const schema = await fetcher.fetchSchema(modelId, useCache);
      const spec = parser.parse(schema);
      // Apply config overrides
      const nodeConfig = config.configs[modelId];
      const applied = nodeConfig
        ? generator.applyConfig(spec, nodeConfig)
        : spec;
      specs.push({ spec: applied, modelId });
    } catch (e) {
      console.error(`  ERROR: ${modelId}: ${e}`);
    }
  }

  if (specs.length === 0) return 0;

  const moduleCode = generator.generateModule(
    moduleName,
    specs.map((s) => s.spec),
    config
  );

  await mkdir(outputDir, { recursive: true });
  const outFile = join(outputDir, `${moduleName}.ts`);
  await writeFile(outFile, moduleCode);
  console.log(`  Wrote ${specs.length} nodes to ${outFile}`);
  return specs.length;
}

// ---------------------------------------------------------------------------
// Metadata-based generation (no API calls)
// ---------------------------------------------------------------------------

/**
 * Build a reverse lookup: className → { configKey (modelId), moduleDotName }
 * from the allConfigs structure.
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

async function generateFromMetadata(
  metadataPath: string,
  outputDir: string
): Promise<void> {
  const raw = await readFile(metadataPath, "utf-8");
  const metadata: PackageMetadata = JSON.parse(raw);

  const metaParser = new MetadataParser();
  const generator = new NodeGenerator();
  const configIndex = buildConfigIndex();

  // Parse all nodes grouped by module name (e.g. "image-generate")
  const moduleMap = metaParser.parseAll(metadata);

  let total = 0;

  for (const [dashName, specs] of moduleMap) {
    // Find the matching module config (dash → dot name)
    const dotName = dashName.replace(/-/g, ".");
    const moduleConfig = allConfigs[dotName];

    if (!moduleConfig) {
      console.warn(
        `  WARN: No config found for module "${dotName}", skipping ${specs.length} nodes`
      );
      continue;
    }

    console.log(`\n=== ${dashName} ===`);

    // For each spec, match to a config entry by className or modelId,
    // then set endpointId to the config's modelId key.
    const finalSpecs: NodeSpec[] = [];

    for (const spec of specs) {
      // Try to find config entry by className
      const indexEntry = configIndex.get(spec.className);
      let modelId = spec.endpointId;

      // Check if modelId exists in config
      if (moduleConfig.configs[modelId]) {
        // Direct match by modelId — use it
      } else if (indexEntry && moduleConfig.configs[indexEntry.modelId]) {
        // Match by className
        modelId = indexEntry.modelId;
      } else {
        console.warn(
          `  WARN: No config for node "${spec.className}" (model: ${modelId}), skipping`
        );
        continue;
      }

      // Set the endpointId to the config key (modelId)
      spec.endpointId = modelId;

      // Apply config overrides
      const nodeConfig = moduleConfig.configs[modelId];
      const applied = nodeConfig
        ? generator.applyConfig(spec, nodeConfig)
        : spec;

      // Deduplicate by className (Python metadata can have multiple entries
      // for the same model, e.g. Kandinsky and Kandinsky_2_2 both map to
      // ai-forever/kandinsky-2.2 with className "Kandinsky")
      if (finalSpecs.some((s) => s.className === applied.className)) continue;

      console.log(`  ${applied.className} (${modelId})`);
      finalSpecs.push(applied);
    }

    if (finalSpecs.length === 0) continue;

    const moduleCode = generator.generateModule(
      dashName,
      finalSpecs,
      moduleConfig
    );

    await mkdir(outputDir, { recursive: true });
    const outFile = join(outputDir, `${dashName}.ts`);
    await writeFile(outFile, moduleCode);
    console.log(`  Wrote ${finalSpecs.length} nodes to ${outFile}`);
    total += finalSpecs.length;
  }

  console.log(`\nTotal: ${total} nodes generated from metadata`);
}

// ---------------------------------------------------------------------------
// Manifest generation (JSON instead of TS)
// ---------------------------------------------------------------------------

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
        // Direct match
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
        outputType: (nodeConfig?.returnType ?? applied.outputType),
        inputFields: applied.inputFields,
        outputFields: applied.outputFields,
        enums: applied.enums
      });
    }
  }

  await writeFile(outputPath, JSON.stringify(manifest, null, 2));
  console.log(`Wrote ${manifest.length} nodes to ${outputPath}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const outputDir = values["output-dir"]!;
  const useCache = !values["no-cache"];

  if (values.manifest && values["from-metadata"]) {
    const manifestPath = join(
      process.cwd(),
      "..",
      "replicate-nodes",
      "src",
      "replicate-manifest.json"
    );
    await generateManifestFromMetadata(values["from-metadata"], manifestPath);
    return;
  }

  if (values["from-metadata"]) {
    await generateFromMetadata(values["from-metadata"], outputDir);
  } else if (values.all) {
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
    console.error("Usage: --module <name> | --all | --from-metadata <path>");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
