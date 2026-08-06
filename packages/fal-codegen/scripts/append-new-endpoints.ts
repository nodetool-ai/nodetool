#!/usr/bin/env tsx
/**
 * Appends endpoints newly listed in `src/configs/` to fal-manifest.json
 * without re-fetching the schemas already in it.
 *
 * Run: npx tsx scripts/append-new-endpoints.ts
 */

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SchemaFetcher } from "../src/schema-fetcher.js";
import { SchemaParser } from "../src/schema-parser.js";
import { NodeGenerator } from "../src/node-generator.js";
import { allConfigs } from "../src/configs/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const MANIFEST = join(ROOT, "..", "fal-nodes", "src", "fal-manifest.json");

const fetcher = new SchemaFetcher(join(ROOT, ".codegen-cache"));
const parser = new SchemaParser();
const generator = new NodeGenerator();

const manifest = JSON.parse(await readFile(MANIFEST, "utf-8")) as Array<
  Record<string, unknown>
>;
const existing = new Set(manifest.map((m) => m.endpointId as string));

const failures: string[] = [];
let added = 0;

for (const [moduleName, moduleConfig] of Object.entries(allConfigs)) {
  for (const endpointId of Object.keys(moduleConfig.configs)) {
    if (existing.has(endpointId)) continue;
    existing.add(endpointId);
    try {
      console.log(`  Fetching ${endpointId}...`);
      const schema = await fetcher.fetchSchema(endpointId, true);
      const spec = generator.applyConfig(
        parser.parse(schema),
        moduleConfig.configs[endpointId]
      );
      manifest.push({ ...spec, moduleName });
      added++;
    } catch (e) {
      console.error(`  ERROR ${endpointId}: ${(e as Error).message}`);
      failures.push(endpointId);
    }
  }
}

await writeFile(MANIFEST, JSON.stringify(manifest, null, 2));
console.log(`\nManifest entries: ${manifest.length} (added ${added})`);
if (failures.length) console.log("Failed:", failures);
