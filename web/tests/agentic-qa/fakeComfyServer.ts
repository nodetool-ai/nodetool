/**
 * A stand-in for a local ComfyUI, for studies of people who bring their own
 * ComfyUI to NodeTool. It speaks ComfyUI's native HTTP and WebSocket protocol
 * (`/object_info`, `/prompt`, `/ws`, `/history`, `/view`, `/upload/image`,
 * `/interrupt`, `/queue`, `/system_stats`, `/models`, `/embeddings`, each also
 * under `/api`), validates prompts the way ComfyUI does, streams the same
 * progress events, and saves made-up pictures and clips to its output folder.
 *
 * Pictures are painted from the prompt's words and the seed, so two prompts
 * give two different pictures and the same seed gives the same one. A video
 * is a slow push-in on its start image, or on a painted frame without one.
 * Every request is logged to `--log` as JSON lines, so a researcher can see
 * what the app asked the server and when.
 *
 * Usage (from web/):
 *   npx tsx tests/agentic-qa/fakeComfyServer.ts [--port 8188] [--host 127.0.0.1]
 *     [--dir <data dir>] [--log <requests.jsonl>] [--step-ms 150]
 */

import { createHash, randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { basename, join, normalize } from "node:path";
import { parseArgs } from "node:util";
import { createCanvas, loadImage, type Image, type SKRSContext2D } from "@napi-rs/canvas";
import { WebSocketServer, type WebSocket } from "ws";
import { writeRgbaVideo } from "@nodetool-ai/runtime/media/testing";
import { hasEncoder } from "@nodetool-ai/runtime/media";
import { buildObjectInfo, MODEL_FOLDERS, type ComfyNodeDef } from "./fakeComfyCatalog";

type PromptNode = { class_type: string; inputs: Record<string, unknown>; _meta?: { title?: string } };
type Prompt = Record<string, PromptNode>;
type FileRef = { filename: string; subfolder: string; type: string };

const { values } = parseArgs({
  options: {
    port: { type: "string", default: "8188" },
    host: { type: "string", default: "127.0.0.1" },
    dir: { type: "string" },
    log: { type: "string" },
    "step-ms": { type: "string", default: "150" }
  }
});
const PORT = Number(values.port);
const HOST = values.host ?? "127.0.0.1";
const DATA = values.dir ?? join(tmpdir(), `fake-comfy-${PORT}`);
const LOG = values.log;
const STEP_MS = Number(values["step-ms"]);
const DIRS = { input: join(DATA, "input"), output: join(DATA, "output"), temp: join(DATA, "temp") };
for (const dir of Object.values(DIRS)) mkdirSync(dir, { recursive: true });

const sockets = new Map<string, WebSocket>();
const history: Record<string, unknown> = {};
const queue: Array<{ id: string; number: number; prompt: Prompt; clientId: string }> = [];
let running: { id: string; number: number; prompt: Prompt; clientId: string; interrupted: boolean } | null = null;
let promptNumber = 0;
const counters: Record<string, number> = {};

function log(entry: Record<string, unknown>): void {
  const line = JSON.stringify({ t: new Date().toISOString(), ...entry });
  console.log(line);
  if (LOG) appendFileSync(LOG, line + "\n");
}

const objectInfo = (): Record<string, ComfyNodeDef> =>
  buildObjectInfo(readdirSync(DIRS.input).filter((f) => !f.startsWith(".")).sort());

// ---------------------------------------------------------------------------
// Validation, as ComfyUI's execution.validate_prompt reports it.

class PromptError extends Error {
  constructor(readonly body: Record<string, unknown>) {
    super("invalid prompt");
  }
}

function validate(prompt: Prompt): string[] {
  const info = objectInfo();
  for (const [id, node] of Object.entries(prompt)) {
    if (!node || typeof node.class_type !== "string") {
      throw new PromptError({
        error: { type: "invalid_prompt", message: "Cannot execute because a node is missing the class_type property.", details: `Node ID '#${id}'`, extra_info: {} },
        node_errors: {}
      });
    }
    if (!info[node.class_type]) {
      throw new PromptError({
        error: { type: "invalid_prompt", message: `Cannot execute because node ${node.class_type} does not exist.`, details: `Node ID '#${id}'`, extra_info: {} },
        node_errors: {}
      });
    }
  }
  const outputs = Object.entries(prompt).filter(([, n]) => info[n.class_type].output_node);
  if (outputs.length === 0) {
    throw new PromptError({
      error: { type: "prompt_no_outputs", message: "Prompt has no outputs", details: "", extra_info: {} },
      node_errors: {}
    });
  }
  const nodeErrors: Record<string, unknown> = {};
  for (const [id, node] of Object.entries(prompt)) {
    const def = info[node.class_type];
    const errors: unknown[] = [];
    for (const [name, spec] of Object.entries(def.input.required)) {
      const value = node.inputs?.[name];
      if (value === undefined) {
        errors.push({ type: "required_input_missing", message: "Required input is missing", details: name, extra_info: { input_name: name } });
        continue;
      }
      if (Array.isArray(value)) {
        const [src] = value as [string, number];
        if (!prompt[String(src)]) {
          errors.push({ type: "exception_during_inner_validation", message: "Exception when validating inner node", details: `${name}: node ${src} not found`, extra_info: { input_name: name } });
        }
        continue;
      }
      const options = spec[0];
      if (Array.isArray(options) && !options.includes(value as string)) {
        const shown = options.length > 0 ? options.join(", ") : "";
        errors.push({
          type: "value_not_in_list",
          message: "Value not in list",
          details: `${name}: '${String(value)}' not in [${shown}]`,
          extra_info: { input_name: name, input_config: spec, received_value: value }
        });
      }
    }
    if (errors.length > 0) {
      nodeErrors[id] = { errors, dependent_outputs: outputs.map(([o]) => o), class_type: node.class_type };
    }
  }
  if (Object.keys(nodeErrors).length > 0) {
    throw new PromptError({
      error: { type: "prompt_outputs_failed_validation", message: "Prompt outputs failed validation", details: "", extra_info: {} },
      node_errors: nodeErrors
    });
  }
  return outputs.map(([id]) => id);
}

// ---------------------------------------------------------------------------
// Reading what a graph asks for.

function linked(prompt: Prompt, value: unknown): PromptNode | undefined {
  return Array.isArray(value) ? prompt[String(value[0])] : undefined;
}

/** Walk upstream from `start` and return every node reached, nearest first. */
function upstream(prompt: Prompt, start: string): PromptNode[] {
  const seen = new Set<string>([start]);
  const order: PromptNode[] = [];
  const queueIds = [start];
  while (queueIds.length > 0) {
    const id = queueIds.shift()!;
    const node = prompt[id];
    if (!node) continue;
    order.push(node);
    for (const value of Object.values(node.inputs ?? {})) {
      if (Array.isArray(value) && !seen.has(String(value[0]))) {
        seen.add(String(value[0]));
        queueIds.push(String(value[0]));
      }
    }
  }
  return order;
}

interface Ask {
  text: string;
  seed: number;
  width: number;
  height: number;
  frames: number;
  fps: number;
  startImage?: string;
  steps: number;
  upscale: number;
}

function readAsk(prompt: Prompt, outputId: string): Ask {
  const nodes = upstream(prompt, outputId);
  const sampler = nodes.find((n) => n.class_type.startsWith("KSampler"));
  const positive = sampler ? linked(prompt, sampler.inputs.positive) : undefined;
  const textNode =
    (positive && upstream(prompt, Object.keys(prompt).find((k) => prompt[k] === positive)!).find((n) => n.class_type === "CLIPTextEncode")) ??
    nodes.find((n) => n.class_type === "CLIPTextEncode");
  const latent = nodes.find((n) => ["EmptyLatentImage", "EmptySD3LatentImage", "WanImageToVideo", "Wan22ImageToVideoLatent"].includes(n.class_type));
  const loadImage = nodes.find((n) => n.class_type === "LoadImage");
  const isVideo = nodes.some((n) => n.class_type.includes("Video") || n.class_type === "SaveWEBM") ||
    ["SaveVideo", "SaveWEBM", "VHS_VideoCombine"].includes(prompt[outputId].class_type);
  const num = (v: unknown, d: number): number => (typeof v === "number" && Number.isFinite(v) ? v : d);
  const upscaleNode = nodes.find((n) => n.class_type === "ImageUpscaleWithModel");
  const scaleBy = nodes.find((n) => n.class_type === "ImageScaleBy");
  return {
    text: typeof textNode?.inputs.text === "string" ? textNode.inputs.text : "",
    seed: num(sampler?.inputs.seed ?? sampler?.inputs.noise_seed, 0),
    width: num(latent?.inputs.width, loadImage ? 768 : 1024),
    height: num(latent?.inputs.height, loadImage ? 768 : 1024),
    frames: isVideo ? Math.min(num(latent?.inputs.length, 49), 97) : 1,
    fps: num(prompt[outputId].inputs.frame_rate ?? nodes.find((n) => n.class_type === "CreateVideo")?.inputs.fps, 16),
    startImage: typeof loadImage?.inputs.image === "string" ? loadImage.inputs.image : undefined,
    steps: nodes.filter((n) => n.class_type.startsWith("KSampler")).reduce((sum, n) => sum + num(n.inputs.steps, 20), 0) || 20,
    upscale: upscaleNode ? 2 : scaleBy ? num(scaleBy.inputs.scale_by, 1) : 1
  };
}

// ---------------------------------------------------------------------------
// Painting.

function rng(seedText: string): () => number {
  let h = createHash("sha256").update(seedText).digest().readUInt32LE(0) || 1;
  return () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return ((h >>> 0) % 1_000_000) / 1_000_000;
  };
}

