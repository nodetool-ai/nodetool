// Run gallery workflows and publish their actual outputs. Never called by CI.
// node marketing/scripts/render-template-samples.mjs --local
// node marketing/scripts/render-template-samples.mjs --only a-poster-in-portrait
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { ROUTES } from "./recipe-samples.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const WORK = path.join(ROOT, "nodetool-debug/template-samples");
const PUBLIC = path.join(ROOT, "marketing/public/templates/samples");
const DATA = path.join(ROOT, "marketing/src/data/templateSamples.generated.json");
const RECEIPTS = path.join(ROOT, "marketing/scripts/template-samples.generated.json");
const EXAMPLES = path.join(ROOT, "packages/base-nodes/nodetool/examples/nodetool-base");
const INPUTS = path.join(ROOT, "packages/base-nodes/nodetool/assets/nodetool-base/recipe-inputs");
const argv = process.argv.slice(2);
const only = argv.includes("--only") ? argv[argv.indexOf("--only") + 1].split(",") : null;
const local = argv.includes("--local");
const simple = argv.includes("--simple");
const complex = argv.includes("--complex");
const renderOnly = argv.includes("--render-only");
const publishOnly = argv.includes("--publish-only");
const triggersOnly = argv.includes("--triggers");
const force = argv.includes("--force");
const source = fs.readFileSync(path.join(ROOT, "marketing/src/data/templateEntries.generated.ts"), "utf8");
const entries = JSON.parse(source.slice(source.indexOf("= [") + 2, source.lastIndexOf("];") + 1));
const samples = fs.existsSync(DATA) ? JSON.parse(fs.readFileSync(DATA, "utf8")) : {};
const receipts = fs.existsSync(RECEIPTS) ? JSON.parse(fs.readFileSync(RECEIPTS, "utf8")) : {};
const existing = new Set(["ai-spokesperson", "cut-a-product-out-of-its-background", "localise-a-script-and-revoice-it", "put-a-product-on-a-studio-backdrop", "score-a-silent-clip", "take-a-product-shot-to-print-resolution"]);
const photoCredit = {
  name: "Photo by Janko Ferlic", url: "https://commons.wikimedia.org/wiki/File:White_Ceramic_Mug_Filled_With_Coffee_Beside_Coffee_Beans_(43087322071).jpg",
  license: "CC0", licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
};
const videoCredit = {
  name: "Footage by Stevenndori289; edited", url: "https://commons.wikimedia.org/wiki/File:Latte_Coffee_making.webm",
  license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
};
const routes = {
  ...ROUTES,
  "fal_ai:fal-ai/flux/schnell": { provider: "atlascloud", id: "google/nano-banana-pro/text-to-image", name: "Nano Banana Pro" },
  "fal_ai:fal-ai/nano-banana/edit": { provider: "replicate", id: "google/nano-banana", name: "Nano Banana" },
  "fal_ai:fal-ai/flux/dev": { provider: "replicate", id: "google/nano-banana", name: "Nano Banana" },
  "fal_ai:fal-ai/flux-2/klein/9b": { provider: "replicate", id: "black-forest-labs/flux-2-klein-9b", name: "FLUX.2 Klein 9B" },
  "fal_ai:fal-ai/imageutils/rembg": ROUTES["fal_ai:fal-ai/bria/background/remove"],
  "fal_ai:fal-ai/esrgan": ROUTES["fal_ai:fal-ai/clarity-upscaler"],
  "replicate:meta/musicgen": ROUTES["fal_ai:fal-ai/stable-audio-25/text-to-audio"],
  "openai:gpt-4o-mini-transcribe": { provider: "together", id: "openai/whisper-large-v3", name: "Whisper Large V3" },
  "fal_ai:openai/whisper-large-v3": { provider: "together", id: "openai/whisper-large-v3", name: "Whisper Large V3" },
  "claude_agent_sdk:sonnet": { provider: "openrouter", id: "anthropic/claude-sonnet-4.6", name: "Claude Sonnet 4.6" },
  "anthropic:claude-sonnet-5": { provider: "openrouter", id: "anthropic/claude-sonnet-4.6", name: "Claude Sonnet 4.6" },
  "gemini:gemini-3.5-flash": { provider: "openrouter", id: "google/gemini-3.1-pro-preview", name: "Gemini 3.1 Pro" },
  "ollama:llama3.2": { provider: "openrouter", id: "openai/gpt-5-mini", name: "GPT-5 mini" },
  "fal_ai:fal-ai/ltx-2.3/text-to-video/fast": { provider: "kie", id: "kling-2.6/text-to-video", name: "Kling 2.6" },
  "fal_ai:fal-ai/recraft/vectorize": { provider: "replicate", id: "recraft-ai/recraft-vectorize", name: "Recraft Vectorize" },
};
const textInputs = {
  facts: "Field Coffee opens a new shop in Amsterdam on 15 October. The menu features espresso, filter coffee, and pastries. Opening hours are 8am to 6pm. Founders: Sam and Alex.",
  email: "Meet the Field Coffee subscription. Two freshly roasted bags delivered each month. Choose your grind and change or cancel your plan any time.",
  synopsis: "A cyclist finds an old camera in a rain-soaked city. Each photo reveals the same street one day in the future.",
  premise: "A cyclist finds a camera that photographs tomorrow.",
  specs: "Travel mug. 350 ml. Double-wall stainless steel. Screw lid. Fits cup holders. Available in sage green and black. Hand wash only.",
  text: "Your subscription renewal will be processed on the first day of the subsequent billing period. Modifications must be submitted at least 48 hours prior to renewal.",
  tagline: "Fresh coffee. Your way.",
  concept: "A weathered lighthouse above a volcanic coastline at dawn, warm light against deep blue ocean.",
  document: "Field Coffee pilot: 120 customers tried monthly delivery. 84 renewed. The most common request was a smaller bag. Shipping delays affected 9 orders. Next steps: test a 200g option, add tracking emails, and interview customers who cancelled.",
  script: "Freshly roasted coffee, brewed one cup at a time. Find your favourite blend.",
  topic: "How freshly ground coffee changes the flavour of an espresso",
  idea: "A minimal coffee campaign with warm morning light and handmade ceramic cups",
  offer: "Field Coffee subscription. Two freshly roasted bags each month. Choose whole beans or your grind. Change or cancel any time.",
  brief: "Launch Field Coffee's monthly coffee subscription for home brewers. Focus on fresh roast dates, flexible delivery, and better weekday coffee. Tone: direct and warm.",
  notes: "Mug A: stainless steel, 350 ml, screw lid, hand wash, 240g. Mug B: ceramic, 300 ml, open top, dishwasher safe, 310g. Mug C: glass, 250 ml, silicone lid, dishwasher safe, 180g.",
  listing: "Field Travel Mug. A 350 ml stainless steel mug with a screw lid. Available in sage green and black. Hand wash only.",
  thread: "Customer: The checkout spinner never stops after I apply COFFEE10. Support: Which browser? Customer: Safari on iPhone. Without the code, checkout works. Support reproduced on iOS 18 with two bags in the basket.",
  Transcript: "",
  scene: "A ceramic coffee cup on a wooden table in soft morning window light. A slow, steady push in. No text.",
  line_a: "What makes a good morning?",
  line_b: "Fresh coffee, and a little time to enjoy it.",
  article: "Better coffee starts with fresh beans. Store them in an airtight container away from heat and light. Grind only what you need before brewing. Weigh both coffee and water so you can repeat a cup you enjoy. Change one variable at a time: grind size, dose, or brew time.",
  page: "Field Coffee offers a monthly subscription with two freshly roasted bags. Customers choose whole beans or ground coffee and can change or cancel their plan any time.",
  copy: "Freshly roasted coffee, delivered your way. Choose your grind and change your plan any time.",
  questions: "How often does the coffee arrive? Can I choose my grind? How do I pause my subscription?",
  feedback: "Love the coffee, wish there was a smaller bag. Delivery tracking would help. Great flavour and easy cancellation. The bag is too big for one person. Please send a tracking email.",
  changelog: "Added delivery tracking emails. Fixed discount codes freezing checkout in Safari. Added a 200g bag size. Subscription pauses now take effect immediately.",
  directions: "Keep the subject unchanged. Use a warm cream studio background.",
  mood: "Soft jazz guitar and brushed drums for a quiet coffee shop, instrumental",
  sku: "FIELD-350-SAGE", name: "Field Travel Mug", price: "24", descriptor: "A sage green stainless steel travel mug",
};
fs.mkdirSync(WORK, { recursive: true });
fs.mkdirSync(PUBLIC, { recursive: true });

