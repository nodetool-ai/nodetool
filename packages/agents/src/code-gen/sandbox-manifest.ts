/**
 * Serializable description of the guest surface `nodetool.code.Code` runs on.
 *
 * Every name and number here is read out of `js-sandbox.ts` rather than
 * restated, so a prompt or help text derived from the manifest cannot advertise
 * an API the sandbox does not marshal. Only the human prose (signatures,
 * descriptions) is written here.
 */
import {
  buildSandbox,
  resolveSandboxLimits,
  DELETED_GUEST_GLOBALS,
  EXPOSED_BRIDGE_NAMES,
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
  readonly notes: readonly string[];
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
      "Structured parsing. These are the only CSV and HTML facilities; the guest has no module loader, so import and require do not exist.",
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
        name: "data.selectHtml",
        signature:
          "await data.selectHtml(html, selector, options?) -> string[] // options: attr, limit",
        description:
          "CSS selector over HTML returning trimmed text, or the named attribute when attr is set.",
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
  const described: Record<
    keyof typeof defaults,
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
  return (Object.keys(described) as (keyof typeof defaults)[]).map((key) => ({
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
    }
  ];
}

/** Split the `buildSandbox` record into what QuickJS provides natively and what
 * it deliberately leaves undefined. */
function partitionNativeGlobals(): {
  native: string[];
  blocked: string[];
} {
  const bridgeNames = new Set<string>(EXPOSED_BRIDGE_NAMES);
  const { sandbox } = buildSandbox();
  const native: string[] = [];
  const blocked: string[] = [];
  for (const [name, value] of Object.entries(sandbox)) {
    if (bridgeNames.has(name)) continue;
    (value === undefined ? blocked : native).push(name);
  }
  return { native, blocked: [...blocked, ...DELETED_GUEST_GLOBALS] };
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
      "Code runs as an async function body: top-level await works and `return` produces the node's result.",
      "Return an object whose keys are the node's outputs. Emit every declared output on every return path.",
      "Media and asset values are reference objects. Pass them through unchanged.",
      "There is no module loader and no Intl. Anything a library would do comes from the bridges below."
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
