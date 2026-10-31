#!/usr/bin/env node
// Generates the `preset_catalog` block of every web locale from the preset
// catalogue (packages/presets/preset-catalog.json), so preset names and
// descriptions cannot drift from the catalogue.
//
//   node scripts/generate-preset-i18n.mjs          write the block
//   node scripts/generate-preset-i18n.mjs --check  fail when any locale drifts
//
// English takes name and description from the catalogue and is overwritten on
// every run. Other locales get the English text for a preset they have not
// translated yet, keep an existing translation, and lose entries for presets
// that left the catalogue.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const catalogPath = resolve(root, "packages/presets/preset-catalog.json");
const localeDir = resolve(root, "web/src/i18n/locales");
const LOCALES = ["en", "de", "fi", "ru", "zh-CN"];
const BLOCK = "preset_catalog";

/** `camera.dolly-in` becomes `["camera", "dolly-in"]`: ids hold no further dots. */
export function presetKeyPath(id) {
  const [kind, ...rest] = id.split(".");
  return [kind, rest.join(".")];
}

export function buildEnglishBlock(presets) {
  const block = {};
  for (const preset of [...presets].sort((a, b) => a.id.localeCompare(b.id))) {
    const [kind, slug] = presetKeyPath(preset.id);
    block[kind] ??= {};
    block[kind][slug] = { name: preset.name, description: preset.description };
  }
  return block;
}

export function buildLocaleBlock(english, existing) {
  const block = {};
  for (const [kind, entries] of Object.entries(english)) {
    block[kind] = {};
    for (const [slug, text] of Object.entries(entries)) {
      const previous = existing?.[kind]?.[slug];
      block[kind][slug] = {
        name: typeof previous?.name === "string" ? previous.name : text.name,
        description:
          typeof previous?.description === "string" ? previous.description : text.description
      };
    }
  }
  return block;
}

function main() {
  const check = process.argv.includes("--check");
  const presets = JSON.parse(readFileSync(catalogPath, "utf8"));
  if (!Array.isArray(presets) || presets.length === 0) {
    throw new Error(`${catalogPath} holds no presets`);
  }
  const english = buildEnglishBlock(presets);
  const drifted = [];
  for (const locale of LOCALES) {
    const path = resolve(localeDir, `${locale}.json`);
    const raw = readFileSync(path, "utf8");
    const catalog = JSON.parse(raw);
    catalog[BLOCK] = locale === "en" ? english : buildLocaleBlock(english, catalog[BLOCK]);
    const next = `${JSON.stringify(catalog, null, 2)}\n`;
    if (next === raw) {
      continue;
    }
    drifted.push(locale);
    if (!check) {
      writeFileSync(path, next);
    }
  }
  if (check && drifted.length > 0) {
    console.error(
      `Preset translations are out of date in: ${drifted.join(", ")}. ` +
        "Run `npm run i18n:presets --workspace=web`."
    );
    process.exit(1);
  }
  console.log(
    `${check ? "Checked" : "Wrote"} ${presets.length} presets in ${LOCALES.length} locales` +
      (drifted.length > 0 ? ` (updated ${drifted.join(", ")})` : "")
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