async function bytes(ref) {
  if (ref.data?.$file) return fs.readFileSync(ref.data.$file);
  if (typeof ref.data === "string") return Buffer.from(ref.data, "base64");
  if (ref.data) return Buffer.from(Object.values(ref.data));
  if (ref.uri?.startsWith("data:")) return Buffer.from(ref.uri.split(",")[1], "base64");
  if (ref.asset_id) {
    const { Asset, initDb } = await import("@nodetool-ai/models");
    const { getDefaultDbPath, loadAssetStorageConfig } = await import("@nodetool-ai/config");
    const { createStorageAdapter, assetKeyCandidates } = await import("@nodetool-ai/storage");
    initDb(getDefaultDbPath());
    const asset = await Asset.get(ref.asset_id);
    if (!asset) throw new Error(`Missing output asset ${ref.asset_id}`);
    const adapter = createStorageAdapter(loadAssetStorageConfig());
    for (const key of assetKeyCandidates(asset.user_id, `${asset.id}.${asset.fileExtension}`)) {
      const stored = await adapter.retrieve(adapter.uriForKey(key));
      if (stored) return Buffer.from(stored);
    }
  }
  throw new Error("Output has no embedded media bytes");
}

function prepare(doc) {
  const inputs = {};
  const models = {};
  const transcribes = doc.graph.nodes.some((n) => n.type === "nodetool.text.AutomaticSpeechRecognition");
  const documentFile = path.join(WORK, "document-inputs.json");
  const documents = fs.existsSync(documentFile) ? JSON.parse(fs.readFileSync(documentFile, "utf8")) : {};
  function routeModels(value, key) {
    if (!value || typeof value !== "object") return;
    if (value.provider && value.id) {
      const route = routes[`${value.provider}:${value.id}`];
      if (route) Object.assign(value, { provider: route.provider, id: route.id, name: route.name }, route.extra);
      models[key] = { provider: value.provider, id: value.id };
    }
    for (const [name, child] of Object.entries(value)) routeModels(child, `${key}.${name}`);
  }
  for (const node of doc.graph.nodes) {
    if (node.type === "nodetool.constant.String" && node.data.value) inputs[node.id] = { type: "text", value: node.data.value };
    if (node.type.startsWith("nodetool.input.")) {
      const kind = { ImageInput: "image", VideoInput: "video", AudioInput: "audio" }[node.type.split(".").at(-1)];
      if (kind) {
        const file = kind === "image" ? "coffee.jpg" : kind === "video" ? transcribes ? "meeting.mp4" : "scored.mp4" : transcribes ? "meeting.wav" : "voice.wav";
        const location = file === "scored.mp4" ? path.join(PUBLIC, file) : path.join(INPUTS, file);
        node.data.value = { type: kind, data: fs.readFileSync(location).toString("base64") };
        inputs[node.id] = { type: kind, file };
      }
      if (node.type === "nodetool.input.StringInput") {
        if (!node.data.value && textInputs[node.data.name] !== undefined) node.data.value = textInputs[node.data.name];
        inputs[node.id] = { type: "text", value: node.data.value };
      }
    }
    if (node.type === "nodetool.constant.Timeline" && documents.timeline) node.data.value = { type: "timeline", id: documents.timeline };
    if (node.type === "nodetool.constant.Storyboard" && documents.storyboard) node.data.value = { type: "storyboard", id: documents.storyboard };
    if (node.type === "nodetool.constant.Entity" && !node.data.value?.descriptor) node.data.value = { type: "entity", id: "sample-narrator", kind: "character", name: "Narrator", descriptor: "A clear, conversational narrator", voice_id: "Ashley" };
    if (node.type === "nodetool.script.WriteScript") Object.assign(node.data, { voice_provider: "replicate", voice_model: "inworld/realtime-tts-1.5-max" });
    routeModels(node.data, node.id);
  }
  return { inputs, models };
}

