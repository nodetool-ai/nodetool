#!/usr/bin/env node
// Store the Comfy template gallery image of each Comfy example as its thumbnail.
// The server shows `<example name>.jpg` from the assets directory when it exists.
// An audio template has no gallery image and keeps the default tile.
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import sharp from "sharp";
import { REVISION, TEMPLATES } from "./catalog.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const assetsDir = join(root, "packages/base-nodes/nodetool/assets/nodetool-base");
const examplesDir = join(root, "packages/base-nodes/nodetool/examples/nodetool-base");
const fixturePath = join(root, "packages/runtime/tests/fixtures/comfy-templates/ui-templates.json.gz");
const metadataPath = join(root, "packages/base-nodes/nodetool/package_metadata/nodetool-base.json");
const RAW = `https://raw.githubusercontent.com/Comfy-Org/workflow_templates/${REVISION}/templates`;
const WIDTH = 512;
const WORKERS = 8;

const { kept } = JSON.parse(gunzipSync(await readFile(fixturePath)).toString());
const { examples } = JSON.parse(await readFile(metadataPath, "utf8"));
const nameById = new Map(examples.map((example) => [example.id, example.name]));
const jobs = [
  ...TEMPLATES.map((template) => ({ source: template.source, name: `Comfy ${template.name}` })),
  ...kept.map(({ source }) => ({
    source,
    name: nameById.get(createHash("sha256").update(`nodetool:${source}`).digest("hex").slice(0, 32))
  }))
];
if (jobs.length === 0 || jobs.some((job) => !job.name)) throw new Error("A template has no example");

const missing = [];
let written = 0;
// The catalog lists templates that are not shipped as examples.
const shipped = jobs.filter((job) => existsSync(join(examplesDir, `${job.name}.json`)));
const queue = shipped.filter((job) => !existsSync(join(assetsDir, `${job.name}.jpg`)));
const skipped = shipped.length - queue.length;

async function worker() {
  for (let job = queue.shift(); job; job = queue.shift()) {
    const res = await fetch(`${RAW}/${job.source}-1.webp`);
    if (res.status === 404) {
      missing.push(job.source);
      continue;
    }
    if (!res.ok) throw new Error(`${job.source}: HTTP ${res.status}`);
    await sharp(Buffer.from(await res.arrayBuffer()))
      .resize({ width: WIDTH, withoutEnlargement: true })
      .flatten({ background: "#000000" })
      .jpeg({ quality: 80, mozjpeg: true })
      .toFile(join(assetsDir, `${job.name}.jpg`));
    written += 1;
  }
}

await Promise.all(Array.from({ length: WORKERS }, worker));
console.log(`Wrote ${written}, kept ${skipped} existing, no image for ${missing.length} of ${shipped.length}`);
if (missing.length > 0) console.log(missing.join("\n"));
