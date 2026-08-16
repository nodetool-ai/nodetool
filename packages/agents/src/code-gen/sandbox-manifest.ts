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
  MAX_LOOP_ITERATIONS,
  MAX_RANDOM_BYTES,
  MAX_PROGRESS_CALLS,
  MAX_PROGRESS_MESSAGE_CHARS,
  type ExposedBridgeName,
  type GuestHelperName
} from "../js-sandbox.js";
import { CODE_INPUTS_GLOBAL } from "@nodetool-ai/node-sdk";
import {
  MAX_CANVAS_OPS,
  MAX_DECODE_PIXELS,
  MAX_IMAGE_INPUT_BYTES,
  MAX_IMAGE_PIXELS
} from "../sandbox-media.js";
import {
  MAX_DATA_URI_BYTES,
  MAX_MEDIA_REF_BYTES
} from "../sandbox-media-ref.js";

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
  /**
   * Members that exist and work but are plumbing behind a guest helper
   * (e.g. `canvas.render` behind `createCanvas(...).toBytes()`). They stay in
   * `sandboxManifestNames` — a reference to one is not a phantom — but the
   * prompt/doc renderers never advertise them.
   */
  readonly internalMembers?: readonly SandboxMemberDoc[];
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
  /**
   * Globals the Code node injects per run, on top of what the guest has:
   * the declared inputs arrive on `inputs`, `state` persists across runs, and
   * the tool bridge preludes define `tools` and the `nodetool` object model.
   * Not in the guest snapshot — nothing puts them there until a node runs.
   */
  readonly nodeGlobals: readonly string[];
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
    description:
      "Read a configured secret by name. Prefer nodetool.secrets.get(name), which throws when the secret is unset instead of returning undefined.",
    members: [
      {
        name: "getSecret",
        signature: "await getSecret(name) -> string | undefined",
        description:
          "Returns undefined when the secret is unset or the node runs without a context. A node that declares a secret scope may read only the names it declared.",
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
  emit: {
    name: "emit",
    kind: "function",
    description:
      "Stream one value to an output handle while the body keeps running.",
    members: [
      {
        name: "emit",
        signature: "await emit(name, value) -> void",
        description:
          "Delivers {[name]: value} downstream immediately, in call order. Awaiting it applies backpressure. Capped per run; a non-string name throws.",
        async: true
      }
    ]
  },
  output: {
    name: "output",
    kind: "function",
    description:
      "Set the final value of an output handle; all finals post as one bag when the body completes.",
    members: [
      {
        name: "output",
        signature: "await output(name, value) -> void",
        description:
          "Records the handle's final value. A second call for the same handle throws; the body's return value carries no outputs.",
        async: true
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
        description:
          "Locale date and time formatting of a millisecond timestamp.",
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
  image: {
    name: "image",
    kind: "namespace",
    description:
      "Raster image editing. Every member takes an image handle, a media ref " +
      "(asset:// and friends) or encoded bytes, and returns a handle — a small " +
      "object naming bytes the host holds, so calls chain without moving the " +
      "image. Read `.byteLength`, `.width`, `.height`, `.mimeType` off a " +
      "handle; ask image.stats for what an image looks like, image.blank for " +
      "a backdrop and image.grid to combine several; call image.bytes(handle) " +
      "only when you must read the bytes " +
      "yourself, and media.toImage(handle) to save one as an asset. " +
      "A handle lives only for the action that made it — before this action " +
      "ends, save anything you still need with media.toImage(handle) and " +
      "carry the asset ref instead. Formats: png, jpeg, webp, avif.",
    members: [
      {
        name: "image.bytes",
        signature: "await image.bytes(handle) -> Uint8Array",
        description:
          "The encoded bytes behind a handle. The one call that pulls an " +
          "image into the guest — every other member keeps it host-side, so " +
          "reach for this only when the body reads the bytes itself.",
        async: true
      },
      {
        name: "image.toAsset",
        signature:
          "await image.toAsset(handle, { filename?, mimeType? }) -> ImageRef",
        description:
          "Save a handle as a durable asset. The bytes stay on the host; " +
          "the guest gets an asset:// ref. Prefer nodetool.media.toImage " +
          "from a chat action.",
        async: true
      },
      {
        name: "image.info",
        signature:
          "await image.info(image) -> { width, height, format, byteLength }",
        description:
          "Dimensions and encoding of an image, without decoding it into the guest.",
        async: true
      },
      {
        name: "image.decode",
        signature:
          "await image.decode(image) -> { width, height, pixels } // pixels: RGBA Uint8Array",
        description:
          "Raw pixels for per-pixel work. Four bytes per pixel — resize first, and prefer the other members when they do the job.",
        async: true
      },
      {
        name: "image.stats",
        signature:
          "await image.stats(image) -> { width, height, pixels, luminance, opaque, channels: { r, g, b, a } } // each: mean, min, max",
        description:
          "What an image looks like, in a hundred bytes — is it dark, flat, transparent. Ask this instead of decoding to find out.",
        async: true
      },
      {
        name: "image.blank",
        signature:
          "await image.blank(width, height, options?) -> handle // options: color, format, quality",
        description:
          "A new surface, transparent unless you pass color. The backdrop to composite onto.",
        async: true
      },
      {
        name: "image.pad",
        signature:
          "await image.pad(image, options) -> handle // options: all, top, right, bottom, left, color, format, quality",
        description:
          "Grow the canvas around an image without scaling it — margins, letterboxing, room to composite into.",
        async: true
      },
      {
        name: "image.grid",
        signature:
          "await image.grid([image, ...], options?) -> handle // options: columns, gap, background, format, quality",
        description:
          'Lay images out in a grid — the usual meaning of "combine these". Cells are the largest input and each image is centred; one row unless you pass columns.',
        async: true
      },
      {
        name: "image.resize",
        signature:
          "await image.resize(image, options) -> handle // options: width, height, fit (cover | contain | fill), background, format, quality",
        description:
          "Scale an image. One of width or height keeps the aspect ratio; both apply the fit mode, which defaults to contain.",
        async: true
      },
      {
        name: "image.crop",
        signature:
          "await image.crop(image, options) -> handle // options: x, y, width, height, format, quality",
        description:
          "Cut a rectangle out. A rectangle outside the image is an error, not a clamp.",
        async: true
      },
      {
        name: "image.rotate",
        signature:
          "await image.rotate(image, degrees, options?) -> handle // options: background, format, quality",
        description:
          "Rotate clockwise, growing the canvas to the rotated bounding box so nothing is clipped.",
        async: true
      },
      {
        name: "image.flip",
        signature:
          "await image.flip(image, options?) -> handle // options: horizontal (default true), vertical, format, quality",
        description: "Mirror an image.",
        async: true
      },
      {
        name: "image.adjust",
        signature:
          "await image.adjust(image, options) -> handle // options: brightness, contrast, saturate, grayscale, sepia, invert, blur, hueRotate, opacity, format, quality",
        description:
          "Filter an image. 1 is unchanged for the multiplying filters, 0 for grayscale, sepia, invert and blur.",
        async: true
      },
      {
        name: "image.composite",
        signature:
          "await image.composite(image, layers, options?) -> handle // layer: { image, x, y, width, height, opacity, blendMode }",
        description:
          "Draw layers over a base image — watermarks, badges, stacked renders. blendMode takes the Canvas globalCompositeOperation names.",
        async: true
      },
      {
        name: "image.convert",
        signature:
          "await image.convert(image, options) -> handle // options: format, quality, background",
        description:
          "Re-encode without resampling. Converting to jpeg fills transparency with background, white by default.",
        async: true
      }
    ]
  },
  audio: {
    name: "audio",
    kind: "namespace",
    description:
      "Host-side audio editing. Inputs may be handles, media refs, or encoded bytes; transformed outputs are run-local handles.",
    members: [
      {
        name: "audio.bytes",
        signature: "await audio.bytes(handle) -> Uint8Array",
        description:
          "Read encoded bytes explicitly. Chaining operations does not need this.",
        async: true
      },
      {
        name: "audio.toAsset",
        signature:
          "await audio.toAsset(handle, { filename?, mimeType? }) -> AudioRef",
        description: "Save a run-local audio handle as a durable asset.",
        async: true
      },
      {
        name: "audio.info",
        signature:
          "await audio.info(audio) -> { duration, sample_rate, channels, format, size_bytes }",
        description: "Inspect audio without returning its encoded payload.",
        async: true
      },
      {
        name: "audio.normalize",
        signature: "await audio.normalize(audio) -> handle",
        description: "Normalize peak volume.",
        async: true
      },
      {
        name: "audio.trim",
        signature: "await audio.trim(audio, { start?, end? }) -> handle",
        description: "Keep an interval in seconds.",
        async: true
      },
      {
        name: "audio.concat",
        signature: "await audio.concat([audio, ...]) -> handle",
        description: "Join compatible audio files in sequence.",
        async: true
      },
      {
        name: "audio.mix",
        signature: "await audio.mix([audio, ...]) -> handle",
        description: "Mix compatible tracks over the same timeline.",
        async: true
      },
      {
        name: "audio.reverse",
        signature: "await audio.reverse(audio) -> handle",
        description: "Reverse audio playback.",
        async: true
      },
      {
        name: "audio.fadeIn",
        signature: "await audio.fadeIn(audio, { duration? }) -> handle",
        description: "Apply a fade at the start.",
        async: true
      },
      {
        name: "audio.fadeOut",
        signature: "await audio.fadeOut(audio, { duration? }) -> handle",
        description: "Apply a fade at the end.",
        async: true
      },
      {
        name: "audio.repeat",
        signature: "await audio.repeat(audio, { loops? }) -> handle",
        description: "Repeat audio a fixed number of times.",
        async: true
      }
    ]
  },
  video: {
    name: "video",
    kind: "namespace",
    description:
      "Cross-platform video editing and media composition through Mediabunny. Outputs stay in run-local handles.",
    members: [
      {
        name: "video.bytes",
        signature: "await video.bytes(handle) -> Uint8Array",
        description:
          "Read encoded bytes explicitly. Chaining operations does not need this.",
        async: true
      },
      {
        name: "video.toAsset",
        signature:
          "await video.toAsset(handle, { filename?, mimeType? }) -> VideoRef",
        description: "Save a run-local video handle as a durable asset.",
        async: true
      },
      {
        name: "video.info",
        signature:
          "await video.info(video) -> { duration, width, height, rotation, codec, has_audio }",
        description: "Inspect the video and its streams.",
        async: true
      },
      {
        name: "video.trim",
        signature: "await video.trim(video, { start?, end? }) -> handle",
        description: "Keep a time interval in seconds.",
        async: true
      },
      {
        name: "video.resize",
        signature:
          "await video.resize(video, { width, height, fit? }) -> handle",
        description: "Resize video with fill, contain, or cover fitting.",
        async: true
      },
      {
        name: "video.rotate",
        signature: "await video.rotate(video, degrees) -> handle",
        description: "Rotate video by 0, 90, 180, or 270 degrees.",
        async: true
      },
      {
        name: "video.addAudio",
        signature:
          "await video.addAudio(video, audio, { keepOriginalAudio? }) -> handle",
        description:
          "Attach an audio track to a video. By default it replaces existing audio.",
        async: true
      },
      {
        name: "video.extractAudio",
        signature: "await video.extractAudio(video) -> audio handle",
        description: "Extract the soundtrack as WAV audio.",
        async: true
      },
      {
        name: "video.extractFrame",
        signature: "await video.extractFrame(video, time?) -> image handle",
        description: "Extract a PNG frame at a time in seconds.",
        async: true
      }
    ]
  },
  canvas: {
    name: "canvas",
    kind: "namespace",
    description:
      "Canvas 2D text metrics. Drawing itself goes through createCanvas, " +
      "whose toBytes renders the recorded calls host-side.",
    members: [
      {
        name: "canvas.measureText",
        signature:
          "await canvas.measureText(text, font?) -> { width, actualBoundingBoxAscent, actualBoundingBoxDescent, ... }",
        description:
          "Text metrics for a CSS font string, so text can be laid out before it is drawn.",
        async: true
      }
    ],
    internalMembers: [
      {
        name: "canvas.render",
        signature:
          "await canvas.render(spec) -> Uint8Array // spec: { width, height, background, format, quality, gradients, ops }",
        description:
          "The machinery behind createCanvas(...).toBytes(): replay a recorded draw list and encode the result.",
        async: true
      }
    ]
  },
  media: {
    name: "media",
    kind: "namespace",
    description:
      "Read a document/image/audio/video input's bytes, and build a media ref " +
      "from bytes the body computed. Resolves asset://, /api/storage/, " +
      "package://, data: URIs, https URLs and file paths. Needs a context.",
    members: [
      {
        name: "media.bytes",
        signature: "await media.bytes(ref) -> Uint8Array",
        description: "The bytes behind any media ref.",
        async: true,
        requiresContext: true
      },
      {
        name: "media.text",
        signature: "await media.text(ref, { encoding? }) -> string",
        description: "Decode the ref's bytes as text (default utf-8).",
        async: true,
        requiresContext: true
      },
      {
        name: "media.info",
        signature: "await media.info(ref) -> { type, mimeType, uri, size }",
        description: "What the ref is and how big it is.",
        async: true,
        requiresContext: true
      },
      {
        name: "media.toDocument",
        signature:
          "await media.toDocument(bytes, { mimeType?, filename? }) -> DocumentRef",
        description: "Bytes to a document ref, ready to return as an output.",
        async: true,
        requiresContext: true
      },
      {
        name: "media.toImage",
        signature: "await media.toImage(bytes, { mimeType? }) -> ImageRef",
        description: "Bytes to an image ref.",
        async: true,
        requiresContext: true
      },
      {
        name: "media.toAudio",
        signature: "await media.toAudio(bytes, { mimeType? }) -> AudioRef",
        description: "Bytes to an audio ref.",
        async: true,
        requiresContext: true
      },
      {
        name: "media.toVideo",
        signature: "await media.toVideo(bytes, { mimeType? }) -> VideoRef",
        description: "Bytes to a video ref.",
        async: true,
        requiresContext: true
      }
    ]
  },
  __maxIter: {
    name: "__maxIter",
    kind: "function",
    description: "Loop-guard budget injected by the runtime.",
    internal: true,
    members: []
  },
  __secretScope: {
    name: "__secretScope",
    kind: "function",
    description:
      "The run's declared secret scope, behind nodetool.secrets.list().",
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
  parallelMap: {
    name: "parallelMap",
    signature:
      "await parallelMap(items, fn, concurrency?) -> results[] // fn receives (item, index); concurrency default 5, max 32",
    description:
      "Run an async function over items with at most `concurrency` in flight, preserving input order. The bounded form of Promise.all fan-out — the way to fetch many URLs in parallel. Rejects on the first failure; wrap fn in try/catch to collect errors instead.",
    async: true
  },
  stream: {
    name: "stream",
    signature:
      "for await (const item of stream(name)) // plus stream.any(), await stream.first(name), stream.open(name)",
    description:
      "Read an input handle as it arrives. stream(name) iterates one handle in order until end-of-stream, stream.any() interleaves every handle as [handle, value] pairs, stream.first(name) takes the next value (undefined at end-of-stream), and stream.open(name) answers synchronously whether more can arrive. Only a body the host runs in streaming-input mode has them; anywhere else every call throws.",
    async: true
  },
  createCanvas: {
    name: "createCanvas",
    signature:
      "createCanvas(width, height) -> { width, height, getContext, toBytes, toSpec }",
    description:
      'A Canvas 2D raster surface. getContext with "2d" returns a context taking the usual calls — fillRect, arc, fillText, drawImage, createLinearGradient, save, translate, rotate — synchronously; awaiting toBytes with an options object of format, quality and background renders them and returns the encoded image. drawImage takes image bytes, not an image object, and toSpec returns the recorded draw list. For SVG and vector scenes import @nodetool-ai/sandbox-fabric (renderSVG, loadSVG, render).',
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
    fetchTimeoutMs: HUGE,
    runMediaBytes: HUGE
  });
  // Numeric limits only. The capability switches (`allowPrivateNetwork`,
  // `userAgent`, `secretScope`) are deliberately absent: they are host-set,
  // have no ceiling to clamp against, and must not be advertised in the
  // guest-facing manifest as something authored code can ask for.
  type NumericLimitKey = Exclude<
    keyof typeof defaults,
    "allowPrivateNetwork" | "userAgent" | "filesystemAccess" | "secretScope"
  >;
  const described = {
    maxFetchCalls: { description: "fetch calls per run", unit: "count" },
    maxResponseBodyBytes: {
      description: "response body read per fetch",
      unit: "bytes"
    },
    maxOutputSize: { description: "serialized return value", unit: "bytes" },
    memoryLimitBytes: { description: "guest heap", unit: "bytes" },
    stackLimitBytes: { description: "guest call stack", unit: "bytes" },
    fetchTimeoutMs: { description: "per-request fetch timeout", unit: "ms" },
    runMediaBytes: {
      description: "media handles and transform work held host-side per run",
      unit: "bytes"
    }
  } satisfies Record<
    NumericLimitKey,
    { description: string; unit: SandboxLimitDoc["unit"] }
  >;
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
      key: "maxImageInputBytes",
      description: "encoded image accepted by an image.* call",
      unit: "bytes",
      value: MAX_IMAGE_INPUT_BYTES
    },
    {
      key: "maxMediaRefBytes",
      description: "payload a media.* call moves in either direction",
      unit: "bytes",
      value: MAX_MEDIA_REF_BYTES
    },
    {
      key: "maxDataUriBytes",
      description:
        "payload a media.to* builder inlines as a data URI when the run has no storage",
      unit: "bytes",
      value: MAX_DATA_URI_BYTES
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
  "DataView",
  "Date",
  "Error",
  "EvalError",
  "FinalizationRegistry",
  "Float32Array",
  "Float64Array",
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
  "audio",
  "canvas",
  "console",
  "createCanvas",
  "crypto",
  "decodeURI",
  "decodeURIComponent",
  "emit",
  "encodeURI",
  "encodeURIComponent",
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
  "media",
  "output",
  "parallelMap",
  "parseFloat",
  "parseInt",
  "progress",
  "queueMicrotask",
  "sandboxToAsset",
  "sleep",
  "stream",
  "toBase64",
  "toHex",
  "undefined",
  "unescape",
  "video",
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
  "structuredClone",
  // Removed aliases: crypto.randomUUID replaces uuid(), and the native
  // TextEncoder/TextDecoder replace the utf8 helpers.
  "utf8Decode",
  "utf8Encode",
  "uuid"
] as const;

/**
 * Split the observed guest globals into what a model may use directly and what
 * it must be told is missing. Bridges and prelude helpers are documented
 * elsewhere in the manifest, so they drop out of both lists.
 */
function partitionNativeGlobals() {
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

/**
 * The one sentence every surface states about modules in the guest.
 *
 * Modules exist now — the loader serves what a run declared and refuses
 * everything else — so the old "there is no module loader" claim is false. It
 * lives here because the CodeAct prompt, the Code node prompts and the editor
 * docs all restate it, and the drift tests hold them to this text.
 */
export const SANDBOX_MODULE_RULE =
  "Modules come only from the sandbox packages this run declares, imported " +
  "with a static `import` at the top of the code; dynamic import expressions " +
  "and `require` never resolve, and there is no Intl. Everything else a " +
  "library would do comes from the bridges below.";

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
    nodeGlobals: [CODE_INPUTS_GLOBAL, "state", "nodetool", "tools"],
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
      {
        text: "Declared inputs arrive on the `inputs` object: read `inputs.name`. A bare `name` is a ReferenceError.",
        audience: "code-node"
      },
      {
        text: "Media and asset values are reference objects. Pass them through unchanged."
      },
      {
        text: "Images are edited as encoded bytes: assetToSandbox then workspace.readBytes to get them, image.* or createCanvas to change them, workspace.writeBytes then sandboxToAsset to hand one back. SVG and vector scenes go through @nodetool-ai/sandbox-fabric (renderSVG, loadSVG, render)."
      },
      { text: SANDBOX_MODULE_RULE },
      {
        text: "The platform object model is available as `nodetool` (with the raw `tools` bridge under it): nodetool.capabilities() reports which namespaces are live in this environment; a method whose backing tool is missing throws naming that tool. Tool-backed calls can spend money (media generation, workflow runs) and reach the web — permission gating stays with the tools themselves.",
        audience: "code-node"
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
    for (const member of bridge.internalMembers ?? []) names.add(member.name);
  }
  for (const helper of Object.values(manifest.guestHelpers)) {
    names.add(helper.name);
  }
  return names;
}
