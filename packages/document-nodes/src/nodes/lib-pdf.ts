/**
 * PDF rasterization nodes.
 *
 * Renders PDF pages to PNG (via PDFium) or other raster formats (via
 * poppler's pdftoppm).
 */
import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";

import {
  requireDocumentBytes,
  type DocumentRefLike
} from "../document-bytes.js";

async function resolvePdfBuffer(
  pdf: DocumentRefLike,
  context?: ProcessingContext
): Promise<Buffer> {
  return requireDocumentBytes(pdf, context, "PDF");
}

function resolvePageRange(
  startPage: number,
  endPage: number,
  totalPages: number
): [number, number] {
  const start = Math.max(0, startPage);
  const end =
    endPage === -1 ? totalPages - 1 : Math.min(endPage, totalPages - 1);
  return [start, end];
}

/** Standard page-range props shared by most nodes. */
const PDF_INPUT = {
  type: "document" as const,
  default: {
    type: "document",
    uri: "",
    asset_id: null,
    data: null,
    metadata: null
  },
  title: "PDF",
  description: "The PDF document to process"
};

export class PdfScreenshotNode extends BaseNode {
  static readonly nodeType = "lib.pdf.Screenshot";
  static readonly title = "PDF Page Screenshot";
  static readonly description =
    "Render PDF pages as PNG images.\n    pdf, screenshot, render, image, pages, png";
  static readonly inlineFields = [];
  static readonly inputFields = ["pdf"];
  static readonly metadataOutputTypes = { output: "list[image]" };

  @prop(PDF_INPUT)
  declare pdf: any;

  @prop({
    type: "int",
    default: 0,
    title: "Start Page",
    description: "First page to render (0-based)"
  })
  declare start_page: any;

  @prop({
    type: "int",
    default: -1,
    title: "End Page",
    description: "Last page to render (-1 for all)"
  })
  declare end_page: any;

  @prop({
    type: "int",
    default: 150,
    title: "DPI",
    description: "Rendering resolution in dots per inch",
    min: 72,
    max: 600
  })
  declare dpi: any;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    // Bypass liteparse's parser.screenshot(): it loads the same buffer into
    // pdf.js *and* PDFium, but pdf.js detaches the underlying ArrayBuffer
    // during its load, leaving PDFium with a detached buffer (→ "File not in
    // PDF format or corrupted"). Render directly via PDFium + sharp.
    const [{ PDFiumLibrary }, sharpModule] = await Promise.all([
      import("@hyzyla/pdfium"),
      import("sharp")
    ]);
    const sharp = sharpModule.default;
    const pdfBuffer = await resolvePdfBuffer(
      (this.pdf ?? {}) as DocumentRefLike,
      context
    );
    const dpi = Number(this.dpi ?? 150);
    const scale = dpi / 72;

    const lib = await PDFiumLibrary.init();
    const images: { type: string; data: string }[] = [];
    let doc: Awaited<ReturnType<typeof lib.loadDocument>> | null = null;
    try {
      doc = await lib.loadDocument(Buffer.from(pdfBuffer));
      const totalPages = doc.getPageCount();
      const [start, end] = resolvePageRange(
        Number(this.start_page ?? 0),
        Number(this.end_page ?? -1),
        totalPages
      );
      for (let i = start; i <= end; i++) {
        const page = doc.getPage(i);
        const image = await page.render({
          scale,
          render: async (options) =>
            sharp(options.data, {
              raw: {
                width: options.width,
                height: options.height,
                channels: 4
              }
            })
              .png({ compressionLevel: 6 })
              .withMetadata({ density: dpi })
              .toBuffer()
        });
        images.push({
          type: "image",
          data: Buffer.from(image.data).toString("base64")
        });
      }
    } finally {
      if (doc) doc.destroy();
      lib.destroy();
    }
    return { output: images };
  }
}

