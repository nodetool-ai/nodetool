/**
 * Inline asset references in prompt text.
 *
 * Prompt-style surfaces (the Prompt composer, chat) let users mention an asset
 * with `@`, which encodes as an `asset://<id>.<ext>` token inside the plain
 * prompt string. Text-generation tasks expand these tokens into multimodal
 * image / audio message blocks before the provider call. This module is the
 * shared, provider-agnostic parser so other task types (e.g. image-to-image)
 * can pull the same referenced media out of a prompt and route it to a typed
 * input instead of leaving a dangling `asset://` URI in the text.
 *
 * The low-level parsing is resolution-free — callers hand the verbatim
 * `asset://` URI to {@link loadMediaRefBytes} / `resolveMessageMediaUris`,
 * which dereference it to bytes / a data URI just before it is consumed. The
 * higher-level {@link mapPromptAssetsToInputs} does resolve, so provider nodes
 * (FAL / KIE / Replicate / image-to-image) can route a mentioned image into a
 * typed asset input with bytes already in hand.
 */

import type { ProcessingContext } from "./context.js";
import { loadMediaRefBytes } from "./media-ref-bytes.js";

export type AssetMediaKind = "image" | "audio" | "video";

/** Matches an inline `asset://<id>.<ext>` token (greedy over the URI charset). */
const ASSET_URI_RE = /asset:\/\/[A-Za-z0-9._~\-/]+/g;

const IMAGE_EXT_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  svg: "image/svg+xml"
};

const AUDIO_EXT_MIME: Record<string, string> = {
  mp3: "audio/mpeg",
  mpeg: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  flac: "audio/flac",
  opus: "audio/opus"
};

const VIDEO_EXT_MIME: Record<string, string> = {
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  mkv: "video/x-matroska",
  avi: "video/x-msvideo"
};

/**
 * Classify an `asset://<id>.<ext>` token by its extension. Image, audio and
 * video are provider-consumable media (reference-to-video / lipsync models take
 * a video clip); everything else (text, unknown) returns null so the reference
 * is left as literal text in the prompt.
 */
export function classifyAssetToken(
  token: string
): { kind: AssetMediaKind; mime: string } | null {
  if (!token.startsWith("asset://")) return null;
  const noScheme = token.slice("asset://".length);
  const primary = noScheme.split(/[?#]/)[0];
  const ext = (primary.split(".").pop() ?? "").toLowerCase();
  if (ext in IMAGE_EXT_MIME) return { kind: "image", mime: IMAGE_EXT_MIME[ext] };
  if (ext in AUDIO_EXT_MIME) return { kind: "audio", mime: AUDIO_EXT_MIME[ext] };
  if (ext in VIDEO_EXT_MIME) return { kind: "video", mime: VIDEO_EXT_MIME[ext] };
  return null;
}

/**
 * Pick a media extension for a content type so a stored asset can be turned
 * back into a classifiable `asset://<id>.<ext>` token. Returns null for content
 * types that aren't a recognized image/audio/video kind (folders, documents).
 */
function extForContentType(contentType: string): string | null {
  const ct = (contentType ?? "").toLowerCase().split(";")[0].trim();
  const slash = ct.indexOf("/");
  if (slash <= 0) return null;
  const top = ct.slice(0, slash);
  let sub = ct.slice(slash + 1).split("+")[0];
  if (ct === "audio/mpeg" || ct === "audio/mp3") sub = "mp3";
  else if (ct === "audio/mp4") sub = "m4a";
  else if (ct === "video/quicktime") sub = "mov";
  if (top === "image" && sub in IMAGE_EXT_MIME) return sub;
  if (top === "audio" && sub in AUDIO_EXT_MIME) return sub;
  if (top === "video" && sub in VIDEO_EXT_MIME) return sub;
  return null;
}

export interface PromptAssetRef {
  /** Full `asset://<id>.<ext>` token, trailing sentence punctuation trimmed. */
  uri: string;
  kind: AssetMediaKind;
  mime: string;
  /** Start offset of the token in the source prompt. */
  index: number;
  /** Length of the (trimmed) token in the source prompt. */
  length: number;
}

/**
 * Find every classifiable media reference in a prompt, in source order.
 *
 * Trailing dots on a token are treated as sentence punctuation (not part of
 * the extension), so `asset://a.png.` yields the `asset://a.png` ref and leaves
 * the period in the surrounding text. Unclassifiable tokens (no/unknown
 * extension, e.g. `asset://doc.txt`) are skipped and remain literal text.
 */
export function findAssetRefs(prompt: string): PromptAssetRef[] {
  const refs: PromptAssetRef[] = [];
  ASSET_URI_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ASSET_URI_RE.exec(prompt)) !== null) {
    let token = match[0];
    const trailingDots = token.match(/\.+$/);
    if (trailingDots) {
      token = token.slice(0, token.length - trailingDots[0].length);
    }
    const classification = classifyAssetToken(token);
    if (!classification) continue;
    refs.push({
      uri: token,
      kind: classification.kind,
      mime: classification.mime,
      index: match.index,
      length: token.length
    });
  }
  return refs;
}

