/**
 * Serializable description of the guest surface `nodetool.code.Code` runs on.
 *
 * Every bridge, helper and limit here is read out of `js-sandbox.ts` rather
 * than restated, so a prompt or help text derived from the manifest cannot
 * advertise an API the sandbox does not marshal. Only the human prose
 * (signatures, descriptions) and `GUEST_GLOBALS_SNAPSHOT` — which no
 * synchronous host call can answer — are written here.
 */
import {
  buildSandbox,
  resolveSandboxLimits,
  DELETED_GUEST_GLOBALS,
  EXPOSED_BRIDGE_NAMES,
  GUEST_HELPER_NAMES,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_FORMAT_LOCALE,
  DEFAULT_SELECT_HTML_LIMIT,
  MAX_SELECT_HTML_LIMIT,
  MAX_LOOP_ITERATIONS,
  MAX_RANDOM_BYTES,
  MAX_PROGRESS_CALLS,
  MAX_PROGRESS_MESSAGE_CHARS,
  MAX_DATA_INPUT_CHARS,
  type ExposedBridgeName,
  type GuestHelperName
} from "../js-sandbox.js";
import {
  MAX_CANVAS_OPS,
  MAX_DECODE_PIXELS,
  MAX_IMAGE_INPUT_BYTES,
  MAX_IMAGE_PIXELS
} from "../sandbox-media.js";

/** The node this manifest describes. */
export const SANDBOX_MANIFEST_NODE_TYPE = "nodetool.code.Code";

export interface SandboxMemberDoc {
  /** Fully qualified guest name, e.g. `workspace.read`. */
  readonly name: string;
  readonly signature: string;
  readonly description: string;
  readonly async: boolean;
  /** Throws unless the node runs with a ProcessingContext. */
  readonly requiresContext?: boolean;
  /** No-op unless the caller passed an `onProgress` sink. */
  readonly requiresProgressSink?: boolean;
}

export interface SandboxBridgeDoc {
  readonly name: ExposedBridgeName;
  readonly kind: "function" | "namespace";
  readonly description: string;
  readonly members: readonly SandboxMemberDoc[];
  /** Sandbox plumbing, not part of the authoring surface. */
  readonly internal?: boolean;
}

export interface SandboxLimitDoc {
  readonly key: string;
  readonly description: string;
  readonly value: number;
  readonly unit: "bytes" | "chars" | "count" | "ms";
  /** Ceiling `resolveSandboxLimits` clamps a caller override to. */
  readonly ceiling?: number;
}

/**
 * A rule that holds for the guest, tagged with who it applies to.
 *
 * The audience is data rather than something a consumer infers from the prose:
 * a note about the node's declared outputs is nonsense to a CodeAct action,
 * which completes through `finish()`. Matching the wording to decide that
 * couples one file's prompt to another file's sentences, and rewording a note
 * would silently leak it into the wrong prompt.
 */
export interface SandboxNote {
  readonly text: string;
  /**
   * `"all"` (default) holds anywhere the sandbox runs. `"code-node"` holds only
   * for `nodetool.code.Code`, whose result contract is a returned object of
   * declared outputs.
   */
  readonly audience?: "all" | "code-node";
}

export interface SandboxManifest {
  readonly nodeType: typeof SANDBOX_MANIFEST_NODE_TYPE;
  readonly runtime: "quickjs";
  /** Every marshaled bridge, keyed by its guest name. */
  readonly bridges: { readonly [K in ExposedBridgeName]: SandboxBridgeDoc };
  /** Prelude-defined helpers that never call the host. */
  readonly guestHelpers: { readonly [K in GuestHelperName]: SandboxMemberDoc };
  /** QuickJS built-ins the guest can rely on. */
  readonly nativeGlobals: readonly string[];
  /** Names that exist in other JS runtimes but not here. */
  readonly blockedGlobals: readonly string[];
  readonly limits: readonly SandboxLimitDoc[];
  readonly notes: readonly SandboxNote[];
}