const has = (text: string, words: string[]): boolean => words.some((w) => new RegExp(`\\b${w}`, "i").test(text));

function palette(text: string): { sky: [string, string, string]; land: string[]; light: string } {
  if (has(text, ["night", "neon", "cyberpunk", "moon", "stars"])) {
    return { sky: ["#070b24", "#1d1b4f", "#5b2a6e"], land: ["#1a1840", "#120f2e", "#0a0a1c"], light: "#cfd8ff" };
  }
  if (has(text, ["sunset", "dusk", "golden", "evening", "sunrise", "dawn"])) {
    return { sky: ["#2b2a63", "#d9606a", "#ffc46b"], land: ["#5a3a5e", "#3b2546", "#22152b"], light: "#ffe3a1" };
  }
  if (has(text, ["forest", "jungle", "garden", "meadow", "green"])) {
    return { sky: ["#9fd3e6", "#d8efe2", "#f4f1d0"], land: ["#5f8a4a", "#3d6a39", "#203f25"], light: "#fffbe0" };
  }
  if (has(text, ["ocean", "sea", "beach", "underwater", "lake"])) {
    return { sky: ["#3f7fc4", "#8fc5e8", "#e7f3f7"], land: ["#2a6f9e", "#1b557e", "#0f3a5a"], light: "#ffffff" };
  }
  if (has(text, ["snow", "winter", "ice"])) {
    return { sky: ["#9fb6cf", "#d7e3ee", "#f6f9fc"], land: ["#c9d6e3", "#a8b9cc", "#7d92aa"], light: "#ffffff" };
  }
  if (has(text, ["studio", "product", "bottle", "packshot", "shoe", "watch"])) {
    return { sky: ["#e9e4dc", "#d8d0c4", "#c7bba9"], land: ["#b9ab96", "#a2927b", "#8a7a63"], light: "#ffffff" };
  }
  return { sky: ["#4a6fa5", "#a7c3dc", "#f1dfc4"], land: ["#7b8c6a", "#56684b", "#34432f"], light: "#fff4d6" };
}

