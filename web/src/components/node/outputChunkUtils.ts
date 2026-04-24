import type { Chunk } from "../../stores/ApiTypes";

export interface AudioChunkLike {
  timestamp: [number, number];
  text: string;
}

export const isTextLikeChunk = (chunk: Chunk | null | undefined): boolean => {
  const contentType = chunk?.content_type;
  return (
    contentType === undefined ||
    contentType === null ||
    contentType === ("" as string) ||
    contentType === "text"
  );
};

export const isAudioChunkLike = (
  value: unknown
): value is AudioChunkLike => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  const { timestamp, text } = record;

  return (
    Array.isArray(timestamp) &&
    timestamp.length === 2 &&
    typeof timestamp[0] === "number" &&
    typeof timestamp[1] === "number" &&
    typeof text === "string"
  );
};
