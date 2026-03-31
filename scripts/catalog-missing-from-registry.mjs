/**
 * Catalog vs TS NodeRegistry gap (same load + register path as packages/websocket server.ts).
 * Main JSON fields exclude fal.* / replicate.* (API provider catalog drift) and
 * huggingface.* (Python worker). Raw totals: allCatalogVsTsExecutorGapCount.
 *
 * From repo root: node scripts/catalog-missing-from-registry.mjs
 */
import { existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeRegistry } from "@nodetool/node-sdk";
import { registerBaseNodes } from "@nodetool/base-nodes";
import { registerElevenLabsNodes } from "@nodetool/elevenlabs-nodes";
import { registerFalNodes } from "@nodetool/fal-nodes";
import { registerReplicateNodes } from "@nodetool/replicate-nodes";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

function hasMetadataLayout(root) {
  return (
    existsSync(join(root, "src", "nodetool", "package_metadata")) ||
    existsSync(join(root, "nodetool", "package_metadata"))
  );
}

function detectMetadataRoots() {
  if (process.env["METADATA_ROOTS"]) {
    return process.env["METADATA_ROOTS"].split(":").filter(Boolean);
  }
  const candidates = new Set();
  let cur = resolve(process.cwd());
  for (let i = 0; i < 8; i++) {
    candidates.add(cur);
    const parent = dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  cur = resolve(process.cwd());
  for (let i = 0; i < 6; i++) {
    try {
      for (const entry of readdirSync(cur, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        if (entry.name.toLowerCase().startsWith("nodetool")) {
          candidates.add(join(cur, entry.name));
        }
      }
    } catch {
      /* ignore */
    }
    const parent = dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return [...candidates].filter(hasMetadataLayout);
}

function prefixStats(types) {
  const out = {};
  for (const t of types) {
    const pref = t.split(".").slice(0, 2).join(".") || t;
    out[pref] = (out[pref] ?? 0) + 1;
  }
  return out;
}

/**
 * Not reported in the main gap list: FAL/Replicate are API-backed TS packs (catalog
 * drift vs generated nodes is separate); Hugging Face nodes expect the Python worker.
 */
const EXCLUDED_FROM_GAP_REPORT_PREFIXES = ["fal.", "replicate.", "huggingface."];

function isExcludedFromGapReport(nodeType) {
  return EXCLUDED_FROM_GAP_REPORT_PREFIXES.some((p) => nodeType.startsWith(p));
}

process.chdir(repoRoot);

const roots = detectMetadataRoots();
const registry = new NodeRegistry();
const loaded = registry.loadPythonMetadata({ roots, maxDepth: 8 });
registerBaseNodes(registry);
registerElevenLabsNodes(registry);
registerFalNodes(registry);
registerReplicateNodes(registry);

const catalogTypes = [...loaded.nodesByType.keys()].sort();
const missingAll = catalogTypes.filter((t) => !registry.has(t));
const missingExcludedCount = missingAll.filter(isExcludedFromGapReport).length;
const missing = missingAll.filter((t) => !isExcludedFromGapReport(t));
const byNs = prefixStats(missing);

console.log(
  JSON.stringify(
    {
      metadataRoots: roots,
      catalogNodeTypes: catalogTypes.length,
      tsRegisteredTypes: registry.list().length,
      excludedFromGapReportPrefixes: EXCLUDED_FROM_GAP_REPORT_PREFIXES,
      allCatalogVsTsExecutorGapCount: missingAll.length,
      excludedFromGapReportCount: missingExcludedCount,
      missingFromTsRegistryCount: missing.length,
      missingByTwoPartPrefix: byNs,
      missingFromTsRegistry: missing,
      loadWarnings: loaded.warnings.length > 0 ? loaded.warnings : undefined,
      duplicateNodeTypesInCatalog:
        loaded.duplicates.length > 0 ? loaded.duplicates : undefined,
    },
    null,
    2,
  ),
);
