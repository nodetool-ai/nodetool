/**
 * Host-JS sandbox modules: the first-party registry, and the facade generator
 * that expresses one as guest JavaScript.
 *
 * A **host module** is a library NodeTool runs on the host — papaparse,
 * cheerio, exceljs — reached from the guest through a generated ESM facade
 * over a per-run dispatcher. It is the host-JS analog of a WASM module: the
 * guest sees `import`, the implementation never enters QuickJS, and the
 * library's safety limits live in the implementation where nothing can bypass
 * them.
 *
 * **A pack cannot bring one.** The `host` manifest kind carries an *id*, and an
 * id resolves only through {@link SANDBOX_HOST_MODULES} — NodeTool's own table,
 * which also pins the package name allowed to declare it. A third-party
 * manifest naming an unknown id is refused at discovery; one naming a known id
 * from the wrong package is refused too, so `@evil/x` cannot claim
 * `@nodetool-ai/sandbox-csv`'s implementation. The dispatcher repeats both
 * checks per call, because the boundary is enforcement, not declaration.
 *
 * Everything here is pure and browser-safe. It lives in `protocol` because
 * `node-sdk` validates a manifest against it, `agents` mounts the facade and
 * dispatches through it, and the browser catalog rebuilds a resolved module
 * from it — three places that must not disagree.
 */

import { isNonEmptyString } from "./predicates.js";

/** One host module NodeTool implements, and the pack allowed to declare it. */
export interface SandboxHostModuleSpec {
  /** Registry id, as written in a manifest's `host` field. */
  readonly id: string;
  /** The only package name that may declare this id. */
  readonly packName: string;
  /** The host-side library behind it. */
  readonly library: string;
  /** One line for the prompt tier and the catalog summary. */
  readonly description: string;
  /** Exported function names, in facade order. Nothing else is callable. */
  readonly exports: readonly string[];
}

/**
 * Every host module NodeTool ships.
 *
 * Adding a row is a NodeTool change — an implementation has to exist in
 * `@nodetool-ai/agents` for the id to dispatch — which is exactly the property
 * that keeps host execution out of third-party hands.
 */
