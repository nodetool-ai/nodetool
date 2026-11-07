#!/usr/bin/env node
import fs from "node:fs";

// The full sequence wrapper from scripts/plan-conformance.mjs exampleFixtures().
// Unlike the still comparison, a window bench keeps every clip and raw field.
const [slug, out] = process.argv.slice(2);
if (!slug || !out || !/^[a-z0-9-]+$/.test(slug) || process.argv.length !== 4) {
  console.error("usage: example-sequence.mjs <slug> <out.json>");
  process.exit(1);
}
const bundle = JSON.parse(fs.readFileSync(new URL(
  `../../../../packages/base-nodes/nodetool/examples/timelines/${slug}.timeline.json`, import.meta.url), "utf8"));
fs.writeFileSync(out, JSON.stringify({
  id: `example-${slug}`, projectId: "examples", name: bundle.name,
  fps: bundle.fps, width: bundle.width, height: bundle.height, durationMs: bundle.durationMs,
  ...bundle.document, createdAt: "1970-01-01T00:00:00.000Z", updatedAt: "1970-01-01T00:00:00.000Z"
}));
