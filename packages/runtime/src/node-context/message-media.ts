/**
 * The message media logic of `NodeContext.resolveMessageMediaUris` and the
 * strict image evidence path of `generate_message`, over a {@link MediaHost}.
 * See `context-host.ts` for the host contract and the QuickJS constraints.
 */
import type { MessageContent, Message } from "../providers/types.js";
import { validateImageEvidence } from "../image-codec.js";
import {
  encodeBase64,
  loadMediaRefBytes,
  type MediaRefValue
} from "../media-ref-bytes.js";
import {
  expandAssetReferences,
  expandEntityRefs,
  inlineTextAssetRefs
} from "../prompt-asset-refs.js";
import { sniffImageMime } from "../providers/image-mime.js";
import type { MediaHost } from "./context-host.js";

/**
 * Retrieve raw bytes for a media URI referenced in message content. Handles
 * the `asset://<id>` reference scheme (via `host.resolveAssetBytes`) as well
 * as opaque storage URIs (memory/file/s3) via the storage adapter.
 */
export async function retrieveMediaBytes(
  host: MediaHost,
  uri: string
): Promise<Uint8Array | null> {
  // `/api/storage/<key>` (and its slash-less `api/storage/<key>` form) is the
  // browser-facing route, not a storage-adapter uri — the InMemory/S3 adapters
  // only accept `memory://`/`s3://`, so route it through resolveAssetBytes
  // (which parses the key) like `asset://`.
  if (
    uri.startsWith("asset://") ||
    uri.startsWith("/api/storage/") ||
    uri.startsWith("api/storage/")
  ) {
    const { bytes } = await host.resolveAssetBytes(uri);
    return bytes;
  }
  for (const adapter of [host.assetStorage, host.storage]) {
    if (!adapter) continue;
    const bytes = await adapter.retrieve(uri);
    if (bytes) return bytes;
  }
  return null;
}

/**
 * Resolve non-data, non-http media URIs in message content to data URIs so
 * providers can consume them directly. Covers `/api/storage/` and other
 * storage URIs as well as the `asset://<id>` reference scheme (assets
 * mentioned inline in a prompt). Text parts that contain `asset://<id>.<ext>`
 * image / audio tokens are first split into proper blocks via
 * {@link expandAssetReferences} so the same provider path handles chat
 * surfaces (where the user typed / dropped a reference) and workflow node
 * surfaces (where the agent node builds the message). Text document mentions
 * (`asset://doc.md`, `.txt`, `.csv`, …) are inlined as their decoded
 * contents in place of the token.
 */
