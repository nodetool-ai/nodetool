/**
 * `@nodetool-ai/sandbox-pdflib` — pdf-lib, on the host.
 *
 * pdf-lib builds and merges PDF documents from class instances that cannot
 * cross the guest boundary. The guest describes pages as JSON; this module
 * turns that into PDF bytes.
 */

import { toGuestBytes } from "../sandbox-bytes.js";
import { optionsOf, requireBytes, unwrapLibrary } from "./limits.js";

const MAX_PAGE = 8192;
const MAX_PAGES = 200;

interface PdfLibLike {
  PDFDocument: {
    create: () => Promise<PdfDoc>;
    load: (data: Uint8Array) => Promise<PdfDoc>;
  };
  StandardFonts: { Helvetica: unknown };
  rgb: (r: number, g: number, b: number) => unknown;
}

interface PdfDoc {
  addPage: (size?: [number, number] | PdfPage) => PdfPage;
  getPageCount: () => number;
  getPage: (index: number) => PdfPage;
  getPages: () => PdfPage[];
  embedFont: (font: unknown) => Promise<PdfFont>;
  embedPng: (bytes: Uint8Array) => Promise<PdfImage>;
  embedJpg: (bytes: Uint8Array) => Promise<PdfImage>;
  copyPages: (src: PdfDoc, indices: number[]) => Promise<PdfPage[]>;
  save: () => Promise<Uint8Array>;
}

interface PdfPage {
  getSize: () => { width: number; height: number };
  drawText: (text: string, opts: Record<string, unknown>) => void;
  drawImage: (image: PdfImage, opts: Record<string, unknown>) => void;
}

interface PdfFont {
  widthOfTextAtSize: (text: string, size: number) => number;
}

interface PdfImage {
  width: number;
  height: number;
}

async function loadPdfLib(where: string): Promise<PdfLibLike> {
  const mod: unknown = await import("pdf-lib");
  return unwrapLibrary<PdfLibLike>(
    mod,
    where,
    "pdf-lib",
    (v) => typeof (v as PdfLibLike | undefined)?.PDFDocument?.create === "function"
  );
}

function pageSize(where: string, width: unknown, height: unknown): [number, number] {
  const w = Number(width ?? 612);
  const h = Number(height ?? 792);
  if (!Number.isFinite(w) || w <= 0 || w > MAX_PAGE) {
    throw new Error(`${where}: width must be a positive number up to ${MAX_PAGE}`);
  }
  if (!Number.isFinite(h) || h <= 0 || h > MAX_PAGE) {
    throw new Error(`${where}: height must be a positive number up to ${MAX_PAGE}`);
  }
  return [w, h];
}

function parseRgb(
  lib: PdfLibLike,
  color: unknown
): ReturnType<PdfLibLike["rgb"]> {
  if (typeof color !== "string" || !color.trim()) {
    return lib.rgb(0, 0, 0);
  }
  let hex = color.trim().replace(/^#/, "");
  if (hex.length === 3) {
    hex = `${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`;
  }
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) {
    return lib.rgb(0, 0, 0);
  }
  return lib.rgb(
    parseInt(hex.slice(0, 2), 16) / 255,
    parseInt(hex.slice(2, 4), 16) / 255,
    parseInt(hex.slice(4, 6), 16) / 255
  );
}

function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

async function drawItems(
  where: string,
  lib: PdfLibLike,
  doc: PdfDoc,
  page: PdfPage,
  items: unknown[]
): Promise<void> {
  const font = await doc.embedFont(lib.StandardFonts.Helvetica);
  const { height } = page.getSize();
  for (let i = 0; i < items.length; i += 1) {
    const raw = items[i];
    if (raw === null || typeof raw !== "object") {
      throw new Error(`${where}: items[${i}] must be an object`);
    }
    const item = raw as Record<string, unknown>;
    const type = String(item.type ?? "");
    if (type === "text") {
      const size = Number(item.size ?? 12);
      const x = Number(item.x ?? 0);
      const yTop = Number(item.y ?? 0);
      page.drawText(String(item.text ?? ""), {
        x,
        y: height - yTop - size,
        size,
        font,
        color: parseRgb(lib, item.color)
      });
      continue;
    }
    if (type === "image") {
      const data = requireBytes(`${where}: items[${i}]`, item.data, "data");
      const image = isJpeg(data) ? await doc.embedJpg(data) : await doc.embedPng(data);
      const w = Number(item.width ?? image.width);
      const h = Number(item.height ?? image.height);
      const x = Number(item.x ?? 0);
      const yTop = Number(item.y ?? 0);
      page.drawImage(image, {
        x,
        y: height - yTop - h,
        width: w,
        height: h
      });
      continue;
    }
    throw new Error(`${where}: items[${i}] has unknown type "${type}"`);
  }
}

/**
 * Build a PDF from a JSON page list. Origin for items is top-left, in points.
 */
export async function build(spec: unknown): Promise<unknown> {
  const where = "pdflib.build";
  const input = optionsOf(spec);
  const pages = Array.isArray(input.pages) ? input.pages : [];
  if (pages.length === 0) {
    throw new Error(`${where}: provide at least one page`);
  }
  if (pages.length > MAX_PAGES) {
    throw new Error(`${where}: at most ${MAX_PAGES} pages`);
  }
  const lib = await loadPdfLib(where);
  const doc = await lib.PDFDocument.create();
  for (let i = 0; i < pages.length; i += 1) {
    const raw = pages[i];
    if (raw === null || typeof raw !== "object") {
      throw new Error(`${where}: pages[${i}] must be an object`);
    }
    const pageSpec = raw as Record<string, unknown>;
    const [width, height] = pageSize(
      `${where}: pages[${i}]`,
      pageSpec.width,
      pageSpec.height
    );
    const page = doc.addPage([width, height]);
    const items = Array.isArray(pageSpec.items) ? pageSpec.items : [];
    await drawItems(`${where}: pages[${i}]`, lib, doc, page, items);
  }
  return toGuestBytes(await doc.save());
}

/**
 * Concatenate PDF byte arrays in order.
 */
export async function merge(pdfs: unknown): Promise<unknown> {
  const where = "pdflib.merge";
  if (!Array.isArray(pdfs) || pdfs.length === 0) {
    throw new Error(`${where}: provide a non-empty array of PDF byte arrays`);
  }
  if (pdfs.length > MAX_PAGES) {
    throw new Error(`${where}: at most ${MAX_PAGES} documents`);
  }
  const lib = await loadPdfLib(where);
  const out = await lib.PDFDocument.create();
  for (let i = 0; i < pdfs.length; i += 1) {
    const bytes = requireBytes(`${where}: pdfs[${i}]`, pdfs[i], "pdf");
    const src = await lib.PDFDocument.load(bytes);
    const count = src.getPageCount();
    const indices = Array.from({ length: count }, (_, n) => n);
    const copied = await out.copyPages(src, indices);
    for (const page of copied) {
      out.addPage(page);
    }
  }
  return toGuestBytes(await out.save());
}
