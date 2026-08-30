#!/usr/bin/env node
/**
 * Reconcile `packages/atlascloud-nodes/src/atlascloud-manifest.json` with the
 * input schemas AtlasCloud publishes for each model.
 *
 * AtlasCloud serves a catalog at `GET https://api.atlascloud.ai/api/v1/models`
 * (no auth) where every entry carries a `schema` URL pointing at an OpenAPI
 * fragment with the model's `Input` properties. This script reads that catalog,
 * fetches the schema for each model already in our manifest, and brings the
 * manifest's fields back in line: enum options, defaults, numeric bounds,
 * scalar types, required flags, plus fields that were added or removed upstream.
 *
 * It never invents entries — adding a *model* is a deliberate act (it needs a
 * class name, module, title and description), so this only maintains the fields
 * of models we already ship.
 *
 *   node scripts/sync-atlascloud-manifest.mjs           # rewrite the manifest
 *   node scripts/sync-atlascloud-manifest.mjs --check   # exit 1 if out of date
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST = join(
  ROOT,
  "packages/atlascloud-nodes/src/atlascloud-manifest.json"
);
const CATALOG_URL = "https://api.atlascloud.ai/api/v1/models";

const TYPE_MAP = {
  string: "str",
  integer: "int",
  number: "float",
  boolean: "bool"
};
const ASSET_TYPES = new Set(["image", "video", "audio"]);

// Options AtlasCloud declares that we deliberately do not surface:
//  - enable_base64_output / enable_sync_mode are API-only transport switches
//    that would break the poll+download flow. Most models flag them `disabled`
//    upstream, but not all (the FLUX.1 open-weight ones don't), so name them
//    here rather than relying on that flag.
//  - return_last_frame makes the job emit a second output the single-output
//    node can't surface, so the toggle would silently do nothing.
//  - output_dir is a server-side path on Tencent's upscaler — meaningless to a
//    NodeTool run, which stores the result as an asset.
const SUPPRESSED_FIELDS = new Set([
  "return_last_frame",
  "enable_base64_output",
  "enable_sync_mode",
  "output_dir"
]);

const isAssetField = (field) =>
  ASSET_TYPES.has(field.type) || field.type.startsWith("list[");

/** Vendor descriptions run long; keep a sentence or two for the UI tooltip. */
function trimDescription(text) {
  if (!text) return undefined;
  const collapsed = text.split(/\s+/).join(" ");
  if (collapsed.length <= 180) return collapsed;
  const cut = collapsed.slice(0, 180);
  const lastSentence = cut.lastIndexOf(". ");
  return lastSentence > 40 ? cut.slice(0, lastSentence + 1) : `${cut.trim()}…`;
}

const titleCase = (name) =>
  name
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`GET ${url} → HTTP ${res.status}`);
  }
  return res.json();
}

function fieldFromSchema(name, prop, required) {
  const field = {
    name,
    type: prop.enum ? "enum" : TYPE_MAP[prop.type],
    default: prop.default ?? null,
    title: titleCase(name)
  };
  const description = trimDescription(prop.description);
  if (description) field.description = description;
  if (prop.enum) field.values = prop.enum;
  if (prop.type === "integer" || prop.type === "number") {
    if (prop.minimum !== undefined) field.min = prop.minimum;
    if (prop.maximum !== undefined) field.max = prop.maximum;
  }
  if (required) field.required = true;
  return field;
}

