/** Largest `crypto.getRandomValues` request the bridge will serve. */
export const MAX_RANDOM_BYTES = 65_536;

/** Media member names, in the order the guest prelude re-wraps them. */
export const MEDIA_REF_MEMBERS = [
  "bytes",
  "text",
  "info",
  "toDocument",
  "toImage",
  "toAudio",
  "toVideo"
] as const;
