#!/usr/bin/env node
/**
 * Deterministic fixture-mode generation for the FAL codegen.
 *
 * Reads the checked-in schema fixtures named by `fixtures/generator-manifest.json`
 * and writes the manifest's declared outputs into `--out`. It never touches the
 * network, never reads pricing, and emits no timestamps, so two runs over the
 * same fixtures are byte-identical. Live refresh stays in `src/generate.ts`.
 *
 * Usage:
 *   npx tsx src/fixture-generate.ts --out <dir>
 */

import { parseArgs } from "node:util";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SchemaParser } from "./schema-parser.js";
import { NodeGenerator } from "./node-generator.js";
import { allConfigs } from "./configs/index.js";
import type { NodeSpec } from "./types.js";

export interface FalFixtureEntry {
  endpointId: string;
  module: string;
  schema: string;
}

export interface GeneratorOutputEntry {
  path: string;
  kind: "node-source" | "static-metadata";
}

export interface FalGeneratorManifest {
  provider: "fal";
  fixtures: FalFixtureEntry[];
  outputs: GeneratorOutputEntry[];
}

const PACKAGE_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  ".."
);

export const FIXTURES_DIR = join(PACKAGE_DIR, "fixtures");

export async function readFalGeneratorManifest(
  fixturesDir = FIXTURES_DIR
): Promise<FalGeneratorManifest> {
  const raw = await readFile(
    join(fixturesDir, "generator-manifest.json"),
    "utf8"
  );
  return JSON.parse(raw) as FalGeneratorManifest;
}

/**
 * Build every declared output from the checked-in fixtures.
 *
 * A fixture whose schema file is missing, or whose endpoint the module config
 * no longer carries, is an error: fixture mode must not quietly generate less
 * than the manifest declares.
 */
export async function generateFalFixtureOutputs(
  fixturesDir = FIXTURES_DIR
): Promise<Map<string, string>> {
  const manifest = await readFalGeneratorManifest(fixturesDir);
  const parser = new SchemaParser();
  const generator = new NodeGenerator();

  const specs: Array<NodeSpec & { moduleName: string }> = [];
  const byModule = new Map<string, NodeSpec[]>();

  for (const fixture of manifest.fixtures) {
    const schemaPath = join(fixturesDir, fixture.schema);
    let raw: string;
    try {
      raw = await readFile(schemaPath, "utf8");
    } catch {
      throw new Error(
        `Missing schema fixture for ${fixture.endpointId}: ${schemaPath}`
      );
    }
    const moduleConfig = allConfigs[fixture.module];
    if (!moduleConfig) {
      throw new Error(
        `Fixture ${fixture.endpointId} names module "${fixture.module}", which no config declares`
      );
    }
    const nodeConfig = moduleConfig.configs[fixture.endpointId];
    if (!nodeConfig) {
      throw new Error(
        `Fixture ${fixture.endpointId} is not configured in module "${fixture.module}"`
      );
    }

    const schema = JSON.parse(raw) as Record<string, unknown>;
    const spec = generator.applyConfig(parser.parse(schema), nodeConfig);
    specs.push({ ...spec, moduleName: fixture.module });
    byModule.set(fixture.module, [
      ...(byModule.get(fixture.module) ?? []),
      spec
    ]);
  }

  const files = new Map<string, string>();
  for (const output of manifest.outputs) {
    if (output.kind === "static-metadata") {
      files.set(output.path, `${JSON.stringify(specs, null, 2)}\n`);
      continue;
    }
    const moduleName = moduleNameFromNodeSourcePath(output.path);
    const moduleSpecs = byModule.get(moduleName);
    if (!moduleSpecs) {
      throw new Error(
        `Declared node-source output ${output.path} has no fixture for module "${moduleName}"`
      );
    }
    files.set(
      output.path,
      `${generator.generateModule(moduleName, moduleSpecs, allConfigs[moduleName])}\n`
    );
  }
  return files;
}

function moduleNameFromNodeSourcePath(path: string): string {
  const base = path.split("/").pop() ?? path;
  return base.replace(/\.ts$/, "");
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { out: { type: "string" } } });
  const outDir = values.out;
  if (!outDir) {
    throw new Error("--out <dir> is required");
  }
  const files = await generateFalFixtureOutputs();
  for (const [relPath, content] of files) {
    const target = join(outDir, relPath);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content, "utf8");
  }
  console.log(`Wrote ${files.size} fixture-mode output(s) to ${outDir}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