async function execute(doc, dir) {
  const file = path.join(dir, "workflow.json");
  fs.writeFileSync(file, JSON.stringify(doc));
  const output = fs.openSync(path.join(dir, "run.json"), "w");
  const log = fs.openSync(path.join(dir, "run.log"), "w");
  try {
    await new Promise((resolve, reject) => {
      const trigger = doc.graph.nodes.find((n) => n.type.startsWith("nodetool.triggers."));
      const triggerArgs = trigger ? ["--trigger-event", JSON.stringify({ node_id: trigger.id, payload: { event: "order.paid", order_id: "SAMPLE-1042", total: 24, currency: "EUR", path: "orders/sample-order.json" } })] : [];
      const child = spawn(process.execPath, ["--conditions=nodetool-dev", "--import", "tsx", path.join(ROOT, "packages/cli/src/nodetool.ts"), "workflows", "run", file, "--workspace", dir, "--json", ...triggerArgs], {
        cwd: dir, stdio: ["ignore", output, log],
        env: { ...process.env, NODETOOL_PACKAGE_ASSETS_DIR: path.resolve(INPUTS, "../..") },
      });
      const timer = setTimeout(() => child.kill("SIGTERM"), 600_000);
      child.once("error", (error) => { clearTimeout(timer); reject(error); });
      child.once("exit", (code, signal) => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(signal ?? `Exit ${code}`)); });
    });
  } finally { fs.closeSync(output); fs.closeSync(log); }
  const run = JSON.parse(fs.readFileSync(path.join(dir, "run.json"), "utf8"));
  if (run.status !== "completed") throw new Error(`Run ${run.status}`);
  return run;
}

