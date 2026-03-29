#!/usr/bin/env node
/**
 * CLI for generating FAL node TypeScript classes from OpenAPI schemas.
 *
 * Usage:
 *   npx tsx src/generate.ts --all
 *   npx tsx src/generate.ts --from-platform
 *   npx tsx src/generate.ts --module text-to-image
 *   npx tsx src/generate.ts --endpoint fal-ai/flux/dev
 *   npx tsx src/generate.ts --all --no-cache
 *   npx tsx src/generate.ts --all --output-dir ../fal-nodes/src/generated
 *   npx tsx src/generate.ts --from-platform --dry-run
 *   npx tsx src/generate.ts --from-platform --dry-run --skip-pricing   # faster: omit GET /v1/models/pricing
 *
 * Pricing snapshot (optional):
 *   npx tsx src/generate.ts --pricing-only --from-platform
 *     → writes fal-unit-pricing.json under --output-dir (catalog + pricing; no OpenAPI/codegen).
 *     Same-run catalog + pricing share api.fal.ai rate limits; the CLI waits **FAL_CATALOG_TO_PRICING_GAP_MS**
 *     (default 120s) after the catalog before calling pricing (set `0` to skip — may 429 heavily).
 *   npx tsx src/generate.ts --from-platform --pricing-snapshot path/to/fal-unit-pricing.json
 *     → embeds prices from file (no live pricing API). Regenerate snapshot when FAL changes rates.
 *
 * API key for platform + pricing ( `api.fal.ai` is rate-limited without auth):
 *   • `--fal-api-key <key>` (highest precedence), then `FAL_API_KEY` after monorepo `.env` load,
 *   • or add `FAL_API_KEY=...` to nodetool repo root `.env`, or set the env var in the shell.
 *   Used for OpenAPI/catalog fetches and for GET /v1/models/pricing (embedded `falUnitPricing` on classes).
 *   Unit pricing is fetched by default (including `--dry-run`); pass `--skip-pricing` to skip it.
 *
 * --from-platform lists active models from GET https://api.fal.ai/v1/models (paginated),
 * groups them by category, and loads OpenAPI only via that same API (`expand=openapi-3.0`,
 * small batches + single-id retries — see platform-models.ts).
 */

import { parseArgs } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { SchemaFetcher } from "./schema-fetcher.js";
import { SchemaParser } from "./schema-parser.js";
import { NodeGenerator } from "./node-generator.js";
import { allConfigs } from "./configs/index.js";
import {
  fetchAllActiveCatalogModels,
  fetchOpenapiForEndpoints,
  mapFalCategoryToModuleKey,
  type FalCodegenModuleKey,
  type FalModelListItem,
} from "./platform-models.js";
import {
  writeFalModelsSnapshot,
  readFalModelsSnapshot,
} from "./fal-models-snapshot.js";
import type { FalUnitPricing, ModuleConfig, NodeSpec } from "./types.js";
import { loadNodetoolDotenv, resolveNodetoolRepoRoot } from "./load-nodetool-env.js";
import { fetchFalUnitPricingMap } from "./fetch-fal-unit-pricing.js";
import {
  FAL_UNIT_PRICING_JSON,
  resolveFalUnitPricingMap,
  writeFalUnitPricingSnapshot,
} from "./fal-pricing-snapshot.js";
import {
  collectPricingByNodeType,
  FAL_NODE_TYPE_PRICING_JSON,
  mergeFalNodeTypePricingFile,
  writeFalNodeTypePricingFull,
  type FalUnitPricingWire,
} from "./fal-node-type-pricing-write.js";

/** Let quota recover between GET /v1/models (catalog) and GET /v1/models/pricing in the same process. */
function catalogToPricingGapMs(): number {
  const raw = process.env.FAL_CATALOG_TO_PRICING_GAP_MS;
  if (raw === "0") {
    return 0;
  }
  if (raw != null && raw.trim() !== "") {
    const n = Number.parseInt(raw, 10);
    if (!Number.isNaN(n) && n >= 0) {
      return n;
    }
  }
  return 120_000;
}