function paint(ctx: SKRSContext2D, w: number, h: number, text: string, seed: number, t = 0): void {
  const r = rng(`${text}|${seed}`);
  const p = palette(text);
  const studio = has(text, ["studio", "product", "bottle", "packshot", "shoe", "watch"]);
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, p.sky[0]);
  sky.addColorStop(0.55, p.sky[1]);
  sky.addColorStop(1, p.sky[2]);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  const lx = w * (0.25 + r() * 0.5);
  const ly = h * (studio ? 0.2 : 0.3 + r() * 0.15);
  const glow = ctx.createRadialGradient(lx, ly, 0, lx, ly, Math.max(w, h) * 0.6);
  glow.addColorStop(0, p.light + "cc");
  glow.addColorStop(0.15, p.light + "55");
  glow.addColorStop(1, p.light + "00");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
  if (!studio && has(text, ["sun", "sunset", "sunrise", "moon", "dusk", "dawn", "golden"])) {
    ctx.fillStyle = p.light;
    ctx.beginPath();
    ctx.arc(lx, ly, Math.min(w, h) * 0.06, 0, Math.PI * 2);
    ctx.fill();
  }

  if (has(text, ["city", "street", "cyberpunk", "skyline", "building"])) {
    for (let layer = 0; layer < 3; layer++) {
      const base = h * (0.55 + layer * 0.12);
      let x = -20;
      while (x < w) {
        const bw = w * (0.04 + r() * 0.08);
        const bh = h * (0.15 + r() * 0.35) * (1 - layer * 0.2);
        ctx.fillStyle = p.land[layer];
        ctx.fillRect(x, base - bh, bw, h - base + bh);
        ctx.fillStyle = has(text, ["night", "neon", "cyberpunk"]) ? ["#ff4fd8", "#3ef0ff", "#ffd36b"][Math.floor(r() * 3)] + "aa" : "#fff6d544";
        for (let wy = base - bh + 8; wy < h; wy += 14) {
          for (let wx = x + 5; wx < x + bw - 6; wx += 10) if (r() > 0.55) ctx.fillRect(wx, wy, 4, 6);
        }
        x += bw + 2;
      }
    }
  } else if (studio) {
    ctx.fillStyle = p.land[0];
    ctx.fillRect(0, h * 0.68, w, h * 0.32);
  } else {
    for (let layer = 0; layer < 3; layer++) {
      const base = h * (0.55 + layer * 0.13);
      const amp = h * (0.12 - layer * 0.03);
      const freq = 1.5 + r() * 2.5;
      const phase = r() * 10 + t * (layer + 1) * 0.02;
      ctx.fillStyle = p.land[layer];
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += 8) {
        const y = base - Math.sin((x / w) * freq * Math.PI + phase) * amp - Math.sin((x / w) * 9 + phase * 2) * amp * 0.25;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(w, h);
      ctx.fill();
    }
  }

  const cx = w * (0.4 + r() * 0.2) + Math.sin(t * 0.15) * w * 0.004;
  const ground = h * 0.86;
  const s = Math.min(w, h);
  ctx.save();
  ctx.shadowColor = p.light;
  ctx.shadowBlur = s * 0.03;
  if (has(text, ["woman", "man", "girl", "boy", "person", "portrait", "character", "warrior", "knight", "astronaut", "witch", "samurai"])) {
    ctx.fillStyle = "#1b1622";
    ctx.beginPath();
    ctx.ellipse(cx, ground - s * 0.45, s * 0.075, s * 0.095, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.2, ground + s * 0.2);
    ctx.quadraticCurveTo(cx - s * 0.18, ground - s * 0.32, cx, ground - s * 0.33);
    ctx.quadraticCurveTo(cx + s * 0.18, ground - s * 0.32, cx + s * 0.2, ground + s * 0.2);
    ctx.fill();
  } else if (has(text, ["cat", "dog", "fox", "wolf", "animal", "puppy", "kitten", "bird"])) {
    ctx.fillStyle = "#2a1f1a";
    ctx.beginPath();
    ctx.ellipse(cx, ground - s * 0.1, s * 0.16, s * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx + s * 0.13, ground - s * 0.22, s * 0.07, s * 0.065, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx + s * 0.09, ground - s * 0.27);
    ctx.lineTo(cx + s * 0.1, ground - s * 0.34);
    ctx.lineTo(cx + s * 0.13, ground - s * 0.28);
    ctx.moveTo(cx + s * 0.15, ground - s * 0.28);
    ctx.lineTo(cx + s * 0.18, ground - s * 0.34);
    ctx.lineTo(cx + s * 0.19, ground - s * 0.26);
    ctx.fill();
  } else if (studio || has(text, ["car", "lamp", "perfume", "can", "cup", "mug"])) {
    const bw = s * 0.16;
    const bh = s * 0.38;
    const g = ctx.createLinearGradient(cx - bw / 2, 0, cx + bw / 2, 0);
    g.addColorStop(0, "#3a2c22");
    g.addColorStop(0.35, "#c98f52");
    g.addColorStop(0.5, "#ffe0b0");
    g.addColorStop(1, "#4a3424");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(cx - bw / 2, h * 0.7 - bh, bw, bh, bw * 0.25);
    ctx.fill();
  } else if (has(text, ["castle", "house", "cabin", "lighthouse", "tower", "temple"])) {
    ctx.fillStyle = "#1f1a24";
    ctx.fillRect(cx - s * 0.05, ground - s * 0.42, s * 0.1, s * 0.42);
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.07, ground - s * 0.42);
    ctx.lineTo(cx, ground - s * 0.52);
    ctx.lineTo(cx + s * 0.07, ground - s * 0.42);
    ctx.fill();
    ctx.fillStyle = p.light;
    ctx.fillRect(cx - s * 0.015, ground - s * 0.38, s * 0.03, s * 0.04);
  }
  ctx.restore();

  for (let i = 0; i < 260; i++) {
    const x = r() * w;
    const y = r() * h;
    const rad = s * (0.004 + r() * 0.03);
    ctx.fillStyle = `rgba(255,255,255,${r() * 0.06})`;
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();
  }
  const vig = ctx.createRadialGradient(w / 2, h / 2, s * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
  vig.addColorStop(0, "rgba(0,0,0,0)");
  vig.addColorStop(1, "rgba(0,0,0,0.45)");
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, h);
}