/** Convenience: only the image references in a prompt. */
export function findImageAssetRefs(prompt: string): PromptAssetRef[] {
  return findAssetRefs(prompt).filter((ref) => ref.kind === "image");
}

/**
 * Rewrite the given references inside the prompt, substituting each with the
 * string `replace(ref)` returns (return `""` to drop it). Refs must come from
 * {@link findAssetRefs} on the same string (they carry the source offsets).
 * Horizontal whitespace left behind is collapsed so the result reads cleanly;
 * newlines are preserved.
 */
function replaceAssetRefs(
  prompt: string,
  refs: PromptAssetRef[],
  replace: (ref: PromptAssetRef) => string
): string {
  if (refs.length === 0) return prompt;
  let result = "";
  let cursor = 0;
  for (const ref of refs) {
    if (ref.index < cursor) continue;
    result += prompt.slice(cursor, ref.index);
    result += replace(ref);
    cursor = ref.index + ref.length;
  }
  result += prompt.slice(cursor);
  return result
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

/**
 * Remove the given references from the prompt, collapsing the horizontal
 * whitespace left behind so the remaining text reads as a clean instruction.
 * Refs must come from {@link findAssetRefs} on the same string. Newlines are
 * preserved.
 */
export function stripAssetRefs(
  prompt: string,
  refs: PromptAssetRef[]
): string {
  return replaceAssetRefs(prompt, refs, () => "");
}

/** A free-text field whose value should be scanned for asset mentions. */
export interface PromptAssetTextField {
  name: string;
  value: string;
}

/** A typed media input the node exposes (image/audio), with its current state. */
export interface PromptAssetInputField {
  name: string;
  /**
   * Token used to reference this input back in the prompt text once a mention
   * is routed into it (e.g. the API param name `image_url`). Defaults to
   * `name`. List inputs are indexed: `${label}[0]`, `${label}[1]`, …
   */
  label?: string;
  kind: AssetMediaKind;
  /** True for `list[...]` fields that accept multiple refs. */
  list?: boolean;
  /** True when the field already holds a real source (wired/set upstream). */
  hasSource: boolean;
}

/** A resolved media ref ready to drop into a node's asset input. */
export interface InjectedAssetRef {
  type: AssetMediaKind;
  /** The original `asset://` URI, kept for provenance / fallback resolution. */
  uri: string;
  mimeType: string;
  /** base64 of the resolved bytes; present when resolution succeeded. */
  data?: string;
}

/**
 * Expand any folder mention in `text` into the `asset://<id>.<ext>` tokens of
 * its members of an accepted kind, recursively. A folder mention is a bare
 * `asset://<id>` (no extension) that {@link ProcessingContext.listFolderAssets}
 * resolves to a folder; non-folder bare tokens and ordinary media tokens are
 * left untouched. The expanded tokens then flow through the normal matcher, so
 * a referenced folder fills as many of the node's media inputs as it can.
 */
async function expandFolderRefs(
  text: string,
  context: ProcessingContext | undefined,
  acceptedKinds: Set<AssetMediaKind>
): Promise<string> {
  if (!context || !text.includes("asset://")) return text;

  // Bare `asset://<id>` tokens (no extension) are folder candidates.
  const candidates: { index: number; length: number; id: string }[] = [];
  ASSET_URI_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ASSET_URI_RE.exec(text)) !== null) {
    const token = match[0];
    const id = token.slice("asset://".length);
    if (id.includes(".")) continue; // has an extension → a media ref, not a folder
    candidates.push({ index: match.index, length: token.length, id });
  }
  if (candidates.length === 0) return text;

  const replacements = new Map<number, string>();
  for (const candidate of candidates) {
    const entries = await context.listFolderAssets(candidate.id);
    if (!entries) continue; // not a folder → leave the token alone
    const uris: string[] = [];
    for (const entry of entries) {
      const ext = extForContentType(entry.content_type);
      if (!ext) continue;
      const classification = classifyAssetToken(`asset://${entry.id}.${ext}`);
      if (!classification || !acceptedKinds.has(classification.kind)) continue;
      uris.push(`asset://${entry.id}.${ext}`);
    }
    replacements.set(candidate.index, uris.join(" "));
  }
  if (replacements.size === 0) return text;

  let result = "";
  let cursor = 0;
  for (const candidate of candidates) {
    const replacement = replacements.get(candidate.index);
    if (replacement === undefined) continue;
    result += text.slice(cursor, candidate.index);
    result += replacement;
    cursor = candidate.index + candidate.length;
  }
  result += text.slice(cursor);
  return result
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

