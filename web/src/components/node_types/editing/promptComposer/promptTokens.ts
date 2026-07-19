/**
 * Pure tokenizer + (de)serialization helpers for the Prompt composer.
 *
 * The Prompt node stores its prompt as a plain string. Two kinds of inline
 * reference get a chip in the composer and a stable text encoding on disk:
 *
 *   - Asset mentions  → `asset://<id>.<ext>`  (dereferenced to media by the
 *                        runtime before the prompt reaches a provider)
 *   - Entity mentions → `entity://<id>`       (expanded by the runtime into the
 *                        entity's descriptor + reference image at generation
 *                        time, so entity edits propagate to old prompts)
 *   - Variables       → `{{ name }}`          (substituted from the node's
 *                        dynamic inputs at runtime)
 *
 * Keeping the parsing here (free of Lexical) makes the round-trip testable and
 * lets the Lexical nodes/plugins stay thin.
 */

export interface TextToken {
  kind: "text";
  text: string;
}

export interface AssetToken {
  kind: "asset";
  /** Full `asset://<id>.<ext>` reference, stored verbatim. */
  uri: string;
  assetId: string;
  /** Lowercased extension without the dot, or "" when absent. */
  ext: string;
}

export interface EntityToken {
  kind: "entity";
  /** Full `entity://<id>` reference, stored verbatim. */
  uri: string;
  entityId: string;
}

export interface VariableToken {
  kind: "variable";
  /** Inner expression, e.g. "name" or "name|upper". */
  expr: string;
}

export type PromptToken = TextToken | AssetToken | EntityToken | VariableToken;

// Group 1: asset URI. Group 2: entity URI. Group 3: variable inner expression.
const TOKEN_RE =
  /(asset:\/\/[A-Za-z0-9._~\-/]+)|(entity:\/\/[A-Za-z0-9._~-]+)|\{\{\s*([^}]+?)\s*\}\}/g;

const IMAGE_EXTS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "bmp",
  "svg"
]);
const AUDIO_EXTS = new Set([
  "mp3",
  "mpeg",
  "wav",
  "ogg",
  "m4a",
  "aac",
  "flac",
  "opus"
]);
const VIDEO_EXTS = new Set(["mp4", "webm", "mov", "mkv", "avi"]);

export type AssetMediaKind = "image" | "audio" | "video" | "other";

const CONTENT_TYPE_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/bmp": "bmp",
  "image/svg+xml": "svg",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/flac": "flac",
  "video/mp4": "mp4",
  "video/webm": "webm"
};

/** Derive a file extension for an asset from its name, then content type. */
export const extForAsset = (asset: {
  name?: string | null;
  content_type?: string | null;
}): string => {
  const name = asset.name ?? "";
  const dot = name.lastIndexOf(".");
  if (dot > 0 && dot < name.length - 1) {
    return name.slice(dot + 1).toLowerCase();
  }
  const ct = (asset.content_type ?? "").toLowerCase();
  if (ct in CONTENT_TYPE_EXT) {
    return CONTENT_TYPE_EXT[ct];
  }
  const slash = ct.indexOf("/");
  if (slash >= 0) {
    const sub = ct.slice(slash + 1).split("+")[0];
    if (sub) {
      return sub;
    }
  }
  return "";
};

/** Build the `asset://<id>.<ext>` URN for a mentioned asset. */
export const assetToUri = (asset: {
  id: string;
  name?: string | null;
  content_type?: string | null;
}): string => {
  const ext = extForAsset(asset);
  return ext ? `asset://${asset.id}.${ext}` : `asset://${asset.id}`;
};

/** Build the `entity://<id>` URN for a mentioned entity. */
export const entityToUri = (entity: { id: string }): string =>
  `entity://${entity.id}`;

/** The entity id inside an `entity://<id>` URN. */
export const parseEntityUri = (uri: string): string =>
  uri.startsWith("entity://") ? uri.slice("entity://".length) : uri;

export const parseAssetUri = (
  uri: string
): { assetId: string; ext: string } => {
  const noScheme = uri.startsWith("asset://")
    ? uri.slice("asset://".length)
    : uri;
  const primary = noScheme.split(/[?#]/)[0];
  const dot = primary.lastIndexOf(".");
  if (dot > 0 && dot < primary.length - 1) {
    return {
      assetId: primary.slice(0, dot),
      ext: primary.slice(dot + 1).toLowerCase()
    };
  }
  return { assetId: primary, ext: "" };
};

export const assetMediaKind = (ext: string): AssetMediaKind => {
  const e = ext.toLowerCase();
  if (IMAGE_EXTS.has(e)) {
    return "image";
  }
  if (AUDIO_EXTS.has(e)) {
    return "audio";
  }
  if (VIDEO_EXTS.has(e)) {
    return "video";
  }
  return "other";
};

/**
 * Split a single line (no newlines) into ordered tokens. Trailing dots on an
 * asset URI are treated as sentence punctuation, not part of the extension.
 */
export const tokenizePromptLine = (line: string): PromptToken[] => {
  const tokens: PromptToken[] = [];
  const pushText = (text: string) => {
    if (!text) {
      return;
    }
    const last = tokens[tokens.length - 1];
    if (last && last.kind === "text") {
      last.text += text;
    } else {
      tokens.push({ kind: "text", text });
    }
  };

  let cursor = 0;
  let match: RegExpExecArray | null;
  TOKEN_RE.lastIndex = 0;
  while ((match = TOKEN_RE.exec(line)) !== null) {
    if (match[1] !== undefined) {
      let uri = match[1];
      const trailingDots = uri.match(/\.+$/);
      if (trailingDots) {
        uri = uri.slice(0, uri.length - trailingDots[0].length);
      }
      pushText(line.slice(cursor, match.index));
      const { assetId, ext } = parseAssetUri(uri);
      tokens.push({ kind: "asset", uri, assetId, ext });
      cursor = match.index + uri.length;
    } else if (match[2] !== undefined) {
      let uri = match[2];
      const trailingDots = uri.match(/\.+$/);
      if (trailingDots) {
        uri = uri.slice(0, uri.length - trailingDots[0].length);
      }
      pushText(line.slice(cursor, match.index));
      tokens.push({ kind: "entity", uri, entityId: parseEntityUri(uri) });
      cursor = match.index + uri.length;
    } else {
      pushText(line.slice(cursor, match.index));
      tokens.push({ kind: "variable", expr: (match[3] ?? "").trim() });
      cursor = match.index + match[0].length;
    }
  }
  pushText(line.slice(cursor));
  return tokens;
};

/** Tokenize a full multi-line prompt into one token list per line. */
export const tokenizePrompt = (text: string): PromptToken[][] =>
  text.split("\n").map(tokenizePromptLine);

/** Collect the distinct variable expressions referenced in a prompt string. */
export const variablesInPrompt = (text: string): string[] => {
  const names = new Set<string>();
  for (const line of tokenizePrompt(text)) {
    for (const token of line) {
      if (token.kind === "variable") {
        names.add(token.expr);
      }
    }
  }
  return Array.from(names);
};
