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
    const svg = buildSvg(String(this.prompt ?? ""), width, height);
    const output: ImageRef = {
      type: "image",
      uri: `data:image/svg+xml,${encodeURIComponent(svg)}`,
      mimeType: "image/svg+xml",
      width,
      height
    };
    return { output };
  }
}

export const FAKE_MEDIA_NODES = tagAsContentCard(
  tagAsUniversal([FakeGenerateImageNode])
);