/**
 * Map media mentioned inline in a node's text inputs onto its typed media
 * inputs. This is the generalized form of what text-generation tasks do when
 * they expand `asset://` references into image / audio message blocks.
 *
 * A mention may be a single asset or a folder: folder mentions are expanded
 * recursively to their member assets first (see {@link expandFolderRefs}), so a
 * referenced folder fills as many inputs as it can.
 *
 * For every media kind the node actually accepts (derived from `assetFields`):
 *   - mentions of that kind are pulled out of the text inputs, in order;
 *   - each still-empty input of that kind is filled with the next mention,
 *     resolved to bytes (`data`) so the provider's normal `data` path uploads
 *     it — no provider needs to learn the `asset://` scheme;
 *   - `list[...]` inputs absorb all remaining mentions of their kind;
 *   - each placed mention is rewritten in the text to the input label it now
 *     lives in (`image_url`, `reference_image_urls[0]`, …) so the model can
 *     tell which slot holds which image; mentions that could not be placed
 *     (an input was already wired, or capacity ran out) are dropped rather
 *     than left as a dangling URI.
 *
 * Inputs that already carry a source are left untouched. Returns a flat map of
 * field name → replacement value (cleaned string for text fields, an
 * {@link InjectedAssetRef} or array for asset fields); fields that did not
 * change are absent, so callers do `overrides[name] ?? instance[name]`.
 */
export async function mapPromptAssetsToInputs(
  textFields: PromptAssetTextField[],
  assetFields: PromptAssetInputField[],
  context?: ProcessingContext
): Promise<Record<string, unknown>> {
  const overrides: Record<string, unknown> = {};
  if (assetFields.length === 0) return overrides;

  const acceptedKinds = new Set(assetFields.map((f) => f.kind));

  // Expand any folder mentions into their member assets first, then work off
  // the expanded text. The original value is kept to decide whether the field
  // actually changed (a folder that expanded to nothing still rewrites text).
  const expandedByField = new Map<string, string>();
  for (const tf of textFields) {
    expandedByField.set(
      tf.name,
      await expandFolderRefs(tf.value, context, acceptedKinds)
    );
  }

  // Refs of accepted kinds, queued per kind in source order across all text
  // fields, plus the per-field ref list used for relabeling.
  const queues: Record<AssetMediaKind, PromptAssetRef[]> = {
    image: [],
    audio: [],
    video: []
  };
  const refsByField = new Map<string, PromptAssetRef[]>();
  for (const tf of textFields) {
    const refs = findAssetRefs(expandedByField.get(tf.name) ?? tf.value).filter(
      (r) => acceptedKinds.has(r.kind)
    );
    if (refs.length === 0) continue;
    refsByField.set(tf.name, refs);
    for (const ref of refs) queues[ref.kind].push(ref);
  }

  const resolveRef = async (
    ref: PromptAssetRef
  ): Promise<InjectedAssetRef> => {
    const injected: InjectedAssetRef = {
      type: ref.kind,
      uri: ref.uri,
      mimeType: ref.mime
    };
    const bytes = await loadMediaRefBytes(
      { type: ref.kind, uri: ref.uri },
      context
    );
    if (bytes && bytes.length > 0) {
      injected.data = Buffer.from(bytes).toString("base64");
    }
    return injected;
  };

  // Fill empty inputs in declaration order from the matching kind's queue,
  // recording which input label each placed mention was routed into.
  const labelByRef = new Map<PromptAssetRef, string>();
  const cursor: Record<AssetMediaKind, number> = { image: 0, audio: 0, video: 0 };
  for (const field of assetFields) {
    if (field.hasSource) continue;
    const queue = queues[field.kind];
    if (cursor[field.kind] >= queue.length) continue;
    const label = field.label ?? field.name;
    if (field.list) {
      const remaining = queue.slice(cursor[field.kind]);
      cursor[field.kind] = queue.length;
      const resolved: InjectedAssetRef[] = [];
      for (let i = 0; i < remaining.length; i++) {
        labelByRef.set(remaining[i], `${label}[${i}]`);
        resolved.push(await resolveRef(remaining[i]));
      }
      if (resolved.length > 0) overrides[field.name] = resolved;
    } else {
      const ref = queue[cursor[field.kind]++];
      labelByRef.set(ref, label);
      overrides[field.name] = await resolveRef(ref);
    }
  }

  // Rewrite each text input off its (folder-)expanded value: a placed mention
  // becomes a reference to the input label it now lives in; a mention that
  // could not be placed is dropped. Compared against the original so a folder
  // that expanded to nothing still rewrites the field.
  for (const tf of textFields) {
    const expanded = expandedByField.get(tf.name) ?? tf.value;
    const refs = refsByField.get(tf.name) ?? [];
    const rewritten = replaceAssetRefs(
      expanded,
      refs,
      (ref) => labelByRef.get(ref) ?? ""
    );
    if (rewritten !== tf.value) overrides[tf.name] = rewritten;
  }

  return overrides;
}