async function publish(entry, run, provenance) {
  const outputEvents = run.messages.filter((event) => event.type === "generation_complete" && event.node_type === "nodetool.output.Output");
  const values = outputEvents.length ? outputEvents.flatMap((event) => Object.values(event.outputs)) : Object.values(run.outputs).flat();
  const flattened = values.flat(Infinity);
  const svg = flattened.find((value) => value?.content?.includes("<svg") || (typeof value?.data === "string" && Buffer.from(value.data, "base64").subarray(0, 200).toString().includes("<svg")));
  const media = flattened.find((v) => ["image", "video", "audio"].includes(v?.type)) ?? (svg ? { type: "image", data: svg.content ? Buffer.from(svg.content).toString("base64") : svg.data } : null);
  const sample = { caption: "" };
  const textInput = Object.values(provenance.inputs).find((v) => v.type === "text" && v.value);
  if (textInput) sample.inputText = textInput.value;
  if (media) {
    const raw = await bytes(media);
    const stem = path.join(PUBLIC, entry.slug);
    if (media.type === "image") {
      const options = media.mimeType === "image/x-raw-rgba" ? { raw: { width: media.width, height: media.height, channels: 4 } } : undefined;
      const info = await sharp(raw, options).resize({ width: 1280, height: 1280, fit: "inside", withoutEnlargement: true }).webp({ quality: 90 }).toFile(stem + ".webp");
      Object.assign(sample, { image: `/templates/samples/${entry.slug}.webp`, imageWidth: info.width, imageHeight: info.height });
      if (Object.values(provenance.inputs).some((v) => v.type === "image")) Object.assign(sample, { inputImage: "/templates/samples/coffee.jpg", credit: photoCredit });
    } else {
      const input = path.join(WORK, entry.slug, "output-media");
      fs.writeFileSync(input, raw);
      if (media.type === "audio") {
        execFileSync("ffmpeg", ["-y", "-v", "error", "-xerror", "-i", input, "-c:a", "libmp3lame", "-q:a", "2", stem + ".mp3"]);
        sample.audio = `/templates/samples/${entry.slug}.mp3`;
      } else {
        execFileSync("ffmpeg", ["-y", "-v", "error", "-xerror", "-i", input, "-c:v", "libx264", "-crf", "24", "-pix_fmt", "yuv420p", "-c:a", "aac", "-movflags", "+faststart", stem + ".mp4"]);
        execFileSync("ffmpeg", ["-y", "-v", "error", "-i", stem + ".mp4", "-frames:v", "1", stem + "-poster.webp"]);
        sample.video = `/templates/samples/${entry.slug}.mp4`;
        sample.poster = `/templates/samples/${entry.slug}-poster.webp`;
      }
      if (Object.values(provenance.inputs).some((v) => ["scored.mp4", "meeting.mp4"].includes(v.file))) sample.credit = videoCredit;
    }
  } else {
    if (!values.length) throw new Error("No output values");
    sample.text = values.map((value) => typeof value === "string" ? value : JSON.stringify(value, null, 2)).join("\n\n");
  }
  samples[entry.slug] = sample;
  const files = [sample.image, sample.audio, sample.video, sample.poster].filter(Boolean);
  receipts[entry.slug] = { ...provenance, files: Object.fromEntries(files.map((file) => [file, createHash("sha256").update(fs.readFileSync(path.join(ROOT, "marketing/public", file))).digest("hex")])) };
  fs.writeFileSync(DATA, JSON.stringify(samples, null, 2) + "\n");
  fs.writeFileSync(RECEIPTS, JSON.stringify(receipts, null, 2) + "\n");
}