/**
 * Bridge documentation. The key set is pinned to `EXPOSED_BRIDGE_NAMES`: adding
 * a bridge without documenting it (or documenting one that is not marshaled) is
 * a type error.
 */
const BRIDGE_DOCS: { [K in ExposedBridgeName]: SandboxBridgeDoc } = {
  console: {
    name: "console",
    kind: "namespace",
    description: "Collected into the node's logs; not returned to the graph.",
    members: [
      {
        name: "console.log",
        signature: "console.log(...args) -> void",
        description: "Append a log line.",
        async: false
      },
      {
        name: "console.warn",
        signature: "console.warn(...args) -> void",
        description: "Append a log line tagged [warn].",
        async: false
      },
      {
        name: "console.error",
        signature: "console.error(...args) -> void",
        description: "Append a log line tagged [error].",
        async: false
      },
      {
        name: "console.info",
        signature: "console.info(...args) -> void",
        description: "Append a log line tagged [info].",
        async: false
      }
    ]
  },
  fetch: {
    name: "fetch",
    kind: "function",
    description:
      "HTTP client. Loopback, link-local and private addresses are refused.",
    members: [
      {
        name: "fetch",
        signature:
          "await fetch(url, options?) -> { ok, status, statusText, headers, body, json, text, bytes, arrayBuffer }",
        description:
          "`body` is the decoded text and `json` the parsed payload when the response is JSON; `text`, `bytes` and `arrayBuffer` are async methods on the response. A Uint8Array request body is sent as raw bytes, anything else non-string as JSON.",
        async: true
      }
    ]
  },
  crypto: {
    name: "crypto",
    kind: "namespace",
    description: "WebCrypto-backed hashing and randomness.",
    members: [
      {
        name: "crypto.randomUUID",
        signature: "crypto.randomUUID() -> string",
        description: "Random UUID v4.",
        async: false
      },
      {
        name: "crypto.getRandomValues",
        signature: "crypto.getRandomValues(length) -> Uint8Array",
        description: "Random bytes. Takes a length, not a target array.",
        async: false
      },
      {
        name: "crypto.digest",
        signature:
          "await crypto.digest(algorithm, data) -> Uint8Array // SHA-1 | SHA-256 | SHA-384 | SHA-512",
        description: "Hash a string or Uint8Array.",
        async: true
      },
      {
        name: "crypto.hmac",
        signature: "await crypto.hmac(algorithm, key, data) -> Uint8Array",
        description: "HMAC over a string or Uint8Array key and payload.",
        async: true
      }
    ]
  },
  uuid: {
    name: "uuid",
    kind: "function",
    description: "Shorthand for crypto.randomUUID.",
    members: [
      {
        name: "uuid",
        signature: "uuid() -> string",
        description: "Random UUID v4.",
        async: false
      }
    ]
  },
  sleep: {
    name: "sleep",
    kind: "function",
    description: "The only timer. setTimeout and setInterval do not exist.",
    members: [
      {
        name: "sleep",
        signature: "await sleep(ms) -> void",
        description: "Pause, capped at 5000 ms and cut short by cancellation.",
        async: true
      }
    ]
  },
  getSecret: {
    name: "getSecret",
    kind: "function",
    description: "Read a configured secret by name.",
    members: [
      {
        name: "getSecret",
        signature: "await getSecret(name) -> string | undefined",
        description:
          "Returns undefined when the secret is unset or the node runs without a context.",
        async: true
      }
    ]
  },
  workspace: {
    name: "workspace",
    kind: "namespace",
    description:
      "Files under the run's workspace directory. Paths escaping it are refused; every member throws without a context.",
    members: [
      {
        name: "workspace.read",
        signature: "await workspace.read(path) -> string",
        description: "Read a UTF-8 file.",
        async: true,
        requiresContext: true
      },
      {
        name: "workspace.write",
        signature: "await workspace.write(path, content) -> void",
        description: "Write a UTF-8 file, creating parent directories.",
        async: true,
        requiresContext: true
      },
      {
        name: "workspace.list",
        signature: "await workspace.list(path) -> string[]",
        description: "Directory entry names.",
        async: true,
        requiresContext: true
      },
      {
        name: "workspace.readBytes",
        signature: "await workspace.readBytes(path) -> Uint8Array",
        description: "Read a file as bytes.",
        async: true,
        requiresContext: true
      },
      {
        name: "workspace.writeBytes",
        signature: "await workspace.writeBytes(path, bytes) -> void",
        description: "Write a Uint8Array, creating parent directories.",
        async: true,
        requiresContext: true
      },
      {
        name: "workspace.stat",
        signature:
          "await workspace.stat(path) -> { exists, size, isDirectory, isFile, isSymlink, modifiedMs, createdMs, accessedMs }",
        description:
          "File metadata. A missing path returns { exists: false } rather than throwing.",
        async: true,
        requiresContext: true
      },
      {
        name: "workspace.root",
        signature: "await workspace.root() -> string",
        description: "Absolute path of the workspace root.",
        async: true,
        requiresContext: true
      },
      {
        name: "workspace.copy",
        signature: "await workspace.copy(src, dest) -> void",
        description: "Copy a file, creating parent directories.",
        async: true,
        requiresContext: true
      },
      {
        name: "workspace.move",
        signature: "await workspace.move(src, dest) -> void",
        description: "Move or rename a file, creating parent directories.",
        async: true,
        requiresContext: true
      },
      {
        name: "workspace.mkdir",
        signature: "await workspace.mkdir(path) -> void",
        description: "Create a directory and its parents.",
        async: true,
        requiresContext: true
      },
      {
        name: "workspace.remove",
        signature: "await workspace.remove(path) -> void",
        description:
          "Delete one file or one empty directory. Never removes a tree.",
        async: true,
        requiresContext: true
      }
    ]
  },
  assetToSandbox: {
    name: "assetToSandbox",
    kind: "function",
    description: "Materialize a stored asset as a workspace file.",
    members: [
      {
        name: "assetToSandbox",
        signature: "await assetToSandbox(assetId, path) -> string",
        description: "Returns the workspace path the asset was written to.",
        async: true,
        requiresContext: true
      }
    ]
  },
  sandboxToAsset: {
    name: "sandboxToAsset",
    kind: "function",
    description: "Store a workspace file as an asset reference.",
    members: [
      {
        name: "sandboxToAsset",
        signature: "await sandboxToAsset(path) -> AssetRef",
        description:
          "Returns the reference object to pass downstream. Return media as references; never re-encode them yourself.",
        async: true,
        requiresContext: true
      }
    ]
  },
  progress: {
    name: "progress",
    kind: "function",
    description: "Drive the node's progress bar during a long run.",
    members: [
      {
        name: "progress",
        signature: "progress(percent, message?) -> void",
        description:
          "Fire-and-forget. Percent is clamped to 0-100; rate-limited and a no-op when nothing listens.",
        async: false,
        requiresProgressSink: true
      }
    ]
  },
  format: {
    name: "format",
    kind: "namespace",
    description: `Locale-aware formatting. QuickJS has no Intl, so these are host calls; the default locale is ${DEFAULT_FORMAT_LOCALE}.`,
    members: [
      {
        name: "format.number",
        signature:
          "await format.number(value, options?) -> string // locale, style, currency, minimumFractionDigits, maximumFractionDigits, useGrouping",
        description: "Locale number, percent and currency formatting.",
        async: true
      },
      {
        name: "format.date",
        signature:
          "await format.date(epochMs, options?) -> string // locale, dateStyle, timeStyle, timeZone",
        description: "Locale date and time formatting of a millisecond timestamp.",
        async: true
      },
      {
        name: "format.relativeTime",
        signature:
          "await format.relativeTime(value, unit, options?) -> string // unit: day, hour, minute, ...",
        description: "Relative phrasing, for example -3 with unit day.",
        async: true
      },
      {
        name: "format.list",
        signature:
          "await format.list(items, options?) -> string // locale, type",
        description: "Join an array of strings the way the locale does.",
        async: true
      }
    ]
  },
  data: {
    name: "data",
    kind: "namespace",
    description:
      "Structured data: CSV, XLSX, YAML, XML, HTML, zip archives, and text " +
      "diffs. These are the only such facilities; the guest has no module " +
      "loader, so import and require do not exist.",
    members: [
      {
        name: "data.parseCsv",
        signature:
          "await data.parseCsv(text, options?) -> object[] | string[][] // options: delimiter, header (default true)",
        description:
          "Records keyed by the header row, or raw rows with header false. Values stay strings.",
        async: true
      },
      {
        name: "data.toCsv",
        signature:
          "await data.toCsv(rows, options?) -> string // options: delimiter, header (default true)",
        description:
          "Records or row arrays back out as CSV text — the inverse of parseCsv.",
        async: true
      },
      {
        name: "data.selectHtml",
        signature:
          "await data.selectHtml(html, selector, options?) -> string[] // options: attr, limit",
        description:
          "CSS selector over HTML returning trimmed text, or the named attribute when attr is set.",
        async: true
      },
      {
        name: "data.htmlToMarkdown",
        signature: "await data.htmlToMarkdown(html) -> string",
        description:
          "A whole HTML page as clean markdown — the usual first step before summarizing or indexing a fetched page.",
        async: true
      },
      {
        name: "data.parseXlsx",
        signature:
          'await data.parseXlsx(bytes, options?) -> {sheetName: object[]} | object[] // options: sheet, header (default true)',
        description:
          "Excel workbook bytes (from workspace.readBytes or a fetched body) to records per sheet; pass sheet to get one sheet's rows directly. Formula cells yield their computed result.",
        async: true
      },
      {
        name: "data.parseYaml",
        signature: "await data.parseYaml(text) -> value",
        description: "One YAML document as a plain value.",
        async: true
      },
      {
        name: "data.toYaml",
        signature: "await data.toYaml(value) -> string",
        description: "Any JSON-serializable value as YAML text.",
        async: true
      },
      {
        name: "data.parseXml",
        signature:
          "await data.parseXml(text, options?) -> object // options: attributes (default true)",
        description:
          'XML (RSS/Atom feeds, sitemaps) as a plain object; attributes ride along prefixed "@_". Text values stay strings. Invalid XML throws with the parser\'s reason.',
        async: true
      },
      {
        name: "data.unzip",
        signature: "await data.unzip(bytes) -> {path: Uint8Array}",
        description:
          "Extract a zip archive to a map of entry path to content bytes (utf8Decode for text entries).",
        async: true
      },
      {
        name: "data.zip",
        signature: "await data.zip({path: Uint8Array | string}) -> Uint8Array",
        description:
          "Build a zip archive from named entries; string values are UTF-8 encoded.",
        async: true
      },
      {
        name: "data.diff",
        signature:
          "await data.diff(a, b, options?) -> string // options: context, oldName, newName",
        description:
          "Unified diff of two texts — empty hunks mean identical. Handy for verify loops and change reports.",
        async: true
      }
    ]
  },
  image: {
    name: "image",
    kind: "namespace",
    description:
      "Raster image editing. Every member takes and returns encoded image " +
      "bytes, so calls chain. Formats: png, jpeg, webp, avif.",
    members: [
      {
        name: "image.info",
        signature:
          "await image.info(bytes) -> { width, height, format, byteLength }",
        description:
          "Dimensions and encoding of an image, without decoding it into the guest.",
        async: true
      },
      {
        name: "image.decode",
        signature:
          "await image.decode(bytes) -> { width, height, pixels } // pixels: RGBA Uint8Array",
        description:
          "Raw pixels for per-pixel work. Four bytes per pixel — resize first, and prefer the other members when they do the job.",
        async: true
      },
      {
        name: "image.encode",
        signature:
          "await image.encode({ width, height, pixels }, options?) -> Uint8Array // options: format, quality, background",
        description: "Encode raw RGBA pixels — the inverse of decode.",
        async: true
      },
      {
        name: "image.resize",
        signature:
          "await image.resize(bytes, options) -> Uint8Array // options: width, height, fit (cover | contain | fill), background, format, quality",
        description:
          "Scale an image. One of width or height keeps the aspect ratio; both apply the fit mode, which defaults to contain.",
        async: true
      },
      {
        name: "image.crop",
        signature:
          "await image.crop(bytes, options) -> Uint8Array // options: x, y, width, height, format, quality",
        description:
          "Cut a rectangle out. A rectangle outside the image is an error, not a clamp.",
        async: true
      },
      {
        name: "image.rotate",
        signature:
          "await image.rotate(bytes, degrees, options?) -> Uint8Array // options: background, format, quality",
        description:
          "Rotate clockwise, growing the canvas to the rotated bounding box so nothing is clipped.",
        async: true
      },
      {
        name: "image.flip",
        signature:
          "await image.flip(bytes, options?) -> Uint8Array // options: horizontal (default true), vertical, format, quality",
        description: "Mirror an image.",
        async: true
      },
      {
        name: "image.adjust",
        signature:
          "await image.adjust(bytes, options) -> Uint8Array // options: brightness, contrast, saturate, grayscale, sepia, invert, blur, hueRotate, opacity, format, quality",
        description:
          "Filter an image. 1 is unchanged for the multiplying filters, 0 for grayscale, sepia, invert and blur.",
        async: true
      },
      {
        name: "image.composite",
        signature:
          "await image.composite(bytes, layers, options?) -> Uint8Array // layer: { image, x, y, width, height, opacity, blendMode }",
        description:
          "Draw layers over a base image — watermarks, badges, stacked renders. blendMode takes the Canvas globalCompositeOperation names.",
        async: true
      },
      {
        name: "image.convert",
        signature:
          "await image.convert(bytes, options) -> Uint8Array // options: format, quality, background",
        description:
          "Re-encode without resampling. Converting to jpeg fills transparency with background, white by default.",
        async: true
      }
    ]
  },
  canvas: {
    name: "canvas",
    kind: "namespace",
    description:
      "Draw with a real Canvas 2D context. Use createCanvas for the familiar " +
      "API; these are the raw calls behind it.",
    members: [
      {
        name: "canvas.render",
        signature:
          "await canvas.render(spec) -> Uint8Array // spec: { width, height, background, format, quality, gradients, ops }",
        description:
          "Replay a recorded draw list and encode the result. createCanvas builds the spec for you.",
        async: true
      },
      {
        name: "canvas.measureText",
        signature:
          "await canvas.measureText(text, font?) -> { width, actualBoundingBoxAscent, actualBoundingBoxDescent, ... }",
        description:
          "Text metrics for a CSS font string, so text can be laid out before it is drawn.",
        async: true
      }
    ]
  },
  __maxIter: {
    name: "__maxIter",
    kind: "function",
    description: "Loop-guard budget injected by the runtime.",
    internal: true,
    members: []
  }
};

