import type {
  MessageContent,
  MessageImageContent,
  MessageVideoContent,
  MessageAudioContent
} from "../../../stores/ApiTypes";

export function isImageContent(c: MessageContent): c is MessageImageContent {
  return c.type === "image_url";
}

export function isVideoContent(c: MessageContent): c is MessageVideoContent {
  return c.type === "video";
}

export function isAudioContent(c: MessageContent): c is MessageAudioContent {
  return c.type === "audio";
}

/**
 * Returns true if the content array is purely image + video + audio media
 * blocks — i.e. the kind of output produced by a media generation turn.
 */
export function isMediaOnlyContent(content: unknown): boolean {
  if (!Array.isArray(content) || content.length === 0) {
    return false;
  }
  return content.every(
    (c) =>
      typeof c === "object" &&
      c !== null &&
      (isImageContent(c as MessageContent) ||
        isVideoContent(c as MessageContent) ||
        isAudioContent(c as MessageContent))
  );
}
