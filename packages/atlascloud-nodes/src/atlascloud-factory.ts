/**
 * Dynamic AtlasCloud node-class factory.
 *
 * Generates node classes from `atlascloud-manifest.json` at runtime, mirroring
 * the topaz-nodes and kie-nodes factories. Each manifest entry declares a
 * model id, modality, output type, and the input fields exposed in the node
 * UI. The generated class extends `BaseNode`, so `BaseNode._injectSecrets`
 * resolves `ATLASCLOUD_API_KEY` from `context.getSecret(...)` and surfaces it
 * as `this._secrets.ATLASCLOUD_API_KEY` inside `process()`.
 */

import {
  applyContentCardBody,
  BaseNode,
  classifyFields,
  classNameToTitle,
  defaultForPropType,
  propertyOf,
  registerDeclaredProperty
} from "@nodetool-ai/node-sdk";
import type { NodeClass, NodeValue, PropOptions } from "@nodetool-ai/node-sdk";
import {
  fetchExternalMedia,
  loadMediaRefBytes,
  mapPromptAssetsToInputs
} from "@nodetool-ai/runtime";
import type {
  AssetMediaKind,
  MediaRefValue,
  PromptAssetInputField,
  PromptAssetTextField
} from "@nodetool-ai/runtime";
import {
  atlasDownload,
  atlasPoll,
  atlasSubmit,
  getApiKey,
  pickOutputUrl,
  type AtlasModality
} from "./atlascloud-base.js";

export type AtlasFieldType =
  | "str"
  | "int"
  | "float"
  | "bool"
  | "enum"
  | "image"
  | "video"
  | "audio"
  | "list[image]"
  | "list[video]"
  | "list[audio]";

export interface AtlasFieldDef {
  name: string;
  type: AtlasFieldType;
  default?: unknown;
  title?: string;
  description?: string;
  values?: Array<string | number>;
  min?: number;
  max?: number;
  required?: boolean;
  /**
   * When true, wraps a single-asset field's resolved value in a one-element
   * array. Used by AtlasCloud `*-edit` endpoints which expect `images: [url]`.
   */
  array?: boolean;
  /**
   * Send this asset field's resolved URLs as `{ url, type }` objects appended
   * to the named request array instead of under the field's own name.
   *
   * AtlasCloud's newer reference-to-video models (Wan 3.0, MiniMax H3) take one
   * mixed `refers` array rather than per-kind lists. Splitting it into typed
   * `reference_images` / `reference_videos` / `reference_audios` node inputs
   * keeps the editor's asset wiring, and the media kind each input declares is
   * exactly the `type` those objects require.
   */
  wrapInto?: string;
}

export interface AtlasManifestEntry {
  className: string;
  moduleName: string;
  modality: AtlasModality;
  modelId: string;
  outputType: "image" | "video";
  title: string;
  description: string;
  pollInterval: number;
  maxAttempts: number;
  fields: AtlasFieldDef[];
}

const ASSET_TYPES = new Set<AtlasFieldType>(["image", "video", "audio"]);
const LIST_ASSET_RE = /^list\[(image|video|audio)\]$/;

/**
 * In-flight raw-RGBA images (protocol `RAW_RGBA_MIME`) carry straight-alpha
 * pixels in `data`, not an encoded file. `loadMediaRefBytes` PNG-encodes them,
 * so the outgoing data URI must say `image/png` rather than the ref's mime.
 */
const RAW_RGBA_MIME = "image/x-raw-rgba";

type AssetRef = {
  uri?: string;
  // Native NodeTool refs carry the asset's id here; the `uri` is often an
  // internal storage path (`/api/storage/<key>`, `memory://…`) or empty, so
  // `asset_id` is the reliable handle for resolving the bytes.
  asset_id?: string | null;
  data?: string | Uint8Array;
  // Native NodeTool refs use snake_case `mime_type`; the refs that
  // `mapPromptAssetsToInputs` injects for @-mentioned assets (InjectedAssetRef)
  // use camelCase `mimeType`. Accept both so a mentioned asset whose URI has no
  // usable extension isn't silently mislabeled with the type default.
  mime_type?: string;
  mimeType?: string;
  metadata?: { mime_type?: string };
};