const GUEST_HELPER_DOCS: { [K in GuestHelperName]: SandboxMemberDoc } = {
  toBase64: {
    name: "toBase64",
    signature: "toBase64(stringOrBytes) -> string",
    description: "Base64-encode a string or Uint8Array.",
    async: false
  },
  fromBase64: {
    name: "fromBase64",
    signature: "fromBase64(text) -> Uint8Array",
    description: "Decode base64 (standard or URL alphabet) to bytes.",
    async: false
  },
  toHex: {
    name: "toHex",
    signature: "toHex(bytes) -> string",
    description: "Lowercase hex of a Uint8Array.",
    async: false
  },
  fromHex: {
    name: "fromHex",
    signature: "fromHex(text) -> Uint8Array",
    description: "Decode hex to bytes.",
    async: false
  },
  utf8Encode: {
    name: "utf8Encode",
    signature: "utf8Encode(text) -> Uint8Array",
    description: "UTF-8 encode.",
    async: false
  },
  utf8Decode: {
    name: "utf8Decode",
    signature: "utf8Decode(bytes) -> string",
    description: "UTF-8 decode.",
    async: false
  },
  parallelMap: {
    name: "parallelMap",
    signature:
      "await parallelMap(items, fn, concurrency?) -> results[] // fn receives (item, index); concurrency default 5, max 32",
    description:
      "Run an async function over items with at most `concurrency` in flight, preserving input order. The bounded form of Promise.all fan-out — the way to fetch many URLs in parallel. Rejects on the first failure; wrap fn in try/catch to collect errors instead.",
    async: true
  },
  createCanvas: {
    name: "createCanvas",
    signature:
      "createCanvas(width, height) -> { width, height, getContext, toBytes, toSpec }",
    description:
      "A Canvas 2D surface. getContext with \"2d\" returns a context taking the usual calls — fillRect, arc, fillText, drawImage, createLinearGradient, save, translate, rotate — synchronously; awaiting toBytes with an options object of format, quality and background renders them and returns the encoded image. drawImage takes image bytes, not an image object, and toSpec hands the recorded draw list to canvas.render instead.",
    async: false
  }
};