/** A PNG with ComfyUI's `prompt` text chunk, as SaveImage writes it. */
function withPromptChunk(png: Buffer, prompt: Prompt): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer): number => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const data = Buffer.concat([Buffer.from("prompt\0", "latin1"), Buffer.from(JSON.stringify(prompt), "latin1")]);
  const type = Buffer.from("tEXt", "latin1");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc(Buffer.concat([type, data])));
  const ihdrEnd = 8 + 25;
  return Buffer.concat([png.subarray(0, ihdrEnd), len, type, data, crcBuf, png.subarray(ihdrEnd)]);
}

function nextName(prefix: string, ext: string): { filename: string; subfolder: string } {
  const parts = prefix.split("/");
  const stem = parts.pop() || "ComfyUI";
  const subfolder = parts.join("/");
  const key = `${subfolder}/${stem}`;
  counters[key] = (counters[key] ?? 0) + 1;
  mkdirSync(join(DIRS.output, subfolder), { recursive: true });
  return { filename: `${stem}_${String(counters[key]).padStart(5, "0")}_.${ext}`, subfolder };
}

async function startFrame(ask: Ask): Promise<Image | null> {
  if (!ask.startImage) return null;
  const path = join(DIRS.input, ask.startImage);
  return existsSync(path) ? loadImage(readFileSync(path)) : null;
}