/** Reconcile one manifest entry against its schema. Returns a change log. */
function reconcile(entry, schema) {
  const input = schema.components.schemas.Input;
  const props = input.properties ?? {};
  const required = new Set(input.required ?? []);
  const changes = [];
  const at = (msg) => changes.push(`${entry.modelId}: ${msg}`);

  // Drop scalar fields the model no longer declares. Asset fields are left
  // alone — the manifest models them as image/video/audio props whose names
  // still match the schema, and they carry NodeTool-side metadata.
  entry.fields = entry.fields.filter((field) => {
    if (isAssetField(field)) return true;
    if (props[field.name] && !SUPPRESSED_FIELDS.has(field.name)) return true;
    at(`drop \`${field.name}\``);
    return false;
  });

  const byName = new Map(entry.fields.map((f) => [f.name, f]));

  for (const [name, prop] of Object.entries(props)) {
    if (name === "model" || prop.disabled || SUPPRESSED_FIELDS.has(name)) {
      continue;
    }
    const field = byName.get(name);

    if (!field) {
      if (!TYPE_MAP[prop.type]) {
        at(`skip \`${name}\` — ${prop.type} is not a NodeTool prop type`);
        continue;
      }
      const added = fieldFromSchema(name, prop, required.has(name));
      entry.fields.push(added);
      byName.set(name, added);
      at(`add \`${name}\``);
      continue;
    }

    if (isAssetField(field)) continue;

    if (prop.enum) {
      const same =
        field.values?.length === prop.enum.length &&
        field.values.every((v, i) => String(v) === String(prop.enum[i]));
      if (!same) {
        field.values = prop.enum;
        if (field.type === "str") field.type = "enum";
        at(`\`${name}\` values → ${JSON.stringify(prop.enum)}`);
      }
    } else if (field.type === "enum") {
      // The schema dropped the enum (or never had one — AtlasCloud types some
      // constrained strings as plain `string`). Keep our option list: it came
      // from the upstream API's own docs and a free-text box is strictly worse.
    } else if (TYPE_MAP[prop.type] && field.type !== TYPE_MAP[prop.type]) {
      at(`\`${name}\` type ${field.type} → ${TYPE_MAP[prop.type]}`);
      field.type = TYPE_MAP[prop.type];
    }

    // `prompt` keeps its empty default — upstream defaults are example prompts.
    if (
      name !== "prompt" &&
      prop.default !== undefined &&
      field.default !== prop.default
    ) {
      at(
        `\`${name}\` default ${JSON.stringify(field.default)} → ${JSON.stringify(prop.default)}`
      );
      field.default = prop.default;
    }

    // Bounds apply to numeric props only. A string `size` carries min/max as
    // per-axis pixel limits, which a scalar range control would misrepresent.
    if (prop.type === "integer" || prop.type === "number") {
      for (const [schemaKey, fieldKey] of [
        ["minimum", "min"],
        ["maximum", "max"]
      ]) {
        if (prop[schemaKey] !== undefined && field[fieldKey] !== prop[schemaKey]) {
          at(`\`${name}\` ${fieldKey} → ${prop[schemaKey]}`);
          field[fieldKey] = prop[schemaKey];
        }
      }
    }

    if (required.has(name) && !field.required) {
      field.required = true;
      at(`\`${name}\` required → true`);
    } else if (!required.has(name) && field.required) {
      delete field.required;
      at(`\`${name}\` required → false`);
    }
  }

  return changes;
}

async function main() {
  const check = process.argv.includes("--check");
  const original = readFileSync(MANIFEST, "utf8");
  const manifest = JSON.parse(original);

  const catalog = await fetchJson(CATALOG_URL);
  const schemaUrls = new Map(
    (catalog.data ?? []).map((model) => [model.model, model.schema])
  );

  const changes = [];
  for (const entry of manifest) {
    const url = schemaUrls.get(entry.modelId);
    if (!url) {
      changes.push(
        `${entry.modelId}: NOT IN CATALOG — model may have been retired upstream`
      );
      continue;
    }
    reconcile(entry, await fetchJson(url)).forEach((c) => changes.push(c));
  }

  const updated = `${JSON.stringify(manifest, null, 2)}\n`;
  if (updated === original) {
    console.log("atlascloud-manifest.json is up to date.");
    return;
  }

  console.log(changes.join("\n"));
  if (check) {
    console.error(
      `\n${changes.length} drift(s) from AtlasCloud's published schemas. ` +
        "Run `node scripts/sync-atlascloud-manifest.mjs` to apply."
    );
    process.exitCode = 1;
    return;
  }
  writeFileSync(MANIFEST, updated);
  console.log(`\nWrote ${changes.length} change(s) to ${MANIFEST}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
