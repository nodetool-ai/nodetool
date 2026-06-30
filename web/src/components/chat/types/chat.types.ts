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