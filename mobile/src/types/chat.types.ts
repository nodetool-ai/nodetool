/**
 * Chat-specific types for file handling and attachments.
 * Adapted from web/src/components/chat/types/chat.types.ts
 */

/**
 * Represents a dropped/attached file ready for upload
 */
export type DroppedFile = {
  dataUri: string;
  type: string;
  name: string;
};

/**
 * Regex pattern to match document MIME types
 */
export const DOC_TYPES_REGEX =
  /application\/pdf|application\/msword|application\/vnd\.openxmlformats-officedocument\.*|application\/vnd\.ms-.*|application\/vnd\.apple\.*|application\/x-iwork.*/;
