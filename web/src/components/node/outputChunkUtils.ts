import type { Chunk } from "../../stores/ApiTypes";

export interface AudioChunkLike {
  timestamp: [number, number];
  text: string;
}

/**
 * A chunk as it arrives off the wire: producers that do not classify their
 * payload leave `content_type` absent, null, or empty, none of which the
 * protocol's own union spells out.
 */
export type ReceivedChunk = Omit<Chunk, "content_type"> & {
  content_type?: Chunk["content_type"] | null | "";
};

export const isTextLikeChunk = (
  chunk: ReceivedChunk | null | undefined
): boolean => {
  const contentType = chunk?.content_type;
  return (
    contentType === undefined ||
    contentType === null ||
    contentType === "" ||
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