export const SANDBOX_HOST_MODULES: Readonly<Record<string, SandboxHostModuleSpec>> = {
  csv: {
    id: "csv",
    packName: "@nodetool-ai/sandbox-csv",
    library: "papaparse",
    description: "Parse and write CSV text.",
    exports: ["parse", "stringify"]
  },
  html: {
    id: "html",
    packName: "@nodetool-ai/sandbox-html",
    library: "cheerio + turndown",
    description:
      "CSS selection over HTML, HTML to markdown/text, and link/media/metadata extraction.",
    exports: [
      "select",
      "toMarkdown",
      "toText",
      "extractLinks",
      "extractImages",
      "extractAudio",
      "extractVideos",
      "extractMetadata",
      "extractReadableText"
    ]
  },
  xml: {
    id: "xml",
    packName: "@nodetool-ai/sandbox-xml",
    library: "fast-xml-parser",
    description: "Parse XML (feeds, sitemaps) into a plain object.",
    exports: ["parse"]
  },
  xlsx: {
    id: "xlsx",
    packName: "@nodetool-ai/sandbox-xlsx",
    library: "exceljs",
    description: "Read and write Excel workbooks.",
    exports: ["parse", "write"]
  },
  ocr: {
    id: "ocr",
    packName: "@nodetool-ai/sandbox-ocr",
    library: "tesseract.js",
    description: "Read text out of an image, with per-word boxes.",
    exports: ["recognize"]
  },
  tfjs: {
    id: "tfjs",
    packName: "@nodetool-ai/sandbox-tfjs",
    library: "@tensorflow/tfjs + the tfjs model zoo",
    description:
      "Classify and embed images, detect objects, answer from a passage.",
    exports: ["classify", "embed", "detect", "answer"]
  },
  zip: {
    id: "zip",
    packName: "@nodetool-ai/sandbox-zip",
    library: "fflate",
    description: "Read and write zip archives, with an inflation cap.",
    exports: ["unzip", "zip"]
  },
  diff: {
    id: "diff",
    packName: "@nodetool-ai/sandbox-diff",
    library: "diff",
    description: "Unified diff of two texts.",
    exports: ["unified"]
  },
  aws: {
    id: "aws",
    packName: "@nodetool-ai/sandbox-aws",
    library: "NodeTool's SigV4 signer",
    description: "Sign an AWS request (S3 and friends) with Signature V4.",
    exports: ["sigv4", "presign"]
  },
  notion: {
    id: "notion",
    packName: "@nodetool-ai/sandbox-notion",
    library: "NodeTool's Notion helper",
    description: "Build a Notion API request, and read its rich text and blocks.",
    exports: ["request", "plainText", "toMarkdown"]
  },
  supabase: {
    id: "supabase",
    packName: "@nodetool-ai/sandbox-supabase",
    library: "NodeTool's PostgREST helper",
    description: "Build a Supabase REST or RPC request.",
    exports: ["from", "rpc"]
  },
  twilio: {
    id: "twilio",
    packName: "@nodetool-ai/sandbox-twilio",
    library: "NodeTool's Twilio helper",
    description: "Build an authenticated Twilio API request.",
    exports: ["request"]
  },
  apify: {
    id: "apify",
    packName: "@nodetool-ai/sandbox-apify",
    library: "NodeTool's Apify helper",
    description: "Build the start, poll, and dataset requests of an Apify run.",
    exports: ["startRun", "runStatus", "datasetItems"]
  },
  docx: {
    id: "docx",
    packName: "@nodetool-ai/sandbox-docx",
    library: "docx",
    description: "Build a Word document from headings, paragraphs, tables, and images.",
    exports: ["build"]
  },
  mammoth: {
    id: "mammoth",
    packName: "@nodetool-ai/sandbox-mammoth",
    library: "mammoth",
    description: "Read a Word document as plain text or HTML.",
    exports: ["extractRawText", "convertToHtml"]
  },
  epub: {
    id: "epub",
    packName: "@nodetool-ai/sandbox-epub",
    library: "epub2",
    description: "Read an EPUB's metadata, table of contents, and chapter text.",
    exports: ["metadata", "tableOfContents", "extractText", "extractChapters"]
  },
  pdf: {
    id: "pdf",
    packName: "@nodetool-ai/sandbox-pdf",
    library: "pdf-parse",
    description:
      "Extract a PDF's embedded text, whole or per page. No OCR of scanned pages.",
    exports: ["extractText", "extractPages"]
  },
  pptx: {
    id: "pptx",
    packName: "@nodetool-ai/sandbox-pptx",
    library: "office-text-extractor",
    description: "Extract text from a PowerPoint file, whole or per slide.",
    exports: ["extractText", "extractSlides"]
  },
  fabric: {
    id: "fabric",
    packName: "@nodetool-ai/sandbox-fabric",
    library: "fabric",
    description:
      "Build, parse, and rasterize SVG with Fabric.js (renderSVG, loadSVG, render).",
    exports: ["render", "renderSVG", "loadSVG", "toDataURL"]
  },
  pdflib: {
    id: "pdflib",
    packName: "@nodetool-ai/sandbox-pdflib",
    library: "pdf-lib",
    description: "Build and merge PDF files from a JSON page list.",
    exports: ["build", "merge"]
  },
  pptxgen: {
    id: "pptxgen",
    packName: "@nodetool-ai/sandbox-pptxgen",
    library: "pptxgenjs",
    description: "Build a PowerPoint file from a JSON slide list.",
    exports: ["build"]
  },
  chrono: {
    id: "chrono",
    packName: "@nodetool-ai/sandbox-chrono",
    library: "chrono-node",
    description: "Parse natural-language dates into ISO timestamps.",
    exports: ["parseDate", "parse"]
  },
  exif: {
    id: "exif",
    packName: "@nodetool-ai/sandbox-exif",
    library: "exifr",
    description: "Read EXIF and other photo metadata from image bytes.",
    exports: ["parse"]
  },
  expr: {
    id: "expr",
    packName: "@nodetool-ai/sandbox-expr",
    library: "expr-eval",
    description: "Evaluate a math formula without eval.",
    exports: ["evaluate"]
  },
  ics: {
    id: "ics",
    packName: "@nodetool-ai/sandbox-ics",
    library: "ics",
    description: "Build iCalendar (.ics) text from event objects.",
    exports: ["createEvent", "createEvents"]
  },
  subtitle: {
    id: "subtitle",
    packName: "@nodetool-ai/sandbox-subtitle",
    library: "subtitle",
    description: "Parse and write SRT and WebVTT captions.",
    exports: ["parse", "stringify"]
  }
} as const;

