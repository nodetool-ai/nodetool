/**
 * Chat-specific types for file handling and attachments.
 * Adapted from web/src/components/chat/types/chat.types.ts
 */

/**
 * Represents a dropped/attached file ready for upload
 * - dataUri: Base64 data URI for web environments
 * - uri: File URI for native environments (from expo-image-picker, expo-document-picker)
 */
export type DroppedFile = {
  /** Base64 encoded data URI (web) */
  dataUri?: string;
  /** File URI path (native) */
  uri?: string;
  type: string;
  name: string;
  /** File size in bytes (optional) */
  size?: number;
};

/**
 * Regex pattern to match document MIME types
 */
export const DOC_TYPES_REGEX =
  /application\/pdf|application\/msword|application\/vnd\.openxmlformats-officedocument\.*|application\/vnd\.ms-.*|application\/vnd\.apple\.*|application\/x-iwork.*/;