async function makeImage(prompt: Prompt, ask: Ask, prefix: string, type: "output" | "temp"): Promise<FileRef> {
  const w = Math.round(ask.width * ask.upscale);
  const h = Math.round(ask.height * ask.upscale);
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext("2d");
  const start = await startFrame(ask);
  if (start) {
    ctx.drawImage(start, 0, 0, w, h);
    ctx.globalAlpha = 0.35;
    paint(ctx, w, h, ask.text, ask.seed);
    ctx.globalAlpha = 1;
  } else {
    paint(ctx, w, h, ask.text, ask.seed);
  }
  const png = withPromptChunk(canvas.toBuffer("image/png"), prompt);
  if (type === "temp") {
    const filename = `ComfyUI_temp_${randomUUID().slice(0, 5)}_${String(++promptNumber).padStart(5, "0")}_.png`;
    writeFileSync(join(DIRS.temp, filename), png);
    return { filename, subfolder: "", type: "temp" };
  }
  const { filename, subfolder } = nextName(prefix, "png");
  writeFileSync(join(DIRS.output, subfolder, filename), png);
  return { filename, subfolder, type: "output" };
}

const H264 = (async () => hasEncoder("libx264"))();

async function makeVideo(ask: Ask, prefix: string, wantMp4: boolean): Promise<FileRef & { format: string }> {
  const w = Math.round(ask.width / 2) * 2;
  const h = Math.round(ask.height / 2) * 2;
  const mp4 = wantMp4 && (await H264);
  const { filename, subfolder } = nextName(prefix, mp4 ? "mp4" : "webm");
  const base = createCanvas(w, h);
  const bctx = base.getContext("2d");
  const start = await startFrame(ask);
  if (start) {
    const scale = Math.max(w / start.width, h / start.height);
    bctx.drawImage(start, (w - start.width * scale) / 2, (h - start.height * scale) / 2, start.width * scale, start.height * scale);
  } else {
    paint(bctx, w, h, ask.text, ask.seed);
  }
  const frame = createCanvas(w, h);
  const fctx = frame.getContext("2d");
  await writeRgbaVideo({
    outPath: join(DIRS.output, subfolder, filename),
    width: w,
    height: h,
    fps: ask.fps,
    frames: ask.frames,
    frameAt: (i) => {
      const k = i / Math.max(1, ask.frames - 1);
      const zoom = 1 + 0.12 * k;
      fctx.setTransform(zoom, 0, 0, zoom, -(w * (zoom - 1)) / 2 + Math.sin(k * Math.PI) * w * 0.02, -(h * (zoom - 1)) / 2);
      fctx.drawImage(base, 0, 0);
      fctx.setTransform(1, 0, 0, 1, 0, 0);
      fctx.fillStyle = `rgba(255,240,210,${0.08 * Math.sin(k * Math.PI * 2) ** 2})`;
      fctx.fillRect(0, 0, w, h);
      return new Uint8Array(fctx.getImageData(0, 0, w, h).data.buffer);
    },
    spec: mp4
      ? { codec: "libx264", pixelFormat: "yuv420p", options: { preset: "veryfast", crf: "23" } }
      : { codec: "libvpx-vp9", pixelFormat: "yuv420p", options: { deadline: "realtime", "cpu-used": "8", crf: "34", b: "0" } }
  });
  return { filename, subfolder, type: "output", format: mp4 ? "video/h264-mp4" : "video/webm" };
}