const HUGE = Number.MAX_SAFE_INTEGER;

/**
 * Limits a caller may override. Defaults and ceilings both come from
 * `resolveSandboxLimits` — the ceilings by asking it to clamp an absurd value,
 * which is the only place the clamp table is expressed.
 */
function overridableLimits(): SandboxLimitDoc[] {
  const defaults = resolveSandboxLimits();
  const ceilings = resolveSandboxLimits({
    maxFetchCalls: HUGE,
    maxResponseBodyBytes: HUGE,
    maxOutputSize: HUGE,
    memoryLimitBytes: HUGE,
    stackLimitBytes: HUGE,
    fetchTimeoutMs: HUGE
  });
  // Numeric limits only. The capability switches (`allowPrivateNetwork`,
  // `userAgent`) are deliberately absent: they are host-set, have no ceiling
  // to clamp against, and must not be advertised in the guest-facing manifest
  // as something authored code can ask for.
  type NumericLimitKey = Exclude<
    keyof typeof defaults,
    "allowPrivateNetwork" | "userAgent" | "filesystemAccess"
  >;
  const described: Record<
    NumericLimitKey,
    { description: string; unit: SandboxLimitDoc["unit"] }
  > = {
    maxFetchCalls: { description: "fetch calls per run", unit: "count" },
    maxResponseBodyBytes: {
      description: "response body read per fetch",
      unit: "bytes"
    },
    maxOutputSize: { description: "serialized return value", unit: "bytes" },
    memoryLimitBytes: { description: "guest heap", unit: "bytes" },
    stackLimitBytes: { description: "guest call stack", unit: "bytes" },
    fetchTimeoutMs: { description: "per-request fetch timeout", unit: "ms" }
  };
  return (Object.keys(described) as NumericLimitKey[]).map((key) => ({
    key,
    description: described[key].description,
    unit: described[key].unit,
    value: defaults[key],
    ceiling: ceilings[key]
  }));
}

