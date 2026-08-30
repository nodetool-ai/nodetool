import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import { tagAsServer } from "@nodetool-ai/nodes-utils";
import { importHidden } from "@nodetool-ai/config";
import type { Platform } from "@nodetool-ai/protocol";

// SVGToImage rasterizes via the native `sharp` addon, so it is Node-only (its
// per-class override below wins over the list-level tagAsServer). Document is a
// pure string generator and stays server-portable.
const NODE_ONLY: readonly Platform[] = ["node"];

/** Actionable error thrown by SVGToImage when the native `sharp` addon is absent. */
const SHARP_UNAVAILABLE_MESSAGE =
  "SVG to Image requires the native 'sharp' addon, which is only available on a " +
  "Node server (install/reinstall sharp for this platform/arch — e.g. musl or a " +
  "serverless target). It is not available in the browser/edge/workers.";

// `sharp` is a native Node addon. Load it via a bundler-hidden import that
// resolves null off-Node (browser/edge/workers) or when the addon is missing
// (musl, unbundled serverless, ABI mismatch), so the caller throws a clear
// actionable error rather than an opaque module-load throw. A rejected attempt
// is never cached, so a fixed install is picked up on the next call.
type SharpModule = typeof import("sharp");
type SharpFn = SharpModule["default"];

/** sharp's CJS export is either the callable itself or a namespace with `default`. */
function isSharpFn(mod: SharpModule | SharpFn): mod is SharpFn {
  return typeof mod === "function";
}

let _sharpPromise: Promise<SharpFn | null> | null = null;
async function loadSharp(): Promise<SharpFn | null> {
  if (!_sharpPromise) {
    const attempt = (async (): Promise<SharpFn | null> => {
      const mod = await importHidden<SharpModule | SharpFn>("sharp");
      if (!mod) return null;
      if (isSharpFn(mod)) return mod;
      return mod.default ?? null;
    })();
    _sharpPromise = attempt;
    attempt.catch(() => {
      if (_sharpPromise === attempt) _sharpPromise = null;
    });
  }
  return _sharpPromise.catch(() => null);
}

type SvgElementLike = {
  name: string;
  attributes?: Record<string, string>;
  children?: SvgElementLike[];
  content?: string;
};

/**
 * What a `list[svg_element]` slot delivers: an element, a nested list of them,
 * or a scalar somebody wired straight into the slot.
 */
type SvgContent =
  | SvgElementLike
  | SvgContent[]
  | string
  | number
  | boolean
  | null
  | undefined;

function isSvgElement(content: SvgContent): content is SvgElementLike {
  return (
    content !== null &&
    typeof content === "object" &&
    !Array.isArray(content) &&
    "name" in content
  );
}

function escapeXmlText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeXmlAttribute(value: string): string {
  return escapeXmlText(value).replaceAll('"', "&quot;");
}

function elementToString(el: SvgElementLike): string {
  const attrs = Object.entries(el.attributes ?? {})
    .map(([k, v]) => `${k}="${escapeXmlAttribute(String(v))}"`)
    .join(" ");
  const open = attrs ? `<${el.name} ${attrs}>` : `<${el.name}>`;
  const children = (el.children ?? []).map(elementToString).join("");
  const content = escapeXmlText(el.content ?? "");
  return `${open}${content}${children}</${el.name}>`;
}

function svgDocument(
  content: string,
  width: number,
  height: number,
  viewBox: string
): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${viewBox}">${content}</svg>`;
}

function normalizeContent(content: SvgContent): string {
  if (Array.isArray(content)) {
    return content.map((child) => normalizeContent(child)).join("\n");
  }
  if (isSvgElement(content)) {
    return elementToString(content);
  }
  return String(content ?? "");
}

/** Output handles DocumentLibNode.process() emits. */
type DocumentLibNodeOutputs = {
  output: { data: string };
};

export class DocumentLibNode extends BaseNode {
  static readonly nodeType = "lib.svg.Document";
  static readonly retrySafe = true;
  static readonly title = "SVG Document";
  static readonly description =
    "Combine SVG elements into a complete SVG document.\n    svg, document, combine\n\n    Use cases:\n    - Combine multiple SVG elements into a single document\n    - Set document-level properties like viewBox and dimensions\n    - Export complete SVG documents";
  static readonly inlineFields = [];
  static readonly inputFields = ["elements"];
  static readonly metadataOutputTypes = {
    output: "svg"
  };

