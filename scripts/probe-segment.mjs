#!/usr/bin/env node
/**
 * Probe one segmentation model end to end, outside the editor.
 *
 * Prints the request that went to the provider and the masks that came back,
 * so a run that produces nothing can be told apart from a run that never
 * reached the provider. Uses this install's own configured credentials.
 *
 *   node scripts/probe-segment.mjs <image> [model-id] [prompt]
 */
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const [image, model = "fal-ai/sam-3-1/image", prompt = ""] = process.argv.slice(2);
if (!image) {
  console.error("usage: node scripts/probe-segment.mjs <image> [model-id] [prompt]");
  process.exit(2);
}

const props = {
  image: {
    type: "image",
    uri: "",
    data: readFileSync(image).toString("base64"),
    mimeType: image.endsWith(".jpg") || image.endsWith(".jpeg")
      ? "image/jpeg"
      : "image/png"
  },
  model: { type: "image_model", provider: "fal_ai", id: model, name: model },
  max_masks: 5
};
if (prompt) props.prompt = prompt;

console.log(`probing ${model}${prompt ? ` for "${prompt}"` : ""} with ${image}`);
const run = spawnSync(
  "npm",
  ["run", "dev:nodetool", "--silent", "--", "node", "run", "nodetool.image.Segment",
   "--props", JSON.stringify(props), "--json"],
  { stdio: "inherit" }
);
process.exit(run.status ?? 1);
