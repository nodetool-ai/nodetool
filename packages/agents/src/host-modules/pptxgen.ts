/**
 * `@nodetool-ai/sandbox-pptxgen` — PptxGenJS, on the host.
 *
 * PptxGenJS builds a presentation from class instances that cannot cross the
 * guest boundary. The guest describes slides as JSON; this module turns that
 * into PPTX bytes.
 */

import { toGuestBytes, type GuestBytes } from "../sandbox-bytes.js";
import { optionsOf, requireBytes, unwrapLibrary } from "./limits.js";
import {
  isFunction,
  isObjectLike,
  isString
} from "../utils/type-guards.js";

const MAX_SLIDES = 200;

interface PptxGenCtor {
  new (): PptxPres;
}

interface PptxPres {
  title?: string;
  author?: string;
  subject?: string;
  addSlide: () => PptxSlide;
  write: (opts: { outputType: "uint8array" }) => Promise<Uint8Array>;
}

interface PptxSlide {
  addText: (text: string, opts: Record<string, unknown>) => void;
  addImage: (opts: Record<string, unknown>) => void;
  addShape: (shape: string, opts: Record<string, unknown>) => void;
  background?: { color?: string };
}

async function loadPptxGen(where: string): Promise<PptxGenCtor> {
  const mod: unknown = await import("pptxgenjs");
  const ctor = unwrapLibrary<PptxGenCtor>(
    mod,
    where,
    "pptxgenjs",
    (v) => isFunction(v)
  );
  return ctor;
}

function toDataUrl(bytes: Uint8Array): string {
  const jpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8;
  const b64 = Buffer.from(bytes).toString("base64");
  return `data:image/${jpeg ? "jpeg" : "png"};base64,${b64}`;
}

/**
 * Build a PPTX from a JSON slide list. Positions are inches from the top-left.
 */
export async function build(spec: unknown): Promise<GuestBytes> {
  const where = "pptxgen.build";
  const input = optionsOf(spec);
  const slides = Array.isArray(input.slides) ? input.slides : [];
  if (slides.length === 0) {
    throw new Error(`${where}: provide at least one slide`);
  }
  if (slides.length > MAX_SLIDES) {
    throw new Error(`${where}: at most ${MAX_SLIDES} slides`);
  }
  const PptxGen = await loadPptxGen(where);
  const pres = new PptxGen();
  if (isString(input.title)) {
    pres.title = input.title;
  }
  if (isString(input.author)) {
    pres.author = input.author;
  }
  if (isString(input.subject)) {
    pres.subject = input.subject;
  }

  for (let i = 0; i < slides.length; i += 1) {
    const raw = slides[i];
    if (!isObjectLike(raw)) {
      throw new Error(`${where}: slides[${i}] must be an object`);
    }
    const slideSpec = raw as Record<string, unknown>;
    const slide = pres.addSlide();
    if (isString(slideSpec.background)) {
      slide.background = { color: slideSpec.background.replace(/^#/, "") };
    }
    const items = Array.isArray(slideSpec.items) ? slideSpec.items : [];
    for (let j = 0; j < items.length; j += 1) {
      const itemRaw = items[j];
      if (!isObjectLike(itemRaw)) {
        throw new Error(`${where}: slides[${i}].items[${j}] must be an object`);
      }
      const item = itemRaw as Record<string, unknown>;
      const type = String(item.type ?? "");
      const box = {
        x: Number(item.x ?? 0.5),
        y: Number(item.y ?? 0.5),
        w: Number(item.w ?? item.width ?? 8),
        h: Number(item.h ?? item.height ?? 1)
      };
      if (type === "text") {
        slide.addText(String(item.text ?? ""), {
          ...box,
          fontSize: Number(item.fontSize ?? 18),
          color: String(item.color ?? "000000").replace(/^#/, ""),
          bold: Boolean(item.bold),
          align: item.align ?? "left"
        });
        continue;
      }
      if (type === "image") {
        const data = requireBytes(
          `${where}: slides[${i}].items[${j}]`,
          item.data,
          "data"
        );
        slide.addImage({ ...box, data: toDataUrl(data) });
        continue;
      }
      if (type === "shape") {
        slide.addShape(String(item.shape ?? "rect"), {
          ...box,
          fill: { color: String(item.fill ?? "2563eb").replace(/^#/, "") }
        });
        continue;
      }
      throw new Error(
        `${where}: slides[${i}].items[${j}] has unknown type "${type}"`
      );
    }
  }

  const bytes = await pres.write({ outputType: "uint8array" });
  return toGuestBytes(bytes);
}
