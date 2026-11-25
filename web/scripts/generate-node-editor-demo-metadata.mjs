#!/usr/bin/env node
/**
 * Writes the node metadata the marketing-site node editor demo shows:
 * `npm run generate:node-editor-demo-metadata` in web/.
 *
 * The demo has no server to ask for metadata, so it ships the real entries
 * for its few node types, copied from the node catalog
 * (packages/node-catalog/data/nodes.ndjson). Enhance Prompt has no default
 * language model, which would block Run, so the demo gives it one.
 *
 * `--check` exits 1 when the committed file differs from the catalog.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const webDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CATALOG = resolve(webDir, "../packages/node-catalog/data/nodes.ndjson");
const OUT = resolve(webDir, "src/demo/nodeEditor/demoNodeMetadata.json");

const NODE_TYPES = [
  "nodetool.input.StringInput",
  "nodetool.agents.EnhancePrompt",
  "nodetool.image.TextToImage",
  "nodetool.video.TextToVideo",
  "nodetool.video.ImageToVideo",
  "nodetool.workflows.base_node.Preview"
];

const DEFAULT_OVERRIDES = {
  "nodetool.agents.EnhancePrompt": {
    model: { type: "language_model", provider: "openai", id: "gpt-5.4", name: "GPT-5.4", path: null, supported_tasks: [] }
  }
};

const found = new Map();
for (const line of readFileSync(CATALOG, "utf8").split("\n")) {
  if (!line.trim()) continue;
  const record = JSON.parse(line);
  if (NODE_TYPES.includes(record.node_type)) {
    found.set(record.node_type, record.metadata);
  }
}
const missing = NODE_TYPES.filter((type) => !found.has(type));
if (missing.length > 0) {
  console.error(`Node catalog has no entry for: ${missing.join(", ")}`);
  process.exit(1);
}

const metadata = {};
for (const type of NODE_TYPES) {
  const entry = structuredClone(found.get(type));
  const overrides = DEFAULT_OVERRIDES[type] ?? {};
  for (const property of entry.properties) {
    if (property.name in overrides) {
      property.default = overrides[property.name];
    }
  }
  metadata[type] = entry;
}

const text = `${JSON.stringify(metadata, null, 2)}\n`;
if (process.argv.includes("--check")) {
  const current = readFileSync(OUT, "utf8");
  if (current !== text) {
    console.error("demoNodeMetadata.json is out of date. Run npm run generate:node-editor-demo-metadata in web/.");
    process.exit(1);
  }
  console.log(`demoNodeMetadata.json matches the catalog (${NODE_TYPES.length} node types).`);
} else {
  writeFileSync(OUT, text);
  console.log(`Wrote ${OUT} (${NODE_TYPES.length} node types).`);
}