export class PdfToppmNode extends BaseNode {
  static readonly nodeType = "lib.pdf.Pdftoppm";
  static readonly title = "PDF Rasterize (pdftoppm)";
  static readonly description =
    "Rasterize PDF pages with poppler's pdftoppm. Higher fidelity than the PDFium-based Screenshot node for some PDFs and supports anti-aliasing controls.\n    pdf, pdftoppm, poppler, rasterize, render, image, pages";
  static readonly inlineFields = [];
  static readonly inputFields = ["pdf"];
  static readonly metadataOutputTypes = { output: "list[image]" };
  static readonly requiredRuntimes = ["pdftoppm"];

  @prop(PDF_INPUT)
  declare pdf: any;

  @prop({
    type: "int",
    default: 0,
    title: "Start Page",
    description: "First page to render (0-based)"
  })
  declare start_page: any;

  @prop({
    type: "int",
    default: -1,
    title: "End Page",
    description: "Last page to render (-1 for all)"
  })
  declare end_page: any;

  @prop({
    type: "int",
    default: 150,
    title: "DPI",
    description: "Rendering resolution in dots per inch",
    min: 36,
    max: 600
  })
  declare dpi: any;

  @prop({
    type: "enum",
    default: "png",
    values: ["png", "jpeg", "tiff"],
    title: "Format",
    description: "Output image format"
  })
  declare format: any;

  @prop({
    type: "int",
    default: 0,
    title: "Scale To (px)",
    description:
      "If > 0, scale the longest side to this many pixels (overrides DPI)",
    min: 0,
    max: 8192
  })
  declare scale_to: any;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const { promises: fs } = await import("node:fs");
    const os = await import("node:os");
    const path = await import("node:path");
    const execFileAsync = promisify(execFile);

    const pdfBuffer = await resolvePdfBuffer(
      (this.pdf ?? {}) as DocumentRefLike,
      context
    );
    const dpi = Number(this.dpi ?? 150);
    const scaleTo = Number(this.scale_to ?? 0);
    const format = String(this.format ?? "png").toLowerCase();
    const formatFlag =
      format === "jpeg" ? "-jpeg" : format === "tiff" ? "-tiff" : "-png";
    const ext = format === "jpeg" ? "jpg" : format;

    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "nodetool-pdftoppm-"));
    const inputPath = path.join(dir, "input.pdf");
    const outputPrefix = path.join(dir, "page");
    try {
      await fs.writeFile(inputPath, pdfBuffer);

      // pdftoppm uses 1-based page numbers.
      const totalPages = await countPdfPages(pdfBuffer);
      const [start, end] = resolvePageRange(
        Number(this.start_page ?? 0),
        Number(this.end_page ?? -1),
        totalPages
      );

      const args: string[] = [formatFlag];
      if (scaleTo > 0) {
        args.push("-scale-to", String(scaleTo));
      } else {
        args.push("-r", String(dpi));
      }
      args.push(
        "-f", String(start + 1),
        "-l", String(end + 1),
        inputPath,
        outputPrefix
      );

      await execFileAsync("pdftoppm", args, { maxBuffer: 64 * 1024 * 1024 });

      const entries = await fs.readdir(dir);
      const images: { type: string; data: string }[] = [];
      const pageFiles = entries
        .filter((n) => n.startsWith("page-") && n.endsWith(`.${ext}`))
        .sort();
      for (const name of pageFiles) {
        const buf = await fs.readFile(path.join(dir, name));
        images.push({
          type: "image",
          data: Buffer.from(buf).toString("base64")
        });
      }
      return { output: images };
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }
}

async function countPdfPages(pdf: Buffer): Promise<number> {
  const { PDFiumLibrary } = await import("@hyzyla/pdfium");
  const lib = await PDFiumLibrary.init();
  let doc: Awaited<ReturnType<typeof lib.loadDocument>> | null = null;
  try {
    doc = await lib.loadDocument(pdf);
    return doc.getPageCount();
  } finally {
    if (doc) doc.destroy();
    lib.destroy();
  }
}

// Node-only: both nodes depend on native pdfium (@hyzyla/pdfium) and
// PdfToppmNode spawns `pdftoppm` via node:child_process + os.tmpdir().
// Workers/edge have no native addons and no subprocess, so these can never
// run there. Untagged → registry default ["node"].
export const LIB_PDF_NODES = [PdfScreenshotNode, PdfToppmNode];