function fixedLimits(): SandboxLimitDoc[] {
  return [
    {
      key: "timeoutMs",
      description: "wall-clock budget per run",
      unit: "ms",
      value: DEFAULT_TIMEOUT_MS
    },
    {
      key: "maxLoopIterations",
      description: "guarded loop iterations",
      unit: "count",
      value: MAX_LOOP_ITERATIONS
    },
    {
      key: "maxRandomBytes",
      description: "bytes per crypto.getRandomValues call",
      unit: "bytes",
      value: MAX_RANDOM_BYTES
    },
    {
      key: "maxProgressCalls",
      description: "forwarded progress reports per run",
      unit: "count",
      value: MAX_PROGRESS_CALLS
    },
    {
      key: "maxProgressMessageChars",
      description: "progress message length",
      unit: "chars",
      value: MAX_PROGRESS_MESSAGE_CHARS
    },
    {
      key: "maxDataInputChars",
      description: "text accepted by a data.* call",
      unit: "chars",
      value: MAX_DATA_INPUT_CHARS
    },
    {
      key: "selectHtmlLimit",
      description: "matches returned by data.selectHtml",
      unit: "count",
      value: DEFAULT_SELECT_HTML_LIMIT,
      ceiling: MAX_SELECT_HTML_LIMIT
    },
    {
      key: "maxImageInputBytes",
      description: "encoded image accepted by an image.* call",
      unit: "bytes",
      value: MAX_IMAGE_INPUT_BYTES
    },
    {
      key: "maxImagePixels",
      description: "pixels in a decoded image or rendered canvas",
      unit: "count",
      value: MAX_IMAGE_PIXELS
    },
    {
      key: "maxDecodePixels",
      description: "pixels returned by image.decode",
      unit: "count",
      value: MAX_DECODE_PIXELS
    },
    {
      key: "maxCanvasOps",
      description: "draw operations per canvas render",
      unit: "count",
      value: MAX_CANVAS_OPS
    }
  ];
}