/** The host module a registry id names, or `undefined` for anything else. */
export function sandboxHostModule(id: string): SandboxHostModuleSpec | undefined {
  return Object.hasOwn(SANDBOX_HOST_MODULES, id)
    ? SANDBOX_HOST_MODULES[id]
    : undefined;
}

/**
 * Why a `kind: "host"` declaration is not admissible, or `undefined` when it is.
 *
 * The text completes "…: " after the specifier, so a caller reads
 * `${packName}/${specifier}: ${reason}`.
 */
export function sandboxHostModuleViolation(
  packName: string,
  hostId: unknown
): string | undefined {
  if (!isNonEmptyString(hostId)) {
    return "a host module must name a host id";
  }
  const spec = sandboxHostModule(hostId);
  if (spec === undefined) {
    return `"${hostId}" is not a host module NodeTool implements — host modules are first-party only, and a pack cannot bring its own`;
  }
  if (spec.packName !== packName) {
    return `host module "${hostId}" belongs to ${spec.packName} and cannot be declared by ${packName}`;
  }
  return undefined;
}

/**
 * The facade generator's version.
 *
 * It joins a host module's content digest, so a change to the generated guest
 * surface invalidates a workflow's pinned digest. Bump it whenever
 * {@link generateSandboxHostFacade} or {@link SANDBOX_HOST_BRIDGE_SOURCE}
 * changes what the guest sees.
 */
export const SANDBOX_HOST_FACADE_VERSION = 2;

/**
 * The guest-visible name the host parks the dispatcher on.
 *
 * It exists only between the init prelude and the entry module's first
 * statement — long enough for the bridge module to capture it while the static
 * graph evaluates, then deleted. The hiding is convenience; the dispatcher's
 * own checks are the boundary.
 */
export const SANDBOX_HOST_DISPATCH_GLOBAL = "__nodetoolHostDispatch";

/**
 * The private bridge module every facade imports.
 *
 * Guest code cannot import it: the loader refuses the specifier from any module
 * that is not a generated facade, and the static analyzer refuses it in
 * authored source.
 */
export const SANDBOX_HOST_BRIDGE_SPECIFIER = "nodetool:host-bridge";

/**
 * The bridge module's source.
 *
 * It reads the dispatcher once, at module-evaluation time — which happens while
 * the entry module's static graph links, before the entry body deletes the
 * binding.
 */
export const SANDBOX_HOST_BRIDGE_SOURCE = `const __dispatch = globalThis.${SANDBOX_HOST_DISPATCH_GLOBAL};
export const __call = (moduleKey, exportName, args) => {
  if (typeof __dispatch !== "function") {
    throw new Error("the sandbox host bridge is unavailable in this run");
  }
  return __dispatch(moduleKey, exportName, args);
};
`;

/**
 * Generate the ESM facade for one host module.
 *
 * One named async export per registry export, plus a default namespace object
 * so `import csv from "@nodetool-ai/sandbox-csv"` reads the way the library
 * does. Nothing else is exposed: no way to name a module other than this one,
 * and no export the registry does not list.
 */
export function generateSandboxHostFacade(
  moduleKey: string,
  spec: SandboxHostModuleSpec
): string {
  const body = spec.exports
    .map(
      (exported) =>
        `export async function ${exported}(...args) {\n  return __call(${JSON.stringify(moduleKey)}, ${JSON.stringify(exported)}, args);\n}`
    )
    .join("\n");
  const namespace = spec.exports.join(", ");
  return `import { __call } from ${JSON.stringify(SANDBOX_HOST_BRIDGE_SPECIFIER)};
${body}
export default { ${namespace} };
`;
}