// ---------------------------------------------------------------------------
// Execution.

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function send(clientId: string | null, type: string, data: Record<string, unknown>): void {
  const message = JSON.stringify({ type, data });
  const targets = clientId ? [sockets.get(clientId)] : [...sockets.values()];
  for (const ws of targets) if (ws && ws.readyState === ws.OPEN) ws.send(message);
}

const queueStatus = (): Record<string, unknown> => ({
  status: { exec_info: { queue_remaining: queue.length + (running ? 1 : 0) } }
});

/** Topological order, as ComfyUI executes a graph. */
function order(prompt: Prompt): string[] {
  const done = new Set<string>();
  const out: string[] = [];
  const visit = (id: string): void => {
    if (done.has(id)) return;
    done.add(id);
    for (const v of Object.values(prompt[id]?.inputs ?? {})) if (Array.isArray(v) && prompt[String(v[0])]) visit(String(v[0]));
    out.push(id);
  };
  Object.keys(prompt).forEach(visit);
  return out;
}

async function execute(job: { id: string; number: number; prompt: Prompt; clientId: string }): Promise<void> {
  running = { ...job, interrupted: false };
  const { id, prompt, clientId } = job;
  const info = objectInfo();
  const outputs: Record<string, Record<string, unknown>> = {};
  const messages: unknown[] = [];
  const started = Date.now();
  const emit = (type: string, data: Record<string, unknown>): void => {
    messages.push([type, { ...data, timestamp: Date.now() }]);
    send(clientId, type, data);
  };
  send(null, "status", queueStatus());
  emit("execution_start", { prompt_id: id, timestamp: started });
  emit("execution_cached", { nodes: [], prompt_id: id, timestamp: started });
  let failed: string | null = null;
  try {
    for (const nodeId of order(prompt)) {
      if (running.interrupted) break;
      const node = prompt[nodeId];
      emit("executing", { node: nodeId, display_node: nodeId, prompt_id: id });
      const isVideoJob = Object.values(prompt).some((n) => n.class_type.includes("Video") || n.class_type === "SaveWEBM");
      if (node.class_type.startsWith("KSampler")) {
        const steps = Math.min(Number(node.inputs.steps) || 20, 60);
        for (let step = 1; step <= steps; step++) {
          if (running.interrupted) break;
          await sleep(isVideoJob ? STEP_MS * 4 : STEP_MS);
          emit("progress", { value: step, max: steps, prompt_id: id, node: nodeId });
        }
      } else if (/Loader/.test(node.class_type)) {
        await sleep(STEP_MS * 2);
      } else {
        await sleep(30);
      }
      if (!info[node.class_type].output_node || running.interrupted) continue;
      const ask = readAsk(prompt, nodeId);
      let output: Record<string, unknown>;
      if (node.class_type === "SaveImage" || node.class_type === "PreviewImage") {
        const count = Math.max(1, Number(upstream(prompt, nodeId).find((n) => typeof n.inputs.batch_size === "number")?.inputs.batch_size) || 1);
        const images: FileRef[] = [];
        for (let i = 0; i < Math.min(count, 4); i++) {
          images.push(await makeImage(prompt, { ...ask, seed: ask.seed + i }, String(node.inputs.filename_prefix ?? "ComfyUI"), node.class_type === "SaveImage" ? "output" : "temp"));
        }
        output = { images };
      } else if (node.class_type === "SaveVideo") {
        const file = await makeVideo(ask, String(node.inputs.filename_prefix ?? "video/ComfyUI"), true);
        output = { images: [{ filename: file.filename, subfolder: file.subfolder, type: file.type }], animated: [true] };
      } else if (node.class_type === "SaveWEBM") {
        const file = await makeVideo(ask, String(node.inputs.filename_prefix ?? "ComfyUI"), false);
        output = { images: [{ filename: file.filename, subfolder: file.subfolder, type: file.type }], animated: [true] };
      } else {
        const format = String(node.inputs.format ?? "video/h264-mp4");
        const file = await makeVideo({ ...ask, fps: Number(node.inputs.frame_rate) || 16 }, String(node.inputs.filename_prefix ?? "AnimateDiff"), format.includes("mp4"));
        output = { gifs: [{ filename: file.filename, subfolder: file.subfolder, type: file.type, format: file.format, frame_rate: ask.fps }] };
      }
      outputs[nodeId] = output;
      emit("executed", { node: nodeId, display_node: nodeId, output, prompt_id: id });
    }
  } catch (err) {
    failed = err instanceof Error ? err.message : String(err);
  }
  if (running.interrupted) {
    emit("execution_interrupted", { prompt_id: id, node_id: null, node_type: null, executed: [] });
  } else if (failed) {
    emit("execution_error", { prompt_id: id, node_id: null, node_type: null, exception_message: failed, exception_type: "RuntimeError", traceback: [] });
  } else {
    emit("execution_success", { prompt_id: id, timestamp: Date.now() });
  }
  history[id] = {
    prompt: [job.number, id, prompt, { client_id: clientId }, Object.keys(outputs)],
    outputs,
    status: { status_str: failed || running.interrupted ? "error" : "success", completed: !failed && !running.interrupted, messages },
    meta: Object.fromEntries(Object.keys(outputs).map((k) => [k, { node_id: k, display_node: k, parent_node: null, real_node_id: k }]))
  };
  send(clientId, "executing", { node: null, prompt_id: id });
  log({ event: "run", prompt_id: id, ms: Date.now() - started, outputs, failed, interrupted: running.interrupted });
  running = null;
  send(null, "status", queueStatus());
  const next = queue.shift();
  if (next) void execute(next);
}

