/**
 * The implementations behind NodeTool's host module ids.
 *
 * `SANDBOX_HOST_MODULES` in `@nodetool-ai/protocol` declares *what* exists —
 * ids, owning packs, export names — because node-sdk validates a manifest
 * against it and the browser rebuilds a facade from it. This is the other half:
 * the functions, which only a host runs.
 *
 * Every entry is loaded lazily. Nothing here sits in an entry graph, so a
 * process that never runs a Code node importing `@nodetool-ai/sandbox-xlsx`
 * never loads exceljs — the same property the old `data.*` bridges had, kept
 * for the same reason.
 */

import { SANDBOX_HOST_MODULES } from "@nodetool-ai/protocol";

/** One host module's exports: named async functions over plain data. */
export type SandboxHostModuleImplementation = Readonly<
  Record<string, (...args: unknown[]) => Promise<unknown>>
>;

type Loader = () => Promise<SandboxHostModuleImplementation>;

const LOADERS: Readonly<Record<string, Loader>> = {
  csv: async () => {
    const mod = await import("./csv.js");
    return { parse: mod.parse, stringify: mod.stringify };
  },
  html: async () => {
    const mod = await import("./html.js");
    return {
      select: mod.select,
      toMarkdown: mod.toMarkdown,
      toText: mod.toText,
      extractLinks: mod.extractLinks,
      extractImages: mod.extractImages,
      extractAudio: mod.extractAudio,
      extractVideos: mod.extractVideos,
      extractMetadata: mod.extractMetadata,
      extractReadableText: mod.extractReadableText
    };
  },
  xml: async () => {
    const mod = await import("./xml.js");
    return { parse: mod.parse };
  },
  xlsx: async () => {
    const mod = await import("./xlsx.js");
    return { parse: mod.parse, write: mod.write };
  },
  ocr: async () => {
    const mod = await import("./ocr.js");
    return { recognize: mod.recognize };
  },
  tfjs: async () => {
    const mod = await import("./tfjs.js");
    return {
      classify: mod.classify,
      embed: mod.embed,
      detect: mod.detect,
      answer: mod.answer
    };
  },
  zip: async () => {
    const mod = await import("./zip.js");
    return { unzip: mod.unzip, zip: mod.zip };
  },
  diff: async () => {
    const mod = await import("./diff.js");
    return { unified: mod.unified };
  },
  aws: async () => {
    const mod = await import("./aws.js");
    return { sigv4: mod.sigv4, presign: mod.presign };
  },
  notion: async () => {
    const mod = await import("./notion.js");
    return {
      request: mod.request,
      plainText: mod.plainText,
      toMarkdown: mod.toMarkdown
    };
  },
  supabase: async () => {
    const mod = await import("./supabase.js");
    return { from: mod.from, rpc: mod.rpc };
  },
  twilio: async () => {
    const mod = await import("./twilio.js");
    return { request: mod.request };
  },
  docx: async () => {
    const mod = await import("./docx.js");
    return { build: mod.build };
  },
  mammoth: async () => {
    const mod = await import("./mammoth.js");
    return { extractRawText: mod.extractRawText, convertToHtml: mod.convertToHtml };
  },
  epub: async () => {
    const mod = await import("./epub.js");
    return {
      metadata: mod.metadata,
      tableOfContents: mod.tableOfContents,
      extractText: mod.extractText,
      extractChapters: mod.extractChapters
    };
  },
  pdf: async () => {
    const mod = await import("./pdf.js");
    return { extractText: mod.extractText, extractPages: mod.extractPages };
  },
  pptx: async () => {
    const mod = await import("./pptx.js");
    return { extractText: mod.extractText, extractSlides: mod.extractSlides };
  },
  fabric: async () => {
    const mod = await import("./fabric.js");
    return {
      render: mod.render,
      renderSVG: mod.renderSVG,
      loadSVG: mod.loadSVG,
      toDataURL: mod.toDataURL
    };
  },
  pdflib: async () => {
    const mod = await import("./pdflib.js");
    return { build: mod.build, merge: mod.merge };
  },
  pptxgen: async () => {
    const mod = await import("./pptxgen.js");
    return { build: mod.build };
  },
  chrono: async () => {
    const mod = await import("./chrono.js");
    return { parseDate: mod.parseDate, parse: mod.parse };
  },
  exif: async () => {
    const mod = await import("./exif.js");
    return { parse: mod.parse };
  },
  expr: async () => {
    const mod = await import("./expr.js");
    return { evaluate: mod.evaluate };
  },
  ics: async () => {
    const mod = await import("./ics.js");
    return { createEvent: mod.createEvent, createEvents: mod.createEvents };
  },
  subtitle: async () => {
    const mod = await import("./subtitle.js");
    return { parse: mod.parse, stringify: mod.stringify };
  },
  tokens: async () => {
    const mod = await import("./tokens.js");
    return { count: mod.count, encode: mod.encode, decode: mod.decode };
  }
};

const cache = new Map<string, Promise<SandboxHostModuleImplementation>>();

/**
 * Load one host module's implementation, at most once per process.
 *
 * A miss is a programming error, not a guest-reachable path: the dispatcher
 * only asks for ids the catalog resolved, and the catalog only resolves ids
 * `SANDBOX_HOST_MODULES` lists.
 */
export function loadSandboxHostModule(
  hostId: string
): Promise<SandboxHostModuleImplementation> {
  const cached = cache.get(hostId);
  if (cached !== undefined) return cached;
  const loader = Object.hasOwn(LOADERS, hostId) ? LOADERS[hostId] : undefined;
  if (loader === undefined) {
    return Promise.reject(
      new Error(`no host module implementation is registered for "${hostId}"`)
    );
  }
  const loading = loader();
  cache.set(hostId, loading);
  void loading.catch(() => cache.delete(hostId));
  return loading;
}

/** Ids this process can actually serve. Every id in the protocol table. */
export function registeredSandboxHostModuleIds(): readonly string[] {
  return Object.keys(LOADERS).sort();
}

/**
 * Ids declared in the protocol table with no implementation here, or the other
 * way round. Always empty in a healthy build; the drift test asserts it.
 */
export function sandboxHostModuleDrift(): readonly string[] {
  const declared = new Set(Object.keys(SANDBOX_HOST_MODULES));
  const implemented = new Set(Object.keys(LOADERS));
  const drift: string[] = [];
  for (const id of declared) {
    if (!implemented.has(id)) drift.push(`${id} is declared but not implemented`);
  }
  for (const id of implemented) {
    if (!declared.has(id)) drift.push(`${id} is implemented but not declared`);
  }
  return drift.sort();
}
