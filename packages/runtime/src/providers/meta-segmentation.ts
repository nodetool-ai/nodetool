/**
 * Request text and response decoding for Meta's SAM 3.1 segmentation model.
 *
 * SAM 3.1 runs on Meta's Responses API. The request carries one image and an
 * `input_text` prompt: a short noun phrase, or an object prompt built from a
 * box and points. The answer is not JSON but one line of special-token text,
 * `<0f>` followed by `id<|box;…|><|mask;…|>` records, whose masks use a custom
 * base85 encoding. `@meta-sam/parser` is Meta's own reader for that grammar;
 * this module turns its records into full-frame mask PNGs.
 * See https://dev.meta.ai/docs/media-segmentation and
 * https://dev.meta.ai/docs/sam/reading-segmentation.
 */
import {
  buildObjectPrompt,
  decodeMaskToRaster,
  parseImageStream,
  recordsOfKind,
  type FramePrompt,
  type ResponsesEvent
} from "@meta-sam/parser";
import { importHidden } from "@nodetool-ai/config";
import type {
  ImageSegmentationMask,
  SegmentImageParams
} from "./types.js";

type SharpModuleNs = typeof import("sharp");
type SharpFn = SharpModuleNs["default"];

async function loadSharp(): Promise<SharpFn> {
  const mod = await importHidden<SharpModuleNs | { default: SharpFn }>(
    "sharp"
  );
  if (!mod) throw new Error("Meta segmentation requires sharp");
  return "default" in mod ? mod.default : mod;
}

export interface ImageSize {
  width: number;
  height: number;
}

/**
 * The image's size as displayed, which is the space SAM reads prompt
 * coordinates in and reports boxes in. EXIF orientations 5–8 rotate by a
 * quarter turn, so the stored width and height swap.
 */
export async function displayedImageSize(image: Uint8Array): Promise<ImageSize> {
  const sharp = await loadSharp();
  const meta = await sharp(Buffer.from(image)).metadata();
  if (!meta.width || !meta.height) {
    throw new Error("Meta segmentation could not read the image size");
  }
  const rotated = (meta.orientation ?? 1) >= 5;
  return rotated
    ? { width: meta.height, height: meta.width }
    : { width: meta.width, height: meta.height };
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(value)));
}

/**
 * The `input_text` for a segmentation request. A text prompt wins: SAM's API
 * refuses a request that mixes a noun phrase with object prompts. Without
 * one, the box and points become a single object's prompt on frame 0.
 */
export function samPromptText(
  params: Pick<SegmentImageParams, "prompt" | "box" | "points">,
  size: ImageSize
): string {
  const prompt = params.prompt?.trim();
  if (prompt) return prompt;

  const framePrompt: { box?: FramePrompt["box"]; points?: FramePrompt["points"] } =
    {};
  if (params.box) {
    const left = clampInt(params.box.x, 0, size.width - 1);
    const top = clampInt(params.box.y, 0, size.height - 1);
    framePrompt.box = {
      left,
      top,
      right: clampInt(params.box.x + params.box.width, left + 1, size.width),
      bottom: clampInt(params.box.y + params.box.height, top + 1, size.height)
    };
  }
  if (params.points && params.points.length > 0) {
    framePrompt.points = params.points.map((point) => ({
      x: clampInt(point.x, 0, size.width - 1),
      y: clampInt(point.y, 0, size.height - 1),
      label: point.include ? "positive" : "negative"
    }));
  }
  if (!framePrompt.box && !framePrompt.points) {
    throw new Error(
      "Meta SAM 3.1 needs a text prompt (a short noun phrase), a box, or points"
    );
  }
  return buildObjectPrompt({
    size,
    objects: [{ id: 1, prompts: [{ frame: 0, ...framePrompt }] }]
  });
}

/** The parser reads a Responses event stream; a complete answer is one delta. */
async function* outputTextEvents(text: string): AsyncIterable<ResponsesEvent> {
  const lane = { item_id: "output", output_index: 0, content_index: 0 };
  yield { type: "response.output_text.delta", delta: text, ...lane };
  yield { type: "response.output_text.done", text, ...lane };
  yield { type: "response.completed" };
}

/**
 * Decode SAM's output text into one full-frame mask per object, in the order
 * the model reported them. Each mask raster covers only its object's box, so
 * it is placed at that box on a black canvas the size of the source image.
 * Empty output is SAM's answer for "no match" and yields an empty list.
 */
export async function samMasksFromOutput(
  outputText: string,
  size: ImageSize,
  options: { label?: string | null } = {}
): Promise<ImageSegmentationMask[]> {
  if (!outputText.trim()) return [];
  const result = await parseImageStream(outputTextEvents(outputText))
    .finalResult;
  const maskRecords = recordsOfKind(result.records, "mask");
  const errors = result.diagnostics.filter((d) => d.severity === "error");
  if (maskRecords.length === 0 && errors.length > 0) {
    throw new Error(
      `Meta SAM 3.1 returned output that could not be read: ${errors
        .map((d) => `${d.code}: ${d.message}`)
        .join("; ")}`
    );
  }

  const sharp = await loadSharp();
  const masks: ImageSegmentationMask[] = [];
  for (const record of maskRecords) {
    const raster = decodeMaskToRaster(record.mask);
    const { width: rasterWidth, height: rasterHeight } = record.mask;
    const canvas = new Uint8Array(size.width * size.height);
    for (let row = 0; row < rasterHeight; row++) {
      const y = record.bounds.top + row;
      if (y < 0 || y >= size.height) continue;
      for (let col = 0; col < rasterWidth; col++) {
        const x = record.bounds.left + col;
        if (x < 0 || x >= size.width) continue;
        if (raster[row * rasterWidth + col] === 1) {
          canvas[y * size.width + x] = 255;
        }
      }
    }
    const png = await sharp(Buffer.from(canvas), {
      raw: { width: size.width, height: size.height, channels: 1 }
    })
      .png()
      .toBuffer();
    masks.push({
      mask: new Uint8Array(png),
      mimeType: "image/png",
      width: size.width,
      height: size.height,
      label: options.label ?? null,
      confidence: record.confidence ?? null,
      box: {
        x: record.bounds.left,
        y: record.bounds.top,
        width: record.bounds.right - record.bounds.left,
        height: record.bounds.bottom - record.bounds.top
      }
    });
  }
  return masks;
}