  @prop({
    type: "list[svg_element]",
    default: [],
    title: "Elements",
    description: "List of SVG elements"
  })
  declare elements: any;

  @prop({
    type: "int",
    default: 800,
    title: "Width",
    description: "Document width",
    min: 1,
    max: 4096
  })
  declare width: any;

  @prop({
    type: "int",
    default: 600,
    title: "Height",
    description: "Document height",
    min: 1,
    max: 4096
  })
  declare height: any;

  @prop({
    type: "str",
    default: "0 0 800 600",
    title: "Viewbox",
    description: "SVG viewBox attribute"
  })
  declare viewBox: any;

  async process(): Promise<DocumentLibNodeOutputs> {
    const content = normalizeContent(this.elements ?? []);
    const width = Number(this.width ?? 800);
    const height = Number(this.height ?? 600);
    const viewBox = String(this.viewBox ?? "0 0 800 600");
    const doc = svgDocument(content, width, height, viewBox);
    return { output: { data: Buffer.from(doc, "utf-8").toString("base64") } };
  }
}

/** Output handles SVGToImageLibNode.process() emits. */
type SVGToImageLibNodeOutputs = {
  output: {
    type: string;
    data: string;
    mimeType: string;
    width: number;
    height: number;
  };
};

export class SVGToImageLibNode extends BaseNode {
  static readonly nodeType = "lib.svg.SVGToImage";
  static readonly retrySafe = true;
  // Native `sharp` rasterization — Node only. Overrides the LIB_SVG_NODES
  // tagAsServer tag (per-class platforms always win over the list tagger).
  static readonly platforms = NODE_ONLY;
  static readonly title = "SVG to Image";
  static readonly description =
    "Create an SVG document and convert it to a raster image in one step.\n    svg, document, raster, convert\n\n    Use cases:\n    - Create and rasterize SVG documents in a single operation\n    - Generate image files from SVG elements\n    - Convert vector graphics to bitmap format with custom dimensions";
  static readonly inlineFields = [];
  static readonly inputFields = ["elements"];
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "list[svg_element]",
    default: [],
    title: "Elements",
    description: "List of SVG elements"
  })
  declare elements: any;

  @prop({
    type: "int",
    default: 800,
    title: "Width",
    description: "Document width",
    min: 1,
    max: 4096
  })
  declare width: any;

  @prop({
    type: "int",
    default: 600,
    title: "Height",
    description: "Document height",
    min: 1,
    max: 4096
  })
  declare height: any;

  @prop({
    type: "str",
    default: "0 0 800 600",
    title: "Viewbox",
    description: "SVG viewBox attribute"
  })
  declare viewBox: any;

  @prop({
    type: "int",
    default: 1,
    title: "Scale",
    description: "Scale factor for rasterization",
    min: 1,
    max: 10
  })
  declare scale: any;

  async process(): Promise<SVGToImageLibNodeOutputs> {
    const sharp = await loadSharp();
    if (!sharp) throw new Error(SHARP_UNAVAILABLE_MESSAGE);
    const content = normalizeContent(this.elements ?? []);
    const width = Number(this.width ?? 800);
    const height = Number(this.height ?? 600);
    const scale = Number(this.scale ?? 1);
    const viewBox = String(this.viewBox ?? "0 0 800 600");
    const doc = svgDocument(content, width, height, viewBox);
    const svgBuffer = Buffer.from(doc, "utf-8");
    const pngBuffer = await sharp(svgBuffer, { density: 72 * scale })
      .resize(width * scale, height * scale)
      .png()
      .toBuffer();
    return {
      output: {
        type: "image",
        data: pngBuffer.toString("base64"),
        mimeType: "image/png",
        width: width * scale,
        height: height * scale
      }
    };
  }
}

export const LIB_SVG_NODES = tagAsServer([DocumentLibNode, SVGToImageLibNode]);
