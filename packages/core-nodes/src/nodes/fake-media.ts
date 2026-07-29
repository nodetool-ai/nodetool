import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { ImageRef } from "@nodetool-ai/protocol";
import { tagAsUniversal, tagAsContentCard } from "@nodetool-ai/nodes-utils";

/**
 * Fake media generation — a stand-in for a real image provider that produces a
 * deterministic placeholder image from the prompt, with no API calls or
 * secrets. The prompt seeds a gradient and is drawn on top, so different
 * prompts yield different images and it "feels" like generation. Pure JS (SVG
 * data URL), so it runs in the browser worker alongside the rest of a
 * browser-eligible graph.
 */

const clampDim = (value: unknown, fallback: number): number => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(16, Math.min(Math.round(n), 2048));
};

/** Stable 32-bit hash so the same prompt always yields the same image. */
const hashString = (input: string): number => {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const escapeXml = (input: string): string =>
  input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const buildSvg = (prompt: string, width: number, height: number): string => {
  const seed = hashString(prompt || "fake");
  const hueA = seed % 360;
  const hueB = (hueA + 90 + ((seed >> 8) % 120)) % 360;
  const label = prompt.trim() || "fake image";
  const display = label.length > 48 ? `${label.slice(0, 47)}…` : label;
  const titleSize = Math.max(14, Math.round(width / Math.max(12, display.length)));
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">`,
    `<stop offset="0%" stop-color="hsl(${hueA},72%,55%)"/>`,
    `<stop offset="100%" stop-color="hsl(${hueB},65%,32%)"/>`,
    `</linearGradient></defs>`,
    `<rect width="100%" height="100%" fill="url(#g)"/>`,
    `<circle cx="${width * 0.5}" cy="${height * 0.42}" r="${Math.min(width, height) * 0.28}" fill="rgba(255,255,255,0.12)"/>`,
    `<text x="50%" y="46%" font-family="sans-serif" font-weight="600" font-size="${titleSize}" fill="#ffffff" text-anchor="middle" dominant-baseline="middle">${escapeXml(display)}</text>`,
    `<text x="50%" y="92%" font-family="sans-serif" font-size="${Math.max(11, Math.round(width / 40))}" fill="rgba(255,255,255,0.8)" text-anchor="middle">✦ simulated · fake provider</text>`,
    `</svg>`
  ].join("");
};

const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
};

const getOffscreenCanvas = ():
  | (new (w: number, h: number) => OffscreenCanvas)
  | undefined =>
  (globalThis as { OffscreenCanvas?: new (w: number, h: number) => OffscreenCanvas })
    .OffscreenCanvas;

/**
 * Render the placeholder as a raster PNG (so downstream nodes can decode it with
 * createImageBitmap). Returns null off the browser worker, where the SVG
 * fallback is used instead.
 */