// ---------------------------------------------------------------------------
// HTTP.

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function body(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", mp4: "video/mp4", webm: "video/webm", gif: "image/gif" };

const STATS = {
  system: {
    os: "nt",
    ram_total: 68_614_221_824,
    ram_free: 41_220_448_256,
    comfyui_version: "0.3.68",
    required_frontend_version: "1.28.8",
    python_version: "3.12.10 (tags/v3.12.10:0cc8128, Apr  8 2025, 12:21:36) [MSC v.1943 64 bit (AMD64)]",
    pytorch_version: "2.8.0+cu128",
    embedded_python: true,
    argv: ["ComfyUI\\main.py", "--windows-standalone-build"]
  },
  devices: [
    {
      name: "cuda:0 NVIDIA GeForce RTX 4070 Ti SUPER : cudaMallocAsync",
      type: "cuda",
      index: 0,
      vram_total: 17_170_956_288,
      vram_free: 15_663_759_360,
      torch_vram_total: 0,
      torch_vram_free: 0
    }
  ]
};

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", `http://${HOST}:${PORT}`);
  const path = url.pathname.replace(/^\/api(?=\/)/, "");
  const method = req.method ?? "GET";
  if (method === "GET" && path === "/") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end("<!doctype html><title>ComfyUI</title><p>ComfyUI (test double)</p>");
    return;
  }
  if (method === "GET" && path === "/system_stats") return json(res, 200, STATS);
  if (method === "GET" && path === "/object_info") return json(res, 200, objectInfo());
  if (method === "GET" && path.startsWith("/object_info/")) {
    const cls = decodeURIComponent(path.slice("/object_info/".length));
    const info = objectInfo();
    return json(res, 200, info[cls] ? { [cls]: info[cls] } : {});
  }
  if (method === "GET" && path === "/models") return json(res, 200, Object.keys(MODEL_FOLDERS).filter((k) => k !== "embeddings"));
  if (method === "GET" && path.startsWith("/models/")) {
    return json(res, 200, MODEL_FOLDERS[path.slice("/models/".length)] ?? []);
  }
  if (method === "GET" && path === "/embeddings") return json(res, 200, MODEL_FOLDERS.embeddings.map((f) => f.replace(/\.safetensors$/, "")));
  if (method === "GET" && path === "/extensions") return json(res, 200, ["/extensions/ComfyUI-VideoHelperSuite/widgets.js"]);
  if (method === "GET" && path === "/features") return json(res, 200, { supports_preview_metadata: true, max_upload_size: 104857600 });
  if (method === "GET" && path === "/queue") {
    return json(res, 200, {
      queue_running: running ? [[running.number, running.id, running.prompt, { client_id: running.clientId }, []]] : [],
      queue_pending: queue.map((j) => [j.number, j.id, j.prompt, { client_id: j.clientId }, []])
    });
  }
  if (method === "GET" && path === "/prompt") return json(res, 200, { exec_info: { queue_remaining: queue.length + (running ? 1 : 0) } });
  if (method === "GET" && path === "/history") return json(res, 200, history);
  if (method === "GET" && path.startsWith("/history/")) {
    const id = path.slice("/history/".length);
    return json(res, 200, history[id] ? { [id]: history[id] } : {});
  }
  if (method === "GET" && path === "/view") {
    const type = url.searchParams.get("type") ?? "output";
    const root = DIRS[type as keyof typeof DIRS];
    const filename = basename(url.searchParams.get("filename") ?? "");
    const sub = normalize(url.searchParams.get("subfolder") ?? "").replace(/^(\.\.(\/|\\|$))+/, "");
    const file = root ? join(root, sub, filename) : "";
    if (!root || !filename || !file.startsWith(root) || !existsSync(file)) {
      res.writeHead(404);
      res.end();
      return;
    }
    const ext = filename.split(".").pop()?.toLowerCase() ?? "";
    res.writeHead(200, { "Content-Type": MIME[ext] ?? "application/octet-stream", "Content-Disposition": `filename="${filename}"` });
    res.end(readFileSync(file));
    return;
  }
  if (method === "POST" && path === "/prompt") {
    let payload: { prompt?: Prompt; client_id?: string; number?: number; front?: boolean };
    try {
      payload = JSON.parse((await body(req)).toString("utf8"));
    } catch {
      return json(res, 400, { error: { type: "invalid_prompt", message: "Invalid JSON", details: "", extra_info: {} }, node_errors: {} });
    }
    if (!payload.prompt || typeof payload.prompt !== "object") {
      return json(res, 400, { error: { type: "no_prompt", message: "No prompt provided", details: "No prompt provided", extra_info: {} }, node_errors: {} });
    }
    try {
      validate(payload.prompt);
    } catch (err) {
      if (err instanceof PromptError) {
        log({ event: "rejected", body: err.body });
        return json(res, 400, err.body);
      }
      throw err;
    }
    const job = { id: randomUUID(), number: promptNumber++, prompt: payload.prompt, clientId: payload.client_id ?? "" };
    if (running) queue.push(job);
    else void execute(job);
    return json(res, 200, { prompt_id: job.id, number: job.number, node_errors: {} });
  }
  if (method === "POST" && path === "/interrupt") {
    if (running) running.interrupted = true;
    return json(res, 200, {});
  }
  if (method === "POST" && (path === "/queue" || path === "/history" || path === "/free")) {
    await body(req);
    return json(res, 200, {});
  }
  if (method === "POST" && (path === "/upload/image" || path === "/upload/mask")) {
    const request = new Request(url, { method, headers: req.headers as Record<string, string>, body: await body(req) });
    const form = await request.formData();
    const file = form.get("image");
    if (!(file instanceof File)) return json(res, 400, { error: "no image" });
    const type = String(form.get("type") ?? "input");
    const sub = String(form.get("subfolder") ?? "");
    const dir = join(DIRS[type as keyof typeof DIRS] ?? DIRS.input, sub);
    mkdirSync(dir, { recursive: true });
    let name = basename(file.name);
    if (form.get("overwrite") !== "true") {
      let n = 1;
      const stem = name.replace(/\.[^.]+$/, "");
      const ext = name.slice(stem.length);
      while (existsSync(join(dir, name))) name = `${stem} (${n++})${ext}`;
    }
    writeFileSync(join(dir, name), Buffer.from(await file.arrayBuffer()));
    return json(res, 200, { name, subfolder: sub, type });
  }
  json(res, 404, { error: "Not found" });
}

const server = createServer((req, res) => {
  const started = Date.now();
  res.on("finish", () => log({ method: req.method, path: req.url, status: res.statusCode, ms: Date.now() - started }));
  handle(req, res).catch((err: unknown) => {
    log({ event: "error", path: req.url, error: String(err) });
    if (!res.headersSent) json(res, 500, { error: String(err) });
  });
});

const wss = new WebSocketServer({ noServer: true });
server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url ?? "/", `http://${HOST}:${PORT}`);
  if (url.pathname !== "/ws" && url.pathname !== "/api/ws") {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    const clientId = url.searchParams.get("clientId") ?? randomUUID().replace(/-/g, "");
    sockets.set(clientId, ws);
    log({ event: "ws-open", clientId });
    ws.send(JSON.stringify({ type: "status", data: { ...queueStatus(), sid: clientId } }));
    ws.on("close", () => {
      if (sockets.get(clientId) === ws) sockets.delete(clientId);
    });
  });
});

server.listen(PORT, HOST, () => {
  log({ event: "listening", url: `http://${HOST}:${PORT}`, data: DATA });
});