const queue = entries.filter((entry) => {
  if (only && !only.includes(entry.slug)) return false;
  if (!only && existing.has(entry.slug)) return false;
  if (!force && !publishOnly && samples[entry.slug]) return false;
  const file = path.join(EXAMPLES, entry.name + ".json");
  if (!fs.existsSync(file)) return false;
  const doc = JSON.parse(fs.readFileSync(file, "utf8"));
  const triggered = doc.graph.nodes.some((n) => n.type.startsWith("nodetool.triggers."));
  if (triggered !== triggersOnly) return false;
  if (simple && (doc.graph.nodes.length > 12 || doc.graph.nodes.some((n) => /nodetool\.(creative|storyboard|script)\./.test(n.type)))) return false;
  if (complex && doc.graph.nodes.length <= 12 && !doc.graph.nodes.some((n) => /nodetool\.(creative|storyboard|script)\./.test(n.type))) return false;
  return !local || !doc.graph.nodes.some((n) => n.data.model?.provider);
});
console.log(`Running ${queue.length} workflows`);
const failures = [];
async function worker() {
  for (let entry; (entry = queue.shift());) {
    const dir = path.join(WORK, entry.slug);
    fs.mkdirSync(dir, { recursive: true });
    try {
      const doc = JSON.parse(fs.readFileSync(path.join(EXAMPLES, entry.name + ".json"), "utf8"));
      let provenance = prepare(doc);
      const cached = path.join(dir, "run.json");
      let run = !force && fs.existsSync(cached) && fs.statSync(cached).size ? JSON.parse(fs.readFileSync(cached, "utf8")) : null;
      if (run?.status !== "completed" || !Object.keys(run.outputs).length) {
        if (publishOnly) continue;
        run = await execute(doc, dir);
      } else {
        // Cached media belongs to the model routes saved with that run.
        const models = {};
        function collectModels(value, key) {
          if (!value || typeof value !== "object") return;
          if (value.provider && value.id) models[key] = { provider: value.provider, id: value.id };
          for (const [name, child] of Object.entries(value)) collectModels(child, `${key}.${name}`);
        }
        for (const event of run.messages) collectModels(event.properties, event.node_id);
        provenance = { ...provenance, models };
      }
      if (!renderOnly) await publish(entry, run, provenance);
      console.log(`PASS ${entry.slug}`);
    } catch (error) {
      failures.push({ slug: entry.slug, error: String(error) });
      console.log(`FAIL ${entry.slug}: ${error.message}`);
    }
  }
}
await Promise.all([worker(), worker(), worker()]);
fs.writeFileSync(path.join(WORK, "failures.json"), JSON.stringify(failures, null, 2));
console.log(`${Object.keys(samples).length} published samples; ${failures.length} failures in this run`);
