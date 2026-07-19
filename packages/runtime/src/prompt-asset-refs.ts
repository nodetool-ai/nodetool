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
 * (FAL / KIE / Replicate / image-to-image) can route a mentioned image / audio
 * / video into a typed asset input with bytes already in hand.
 *
 * A mentioned plain-text document (`.md`, `.txt`, `.csv`, `.json`, …) has no
 * typed input to route to — {@link inlineTextAssetRefs} substitutes its decoded
 * contents into the prompt text in place of the token.
 */

import type { ProcessingContext } from "./context.js";
import type { MessageContent } from "./providers/types.js";
import { encodeBase64, loadMediaRefBytes } from "./media-ref-bytes.js";

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
 * Plain-text document extensions. Unlike media, a text mention has no typed
 * input to route to — its decoded content is inlined into the prompt string in
 * place of the token (see {@link inlineTextAssetRefs}).
 */
const TEXT_EXT_MIME: Record<string, string> = {
  txt: "text/plain",
  text: "text/plain",
  md: "text/markdown",
  markdown: "text/markdown",
  csv: "text/csv",
  tsv: "text/tab-separated-values",
  json: "application/json",
  jsonl: "application/json",
  ndjson: "application/json",
  xml: "application/xml",
  yaml: "application/yaml",
  yml: "application/yaml",
  html: "text/html",
  htm: "text/html",
  log: "text/plain",
  rst: "text/x-rst",
  ini: "text/plain",
  toml: "text/plain",
  srt: "text/plain",
  vtt: "text/vtt"
};

