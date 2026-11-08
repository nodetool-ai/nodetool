import type {
  Message,
  MessageAudioContent,
  MessageContent,
  MessageImageContent,
  MessageVideoContent
} from "../../../stores/ApiTypes";
import {
  mediaCategoryForMode,
  type MediaGenerationCategory,
  type MediaGenerationRequest,
  type MediaMode
} from "../../../stores/MediaGenerationStore";
import type { ChatStatus } from "../types/chat.types";

export interface GenerationTurn {
  id: string;
  userMessage: Message;
  assistantMessage?: Message;
  prompt: string;
  referenceImages: MessageImageContent[];
  imageOutputs: MessageImageContent[];
  videoOutputs: MessageVideoContent[];
  audioOutputs: MessageAudioContent[];
  mediaGeneration: MediaGenerationRequest | null;
  createdAt: string | null;
  isPending: boolean;
  errorText: string | null;
}

function extractPromptText(message: Message): string {
  const content = message.content;
  if (typeof content === "string") {
    return content.trim();
  }
  if (!Array.isArray(content)) {
    return "";
  }
  const parts: string[] = [];
  for (const item of content) {
    if (item && typeof item === "object" && item.type === "text" && item.text) {
      parts.push(item.text);
    }
  }
  return parts.join("\n").trim();
}

function extractReferenceImages(
  message: Message
): MessageImageContent[] {
  const content = message.content;
  if (!Array.isArray(content)) {
    return [];
  }
  const out: MessageImageContent[] = [];
  for (const item of content) {
    if (
      item &&
      typeof item === "object" &&
      item.type === "image_url" &&
      item.image
    ) {
      out.push(item);
    }
  }
  return out;
}

function splitMediaOutputs(message?: Message): {
  imageOutputs: MessageImageContent[];
  videoOutputs: MessageVideoContent[];
  audioOutputs: MessageAudioContent[];
  textOutput: string;
} {
  const imageOutputs: MessageImageContent[] = [];
  const videoOutputs: MessageVideoContent[] = [];
  const audioOutputs: MessageAudioContent[] = [];
  const textParts: string[] = [];

  if (!message) {
    return { imageOutputs, videoOutputs, audioOutputs, textOutput: "" };
  }

  const content = message.content;
  if (typeof content === "string") {
    return {
      imageOutputs,
      videoOutputs,
      audioOutputs,
      textOutput: content.trim()
    };
  }

  if (Array.isArray(content)) {
    for (const item of content as MessageContent[]) {
      if (!item || typeof item !== "object") {
        continue;
      }
      if (item.type === "image_url" && item.image) {
        imageOutputs.push(item);
      } else if (item.type === "video" && item.video) {
        videoOutputs.push(item);
      } else if (item.type === "audio" && item.audio) {
        audioOutputs.push(item);
      } else if (item.type === "text" && item.text) {
        textParts.push(item.text);
      }
    }
  }

  return {
    imageOutputs,
    videoOutputs,
    audioOutputs,
    textOutput: textParts.join("\n").trim()
  };
}

/**
 * The media kind of a thread from before Create sessions, read from its
 * messages: every prompt in it was a generation request. Null for a chat,
 * including one that asked for media among other questions.
 */
export function inferMediaCategory(
  messages: readonly Message[]
): MediaGenerationCategory | null {
  let detected: MediaGenerationCategory | null = null;
  for (const msg of messages) {
    const cat = mediaCategoryForMode(msg.media_generation?.mode as MediaMode | undefined);
    if (cat) {
      detected = cat;
    } else if (msg.role === "user") {
      return null;
    }
  }
  return detected;
}

/**
 * Group chronological chat messages into media generation turns.
 */
export function extractGenerationTurns(
  messages: readonly Message[],
  status: ChatStatus
): GenerationTurn[] {
  const turns: GenerationTurn[] = [];
  const isBusy = status === "loading" || status === "streaming";

  for (let i = 0; i < messages.length; i += 1) {
    const msg = messages[i];
    if (msg.role !== "user") {
      continue;
    }

    let assistantMsg: Message | undefined;
    if (i + 1 < messages.length && messages[i + 1].role === "assistant") {
      assistantMsg = messages[i + 1];
      i += 1;
    }

    const isLastTurn = i === messages.length - 1;
    const { imageOutputs, videoOutputs, audioOutputs, textOutput } =
      splitMediaOutputs(assistantMsg);
    const hasMedia =
      imageOutputs.length > 0 ||
      videoOutputs.length > 0 ||
      audioOutputs.length > 0;
    const isPending = isLastTurn && isBusy && !hasMedia;
    const mediaGen =
      (assistantMsg?.media_generation as MediaGenerationRequest | undefined) ??
      (msg.media_generation as MediaGenerationRequest | undefined) ??
      null;

    turns.push({
      id: msg.id ?? `turn-${i}`,
      userMessage: msg,
      assistantMessage: assistantMsg,
      prompt: extractPromptText(msg),
      referenceImages: extractReferenceImages(msg),
      imageOutputs,
      videoOutputs,
      audioOutputs,
      mediaGeneration: mediaGen,
      createdAt: assistantMsg?.created_at ?? msg.created_at ?? null,
      isPending,
      errorText: !isPending && !hasMedia && textOutput ? textOutput : null
    });
  }

  return turns;
}