type StorageLike = {
  retrieve: (uri: string) => Promise<Uint8Array | null> | Uint8Array | null;
};

type ProcessContext = Parameters<BaseNode["process"]>[0] & {
  storage?: StorageLike | null;
  // Canonical asset resolver on ProcessingContext. Resolves asset://<id> and
  // package://<pkg>/<path> reference URIs that storage adapters return null for.
  // SSRF-safe — it performs no unguarded outbound fetches.
  resolveAssetBytes?: (
    uri: string
  ) => Promise<{ bytes: Uint8Array | null }>;
};

function looksLikePublicUrl(s: unknown): s is string {
  if (typeof s !== "string") return false;
  return isSafeHttpUrl(s);
}

/**
 * Validate an http(s) URL for outbound fetching from the workflow runtime.
 *
 * Returns false for any host that points back at the runtime host or its
 * private network — defense against SSRF via user-controllable asset URIs.
 * Workflow inputs (ImageRef.uri etc.) can be set by anyone who can submit a
 * graph; without this check, the worker would happily proxy requests to
 *   - localhost / loopback (any service bound to 127.0.0.1)
 *   - RFC1918 private space (10.*, 172.16-31.*, 192.168.*)
 *   - 169.254.169.254 (AWS / GCP / Azure instance metadata)
 *   - IPv6 loopback / link-local / unique-local equivalents
 *
 * Note: this is hostname-string-based, not a resolved-IP check, so it can be
 * bypassed by a public DNS name that resolves to a private IP (DNS rebinding).
 * That's a known limitation — fixing it properly requires resolving DNS in
 * the same socket dance as the eventual fetch(). The string check is what
 * the canonical fal/replicate/topaz providers use today, hardened here against
 * the inet_aton-style numeric encodings (decimal/hex/octal, short-form) and
 * IPv4-mapped IPv6 that the OS resolver still accepts but a naive dotted-quad
 * regex misses.
 */
