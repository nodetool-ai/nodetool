import type { Chunk } from "../../stores/ApiTypes";

export const isTextLikeChunk = (chunk: Chunk | null | undefined): boolean => {
  const contentType = (chunk as any)?.content_type;
  return (
    contentType === undefined ||
    contentType === null ||
    contentType === "" ||
    contentType === "text"
  );
};
