#!/usr/bin/env node
// Regenerates the Effect Preset options of the Effects Gallery template from
// the effect presets, so the template cannot drift from the catalogue (D8).
//
//   node scripts/presets/sync-effects-template.mjs          rewrite the template
//   node scripts/presets/sync-effects-template.mjs --check  exit 1 on drift
//
// An option is the first alias of an image-to-video effect preset, the phrase
// the template's prompt inserts after "proceeds to". Run it after editing
// packages/presets/catalog/effect/ and `npm run build --workspace=packages/presets`.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const catalogPath = `${root}packages/presets/preset-catalog.json`;
export const templatePath = `${root}packages/base-nodes/nodetool/examples/nodetool-base/Effects Gallery.json`;
const COUNT_PATTERN = /one of \d+ visual effects/;

/** Phrases of the image-to-video effect presets, in catalogue order. */
export function effectOptions(catalog) {
  return catalog
    .filter((preset) => preset.kind === "effect" && preset.modes.includes("image_to_video"))
    .map((preset) => {
      const phrase = preset.aliases[0];
      if (!phrase) {
        throw new Error(`${preset.id} needs an alias holding the phrase the template prompt inserts`);
      }
      return phrase;
    });
}

/** The template with its options, selected value and description count synced. */
export function syncTemplate(template, options) {
  if (options.length === 0) {
    throw new Error("No image-to-video effect presets found, refusing to empty the template");
  }
  const next = structuredClone(template);
  const select = next.graph.nodes.find((node) => node.id === "effect");
  if (!select || !Array.isArray(select.data?.options)) {
    throw new Error("Effects Gallery template has no select node with id \"effect\"");
  }
  select.data.options = options;
  if (!options.includes(select.data.value)) {
    select.data.value = options[0];
  }
  next.description = next.description.replace(COUNT_PATTERN, `one of ${options.length} visual effects`);
  return next;
}

const serialize = (value) => `${JSON.stringify(value, null, 2)}\n`;

function main() {
  const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
  const current = readFileSync(templatePath, "utf8");
  const next = serialize(syncTemplate(JSON.parse(current), effectOptions(catalog)));
  if (process.argv.includes("--check")) {
    if (next !== current) {
      console.error("Effects Gallery.json is out of sync with the effect presets. Run: node scripts/presets/sync-effects-template.mjs");
      process.exit(1);
    }
    console.log("Effects Gallery.json matches the effect presets");
    return;
  }
  if (next !== current) {
    writeFileSync(templatePath, next);
  }
  console.log(`Effects Gallery.json lists ${effectOptions(catalog).length} effects`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
