// Golden Comfy render for the Shot Director challenge entry.
//
// Submits the exact ComfyUI graph pinned in the "Shot Director" example
// workflow to Comfy Cloud through the Comfy API v2 SDK, with the same prompt
// composition the app uses, and writes the video plus a run record.
//
//   COMFY_API_KEY=... node scripts/comfy-challenge/golden-render.mjs \
//     --image path/to/still.jpg --move "dolly in" --direction "..." --seed 42 --out out/dir
//
// One run is one paid Comfy Cloud job. The script never retries a failed job.

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Comfy } from "@comfyorg/sdk";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const WORKFLOW = path.join(ROOT, "packages/base-nodes/nodetool/examples/nodetool-base/Shot Director.json");

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = argv.indexOf(`--${name}`);
  return at >= 0 && argv[at + 1] !== undefined ? argv[at + 1] : fallback;
};

const apiKey = process.env.COMFY_API_KEY?.trim();
if (!apiKey) throw new Error("COMFY_API_KEY is required");

const imagePath = flag("image", path.join(ROOT, "packages/base-nodes/nodetool/assets/nodetool-base/recipe-inputs/coffee.jpg"));
const move = flag("move", "dolly in");
const direction = flag("direction", "Steam curls up from the espresso cup on the dark wooden table among scattered coffee beans, warm low light.");
const seed = Number(flag("seed", "42"));
const outDir = path.resolve(flag("out", path.join(ROOT, "out/comfy-golden")));
fs.mkdirSync(outDir, { recursive: true });

// Read the pinned graph and the preset table straight from the shipped workflow
// so this script cannot drift from what the app runs.
const wf = JSON.parse(fs.readFileSync(WORKFLOW, "utf8"));
const comfyNode = wf.graph.nodes.find((n) => n.type === "lib.comfy.RunWorkflowOnCloud");
const composeNode = wf.graph.nodes.find((n) => n.id === "compose");
const graph = JSON.parse(comfyNode.data.workflow);
const presets = JSON.parse(composeNode.data.code.match(/^const PRESETS = ([\s\S]*?);\nconst move/)[1]);
const preset = presets[move];
if (!preset) throw new Error(`Unknown move "${move}". Options: ${Object.keys(presets).join(", ")}`);
const prompt = [direction.trim(), preset.prompt].filter(Boolean).join(" ");

const client = new Comfy({ apiKey, clientInfo: "nodetool-shot-director" });
const workflow = client.workflows.fromJson(graph);
workflow.setInput("56", "image", client.assets.fromFile(imagePath));
workflow.setInput("6", "text", prompt);
workflow.setInput("3", "seed", seed);

const imageHash = createHash("sha256").update(fs.readFileSync(imagePath)).digest("hex");
const started = new Date();
console.log(`submitting: move=${move} seed=${seed}`);
const job = await client.submit(workflow);
console.log(`job ${job.id} submitted`);
await job.wait(30 * 60 * 1000);
const finished = new Date();
console.log(`job ${job.id} ${job.status} in ${((finished - started) / 1000).toFixed(1)}s`);

const record = {
  schemaVersion: 1,
  app: "shot-director",
  backend: "comfy-cloud (Comfy API v2, @comfyorg/sdk)",
  comfyJobId: job.id,
  status: job.status,
  error: job.error ?? null,
  preset: { id: preset.id, version: preset.version, name: move, family: "local-wan" },
  direction,
  effectivePrompt: prompt,
  seed,
  model: "wan2.2_ti2v_5B_fp16",
  workflowSha256: createHash("sha256").update(comfyNode.data.workflow).digest("hex"),
  source: { file: path.relative(ROOT, imagePath), sha256: imageHash },
  submittedAt: started.toISOString(),
  finishedAt: finished.toISOString(),
  wallSeconds: (finished - started) / 1000,
  outputs: []
};

if (job.status === "succeeded") {
  for (const output of job.getOutputs("58")) {
    const file = path.join(outDir, `${preset.id}-seed${seed}-${job.id}${path.extname(output.name ?? "") || ".mp4"}`);
    await output.toFile(file);
    record.outputs.push({ file: path.basename(file), bytes: fs.statSync(file).size, contentType: output.contentType ?? null });
  }
}
const recordPath = path.join(outDir, `${preset.id}-seed${seed}-${job.id}.run.json`);
fs.writeFileSync(recordPath, JSON.stringify(record, null, 2) + "\n");
console.log(`run record: ${recordPath}`);
if (job.status !== "succeeded") process.exit(1);