/** Lowercased extension of an `asset://<id>.<ext>` token (without the dot). */
function tokenExt(token: string): string {
  const noScheme = token.slice("asset://".length);
  const primary = noScheme.split(/[?#]/)[0];
  return (primary.split(".").pop() ?? "").toLowerCase();
}

/**
 * Classify an `asset://<id>.<ext>` token by its extension. Image, audio and
 * video are provider-consumable media (reference-to-video / lipsync models take
 * a video clip); everything else (text, unknown) returns null so the reference
 * is left for the text-inlining pass or kept as literal text in the prompt.
 */
export function classifyAssetToken(
  token: string
): { kind: AssetMediaKind; mime: string } | null {
  if (!token.startsWith("asset://")) return null;
  const ext = tokenExt(token);
  // Object.hasOwn, not `in`: `in` walks the prototype chain, so an extension of
  // "__proto__"/"toString"/"constructor" would match an inherited key and
  // return a non-string (object/function) mime, fabricating a bogus media ref.
  if (Object.hasOwn(IMAGE_EXT_MIME, ext))
    return { kind: "image", mime: IMAGE_EXT_MIME[ext] };
  if (Object.hasOwn(AUDIO_EXT_MIME, ext))
    return { kind: "audio", mime: AUDIO_EXT_MIME[ext] };
  if (Object.hasOwn(VIDEO_EXT_MIME, ext))
    return { kind: "video", mime: VIDEO_EXT_MIME[ext] };
  return null;
}

/**
 * Classify an `asset://<id>.<ext>` token as a plain-text document. Returns null
 * for non-text tokens (media, folders, unknown) so they are left untouched by
 * the text-inlining pass.
 */
export function classifyTextToken(token: string): { mime: string } | null {
  if (!token.startsWith("asset://")) return null;
  const ext = tokenExt(token);
  return Object.hasOwn(TEXT_EXT_MIME, ext)
    ? { mime: TEXT_EXT_MIME[ext] }
    : null;
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
  if (top === "image" && Object.hasOwn(IMAGE_EXT_MIME, sub)) return sub;
  if (top === "audio" && Object.hasOwn(AUDIO_EXT_MIME, sub)) return sub;
  if (top === "video" && Object.hasOwn(VIDEO_EXT_MIME, sub)) return sub;
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
 * Trim trailing dots (sentence punctuation) off a token. A character loop, not
 * `/\.+$/` — that regex backtracks polynomially on long dot runs, which CodeQL
 * flags as a ReDoS risk on prompt-derived input.
 */
function trimTrailingDots(token: string): string {
  let end = token.length;
  while (end > 0 && token[end - 1] === ".") {
    end--;
  }
  return token.slice(0, end);
}

/**
 * Collapse horizontal-whitespace gaps left behind by token substitution:
 * runs of 2+ spaces/tabs become one space, horizontal whitespace before a
 * newline is dropped, and the result is trimmed. A single pass instead of
 * `/[ \t]{2,}/` + `/[ \t]+\n/` — those backtrack polynomially on long
 * space/tab runs (a ReDoS risk on prompt-derived input).
 */
function collapseGapWhitespace(text: string): string {
  let out = "";
  let run = ""; // pending run of spaces/tabs
  for (const ch of text) {
    if (ch === " " || ch === "\t") {
      run += ch;
      continue;
    }
    if (ch === "\n") {
      // Drop horizontal whitespace before a newline.
      run = "";
      out += "\n";
      continue;
    }
    if (run) {
      out += run.length > 1 ? " " : run;
      run = "";
    }
    out += ch;
  }
  if (run) {
    out += run.length > 1 ? " " : run;
  }
  return out.trim();
}

/**
 * Scan a prompt for `asset://` tokens in source order, yielding each token with
 * its source offset. Trailing dots are treated as sentence punctuation (not
 * part of the extension), so `asset://a.png.` yields `asset://a.png` and leaves
 * the period in the surrounding text. Classification is left to the caller.
 */
function scanAssetTokens(
  prompt: string
): Array<{ token: string; index: number }> {
  const out: Array<{ token: string; index: number }> = [];
  ASSET_URI_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ASSET_URI_RE.exec(prompt)) !== null) {
    const token = trimTrailingDots(match[0]);
    out.push({ token, index: match.index });
  }
  return out;
}

/**
 * Find every classifiable media reference in a prompt, in source order.
 *
 * Unclassifiable tokens (no/unknown extension, e.g. `asset://doc.txt`) are
 * skipped and remain literal text — text documents are handled separately by
 * {@link findTextAssetRefs} / {@link inlineTextAssetRefs}.
 */
export function findAssetRefs(prompt: string): PromptAssetRef[] {
  const refs: PromptAssetRef[] = [];
  for (const { token, index } of scanAssetTokens(prompt)) {
    const classification = classifyAssetToken(token);
    if (!classification) continue;
    refs.push({
      uri: token,
      kind: classification.kind,
      mime: classification.mime,
      index,
      length: token.length
    });
  }
  return refs;
}

/** A text-document reference found inline in a prompt. */
export interface TextAssetRef {
  uri: string;
  mime: string;
  index: number;
  length: number;
}

/** Find every plain-text document reference in a prompt, in source order. */
export function findTextAssetRefs(prompt: string): TextAssetRef[] {
  const refs: TextAssetRef[] = [];
  for (const { token, index } of scanAssetTokens(prompt)) {
    const classification = classifyTextToken(token);
    if (!classification) continue;
    refs.push({ uri: token, mime: classification.mime, index, length: token.length });
  }
  return refs;
}

/**
 * Replace each plain-text document mention in `prompt` with the asset's decoded
 * UTF-8 contents, inline. A mention that can't be resolved to bytes is left as
 * its literal token (never silently dropped). Media mentions are untouched.
 */
export async function inlineTextAssetRefs(
  prompt: string,
  context?: ProcessingContext
): Promise<string> {
  if (!context || !prompt.includes("asset://")) return prompt;
  const refs = findTextAssetRefs(prompt);
  if (refs.length === 0) return prompt;

  const decoder = new TextDecoder();
  const contents = await Promise.all(
    refs.map(async (ref) => {
      const bytes = await loadMediaRefBytes({ type: "text", uri: ref.uri }, context);
      // A resolved-but-empty asset must inline as "" (not fall back to the
      // literal token); only a failed resolution (null bytes) keeps the token.
      return bytes ? decoder.decode(bytes) : null;
    })
  );

  let result = "";
  let cursor = 0;
  refs.forEach((ref, i) => {
    if (ref.index < cursor) return;
    result += prompt.slice(cursor, ref.index);
    // Inline the decoded text, or keep the literal token when resolution failed.
    result += contents[i] ?? prompt.slice(ref.index, ref.index + ref.length);
    cursor = ref.index + ref.length;
  });
  result += prompt.slice(cursor);
  return result;
}

/** Convenience: only the image references in a prompt. */
export function findImageAssetRefs(prompt: string): PromptAssetRef[] {
  return findAssetRefs(prompt).filter((ref) => ref.kind === "image");
}

/**
 * Split a prompt containing inline `asset://<id>.<ext>` references into a
 * multimodal content array: text segments interleaved with image / audio
 * blocks that carry the `asset://` URI verbatim. The blocks are NOT resolved
 * here — {@link ProcessingContext.resolveMessageMediaUris} dereferences the
 * URIs to data URIs just before the provider call. Tokens that aren't a
 * supported chat media type (video, unknown) stay as literal text so the
 * model still sees the mention.
 */
export function expandAssetReferences(prompt: string): MessageContent[] {
  const refs = findAssetRefs(prompt);
  if (refs.length === 0) {
    return [{ type: "text", text: prompt }];
  }

  const parts: MessageContent[] = [];
  const pushText = (text: string) => {
    if (text) parts.push({ type: "text", text });
  };

  let cursor = 0;
  for (const ref of refs) {
    pushText(prompt.slice(cursor, ref.index));
    if (ref.kind === "image") {
      parts.push({
        type: "image_url",
        image: { uri: ref.uri, mimeType: ref.mime }
      });
    } else if (ref.kind === "audio") {
      parts.push({
        type: "audio",
        audio: { uri: ref.uri, mimeType: ref.mime }
      });
    } else {
      // Video (and any other non-chat media): keep the mention as literal text
      // so the model still sees the reference rather than a mislabeled block.
      pushText(ref.uri);
    }
    cursor = ref.index + ref.length;
  }
  pushText(prompt.slice(cursor));

  return parts.length > 0 ? parts : [{ type: "text", text: prompt }];
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
  return collapseGapWhitespace(result);
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
  return collapseGapWhitespace(result);
}

/** Matches an inline `entity://<id>` token (an entity mention from `@`). */
const ENTITY_URI_RE = /entity:\/\/[A-Za-z0-9._~-]+/g;

/** The prompt-relevant fields of an asset's `nodetool_entity` marker. */
interface EntityMarkerLike {
  name: string;
  descriptor: string;
}

/** Read the entity marker off asset metadata, or null when absent/malformed. */
function readEntityMarker(
  metadata: Record<string, unknown> | null
): EntityMarkerLike | null {
  const raw = metadata?.["nodetool_entity"];
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const name = typeof obj.name === "string" ? obj.name.trim() : "";
  if (!name) return null;
  const descriptor =
    typeof obj.descriptor === "string" ? obj.descriptor.trim() : "";
  return { name, descriptor };
}

/**
 * Expand `entity://<id>` mentions (entities are library assets tagged with a
 * `nodetool_entity` marker; the `@`-mention pickers encode them as this token).
 *
 * Each token is replaced inline with the entity's **name** so the sentence
 * still reads naturally, and every mentioned entity contributes once to a
 * trailing `Consistency references:` block carrying its canonical descriptor —
 * the same shape the Apply Entities node produces. With `includeImageRefs`,
 * each entity's reference image is appended as an `asset://<id>.<ext>` token so
 * the normal media-mention machinery routes it into a typed image input.
 *
 * Resolution happens here, at generation time, so later edits to an entity's
 * descriptor or image propagate to every prompt that mentions it. A token that
 * cannot be resolved (unknown id, no marker, no context) is dropped.
 */
export async function expandEntityRefs(
  text: string,
  context: ProcessingContext | undefined,
  includeImageRefs: boolean
): Promise<string> {
  if (!text.includes("entity://")) return text;

  const tokens: Array<{ index: number; length: number; id: string }> = [];
  ENTITY_URI_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ENTITY_URI_RE.exec(text)) !== null) {
    // Trailing dots are sentence punctuation, not part of the id.
    const token = trimTrailingDots(match[0]);
    tokens.push({
      index: match.index,
      length: token.length,
      id: token.slice("entity://".length)
    });
  }
  if (tokens.length === 0) return text;

  // Resolve each unique id once; a mention of the same entity twice reads as
  // its name twice but contributes a single consistency line / image ref.
  const resolved = new Map<
    string,
    { marker: EntityMarkerLike; imageToken: string | null } | null
  >();
  for (const token of tokens) {
    if (resolved.has(token.id)) continue;
    const info =
      typeof context?.getAssetInfo === "function"
        ? await context.getAssetInfo(token.id)
        : null;
    const marker = info ? readEntityMarker(info.metadata) : null;
    if (!info || !marker) {
      resolved.set(token.id, null);
      continue;
    }
    const ext = extForContentType(info.content_type);
    resolved.set(token.id, {
      marker,
      imageToken: ext ? `asset://${info.id}.${ext}` : null
    });
  }

  let result = "";
  let cursor = 0;
  const consistencyLines: string[] = [];
  const imageTokens: string[] = [];
  const contributed = new Set<string>();
  for (const token of tokens) {
    result += text.slice(cursor, token.index);
    cursor = token.index + token.length;
    const entity = resolved.get(token.id);
    if (!entity) continue; // unresolvable mention → dropped
    result += entity.marker.name;
    if (contributed.has(token.id)) continue;
    contributed.add(token.id);
    if (entity.marker.descriptor) {
      consistencyLines.push(
        `- ${entity.marker.name}: ${entity.marker.descriptor}`
      );
    }
    if (includeImageRefs && entity.imageToken) {
      imageTokens.push(entity.imageToken);
    }
  }
  result += text.slice(cursor);
  result = collapseGapWhitespace(result);

  if (consistencyLines.length > 0) {
    result += `\n\nConsistency references:\n${consistencyLines.join("\n")}`;
  }
  if (imageTokens.length > 0) {
    result += `\n${imageTokens.join(" ")}`;
  }
  return result;
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
 * Plain-text document mentions are inlined into the prompt as their decoded
 * contents (see {@link inlineTextAssetRefs}). This applies even when the node
 * has no media inputs at all (e.g. a text-to-image prompt referencing a brief).
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
  const acceptedKinds = new Set(assetFields.map((f) => f.kind));

  // Expand entity mentions first (they inject descriptor text and, when the
  // node accepts images, an `asset://` reference-image token), then folder
  // mentions (only meaningful when the node has media inputs to receive them),
  // and work off the expanded text. The original value is kept to decide
  // whether the field actually changed (a folder that expanded to nothing
  // still rewrites text).
  const expandedByField = new Map<string, string>();
  for (const tf of textFields) {
    const withEntities = await expandEntityRefs(
      tf.value,
      context,
      acceptedKinds.has("image")
    );
    expandedByField.set(
      tf.name,
      assetFields.length > 0
        ? await expandFolderRefs(withEntities, context, acceptedKinds)
        : withEntities
    );
  }

  // A node with no typed media inputs still inlines plain-text document
  // mentions into its prompt — that's the only transformation that applies.
  if (assetFields.length === 0) {
    for (const tf of textFields) {
      const inlined = await inlineTextAssetRefs(
        expandedByField.get(tf.name) ?? tf.value,
        context
      );
      if (inlined !== tf.value) overrides[tf.name] = inlined;
    }
    return overrides;
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
      injected.data = encodeBase64(bytes);
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

  // Rewrite each text input off its (folder-)expanded value: a placed media
  // mention becomes a reference to the input label it now lives in; an unplaced
  // one is dropped. Then inline any plain-text document mentions into the
  // result — done after the media rewrite so the document's own whitespace
  // isn't touched by the gap-collapsing in `replaceAssetRefs`. Compared against
  // the original so a folder that expanded to nothing still rewrites the field.
  for (const tf of textFields) {
    const expanded = expandedByField.get(tf.name) ?? tf.value;
    const refs = refsByField.get(tf.name) ?? [];
    const relabeled = replaceAssetRefs(
      expanded,
      refs,
      (ref) => labelByRef.get(ref) ?? ""
    );
    const rewritten = await inlineTextAssetRefs(relabeled, context);
    if (rewritten !== tf.value) overrides[tf.name] = rewritten;
  }

  return overrides;
}