loadNodetoolDotenv();

const { values } = parseArgs({
  options: {
    module: { type: "string" },
    endpoint: { type: "string" },
    all: { type: "boolean", default: false },
    "from-platform": { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
    "no-cache": { type: "boolean", default: false },
    "fal-api-key": { type: "string" },
    "skip-pricing": { type: "boolean", default: false },
    "pricing-only": { type: "boolean", default: false },
    "models-only": { type: "boolean", default: false },
    "pricing-snapshot": { type: "string" },
    "output-dir": {
      type: "string",
      default: join(process.cwd(), "..", "fal-nodes", "src", "generated"),
    },
    "save-models-snapshot": { type: "string" },
    "from-models-snapshot": { type: "string" },
  },
});

function resolveFalApiKeyFromEnv(): string | undefined {
  const cliKey = values["fal-api-key"]?.trim();
  const envKey = process.env.FAL_API_KEY?.trim();
  return cliKey || envKey || undefined;
}

function uniquifyClassName(
  base: string,
  endpointId: string,
  used: Set<string>,
): string {
  const tail =
    endpointId
      .split("/")
      .filter(Boolean)
      .pop()
      ?.replace(/[^a-zA-Z0-9]/g, "") ?? "Model";
  let candidate = `${base}_${tail}`;
  if (!used.has(candidate)) {
    return candidate;
  }
  let n = 2;
  while (used.has(`${candidate}_${n}`)) {
    n += 1;
  }
  return `${candidate}_${n}`;
}

function enrichSpecFromCatalog(
  spec: NodeSpec,
  item: FalModelListItem | undefined,
  hasDocstringOverride: boolean,
  hasTagsOverride: boolean,
): NodeSpec {
  const meta = item?.metadata;
  if (!meta) {
    return spec;
  }
  let next = spec;
  if (!hasDocstringOverride && meta.description?.trim()) {
    next = { ...next, docstring: meta.description.trim() };
  }
  if (!hasTagsOverride && meta.tags && meta.tags.length > 0) {
    next = { ...next, tags: meta.tags };
  }
  return next;
}

interface StaticModuleResult {
  generated: number;
  failedEndpoints: string[];
}

/** Max endpoint ids listed per error bucket in the platform OpenAPI failure summary. */
const PLATFORM_OPENAPI_LIST_CAP = 30;

function printGroupedEndpointFailures(
  title: string,
  failures: { endpointId: string; error: string }[],
  listCap: number,
): void {
  if (failures.length === 0) {
    return;
  }
  console.log(`\n--- ${title}: ${failures.length} ---`);
  const byError = new Map<string, string[]>();
  for (const { endpointId, error } of failures) {
    const list = byError.get(error) ?? [];
    list.push(endpointId);
    byError.set(error, list);
  }
  const buckets = [...byError.entries()].sort(
    (a, b) => b[1].length - a[1].length,
  );
  console.log("\nCounts by reason:");
  for (const [err, ids] of buckets) {
    console.log(`  ${ids.length}\t${err}`);
  }
  console.log("\nEndpoints by reason (alphabetical; truncated per reason):");
  for (const [err, ids] of buckets) {
    ids.sort((x, y) => x.localeCompare(y));
    console.log(`\n  [${ids.length}] ${err}`);
    const shown = ids.slice(0, listCap);
    for (const id of shown) {
      console.log(`    ${id}`);
    }
    if (ids.length > listCap) {
      console.log(`    … and ${ids.length - listCap} more`);
    }
  }
}

async function generateModule(
  moduleName: string,
  config: ModuleConfig,
  outputDir: string,
  useCache: boolean,
  dryRun: boolean,
  apiKey: string | undefined,
  skipUnitPricing: boolean,
  pricingSnapshotFile: string | undefined,
): Promise<StaticModuleResult> {
  const fetcher = new SchemaFetcher();
  const parser = new SchemaParser();
  const generator = new NodeGenerator();

  const specs: NodeSpec[] = [];
  const failedEndpoints: string[] = [];

  for (const endpointId of Object.keys(config.configs)) {
    try {
      console.log(`  Fetching ${endpointId}...`);
      const schema = await fetcher.fetchSchema(endpointId, useCache);
      const spec = parser.parse(schema);
      const nodeConfig = config.configs[endpointId];
      const applied = nodeConfig ? generator.applyConfig(spec, nodeConfig) : spec;
      specs.push(applied);
    } catch (e) {
      console.error(`  ERROR: ${endpointId}: ${e}`);
      failedEndpoints.push(endpointId);
    }
  }

  if (specs.length === 0) {
    return { generated: 0, failedEndpoints };
  }

  const pricingMap = await resolveFalUnitPricingMap({
    endpointIds: specs.map((s) => s.endpointId),
    apiKey,
    skip: skipUnitPricing,
    snapshotFile: pricingSnapshotFile,
  });
  const pricedSpecs = specs.map((s) => ({
    ...s,
    falUnitPricing: pricingMap.get(s.endpointId) ?? null,
  }));

  const moduleCode = generator.generateModule(
    moduleName.replace(/-/g, "_"),
    pricedSpecs,
    config,
  );

  const outFile = join(outputDir, `${moduleName}.ts`);
  if (dryRun) {
    console.log(
      `  [dry-run] Would write ${specs.length} nodes (${moduleCode.length} chars) → ${outFile}`,
    );
  } else {
    await mkdir(outputDir, { recursive: true });
    await writeFile(outFile, moduleCode);
    console.log(`  Wrote ${specs.length} nodes to ${outFile}`);
    await mergeFalNodeTypePricingFile(
      outputDir,
      collectPricingByNodeType(moduleName, pricedSpecs),
      dryRun,
    );
  }
  return { generated: specs.length, failedEndpoints };
}

/**
 * Pure codegen from already-fetched data. No network calls.
 * Used by both `generateFromPlatform` (after fetch) and `generateFromModelsSnapshot` (offline).
 */
async function runCodegenLoop(
  catalog: FalModelListItem[],
  allSchemas: Map<string, Record<string, unknown>>,
  pricingMap: Map<string, FalUnitPricing>,
  outputDir: string,
  dryRun: boolean,
): Promise<{ totalGenerated: number; parseFailures: { endpointId: string; error: string }[] }> {
  const byModule = new Map<FalCodegenModuleKey, FalModelListItem[]>();
  for (const m of catalog) {
    const key = mapFalCategoryToModuleKey(m.metadata?.category);
    const list = byModule.get(key) ?? [];
    list.push(m);
    byModule.set(key, list);
  }

  const parser = new SchemaParser();
  const generator = new NodeGenerator();
  let totalGenerated = 0;
  const parseFailures: { endpointId: string; error: string }[] = [];
  const aggregatePricingByNodeType: Record<string, FalUnitPricingWire> = {};

  for (const moduleKey of Object.keys(allConfigs) as FalCodegenModuleKey[]) {
    const dashName = moduleKey.replace(/_/g, "-");
    const group = byModule.get(moduleKey) ?? [];
    const moduleConfig = allConfigs[moduleKey];

    console.log(`\n=== ${dashName} === (${group.length} in catalog)`);
    if (group.length === 0) continue;

    const endpointIds = [...new Set(group.map((g) => g.endpoint_id))].sort();
    const itemByEndpoint = new Map(group.map((g) => [g.endpoint_id, g]));

    const usedClassNames = new Set<string>();
    const specs: NodeSpec[] = [];

    for (const endpointId of endpointIds) {
      const openapi = allSchemas.get(endpointId);
      if (!openapi) continue;

      try {
        let spec = parser.parse(openapi);
        // If the schema has an empty endpointId (e.g. fal-ai/flux-2/klein/realtime),
        // fall back to deriving className from the catalog endpointId.
        if (!spec.className) {
          spec = { ...spec, endpointId: endpointId, className: parser.generateClassName(endpointId) };
        }
        const nodeConfig = moduleConfig.configs[endpointId];
        if (nodeConfig) spec = generator.applyConfig(spec, nodeConfig);

        spec = enrichSpecFromCatalog(
          spec,
          itemByEndpoint.get(endpointId),
          Boolean(nodeConfig?.docstring),
          Boolean(nodeConfig?.tags && nodeConfig.tags.length > 0),
        );

        let className = spec.className;
        if (usedClassNames.has(className)) {
          className = uniquifyClassName(className, endpointId, usedClassNames);
        }
        usedClassNames.add(className);
        spec = { ...spec, className, falUnitPricing: pricingMap.get(endpointId) ?? null };
        specs.push(spec);
      } catch (e) {
        parseFailures.push({ endpointId, error: e instanceof Error ? e.message : String(e) });
      }
    }

    if (specs.length === 0) {
      console.log(`  (no nodes generated)`);
      continue;
    }

    specs.sort((a, b) => a.endpointId.localeCompare(b.endpointId));
    // Configs were already applied above using catalog endpointIds.
    // Pass configs:{} so generateModule doesn't re-apply them using spec.endpointId
    // (which comes from the schema and may differ from the catalog id, causing overwrites).
    const moduleCode = generator.generateModule(dashName, specs, { ...moduleConfig, configs: {} });
    const outFile = join(outputDir, `${dashName}.ts`);
    if (dryRun) {
      console.log(`  [dry-run] Would write ${specs.length} nodes (${moduleCode.length} chars) → ${outFile}`);
    } else {
      await mkdir(outputDir, { recursive: true });
      await writeFile(outFile, moduleCode);
      console.log(`  Wrote ${specs.length} nodes to ${outFile}`);
    }
    totalGenerated += specs.length;
    Object.assign(
      aggregatePricingByNodeType,
      collectPricingByNodeType(dashName, specs),
    );
  }

  await writeFalNodeTypePricingFull(outputDir, aggregatePricingByNodeType, dryRun);
  if (!dryRun && Object.keys(aggregatePricingByNodeType).length > 0) {
    console.log(
      `\nWrote ${FAL_NODE_TYPE_PRICING_JSON} (${Object.keys(aggregatePricingByNodeType).length} FAL node types with unit pricing).`,
    );
  }

  return { totalGenerated, parseFailures };
}

async function generateFromPlatform(
  outputDir: string,
  apiKey: string | undefined,
  dryRun: boolean,
  skipUnitPricing: boolean,
  pricingSnapshotFile: string | undefined,
  saveModelsSnapshot: string | undefined,
): Promise<void> {
  console.log("Discovering models (GET https://api.fal.ai/v1/models, status=active)…");
  const { models: catalog, skippedMissingKind } =
    await fetchAllActiveCatalogModels(apiKey);
  console.log(
    `Catalog: ${catalog.length} endpoints with kind inference|training (paginated ~100/page). Missing \`kind\` is skipped — listed in summary.\n`,
  );

  const catalogEndpointIds = [...new Set(catalog.map((m) => m.endpoint_id))].sort();
  let pricingMap = new Map<string, FalUnitPricing>();
  if (skipUnitPricing) {
    console.log("Skipping unit pricing (--skip-pricing); falUnitPricing will be null.\n");
  } else {
    if (!pricingSnapshotFile?.trim()) {
      console.log(
        `Fetching unit pricing (GET /v1/models/pricing, ${catalogEndpointIds.length} endpoints, batched)…`,
      );
    }
    pricingMap = await resolveFalUnitPricingMap({
      endpointIds: catalogEndpointIds,
      apiKey,
      skip: false,
      snapshotFile: pricingSnapshotFile,
      fetchOptions: { mode: "default" },
    });
    if (!apiKey && !pricingSnapshotFile?.trim()) {
      console.warn("No FAL API key: falUnitPricing will be null on all generated nodes.\n");
    } else {
      console.log(`Unit pricing rows: ${pricingMap.size} / ${catalogEndpointIds.length}\n`);
    }
  }

  // Fetch OpenAPI per module and collect into a single map for snapshot + codegen.
  const byModule = new Map<FalCodegenModuleKey, FalModelListItem[]>();
  for (const m of catalog) {
    const key = mapFalCategoryToModuleKey(m.metadata?.category);
    const list = byModule.get(key) ?? [];
    list.push(m);
    byModule.set(key, list);
  }

  const allSchemas = new Map<string, Record<string, unknown>>();
  const allOpenapiFailed: { endpointId: string; error: string }[] = [];

  for (const moduleKey of Object.keys(allConfigs) as FalCodegenModuleKey[]) {
    const group = byModule.get(moduleKey) ?? [];
    if (group.length === 0) continue;
    const endpointIds = [...new Set(group.map((g) => g.endpoint_id))].sort();
    console.log(`\n  [fetch] ${moduleKey.replace(/_/g, "-")}: OpenAPI for ${endpointIds.length} endpoints…`);
    const { schemas, failed } = await fetchOpenapiForEndpoints(endpointIds, apiKey);
    for (const [id, schema] of schemas) allSchemas.set(id, schema);
    allOpenapiFailed.push(...failed);
    if (failed.length > 0) {
      console.log(`  OpenAPI: ${failed.length} failed (see summary at end)`);
    }
  }

  if (saveModelsSnapshot) {
    const snapPath = saveModelsSnapshot.trim();
    if (!dryRun) {
      await mkdir(join(snapPath, ".."), { recursive: true });
      await writeFalModelsSnapshot(snapPath, catalog, allSchemas);
      console.log(`\nModels snapshot written → ${snapPath} (${catalog.length} catalog rows, ${allSchemas.size} OpenAPI schemas)`);
    } else {
      console.log(`\n[dry-run] Would write models snapshot → ${snapPath}`);
    }
  }

  const { totalGenerated, parseFailures } = await runCodegenLoop(
    catalog, allSchemas, pricingMap, outputDir, dryRun,
  );

  console.log(`\nTotal: ${totalGenerated} nodes ${dryRun ? "(dry run — no files written)" : "generated"}`);
  printGroupedEndpointFailures("OpenAPI fetch failures", allOpenapiFailed, PLATFORM_OPENAPI_LIST_CAP);
  printGroupedEndpointFailures("Parse / codegen failures", parseFailures, PLATFORM_OPENAPI_LIST_CAP);

  if (skippedMissingKind.length > 0) {
    console.log(`\nSkipped — missing metadata.kind (${skippedMissingKind.length}):`);
    for (const id of skippedMissingKind) console.log(`  ${id}`);
  }
}

/**
 * Offline codegen from a models snapshot written by `--save-models-snapshot`.
 * No network calls — useful for iterating on parser/generator changes.
 */
async function generateFromModelsSnapshot(
  snapshotFile: string,
  outputDir: string,
  dryRun: boolean,
  skipUnitPricing: boolean,
  pricingSnapshotFile: string | undefined,
  apiKey: string | undefined,
): Promise<void> {
  console.log(`Loading models snapshot: ${snapshotFile}`);
  const { catalog, openapi: allSchemas } = await readFalModelsSnapshot(snapshotFile);
  console.log(`Snapshot: ${catalog.length} catalog rows, ${allSchemas.size} OpenAPI schemas.\n`);

  const endpointIds = [...allSchemas.keys()].sort();
  let pricingMap = new Map<string, FalUnitPricing>();
  if (skipUnitPricing) {
    console.log("Skipping unit pricing (--skip-pricing); falUnitPricing will be null.\n");
  } else {
    pricingMap = await resolveFalUnitPricingMap({
      endpointIds,
      apiKey,
      skip: false,
      snapshotFile: pricingSnapshotFile,
      fetchOptions: { mode: "default" },
    });
    console.log(`Unit pricing rows: ${pricingMap.size} / ${endpointIds.length}\n`);
  }

  const { totalGenerated, parseFailures } = await runCodegenLoop(
    catalog, allSchemas, pricingMap, outputDir, dryRun,
  );

  console.log(`\nTotal: ${totalGenerated} nodes ${dryRun ? "(dry run — no files written)" : "generated"}`);
  printGroupedEndpointFailures("Parse / codegen failures", parseFailures, PLATFORM_OPENAPI_LIST_CAP);
}

/**
 * Fetch GET /v1/models/pricing only and write JSON (no OpenAPI, no generated `.ts`).
 */
async function runPricingOnly(outputDir: string, dryRun: boolean): Promise<void> {
  const apiKey = resolveFalApiKeyFromEnv();
  if (!apiKey) {
    console.error("--pricing-only requires FAL_API_KEY or --fal-api-key");
    process.exit(1);
  }
  const snapshotPath =
    values["pricing-snapshot"]?.trim() || join(outputDir, FAL_UNIT_PRICING_JSON);

  let endpointIds: string[] = [];
  if (values["from-platform"]) {
    console.log("Discovering models (GET /v1/models, catalog for id list)…");
    const { models } = await fetchAllActiveCatalogModels(apiKey);
    endpointIds = [...new Set(models.map((m) => m.endpoint_id))].sort();
  } else if (values.all) {
    for (const c of Object.values(allConfigs)) {
      endpointIds.push(...Object.keys(c.configs));
    }
    endpointIds = [...new Set(endpointIds)].sort();
  } else if (values.module) {
    const moduleName = values.module.replace(/-/g, "_");
    const config =
      allConfigs[moduleName as FalCodegenModuleKey] ?? allConfigs[values.module];
    if (!config) {
      console.error(`Unknown module: ${values.module}`);
      console.error(`Available: ${Object.keys(allConfigs).join(", ")}`);
      process.exit(1);
    }
    endpointIds = Object.keys(config.configs).sort();
  } else if (values.endpoint) {
    endpointIds = [values.endpoint];
  } else {
    console.error(
      "--pricing-only requires --from-platform, --all, --module <name>, or --endpoint <id>",
    );
    process.exit(1);
  }

  console.log(
    `Pricing-only: ${endpointIds.length} endpoints → ${snapshotPath} (no OpenAPI / no TS emit)`,
  );

  const catalogFromPlatform = Boolean(values["from-platform"]);
  if (catalogFromPlatform) {
    const gapMs = catalogToPricingGapMs();
    if (gapMs > 0) {
      console.log(
        `Waiting ${Math.round(gapMs / 1000)}s after platform catalog before pricing (same api.fal.ai quota; FAL_CATALOG_TO_PRICING_GAP_MS=0 to skip)…`,
      );
      await delay(gapMs);
    }
  }

  console.log("Fetching unit pricing from FAL…");
  const map = await fetchFalUnitPricingMap(endpointIds, apiKey, {
    mode: "pricing-only",
    ...(catalogFromPlatform ? { postCatalogCooldownMs: 0 } : {}),
  });
  console.log(`Fetched ${map.size} / ${endpointIds.length} pricing rows.`);

  if (dryRun) {
    console.log("[dry-run] Would write pricing snapshot file.");
    return;
  }
  await mkdir(outputDir, { recursive: true });
  await writeFalUnitPricingSnapshot(snapshotPath, map);
  console.log(`Wrote ${snapshotPath}`);
}

/**
 * Fetch catalog + all OpenAPI schemas and write a models snapshot. No codegen, no pricing.
 * Use this to build `fal-models.json` once; then iterate offline with `--from-models-snapshot`.
 */
async function runModelsOnly(outputDir: string, dryRun: boolean): Promise<void> {
  const apiKey = resolveFalApiKeyFromEnv();
  if (!apiKey) {
    console.error("--models-only requires FAL_API_KEY or --fal-api-key");
    process.exit(1);
  }
  if (!values["from-platform"]) {
    console.error("--models-only requires --from-platform");
    process.exit(1);
  }

  const snapshotPath =
    values["save-models-snapshot"]?.trim() || join(outputDir, "fal-models.json");

  console.log("Discovering models (GET /v1/models, catalog for id list)…");
  const { models: catalog, skippedMissingKind } = await fetchAllActiveCatalogModels(apiKey);
  console.log(`Catalog: ${catalog.length} endpoints.\n`);

  const byModule = new Map<FalCodegenModuleKey, FalModelListItem[]>();
  for (const m of catalog) {
    const key = mapFalCategoryToModuleKey(m.metadata?.category);
    const list = byModule.get(key) ?? [];
    list.push(m);
    byModule.set(key, list);
  }

  const allSchemas = new Map<string, Record<string, unknown>>();
  const allFailed: { endpointId: string; error: string }[] = [];

  for (const moduleKey of Object.keys(allConfigs) as FalCodegenModuleKey[]) {
    const group = byModule.get(moduleKey) ?? [];
    if (group.length === 0) continue;
    const endpointIds = [...new Set(group.map((g) => g.endpoint_id))].sort();
    console.log(`  [fetch] ${moduleKey.replace(/_/g, "-")}: OpenAPI for ${endpointIds.length} endpoints…`);
    const { schemas, failed } = await fetchOpenapiForEndpoints(endpointIds, apiKey);
    for (const [id, schema] of schemas) allSchemas.set(id, schema);
    allFailed.push(...failed);
  }

  console.log(`\nFetched ${allSchemas.size} / ${catalog.length} OpenAPI schemas.`);
  printGroupedEndpointFailures("OpenAPI fetch failures", allFailed, PLATFORM_OPENAPI_LIST_CAP);

  if (skippedMissingKind.length > 0) {
    console.log(`\nSkipped — missing metadata.kind: ${skippedMissingKind.length}`);
  }

  if (dryRun) {
    console.log(`\n[dry-run] Would write models snapshot → ${snapshotPath}`);
    return;
  }
  await mkdir(outputDir, { recursive: true });
  await writeFalModelsSnapshot(snapshotPath, catalog, allSchemas);
  console.log(`\nWrote models snapshot → ${snapshotPath}`);
}

async function main(): Promise<void> {
  const outputDir = values["output-dir"]!;
  const useCache = !values["no-cache"];
  const dryRun = Boolean(values["dry-run"]);
  const skipUnitPricing = Boolean(values["skip-pricing"]);
  const pricingSnapshotFile = values["pricing-snapshot"]?.trim() || undefined;

  if (dryRun) {
    console.log("Dry run: fetching/parsing only; no files will be written.\n");
  }

  if (values["pricing-only"]) {
    if (skipUnitPricing) {
      console.error("Cannot combine --pricing-only with --skip-pricing.");
      process.exit(1);
    }
    const apiKey = resolveFalApiKeyFromEnv();
    if (apiKey) {
      const src = values["fal-api-key"]?.trim()
        ? "CLI --fal-api-key"
        : "FAL_API_KEY (shell or after nodetool/.env)";
      console.log(`FAL auth: key from ${src} (length ${apiKey.length}).\n`);
    }
    await runPricingOnly(outputDir, dryRun);
    return;
  }

  if (values["models-only"]) {
    await runModelsOnly(outputDir, dryRun);
    return;
  }

  if (values["from-platform"]) {
    const apiKey = resolveFalApiKeyFromEnv();

    const envFile = join(resolveNodetoolRepoRoot(), ".env");
    if (!apiKey) {
      if (existsSync(envFile)) {
        console.warn(
          `Warning: no API key (${envFile} has no usable FAL_API_KEY). Use --fal-api-key or set FAL_API_KEY.\n`,
        );
      } else {
        console.warn(
          `Warning: no API key (no ${envFile}). Use --fal-api-key or set FAL_API_KEY — unauthenticated calls often get HTTP 429.\n`,
        );
      }
    } else {
      const src = values["fal-api-key"]?.trim()
        ? "CLI --fal-api-key"
        : "FAL_API_KEY (shell or after nodetool/.env)";
      console.log(
        `FAL platform auth: key present from ${src} (length ${apiKey.length}).\n`,
      );
    }

    await generateFromPlatform(
      outputDir,
      apiKey,
      dryRun,
      skipUnitPricing,
      pricingSnapshotFile,
      values["save-models-snapshot"]?.trim() || undefined,
    );
    return;
  }

  if (values["from-models-snapshot"]) {
    const snapshotFile = values["from-models-snapshot"].trim();
    const apiKey = resolveFalApiKeyFromEnv();
    console.log(`Offline codegen from models snapshot (no network for catalog/OpenAPI).\n`);
    await generateFromModelsSnapshot(
      snapshotFile,
      outputDir,
      dryRun,
      skipUnitPricing,
      pricingSnapshotFile,
      apiKey,
    );
    return;
  }

  if (values.all) {
    const apiKey = resolveFalApiKeyFromEnv();
    if (!skipUnitPricing && !apiKey) {
      console.warn(
        "No FAL API key (--fal-api-key or FAL_API_KEY): falUnitPricing will be null on static module nodes.\n",
      );
    }
    if (skipUnitPricing) {
      console.log("Skipping unit pricing (--skip-pricing).\n");
    }
    let total = 0;
    const allFailed: string[] = [];
    for (const [name, config] of Object.entries(allConfigs)) {
      const dashName = name.replace(/_/g, "-");
      console.log(`\n=== ${dashName} ===`);
      const { generated, failedEndpoints } = await generateModule(
        dashName,
        config,
        outputDir,
        useCache,
        dryRun,
        apiKey,
        skipUnitPricing,
        pricingSnapshotFile,
      );
      total += generated;
      allFailed.push(...failedEndpoints);
    }
    console.log(
      `\nTotal: ${total} nodes ${dryRun ? "(dry run — no files written)" : "generated"}`,
    );
    if (allFailed.length > 0) {
      console.log(`Failed (schema fetch/parse): ${allFailed.length}`);
    }
    return;
  }

  if (values.module) {
    const apiKey = resolveFalApiKeyFromEnv();
    if (!skipUnitPricing && !apiKey) {
      console.warn(
        "No FAL API key: falUnitPricing will be null on generated nodes.\n",
      );
    }
    if (skipUnitPricing) {
      console.log("Skipping unit pricing (--skip-pricing).\n");
    }
    const moduleName = values.module.replace(/-/g, "_");
    const config = allConfigs[moduleName] ?? allConfigs[values.module];
    if (!config) {
      console.error(`Unknown module: ${values.module}`);
      console.error(`Available: ${Object.keys(allConfigs).join(", ")}`);
      process.exit(1);
    }
    const { generated, failedEndpoints } = await generateModule(
      values.module,
      config,
      outputDir,
      useCache,
      dryRun,
      apiKey,
      skipUnitPricing,
      pricingSnapshotFile,
    );
    console.log(
      `\nTotal: ${generated} nodes ${dryRun ? "(dry run — no files written)" : "generated"}`,
    );
    if (failedEndpoints.length > 0) {
      console.log(`Failed (schema fetch/parse): ${failedEndpoints.length}`);
    }
    return;
  }

  if (values.endpoint) {
    const apiKey = resolveFalApiKeyFromEnv();
    if (skipUnitPricing) {
      console.log("Skipping unit pricing (--skip-pricing).\n");
    }
    const fetcher = new SchemaFetcher();
    const parser = new SchemaParser();
    const generator = new NodeGenerator();
    const schema = await fetcher.fetchSchema(values.endpoint, useCache);
    let spec = parser.parse(schema);
    const pricingMap = await resolveFalUnitPricingMap({
      endpointIds: [spec.endpointId],
      apiKey,
      skip: skipUnitPricing,
      snapshotFile: pricingSnapshotFile,
    });
    spec = {
      ...spec,
      falUnitPricing: pricingMap.get(spec.endpointId) ?? null,
    };
    const code = generator.generate(spec, "standalone");
    const outFile = join(outputDir, `${spec.className.toLowerCase()}.ts`);
    if (dryRun) {
      console.log(
        `[dry-run] Would write standalone (${code.length} chars) → ${outFile}`,
      );
    } else {
      await mkdir(outputDir, { recursive: true });
      await writeFile(outFile, code);
      console.log(`Wrote ${outFile}`);
    }
    return;
  }

  console.error(
    "Usage: --module <name> | --endpoint <id> | --all | --from-platform [--fal-api-key KEY] [--dry-run] [--skip-pricing] [--pricing-snapshot FILE] | --pricing-only (with one of those modes)",
  );
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