const renderGradientPng = async (
  prompt: string,
  width: number,
  height: number
): Promise<string | null> => {
  const OffscreenCanvasCtor = getOffscreenCanvas();
  if (!OffscreenCanvasCtor) return null;
  const canvas = new OffscreenCanvasCtor(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const seed = hashString(prompt || "fake");
  const hueA = seed % 360;
  const hueB = (hueA + 90 + ((seed >> 8) % 120)) % 360;
  const grad = ctx.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, `hsl(${hueA},72%,55%)`);
  grad.addColorStop(1, `hsl(${hueB},65%,32%)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.beginPath();
  ctx.arc(width * 0.5, height * 0.42, Math.min(width, height) * 0.28, 0, Math.PI * 2);
  ctx.fill();

  const label = prompt.trim() || "fake image";
  const display = label.length > 48 ? `${label.slice(0, 47)}…` : label;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffffff";
  ctx.font = `600 ${Math.max(14, Math.round(width / Math.max(12, display.length)))}px sans-serif`;
  ctx.fillText(display, width / 2, height * 0.46);
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = `${Math.max(11, Math.round(width / 40))}px sans-serif`;
  ctx.fillText("✦ simulated · fake provider", width / 2, height * 0.9);

  const blob = await canvas.convertToBlob({ type: "image/png" });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return `data:image/png;base64,${bytesToBase64(bytes)}`;
};

export class FakeGenerateImageNode extends BaseNode {
  static readonly nodeType = "nodetool.fake.GenerateImage";
  static readonly title = "Fake Generate Image";
  static readonly description =
    "Simulate image generation with a fake provider — no API calls.\n" +
    "fake, placeholder, image, generate, test, demo\n\n" +
    "Use cases:\n" +
    "- Build and demo media apps without API keys or cost\n" +
    "- Run an image-generation graph entirely in the browser\n" +
    "- Stand in for a real provider while wiring a workflow";
  static readonly metadataOutputTypes = { output: "image" };
  static readonly inputFields = ["prompt"];

  @prop({
    type: "str",
    default: "a serene mountain lake at sunset",
    title: "Prompt",
    description: "Describes the image. Seeds the placeholder; no real model runs."
  })
  declare prompt: any;

  @prop({ type: "int", default: 512, title: "Width", min: 16, max: 2048 })
  declare width: any;

  @prop({ type: "int", default: 512, title: "Height", min: 16, max: 2048 })
  declare height: any;

  async process(): Promise<Record<string, unknown>> {
    const width = clampDim(this.width, 512);
    const height = clampDim(this.height, 512);
    const prompt = String(this.prompt ?? "");
    // Prefer a raster PNG (decodable downstream); fall back to SVG off-browser.
    const png = await renderGradientPng(prompt, width, height);
    const output: ImageRef = {
      type: "image",
      uri: png ?? `data:image/svg+xml,${encodeURIComponent(buildSvg(prompt, width, height))}`,
      mimeType: png ? "image/png" : "image/svg+xml",
      width,
      height
    };
    return { output };
  }
}

const clampNum = (value: unknown, fallback: number, lo: number, hi: number): number => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(n, hi));
};

const imageUri = (image: unknown): string | null => {
  if (typeof image === "string") return image || null;
  if (image && typeof image === "object") {
    const obj = image as Record<string, unknown>;
    const candidate = obj.uri ?? obj.url;
    if (typeof candidate === "string" && candidate.length > 0) return candidate;
  }
  return null;
};

/**
 * Browser image processing: apply hue / saturation / brightness color grading
 * to an input image with an OffscreenCanvas filter. Pure client-side (no GPU,
 * no API) so it runs in the worker and re-grades in real time as a slider
 * drives its inputs.
 */
export class FakeColorGradeNode extends BaseNode {
  static readonly nodeType = "nodetool.fake.ColorGrade";
  static readonly title = "Color Grade (browser)";
  static readonly description =
    "Color-grade an image in the browser — hue, saturation, brightness.\n" +
    "image, color, grade, hue, saturation, brightness, realtime, browser\n\n" +
    "Use cases:\n" +
    "- Drive realtime image adjustments from a slider, client-side\n" +
    "- Grade generated or input images without API calls";
  static readonly metadataOutputTypes = { output: "image" };
  static readonly inputFields = ["image", "hue", "saturation", "brightness"];

  @prop({ type: "image", title: "Image", description: "Source image to grade." })
  declare image: any;

  @prop({ type: "float", default: 0, title: "Hue", min: 0, max: 360 })
  declare hue: any;

  @prop({ type: "float", default: 100, title: "Saturation", min: 0, max: 300 })
  declare saturation: any;

  @prop({ type: "float", default: 100, title: "Brightness", min: 0, max: 300 })
  declare brightness: any;

  async process(): Promise<Record<string, unknown>> {
    const src = imageUri(this.image);
    const hue = clampNum(this.hue, 0, 0, 360);
    const saturation = clampNum(this.saturation, 100, 0, 300);
    const brightness = clampNum(this.brightness, 100, 0, 300);

    const OffscreenCanvasCtor = (
      globalThis as { OffscreenCanvas?: typeof OffscreenCanvas }
    ).OffscreenCanvas;
    // Off the browser worker (e.g. SSR/tests) just pass the image through.
    if (!src || !OffscreenCanvasCtor || typeof createImageBitmap !== "function") {
      return { output: this.image ?? null };
    }

    const response = await fetch(src);
    const bitmap = await createImageBitmap(await response.blob());
    const width = bitmap.width || 512;
    const height = bitmap.height || 512;
    const canvas = new OffscreenCanvasCtor(width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) return { output: this.image ?? null };
    ctx.filter = `hue-rotate(${hue}deg) saturate(${saturation}%) brightness(${brightness}%)`;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const blob = await canvas.convertToBlob({ type: "image/png" });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const output: ImageRef = {
      type: "image",
      uri: `data:image/png;base64,${bytesToBase64(bytes)}`,
      mimeType: "image/png",
      width,
      height
    };
    return { output };
  }
}

export const FAKE_MEDIA_NODES = tagAsContentCard(
  tagAsUniversal([FakeGenerateImageNode, FakeColorGradeNode])
);