function isSafeHttpUrl(uri: string): boolean {
  let u: URL;
  try {
    u = new URL(uri);
  } catch {
    return false;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  return !isPrivateOrLocalHost(u.hostname);
}

/** Parse a single inet_aton component: decimal, 0x-hex, or 0-prefixed octal. */
function parseIpComponent(part: string): number | null {
  if (/^0x[0-9a-f]+$/i.test(part)) return parseInt(part.slice(2), 16);
  if (/^0[0-7]+$/.test(part)) return parseInt(part, 8);
  if (/^[0-9]+$/.test(part)) return parseInt(part, 10);
  return null;
}

/**
 * Parse `host` as IPv4 using inet_aton semantics, which `getaddrinfo` (and thus
 * `fetch`) honors: `a.b.c.d`, the short forms `a.b.c` / `a.b` / `a`, and each
 * component in decimal, hex (`0x7f`), or octal (`0177`). Returns the four
 * octets, or null when the host isn't a numeric IPv4 in any of these forms.
 */
function ipv4ToOctets(host: string): [number, number, number, number] | null {
  const parts = host.split(".");
  if (parts.length === 0 || parts.length > 4) return null;
  const nums: number[] = [];
  for (const part of parts) {
    const n = parseIpComponent(part);
    if (n === null || n < 0) return null;
    nums.push(n);
  }
  // Every component but the last must fit in one octet; the final component
  // absorbs all remaining low-order octets (e.g. "127.1" → 127.0.0.1).
  const n = nums.length;
  for (let i = 0; i < n - 1; i++) {
    if (nums[i] > 0xff) return null;
  }
  const tailOctets = 4 - (n - 1);
  const tail = nums[n - 1];
  if (tail < 0 || tail > 0xffffffff || tail >= 2 ** (tailOctets * 8)) return null;
  let value = tail;
  for (let i = 0; i < n - 1; i++) {
    value += nums[i] * 256 ** (3 - i);
  }
  return [
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff
  ];
}

/** Extract the embedded IPv4 from an IPv4-mapped / -compatible IPv6 address. */
function mappedIpv4ToOctets(
  host: string
): [number, number, number, number] | null {
  // Dotted tail: ::ffff:127.0.0.1 or the deprecated compat form ::127.0.0.1
  const dotted = /^::(?:ffff:)?(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i.exec(host);
  if (dotted) return ipv4ToOctets(dotted[1]);
  // Hex tail: ::ffff:7f00:1
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(host);
  if (hex) {
    const hi = parseInt(hex[1], 16);
    const lo = parseInt(hex[2], 16);
    return [(hi >> 8) & 0xff, hi & 0xff, (lo >> 8) & 0xff, lo & 0xff];
  }
  return null;
}

function isPrivateV4(octets: [number, number, number, number]): boolean {
  const [o1, o2] = octets;
  if (o1 === 0) return true; // 0.0.0.0/8 — "this network"
  if (o1 === 10) return true; // RFC1918
  if (o1 === 127) return true; // loopback
  if (o1 === 169 && o2 === 254) return true; // link-local incl. cloud metadata
  if (o1 === 172 && o2 >= 16 && o2 <= 31) return true; // RFC1918
  if (o1 === 192 && o2 === 168) return true; // RFC1918
  if (o1 === 100 && o2 >= 64 && o2 <= 127) return true; // CGNAT
  return false;
}

function isPrivateOrLocalHost(hostname: string): boolean {
  // URL.hostname returns IPv6 wrapped in brackets ("[::1]") on Node — strip
  // before pattern matching so the v6 cases below work on the bare form.
  let h = hostname.toLowerCase();
  if (h.startsWith("[") && h.endsWith("]")) h = h.slice(1, -1);
  if (h === "" || h === "localhost" || h.endsWith(".localhost")) return true;

  // IPv4 in any inet_aton-accepted spelling, or embedded in a mapped IPv6.
  const octets = ipv4ToOctets(h) ?? mappedIpv4ToOctets(h);
  if (octets) return isPrivateV4(octets);

  // Pure IPv6 — URL.hostname returns bracket-stripped form ("::1", "fe80::1").
  if (h === "::1" || h === "::") return true;
  if (h.startsWith("fe80:") || h.startsWith("fe80::")) return true; // link-local
  // ULA range fc00::/7 — first nibble is f, second is c or d
  if (/^f[cd][0-9a-f]{2}:/i.test(h)) return true;
  return false;
}

function bytesToDataUri(bytes: Uint8Array, mime: string): string {
  return `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
}

function guessMime(ref: AssetRef | undefined, fallback: string): string {
  if (ref?.mime_type) return ref.mime_type;
  if (ref?.mimeType) return ref.mimeType;
  if (ref?.metadata?.mime_type) return ref.metadata.mime_type;
  const uri = ref?.uri ?? "";
  if (/\.jpe?g(?:[?#]|$)/i.test(uri)) return "image/jpeg";
  if (/\.png(?:[?#]|$)/i.test(uri)) return "image/png";
  if (/\.webp(?:[?#]|$)/i.test(uri)) return "image/webp";
  if (/\.mp4(?:[?#]|$)/i.test(uri)) return "video/mp4";
  if (/\.mov(?:[?#]|$)/i.test(uri)) return "video/quicktime";
  if (/\.wav(?:[?#]|$)/i.test(uri)) return "audio/wav";
  if (/\.mp3(?:[?#]|$)/i.test(uri)) return "audio/mpeg";
  return fallback;
}

function defaultMimeFor(fieldType: "image" | "video" | "audio"): string {
  if (fieldType === "video") return "video/mp4";
  if (fieldType === "audio") return "audio/wav";
  return "image/png";
}

/** Mime for bytes we resolved ourselves, with the raw-RGBA case mapped to PNG. */
function resolvedMime(
  ref: AssetRef,
  fieldType: "image" | "video" | "audio"
): string {
  const mime = guessMime(ref, defaultMimeFor(fieldType));
  return mime === RAW_RGBA_MIME ? "image/png" : mime;
}

/** True for a raw-RGBA in-flight image: pixels in `data`, no encoded file. */
function isRawRgba(ref: AssetRef): boolean {
  return (
    (ref.mime_type ?? ref.mimeType) === RAW_RGBA_MIME &&
    ref.data instanceof Uint8Array
  );
}

/**
 * True when a ref carries no source at all: every slot blank. The UI sends a
 * fully-shaped ref for an asset input the user left empty
 * (`{ type: "image", uri: "", asset_id: null, data: null }`), which is an
 * absent optional input — not something to fail the node over.
 */
function isEmptyAssetRef(ref: AssetRef): boolean {
  if (typeof ref.uri === "string" && ref.uri.trim() !== "") return false;
  if (typeof ref.data === "string" && ref.data.length > 0) return false;
  if (ref.data instanceof Uint8Array && ref.data.byteLength > 0) return false;
  return ref.asset_id == null || ref.asset_id === "";
}

function isHttpUri(uri: unknown): boolean {
  return typeof uri === "string" && /^https?:\/\//i.test(uri);
}

/**
 * Resolve a NodeTool asset ref (ImageRef/VideoRef/AudioRef) to something the
 * AtlasCloud API accepts: either a public HTTPS URL or a `data:<mime>;base64,...`
 * URI. Returns null when the ref is empty/undefined.
 */
export async function resolveAssetForAtlas(
  ref: unknown,
  context: ProcessContext | undefined,
  fieldType: "image" | "video" | "audio"
): Promise<string | null> {
  if (!ref) return null;

  // Bare string the user pasted in: a public URL, or a data: URI which is
  // already the exact shape the API wants.
  if (typeof ref === "string") {
    if (ref.startsWith("data:")) return ref;
    return looksLikePublicUrl(ref) ? ref : null;
  }

  if (typeof ref !== "object") return null;
  const r = ref as AssetRef;

  // An asset input left empty is an absent optional input, not a broken one.
  if (isEmptyAssetRef(r)) return null;

  if (looksLikePublicUrl(r.uri)) return r.uri as string;
  // Read uri fresh from ref: the looksLikePublicUrl predicate above narrowed
  // r.uri away, so a typeof check re-establishes the string type here.
  const rawUri = (ref as AssetRef).uri;
  if (typeof rawUri === "string" && rawUri.startsWith("data:")) return rawUri;

  // Inline bytes, except raw-RGBA pixels — those are not an encoded image and
  // must go through the canonical resolver's PNG encoder below.
  if (!isRawRgba(r)) {
    if (typeof r.data === "string" && r.data.length > 0) {
      return r.data.startsWith("data:")
        ? r.data
        : `data:${resolvedMime(r, fieldType)};base64,${r.data}`;
    }
    if (r.data instanceof Uint8Array && r.data.byteLength > 0) {
      return bytesToDataUri(r.data, resolvedMime(r, fieldType));
    }
  }

  // Internal references the canonical resolver understands but a raw
  // storage.retrieve / guarded fetch can't uniformly turn into bytes:
  //   - asset://<id>, package://<pkg>/<path>, memory://<key> reference schemes
  //   - the self-hosted `/api/storage/<key>` path, reduced to its bare <key>
  //   - a ref that carries only an `asset_id` (its `uri` is empty or an
  //     internal path) — the common shape for library-picked and generated
  //     media wired into a downstream node
  // The SSRF safety lives HERE, in restricting what we hand resolveAssetBytes:
  // it will happily download an arbitrary http(s) URL if given one, so we only
  // ever pass it these trusted internal refs (or an asset:// derived from
  // asset_id). Arbitrary http(s) URIs stay on the isSafeHttpUrl-guarded fetch
  // path below and are never routed through it.
  //
  const uri = rawUri;
  const assetId =
    typeof r.asset_id === "string" && r.asset_id.trim() !== ""
      ? r.asset_id.trim()
      : null;
  // Map an internal-ref URI to the argument resolveAssetBytes expects, or null
  // when it isn't one. asset:// / package:// / memory:// are passed verbatim
  // (resolveAssetBytes recognizes each scheme); the `/api/storage/<key>` HTTP
  // path is reduced to its bare `<key>`, since resolveAssetBytes keys off the
  // storage key / asset id, not the route — handing it the full path makes it
  // treat the whole string as an id and build a broken nested URL that 404s.
  const internalRefCandidate = (u: string): string | null => {
    if (
      u.startsWith("asset://") ||
      u.startsWith("package://") ||
      u.startsWith("memory://")
    ) {
      return u;
    }
    // Strip any `?query`/`#hash` (thumb URLs carry e.g. `?thumb=1`) so the bare
    // storage key is handed over. resolveAssetBytes strips these too, but doing
    // it here keeps the passed key exact and the intent explicit.
    const apiStorage = /^\/?api\/storage\/(.+)$/.exec(u);
    return apiStorage ? apiStorage[1].split(/[?#]/)[0] || null : null;
  };
  if (context?.resolveAssetBytes) {
    const candidate =
      (typeof uri === "string" ? internalRefCandidate(uri) : null) ??
      (assetId ? `asset://${assetId}` : null);
    if (candidate) {
      const { bytes } = await context.resolveAssetBytes(candidate);
      if (bytes && bytes.byteLength > 0) {
        return bytesToDataUri(
          new Uint8Array(bytes),
          guessMime(r, defaultMimeFor(fieldType))
        );
      }
    }
  }

  if (r.uri && context?.storage) {
    try {
      const bytes = await context.storage.retrieve(r.uri);
      if (bytes && bytes.byteLength > 0) {
        return bytesToDataUri(
          new Uint8Array(bytes),
          guessMime(r, defaultMimeFor(fieldType))
        );
      }
    } catch {
      /* fall through to direct fetch */
    }
  }

  // Canonical resolver fallback — it understands ref shapes the bespoke
  // branches above miss: `file://` URIs and absolute local paths, raw-RGBA
  // in-flight images (PNG-encoded on the way out), and `asset_id` →
  // `/api/storage/<id>.<ext>` storage candidates.
  //
  // Skipped for http(s) URIs: a safe one already passed through at the top, so
  // anything still here is a private/loopback/metadata host, and
  // loadMediaRefBytes downloads http(s) unguarded. Routing those through it
  // would hand back the SSRF hole isSafeHttpUrl exists to close.
  if (!isHttpUri(r.uri)) {
    const bytes = await loadMediaRefBytes(
      ref as MediaRefValue,
      context
    );
    if (bytes && bytes.byteLength > 0) {
      return bytesToDataUri(bytes, resolvedMime(r, fieldType));
    }
  }

  // Direct fetch fallback. Use the same private-host guard as the
  // pass-through path so a workflow can't trick the worker into proxying
  // requests to internal services / cloud metadata endpoints.
  if (r.uri && isSafeHttpUrl(r.uri)) {
    // The predicate judged the initial URL; the protected fetch judges every
    // redirect hop and applies the media-ref egress policy.
    const res = await fetchExternalMedia(r.uri);
    if (res.ok) {
      const bytes = new Uint8Array(await res.arrayBuffer());
      return bytesToDataUri(bytes, guessMime(r, defaultMimeFor(fieldType)));
    }
  }

  throw new Error(
    `Cannot resolve ${fieldType} asset for AtlasCloud — no usable uri or inline data`
  );
}

/**
 * Coerce a UI-serialized value back to the type AtlasCloud's worker expects.
 * NodeTool serializes numeric dropdowns as strings; AtlasCloud rejects `"5"`
 * when it wants `5`. Coerce here so the user doesn't see opaque worker errors.
 *
 * Callers must filter out null/undefined before invoking — the factory does
 * this in its field loop, so there's no defensive guard here.
 */
function coerceScalar(v: NodeValue, type: AtlasFieldType): NodeValue {
  switch (type) {
    case "int": {
      if (typeof v === "number") return Math.trunc(v);
      const n = parseInt(String(v), 10);
      return Number.isNaN(n) ? null : n;
    }
    case "float": {
      if (typeof v === "number") return v;
      const f = parseFloat(String(v));
      return Number.isNaN(f) ? null : f;
    }
    case "bool": {
      if (typeof v === "boolean") return v;
      if (typeof v === "string") return v.toLowerCase() === "true";
      return Boolean(v);
    }
    default:
      return v;
  }
}

function computeFieldClassification(fields: AtlasFieldDef[]) {
  return classifyFields(fields.map((f) => ({ name: f.name, propType: f.type })));
}

/** Whether an asset ref already points at a source (so a mention shouldn't fill it). */
function refHasSource(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const r = value as AssetRef & { asset_id?: unknown };
  if (typeof r.uri === "string" && r.uri.trim() !== "") return true;
  if (typeof r.data === "string" && r.data.length > 0) return true;
  if (r.data instanceof Uint8Array && r.data.byteLength > 0) return true;
  return r.asset_id != null && r.asset_id !== "";
}

/**
 * Route `asset://` media mentioned inline in a node's text inputs onto its
 * empty image/audio/video inputs (and strip the mentions from the text). Shared
 * with FAL / KIE / Replicate / image-to-image via `mapPromptAssetsToInputs` —
 * lets a Seedance reference-to-video node pull its reference image, audio track
 * and video clip straight from the prompt's @-mentions.
 */
function promptAssetOverrides(
  instance: BaseNode,
  spec: AtlasManifestEntry,
  context: ProcessContext | undefined
): Promise<Record<string, unknown>> {
  const textFields: PromptAssetTextField[] = [];
  const assetFields: PromptAssetInputField[] = [];
  for (const field of spec.fields) {
    const value = propertyOf(instance, field.name);
    if (ASSET_TYPES.has(field.type)) {
      assetFields.push({
        name: field.name,
        kind: field.type as AssetMediaKind,
        list: false,
        hasSource: refHasSource(value)
      });
      continue;
    }
    const listMatch = LIST_ASSET_RE.exec(field.type);
    if (listMatch) {
      assetFields.push({
        name: field.name,
        kind: listMatch[1] as AssetMediaKind,
        list: true,
        hasSource: Array.isArray(value) && value.some(refHasSource)
      });
      continue;
    }
    if (field.type === "str") {
      textFields.push({ name: field.name, value: String(value ?? "") });
    }
  }
  return mapPromptAssetsToInputs(textFields, assetFields, context);
}

/**
 * Append resolved asset URLs to a request array of `{ url, type }` objects,
 * creating it on first use. Order follows manifest field order, so a model
 * that reads its references positionally sees images before videos before
 * audio.
 */
function appendWrapped(
  input: Record<string, unknown>,
  key: string,
  urls: string[],
  kind: "image" | "video" | "audio"
): void {
  const existing = input[key];
  const bucket = Array.isArray(existing) ? existing : [];
  for (const url of urls) {
    bucket.push({ url, type: kind });
  }
  input[key] = bucket;
}

export function createAtlasNodeClass(spec: AtlasManifestEntry): NodeClass {
  const nodeType = `atlascloud.${spec.moduleName}.${spec.className}`;
  const title = spec.title || classNameToTitle(spec.className);
  const specRef = spec;

  const AtlasNodeClass = class extends BaseNode {
    async process(
      context?: ProcessContext
    ): Promise<Record<string, unknown>> {
      const apiKey = getApiKey(this._secrets);
      const input: Record<string, unknown> = {};

      const overrides = await promptAssetOverrides(this, specRef, context);
      // SAFETY: both sources hold node property values, and NodeTool restricts
      // those to its own property types — the shapes `NodeValue` names.
      const readValue = (name: string): NodeValue =>
        (name in overrides
          ? overrides[name]
          : propertyOf(this, name)) as NodeValue;

      for (const f of specRef.fields) {
        const v = readValue(f.name);

        if (ASSET_TYPES.has(f.type)) {
          const inner = f.type as "image" | "video" | "audio";
          const resolved =
            v == null ? null : await resolveAssetForAtlas(v, context, inner);
          if (resolved !== null) {
            if (f.wrapInto) {
              appendWrapped(input, f.wrapInto, [resolved], inner);
            } else {
              input[f.name] = f.array ? [resolved] : resolved;
            }
          } else if (f.required) {
            throw new Error(
              `${specRef.title}: the ${inner} input "${f.title ?? f.name}" is empty — connect or upload a${inner === "image" ? "n" : ""} ${inner}`
            );
          }
          continue;
        }

        if (v === undefined || v === null) continue;

        const listMatch = LIST_ASSET_RE.exec(f.type);
        if (listMatch) {
          const inner = listMatch[1] as "image" | "video" | "audio";
          if (!Array.isArray(v)) continue;
          const resolved: string[] = [];
          for (const item of v) {
            const r = await resolveAssetForAtlas(item, context, inner);
            if (r !== null) resolved.push(r);
          }
          if (resolved.length > 0) {
            if (f.wrapInto) {
              appendWrapped(input, f.wrapInto, resolved, inner);
            } else {
              input[f.name] = resolved;
            }
          }
          continue;
        }

        if (typeof v === "string" && v === "") continue;
        input[f.name] = coerceScalar(v, f.type);
      }

      const predictionId = await atlasSubmit(
        apiKey,
        specRef.modality,
        specRef.modelId,
        input
      );
      const result = await atlasPoll(apiKey, predictionId, {
        pollInterval: specRef.pollInterval ?? 3000,
        maxAttempts: specRef.maxAttempts ?? 600
      });
      const url = pickOutputUrl(result);

      // Retries 429/5xx — the job is already generated and billed by now, so a
      // transient CDN blip must not throw the paid-for result away.
      const bytes = await atlasDownload(url);

      // Preferred path: hand bytes to NodeTool storage so the result becomes a
      // proper local asset. Falls back to base64 embed if storage is missing
      // or rejects the write — that mirrors the autoSaveAsset contract used
      // by topaz-nodes.
      const isVideo = specRef.outputType === "video";
      const ext = isVideo ? "mp4" : "png";
      const mime = isVideo ? "video/mp4" : "image/png";
      const filename = `atlascloud-${specRef.outputType}-${Date.now()}.${ext}`;

      const storage = context?.storage as
        | { store?: (k: string, b: Uint8Array, m?: string) => Promise<string> }
        | null
        | undefined;
      if (storage?.store) {
        try {
          const storageUri = await storage.store(filename, bytes, mime);
          return { output: { type: specRef.outputType, uri: storageUri } };
        } catch {
          /* fall through to base64 embed */
        }
      }

      return {
        output: {
          type: specRef.outputType,
          uri: "",
          data: Buffer.from(bytes).toString("base64")
        }
      };
    }
  };

  Object.defineProperty(AtlasNodeClass, "name", {
    value: spec.className,
    configurable: true
  });
  Object.defineProperty(AtlasNodeClass, "nodeType", {
    value: nodeType,
    configurable: true
  });
  Object.defineProperty(AtlasNodeClass, "title", {
    value: title,
    configurable: true
  });
  Object.defineProperty(AtlasNodeClass, "description", {
    value: spec.description,
    configurable: true
  });
  Object.defineProperty(AtlasNodeClass, "requiredSettings", {
    value: ["ATLASCLOUD_API_KEY"],
    configurable: true
  });
  Object.defineProperty(AtlasNodeClass, "autoSaveAsset", {
    value: true,
    configurable: true
  });
  Object.defineProperty(AtlasNodeClass, "metadataOutputTypes", {
    value: { output: spec.outputType },
    configurable: true
  });
  // Every AtlasCloud model generates an image or a video — preview it in the
  // node body.
  applyContentCardBody(AtlasNodeClass);

  const { inlineFields, inputFields } = computeFieldClassification(spec.fields);
  Object.defineProperty(AtlasNodeClass, "inlineFields", {
    value: inlineFields,
    configurable: true
  });
  Object.defineProperty(AtlasNodeClass, "inputFields", {
    value: inputFields,
    configurable: true
  });

  for (const field of spec.fields) {
    // Preserve null defaults verbatim — the AtlasCloud manifests use `null`
    // to mean "field is optional with no preselected value" (e.g. aspect_ratio
    // on Nano Banana models). Coercing those to a type-default empty string
    // can fail enum-values validation, since "" isn't in the values list.
    const propDefault =
      field.default === null
        ? null
        : field.default ?? defaultForPropType(field.type);
    const propOptions: PropOptions = {
      type: field.type,
      default: propDefault
    };
    if (field.title) propOptions.title = field.title;
    if (field.description) propOptions.description = field.description;
    if (field.values?.length) propOptions.values = field.values;
    if (field.min !== undefined) propOptions.min = field.min;
    if (field.max !== undefined) propOptions.max = field.max;
    if (field.required) propOptions.required = true;

    registerDeclaredProperty(AtlasNodeClass, field.name, propOptions);
  }

  return AtlasNodeClass;
}

export function loadAtlasNodesFromManifest(
  manifest: AtlasManifestEntry[]
): NodeClass[] {
  return manifest.map(createAtlasNodeClass);
}