/**
 * Every own global the QuickJS guest really has, machine-observed rather than
 * inferred from the host-side `buildSandbox` record — that record states what
 * the host means to install, which is neither what `@sebastianwessel/quickjs`
 * marshals nor what the engine itself ships. Names beginning `__` (runtime
 * internals) are filtered out.
 *
 * Booting the guest is async and `getSandboxManifest` is synchronous, so the
 * list is checked in. Regenerate it with:
 *
 *     npx tsx packages/agents/scripts/probe-guest-globals.ts
 *
 * The live-probe case in `tests/sandbox-manifest-drift.test.ts` boots the real
 * sandbox and fails when this drifts from it.
 */
export const GUEST_GLOBALS_SNAPSHOT: readonly string[] = [
  "AggregateError",
  "Array",
  "ArrayBuffer",
  "BigInt",
  "BigInt64Array",
  "BigUint64Array",
  "Boolean",
  "Buffer",
  "DataView",
  "Date",
  "Error",
  "EvalError",
  "FinalizationRegistry",
  "Float32Array",
  "Float64Array",
  "Headers",
  "Infinity",
  "Int16Array",
  "Int32Array",
  "Int8Array",
  "InternalError",
  "JSON",
  "Map",
  "Math",
  "NaN",
  "Number",
  "Object",
  "Promise",
  "Proxy",
  "RangeError",
  "ReferenceError",
  "Reflect",
  "RegExp",
  "Request",
  "Response",
  "Set",
  "SharedArrayBuffer",
  "String",
  "Symbol",
  "SyntaxError",
  "TextDecoder",
  "TextEncoder",
  "TypeError",
  "URIError",
  "URL",
  "URLSearchParams",
  "Uint16Array",
  "Uint32Array",
  "Uint8Array",
  "Uint8ClampedArray",
  "WeakMap",
  "WeakRef",
  "WeakSet",
  "assetToSandbox",
  "canvas",
  "console",
  "createCanvas",
  "crypto",
  "data",
  "decodeURI",
  "decodeURIComponent",
  "encodeURI",
  "encodeURIComponent",
  "env",
  "escape",
  "fetch",
  "format",
  "fromBase64",
  "fromHex",
  "getSecret",
  "globalThis",
  "image",
  "isFinite",
  "isNaN",
  "parallelMap",
  "parseFloat",
  "parseInt",
  "performance",
  "process",
  "progress",
  "queueMicrotask",
  "sandboxToAsset",
  "sleep",
  "toBase64",
  "toHex",
  "undefined",
  "unescape",
  "utf8Decode",
  "utf8Encode",
  "uuid",
  "workspace"
];

