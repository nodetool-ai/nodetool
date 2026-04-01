#!/usr/bin/env node
/**
 * Fetch ComfyUI /object_info and save to the repo as static JSON.
 *
 * Usage:
 *   node scripts/fetch-comfy-object-info.mjs [comfyui-url]
 *
 * Default URL: http://127.0.0.1:8188
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = resolve(
  __dirname,
  "../web/src/data/comfy-object-info.json"
);

const comfyUrl = (process.argv[2] || "http://127.0.0.1:8188").replace(
  /\/+$/,
  ""
);

async function main() {
  console.log(`Fetching object_info from ${comfyUrl}/object_info ...`);

  const resp = await fetch(`${comfyUrl}/object_info`);
  if (!resp.ok) {
    console.error(`ComfyUI returned HTTP ${resp.status}`);
    process.exit(1);
  }

  const data = await resp.json();
  const nodeCount = Object.keys(data).length;

  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(data, null, 2) + "\n");

  console.log(
    `Saved ${nodeCount} node definitions to ${OUTPUT_PATH}`
  );
}

main().catch((err) => {
  console.error("Failed to fetch ComfyUI object_info:", err.message);
  process.exit(1);
});