export async function resolveMessageMediaUris(
  host: MediaHost,
  messages: Message[]
): Promise<Message[]> {
  const IMAGE_MIME: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp"
  };
  const AUDIO_MIME: Record<string, string> = {
    mp3: "audio/mpeg",
    wav: "audio/wav",
    ogg: "audio/ogg",
    m4a: "audio/mp4",
    flac: "audio/flac"
  };
  const VIDEO_MIME: Record<string, string> = {
    mp4: "video/mp4",
    m4v: "video/mp4",
    webm: "video/webm",
    mov: "video/quicktime",
    avi: "video/x-msvideo"
  };

  // Strict, anchored sanitizer for the URIs that may flow into the asset /
  // storage retrieval path. Accept asset references, the browser-facing
  // storage route, and URIs from configured storage adapters. External URLs
  // and unrecognized schemes stay out of the storage adapter. `:` is allowed
  // for named owner ids such as `projects/personal:<user_id>/assets/…`.
  const RESOLVABLE_URI_RE =
    /^(?:asset:\/\/|\/?api\/storage\/|(?:memory|file|s3|supabase):\/\/)[A-Za-z0-9._~/%:-]+$/;
  const isResolvableUri = (uri: string): boolean =>
    RESOLVABLE_URI_RE.test(uri);

  // An `asset://` reference that cannot be dereferenced must not reach the
  // provider: providers `fetch` a non-data URI, and the SSRF guard then
  // rejects `asset://…` with "Refusing to fetch unsafe URL", which fails the
  // whole turn on a message the user cannot fix. Replace the block with a
  // note the model can act on instead — a stale attachment in the history
  // must not break every later turn in the thread.
  const unresolvedNote = (kind: string, uri: string): MessageContent => ({
    type: "text",
    text: `[attached ${kind} could not be ${kind === "image" ? "shown" : "loaded"}: ${uri}]`
  });

  // A resolved block reaches the provider as a `data:` URI, which the model
  // cannot pass to a tool. Emit the stored handle beside it so "make it like
  // this" can become `edit_image({input_file: "asset://…"})` — only for the
  // URIs `isResolvableUri` admits, never for a `data:` URI the caller already
  // inlined.
  const attachedNote = (kind: string, uri: string): MessageContent => ({
    type: "text",
    text: `[attached ${kind} ${uri}]`
  });

  const resolvePart = async (
    part: MessageContent,
    // Parts split out of a text block already carry the literal token next
    // to them (see `expandAssetReferences`), so a note there would repeat it.
    fromText = false
  ): Promise<MessageContent[]> => {
    if (
      part.type === "image_url" &&
      part.image.uri &&
      isResolvableUri(part.image.uri)
    ) {
      const bytes = await retrieveMediaBytes(host, part.image.uri);
      if (bytes) {
        const ext = part.image.uri.split(".").pop()?.toLowerCase() ?? "png";
        const mimeType =
          IMAGE_MIME[ext] ?? part.image.mimeType ?? "image/png";
        const b64 = encodeBase64(bytes);
        const block: MessageContent = {
          type: "image_url",
          image: { uri: `data:${mimeType};base64,${b64}`, mimeType }
        };
        return fromText
          ? [block]
          : [block, attachedNote("image", part.image.uri)];
      }
      return [unresolvedNote("image", part.image.uri)];
    }
    if (
      part.type === "audio" &&
      part.audio.uri &&
      isResolvableUri(part.audio.uri)
    ) {
      const bytes = await retrieveMediaBytes(host, part.audio.uri);
      if (bytes) {
        const ext = part.audio.uri.split(".").pop()?.toLowerCase() ?? "mp3";
        const mimeType =
          AUDIO_MIME[ext] ?? part.audio.mimeType ?? "audio/mpeg";
        const b64 = encodeBase64(bytes);
        const block: MessageContent = {
          type: "audio",
          audio: { uri: `data:${mimeType};base64,${b64}`, mimeType }
        };
        return fromText
          ? [block]
          : [block, attachedNote("audio", part.audio.uri)];
      }
      return [unresolvedNote("audio", part.audio.uri)];
    }
    if (
      part.type === "video" &&
      part.video.uri &&
      isResolvableUri(part.video.uri)
    ) {
      const bytes = await retrieveMediaBytes(host, part.video.uri);
      if (bytes) {
        const ext = part.video.uri.split(".").pop()?.toLowerCase() ?? "mp4";
        const mimeType =
          VIDEO_MIME[ext] ?? part.video.mimeType ?? "video/mp4";
        const b64 = encodeBase64(bytes);
        const block: MessageContent = {
          type: "video",
          video: { uri: `data:${mimeType};base64,${b64}`, mimeType }
        };
        return fromText
          ? [block]
          : [block, attachedNote("video", part.video.uri)];
      }
      return [unresolvedNote("video", part.video.uri)];
    }
    if (part.type === "text") {
      // Entity mentions resolve first: each `entity://<id>` becomes the
      // entity's name inline, a "Consistency references" line carrying its
      // descriptor, and an `asset://` token for its reference image — which
      // the asset pass below then turns into a real image block. Resolving
      // here, per turn, is what makes a later rename or re-description
      // reach every message that already mentions the entity.
      const text = await expandEntityRefs(part.text, host, true);
      if (!text.includes("asset://")) {
        return text === part.text ? [part] : [{ type: "text", text }];
      }
      // First split out image / audio mentions into their own blocks; what
      // stays as text is then run through the document inliner so any
      // .md/.txt/.csv mentions become their decoded contents. The image and
      // audio blocks fall through to the URI-resolution branches above on a
      // second pass so the provider receives data URIs.
      const expanded = expandAssetReferences(text);
      const out: MessageContent[] = [];
      for (const sub of expanded) {
        if (sub.type === "text") {
          const inlined = await inlineTextAssetRefs(sub.text, host);
          if (inlined) out.push({ type: "text", text: inlined });
        } else {
          const resolved = await resolvePart(sub, true);
          out.push(...resolved);
        }
      }
      return out;
    }
    return [part];
  };

  const resolved: Message[] = [];
  for (const msg of messages) {
    if (!Array.isArray(msg.content)) {
      resolved.push(msg);
      continue;
    }
    const parts: MessageContent[] = [];
    for (const part of msg.content) {
      parts.push(...(await resolvePart(part)));
    }
    resolved.push({ ...msg, content: parts });
  }
  return resolved;
}

export async function resolveRequiredImageEvidence(
  host: MediaHost,
  messages: Message[],
  required: readonly string[] = []
): Promise<Message[]> {
  const evidence = new Map<string, MessageContent>();
  const resolve = async (ref: MediaRefValue): Promise<MessageContent> => {
    const identity = ref.uri?.startsWith("data:")
      ? "inline image"
      : ref.uri ?? ref.asset_id ?? "inline image";
    const cached = ref.uri ? evidence.get(ref.uri) : undefined;
    if (cached) {
      return cached;
    }
    try {
      const bytes = await loadMediaRefBytes(ref, host);
      if (!bytes?.length) {
        throw new Error("no image bytes");
      }
      const mimeType = sniffImageMime(bytes);
      if (
        !mimeType ||
        !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(
          mimeType
        )
      ) {
        throw new Error("unsupported image format");
      }
      await validateImageEvidence(bytes);
      const block: MessageContent = {
        type: "image_url",
        image: {
          uri: `data:${mimeType};base64,${encodeBase64(bytes)}`,
          mimeType
        }
      };
      if (ref.uri) {
        evidence.set(ref.uri, block);
      }
      return block;
    } catch (error) {
      throw new Error(
        `Required image evidence unavailable: ${identity} (${error instanceof Error ? error.message : String(error)})`
      );
    }
  };
  for (const uri of required) {
    await resolve({ type: "image", uri });
  }
  const result: Message[] = [];
  for (const message of messages) {
    if (!Array.isArray(message.content)) {
      result.push(message);
      continue;
    }
    const content: MessageContent[] = [];
    let imageIndex = 0;
    for (const part of message.content) {
      if (part.type === "image_url") {
        imageIndex++;
        content.push(await resolve(part.image), {
          type: "text",
          text: `[required image ${
            part.image.uri && !part.image.uri.startsWith("data:")
              ? part.image.uri
              : `inline image ${imageIndex}`
          }]`
        });
      } else {
        content.push(part);
      }
    }
    result.push({ ...message, content });
  }
  return result;
}