/**
 * Names a model reaches for out of habit that this guest does not have. They
 * are absent from `GUEST_GLOBALS_SNAPSHOT` — this list is what makes the
 * absence something the manifest can say out loud. `btoa`, `atob` and
 * `structuredClone` sit in the host-side `buildSandbox` record but are never
 * marshaled; `Intl` is why the `format.*` bridge exists.
 */
const ABSENT_GLOBALS = [
  "AbortController",
  "Blob",
  "FormData",
  "Intl",
  "atob",
  "btoa",
  "structuredClone"
] as const;

/**
 * Split the observed guest globals into what a model may use directly and what
 * it must be told is missing. Bridges and prelude helpers are documented
 * elsewhere in the manifest, so they drop out of both lists.
 */
function partitionNativeGlobals(): {
  native: string[];
  blocked: string[];
} {
  const documentedElsewhere = new Set<string>([
    ...EXPOSED_BRIDGE_NAMES,
    ...GUEST_HELPER_NAMES
  ]);
  const native = GUEST_GLOBALS_SNAPSHOT.filter(
    (name) => !documentedElsewhere.has(name)
  );
  // The names the host record leaves undefined are the timer globals the
  // prelude removes.
  const { sandbox } = buildSandbox();
  const hostBlocked = Object.entries(sandbox)
    .filter(([, value]) => value === undefined)
    .map(([name]) => name);
  return {
    native,
    blocked: [
      ...hostBlocked,
      ...DELETED_GUEST_GLOBALS,
      ...ABSENT_GLOBALS
    ].sort()
  };
}

