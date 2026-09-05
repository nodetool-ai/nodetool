export type DroppedFile = {
  id: string;
  /**
   * For local-file drops: the file's bytes as a `data:` URI, sent inline.
   * For asset-library drops: the asset's preview URL (used only for the
   * composer thumbnail) — the wire-form reference is in `assetUri`.
   */
  dataUri: string;
  type: string;
  name: string;
  /**
   * Set for assets dragged from the asset library: the `asset://<id>.<ext>`
   * reference sent to the server in place of inline bytes. The server
   * dereferences it before the provider call (see
   * `ProcessingContext.resolveMessageMediaUris`).
   */
  assetUri?: string;
};

export const DOC_TYPES_REGEX =
  /application\/pdf|application\/msword|application\/vnd\.openxmlformats-officedocument\.*|application\/vnd\.ms-.*|application\/vnd\.apple\.*|application\/x-iwork.*/;

/**
 * Connection and generation state a chat surface renders. The socket states
 * come from `ConnectionState`; `loading`/`streaming` are the turn in flight
 * and `error`/`failed` are the two ways it ends badly.
 */
export type ChatStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "loading"
  | "error"
  | "streaming"
  | "reconnecting"
  | "disconnecting"
  | "failed";

/** Width of the message column and the composer beneath it, in px. */
export const CHAT_COLUMN_MAX_WIDTH = 800;
