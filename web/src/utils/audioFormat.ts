/**
 * Audio format helpers.
 *
 * A download has to keep the format the backend produced: a WAV output saved
 * as `audio.mp3` is a file whose name contradicts its bytes, and players that
 * trust the extension fail to open it.
 */

/** Extension per audio MIME type, including the aliases providers emit. */
const MIME_TYPE_EXTENSIONS: Record<string, string> = {
  "audio/mp3": "mp3",
  "audio/mpeg": "mp3",
  "audio/mpeg3": "mp3",
  "audio/wav": "wav",
  "audio/wave": "wav",
  "audio/x-wav": "wav",
  "audio/vnd.wave": "wav",
  "audio/ogg": "ogg",
  "audio/vorbis": "ogg",
  "audio/opus": "opus",
  "audio/webm": "webm",
  "audio/flac": "flac",
  "audio/x-flac": "flac",
  "audio/aac": "aac",
  "audio/aacp": "aac",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aiff": "aiff",
  "audio/x-aiff": "aiff",
  "audio/basic": "au",
  "audio/x-ms-wma": "wma"
};

/** MIME type per format token, for the formats whose token is not the subtype. */
const FORMAT_MIME_TYPES: Record<string, string> = {
  mp3: "audio/mp3",
  mpeg: "audio/mpeg",
  wave: "audio/wav",
  m4a: "audio/mp4",
  mp4: "audio/mp4",
  aif: "audio/aiff",
  wma: "audio/x-ms-wma"
};

/** Content types that name a byte stream rather than an audio format. */
const OPAQUE_CONTENT_TYPES = new Set([
  "application/octet-stream",
  "binary/octet-stream"
]);

/** `Audio/WAV; codecs=1` becomes `audio/wav`. */
const normalizeMimeType = (value: string | null | undefined): string =>
  (value ?? "").split(";")[0].trim().toLowerCase();

const isSafeToken = (value: string): boolean => /^[a-z0-9]{1,8}$/.test(value);

/**
 * The file extension an audio MIME type implies, or undefined when the type
 * is missing, opaque, or not audio. An unlisted `audio/<subtype>` falls back
 * to its subtype, so a new codec still downloads under its own name.
 */
export const getAudioExtension = (
  mimeType: string | null | undefined
): string | undefined => {
  const normalized = normalizeMimeType(mimeType);
  if (!normalized || OPAQUE_CONTENT_TYPES.has(normalized)) {
    return undefined;
  }
  const known = MIME_TYPE_EXTENSIONS[normalized];
  if (known) {
    return known;
  }
  const [type, subtype] = normalized.split("/");
  if (type !== "audio" || !subtype) {
    return undefined;
  }
  const token = subtype.replace(/^x-/, "").split("+")[0];
  return isSafeToken(token) ? token : undefined;
};

/**
 * The MIME type an audio format token implies. `format` is an extension such
 * as `wav` or `flac`, as carried by an `AudioRef`'s `metadata.format`.
 */
export const getAudioMimeType = (
  format: string | null | undefined
): string | undefined => {
  const token = (format ?? "").trim().toLowerCase().replace(/^\./, "");
  if (!isSafeToken(token)) {
    return undefined;
  }
  return FORMAT_MIME_TYPES[token] ?? `audio/${token}`;
};

/** The extension of a URL, path, or bare filename, when it looks like one. */
const getPathExtension = (path: string | null | undefined): string | undefined => {
  const withoutQuery = (path ?? "").split(/[?#]/)[0];
  const name = withoutQuery.slice(withoutQuery.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  if (dot <= 0) {
    return undefined;
  }
  const token = name.slice(dot + 1).toLowerCase();
  return isSafeToken(token) ? token : undefined;
};

/** Every extension the maps above can produce. */
const AUDIO_EXTENSIONS = new Set([
  ...Object.values(MIME_TYPE_EXTENSIONS),
  ...Object.keys(FORMAT_MIME_TYPES)
]);

/**
 * The MIME type a URL's extension implies, when that extension names an audio
 * format. A URL ending in `.png` or in nothing yields undefined.
 */
export const getAudioMimeTypeFromUrl = (
  url: string | null | undefined
): string | undefined => {
  const token = getPathExtension(url);
  return token && AUDIO_EXTENSIONS.has(token)
    ? getAudioMimeType(token)
    : undefined;
};

export interface AudioDownloadFilenameOptions {
  /** Name chosen by the caller, usually the library asset's name. */
  filename?: string | null;
  /** Content type the transfer actually served. */
  contentType?: string | null;
  /** MIME type the player was told the source carries. */
  mimeType?: string | null;
  /** URL the bytes came from. */
  url?: string | null;
}

/**
 * Name for a downloaded audio file that keeps the source format.
 *
 * A caller-supplied name wins when it already names a format. Otherwise the
 * extension comes from what the transfer served, then the declared MIME type,
 * then the URL. There is no fixed default: guessing one is how WAV outputs
 * used to reach disk as `audio.mp3`.
 */
export const getAudioDownloadFilename = ({
  filename,
  contentType,
  mimeType,
  url
}: AudioDownloadFilenameOptions): string => {
  const requested = (filename ?? "").trim();
  if (requested && getPathExtension(requested)) {
    return requested;
  }
  const extension =
    getAudioExtension(contentType) ??
    getAudioExtension(mimeType) ??
    getPathExtension(url);
  const base = requested || "audio";
  return extension ? `${base}.${extension}` : base;
};