let cached: SandboxManifest | null = null;

/** Build the manifest. Cached — the inputs are module constants. */
export function getSandboxManifest(): SandboxManifest {
  if (cached) return cached;
  const { native, blocked } = partitionNativeGlobals();
  cached = {
    nodeType: SANDBOX_MANIFEST_NODE_TYPE,
    runtime: "quickjs",
    bridges: BRIDGE_DOCS,
    guestHelpers: GUEST_HELPER_DOCS,
    nativeGlobals: native,
    blockedGlobals: blocked,
    limits: [...overridableLimits(), ...fixedLimits()],
    notes: [
      {
        text: "Code runs as an async function body: top-level await works and `return` produces the node's result.",
        audience: "code-node"
      },
      {
        text: "Bridge calls start host-side work when invoked, not when awaited: Promise.all / allSettled / race / any over fetch or workspace calls run them in parallel. Use parallelMap for bounded fan-out. sleep is the only timer."
      },
      {
        text: "Return an object whose keys are the node's outputs. Emit every declared output on every return path.",
        audience: "code-node"
      },
      { text: "Media and asset values are reference objects. Pass them through unchanged." },
      {
        text: "Images are edited as encoded bytes: assetToSandbox then workspace.readBytes to get them, image.* or createCanvas to change them, workspace.writeBytes then sandboxToAsset to hand one back."
      },
      {
        text: "There is no module loader and no Intl. Anything a library would do comes from the bridges below."
      },
      {
        text: "`process`, `env` and `Buffer` exist but are the sandbox's own stubs, not Node's: `process.env` is empty and the working directory is \"/\". Nothing reaches the host through them."
      }
    ]
  };
  return cached;
}

/** Every guest name the manifest documents, bridges through helpers. */
export function sandboxManifestNames(
  manifest: SandboxManifest = getSandboxManifest()
): Set<string> {
  const names = new Set<string>(manifest.nativeGlobals);
  for (const bridge of Object.values(manifest.bridges)) {
    names.add(bridge.name);
    for (const member of bridge.members) names.add(member.name);
  }
  for (const helper of Object.values(manifest.guestHelpers)) {
    names.add(helper.name);
  }
  return names;
}
