/**
 * Image injection — the runtime-primitive half of lazy image viewing.
 *
 * An agent's context normally carries only *handles* to images (an asset id,
 * size, and content type — see `list_images`). Pixels are expensive, so they
 * are not in context until the model asks for them. When the model calls a tool
 * like `view_image`, that tool returns a light JSON summary plus an
 * `image_content` payload. The agent tool loop then does something a normal
 * tool result can't: it injects the pixels into the model's NEXT turn as a
 * dedicated `user` message, while the tool-result message itself stays a short
 * note. So the model sees the image only after demanding it, and only for the
 * turn that needs it.
 *
 * `view_image` is the single mechanism that pulls pixels into context. Every
 * other tool that produces an image persists it as a temp asset and returns a
 * handle instead — in the headless agent loops nothing else emits
 * `image_content`, and the websocket chat runner materializes any embedded
 * pixels from other tools into temp-asset handles before they reach the model.
 */
import type {
  Message,
  MessageContent,
  MessageImageContent
} from "@nodetool-ai/runtime";

/** Result field carrying a single viewable image. */
export const IMAGE_CONTENT_FIELD = "image_content";
/** Result field carrying several viewable images (e.g. multiple regions). */
export const IMAGE_CONTENTS_FIELD = "image_contents";

/** A viewable image as returned by a tool. `uri` may be a data: URI. */
export interface InjectableImage {
  data?: Uint8Array | string;
  uri?: string;
  mimeType?: string;
}

/** Pixels (plus the text to show beside them) pulled out of a tool result. */
export interface ExtractedImages {
  text: string;
  images: MessageImageContent[];
}

function toImageContent(value: unknown): MessageImageContent | null {
  if (!value || typeof value !== "object") return null;
  const img = value as InjectableImage;
  const image: MessageImageContent["image"] = {};
  if (typeof img.uri === "string" && img.uri) image.uri = img.uri;
  if (typeof img.data === "string" && img.data) image.data = img.data;
  else if (img.data instanceof Uint8Array) image.data = img.data;
  if (!image.uri && image.data == null) return null;
  image.mimeType = typeof img.mimeType === "string" ? img.mimeType : "image/png";
  return { type: "image_url", image };
}

/**
 * Pull viewable image(s) out of a tool result. Returns null for ordinary
 * results, which continue to be serialized as JSON.
 */
export function extractInjectableImages(result: unknown): ExtractedImages | null {
  if (!result || typeof result !== "object" || Array.isArray(result)) return null;
  const record = result as Record<string, unknown>;

  const images: MessageImageContent[] = [];
  const single = toImageContent(record[IMAGE_CONTENT_FIELD]);
  if (single) images.push(single);
  const many = record[IMAGE_CONTENTS_FIELD];
  if (Array.isArray(many)) {
    for (const entry of many) {
      const content = toImageContent(entry);
      if (content) images.push(content);
    }
  }
  if (images.length === 0) return null;

  const text =
    typeof record["note"] === "string"
      ? (record["note"] as string)
      : typeof record["question"] === "string"
        ? (record["question"] as string)
        : "Here is the requested image:";
  return { text, images };
}

/**
 * Return a shallow copy of a tool result with the heavy image payload removed,
 * safe to serialize into the (light) tool-result message. The pixels ride the
 * separate injected user message instead — never the persisted history.
 */
export function stripImagePayload(result: unknown): unknown {
  if (!result || typeof result !== "object" || Array.isArray(result)) return result;
  const record = result as Record<string, unknown>;
  if (!(IMAGE_CONTENT_FIELD in record) && !(IMAGE_CONTENTS_FIELD in record)) {
    return result;
  }
  const clone: Record<string, unknown> = { ...record };
  delete clone[IMAGE_CONTENT_FIELD];
  delete clone[IMAGE_CONTENTS_FIELD];
  if (typeof clone["note"] !== "string") {
    clone["note"] = "Image loaded into view for this turn.";
  }
  return clone;
}

/**
 * Build the `user` message that carries pixels into the model's next turn.
 * Vision-capable providers resolve `image.uri` (including data: URIs) and
 * `image.data` (base64 or bytes) into their native image blocks.
 */
export function buildImageInjectionMessage(extracted: ExtractedImages): Message {
  const content: MessageContent[] = [
    { type: "text", text: extracted.text },
    ...extracted.images
  ];
  return { role: "user", content };
}

/** Placeholder left in place of a viewed image once it has served its turn. */
export const OMITTED_IMAGE_NOTE =
  "[earlier image omitted to save context — call view_image again to re-load it]";

/**
 * Strip the pixels out of a previously-injected image message in place, leaving
 * its text plus a short note. Lets a viewed image ride only until the next view
 * (or the agent re-requests it), instead of bloating every later turn — the
 * tool-result eviction path doesn't touch these user messages, so the loop
 * downgrades them itself.
 */
export function downgradeInjectedImageMessage(message: Message): void {
  if (!Array.isArray(message.content)) return;
  const kept = message.content.filter((c) => c.type !== "image_url");
  const hasNote = kept.some(
    (c) => c.type === "text" && c.text === OMITTED_IMAGE_NOTE
  );
  message.content = hasNote
    ? kept
    : [...kept, { type: "text", text: OMITTED_IMAGE_NOTE }];
}
