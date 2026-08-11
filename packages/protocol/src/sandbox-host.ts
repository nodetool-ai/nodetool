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
  if (typeof hostId !== "string" || hostId.length === 0) {
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
