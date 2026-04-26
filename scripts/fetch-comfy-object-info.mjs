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
  const totalCount = Object.keys(data).length;

  // Strip ComfyUI's bundled API-node wrappers (comfy_api_nodes.*). These call
  // paid third-party services through Comfy.org's hosted API and require an
  // api_key_comfy_org token; NodeTool integrates those providers directly
  // instead of going through the Comfy proxy.
  const filtered = {};
  let removed = 0;
  for (const [key, value] of Object.entries(data)) {
    if (
      typeof value?.python_module === "string" &&
      value.python_module.startsWith("comfy_api_nodes")
    ) {
      removed++;
      continue;
    }
    filtered[key] = value;
  }

  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(filtered, null, 2) + "\n");

  console.log(
    `Saved ${Object.keys(filtered).length} node definitions to ${OUTPUT_PATH} (filtered out ${removed} comfy_api_nodes entries from ${totalCount} total)`
  );
}

main().catch((err) => {
  console.error("Failed to fetch ComfyUI object_info:", err.message);
  process.exit(1);
});
