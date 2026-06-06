#!/usr/bin/env node
/**
 * CLI for generating FAL node manifest from OpenAPI schemas.
 *
 * Also fetches per-endpoint unit pricing from the FAL pricing API and writes
 * two JSON bundles next to the manifest (under `src/generated/`). Pass
 * `--no-pricing` to leave existing bundles untouched. When `FAL_API_KEY` is
 * unset, existing bundles are preserved; empty stubs are written only when
 * neither file exists yet (fresh checkout).
 *
 * Usage:
 *   npx tsx src/generate.ts
 *   npx tsx src/generate.ts --strict
 *   npx tsx src/generate.ts --no-cache
 *   npx tsx src/generate.ts --no-pricing
 *   npx tsx src/generate.ts --output fal-manifest.json
 *
 *   FAL_API_KEY=... npx tsx src/generate.ts   # populate pricing bundles
 */

import { parseArgs } from "node:util";
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { SchemaFetcher } from "./schema-fetcher.js";
import { SchemaParser } from "./schema-parser.js";
import { NodeGenerator } from "./node-generator.js";
import { allConfigs } from "./configs/index.js";
import type { NodeSpec } from "./types.js";
import { fetchFalPricing } from "./fal-pricing-fetch.js";
import {
  buildPricingBundles,
  preserveOrWriteEmptyPricingBundles,
  writePricingBundles,
  type SpecWithModule
} from "./fal-pricing-write.js";

const { values } = parseArgs({
  options: {
    "no-cache": { type: "boolean", default: false },
    strict: { type: "boolean", default: false },
    "no-pricing": { type: "boolean", default: false },
    output: {
      type: "string",
      default: join(process.cwd(), "..", "fal-nodes", "src", "fal-manifest.json")
    }
  }
});

interface GenerationFailure {
  endpointId: string;
  error: unknown;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function throwIfStrictFailures(
  strict: boolean,
  failures: GenerationFailure[]
): void {
  if (!strict || failures.length === 0) return;
  const details = failures
    .map(({ endpointId, error }) => `  - ${endpointId}: ${errorMessage(error)}`)
    .join("\n");
  throw new Error(
    `FAL generation failed for ${failures.length} configured endpoint(s):\n${details}`
  );
}

function pricingPaths(manifestPath: string): {
  byNodeTypePath: string;
  catalogPath: string;
} {
  const generatedDir = join(dirname(manifestPath), "generated");
  return {
    byNodeTypePath: join(generatedDir, "fal-node-type-pricing.json"),
    catalogPath: join(generatedDir, "fal-unit-pricing.json")
  };
}

async function generatePricing(
  specs: SpecWithModule[],
  manifestPath: string,
  skip: boolean
): Promise<void> {
  const paths = pricingPaths(manifestPath);

  if (skip) {
    console.log("\nSkipping pricing update (--no-pricing)");
    return;
  }

  const apiKey = process.env.FAL_API_KEY;
  if (!apiKey) {
    const outcome = await preserveOrWriteEmptyPricingBundles(paths);
    if (outcome === "preserved") {
      console.warn(
        "\nFAL_API_KEY not set — keeping existing pricing bundles. " +
          "Set FAL_API_KEY=... to refresh pricing, or pass --no-pricing to silence this."
      );
    } else {
      console.warn(
        "\nFAL_API_KEY not set — wrote empty pricing stubs (no existing bundles). " +
          "Set FAL_API_KEY=... to populate pricing."
      );
    }
    return;
  }

  const endpointIds = specs.map((s) => s.endpointId);
  console.log(
    `\nFetching FAL pricing for ${endpointIds.length} endpoint(s)...`
  );
  const prices = await fetchFalPricing(endpointIds, apiKey);
  const writtenAt = new Date().toISOString();
  const bundles = buildPricingBundles(specs, prices, writtenAt);

  await writePricingBundles(bundles, paths);

  const resolved = Object.keys(bundles.byNodeType.byNodeType).length;
  console.log(
    `Wrote pricing for ${resolved}/${endpointIds.length} endpoint(s) ` +
      `to ${paths.byNodeTypePath}`
  );
  if (resolved < endpointIds.length) {
    const missing = endpointIds.filter((id) => !prices[id]);
    console.warn(
      `  Missing pricing for: ${missing.slice(0, 5).join(", ")}` +
        (missing.length > 5 ? `, +${missing.length - 5} more` : "")
    );
  }
}

async function main(): Promise<void> {
  const useCache = !values["no-cache"];
  const strict = values.strict!;
  const outputPath = values.output!;
  const skipPricing = values["no-pricing"]!;

  const fetcher = new SchemaFetcher();
  const parser = new SchemaParser();
  const generator = new NodeGenerator();

  const allSpecs: Array<NodeSpec & { moduleName: string }> = [];
  const failures: GenerationFailure[] = [];

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
        failures.push({ endpointId, error: e });
        console.error(`  ERROR: ${endpointId}: ${errorMessage(e)}`);
      }
    }
  }

  throwIfStrictFailures(strict, failures);
  await writeFile(outputPath, JSON.stringify(allSpecs, null, 2));
  console.log(`\nWrote ${allSpecs.length} specs to ${outputPath}`);

  await generatePricing(allSpecs, outputPath, skipPricing);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
