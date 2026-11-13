#!/usr/bin/env node
// Writes node-catalog.json, the node metadata fixture both hosts load, from
// the generated node catalog. Rerun after the catalog changes:
//   node native/parity/fixtures/build.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const NAMESPACES = new Set(["nodetool.text", "nodetool.constant", "nodetool.image", "nodetool.control", "nodetool.input"]);

const metadata = readFileSync(join(here, "../../../packages/node-catalog/data/nodes.ndjson"), "utf8")
  .trim()
  .split("\n")
  .map((line) => JSON.parse(line).metadata)
  .filter((node) => NAMESPACES.has(node.namespace))
  .sort((a, b) => a.node_type.localeCompare(b.node_type));

writeFileSync(
  join(here, "node-catalog.json"),
  `${JSON.stringify({ metadata, recent: ["nodetool.text.Concat"], favorites: ["nodetool.image.Resize"] }, null, 1)}\n`
);
console.log(`node-catalog.json: ${metadata.length} nodes`);
