/**
 * Local-file helpers for the Electron desktop app.
 *
 * In local (desktop) mode a file dropped into the editor is referenced in place
 * by a `file://` URI instead of being uploaded to the asset store. The backend
 * already resolves `file://` URIs from disk when a workflow runs; these helpers
 * cover the renderer side: getting a dropped file's path, building the URI, and
 * resolving the URI back to a previewable data URL (the renderer can't load a
 * raw `file://` URL under `webSecurity`, so previews go through the Electron
 * `readFileAsDataURL` bridge).
 *
 * None of this applies in a plain browser: a dropped `File` never exposes its
 * disk path there, so `getLocalFilePath` returns `null` and callers fall back
 * to uploading.
 */
import { isElectron } from "./browser";
import { useEffect, useState } from "react";

/**
 * Resolve the absolute disk path of a dropped/selected file. Returns `null` in
 * the browser, when the Electron bridge is unavailable, or when the file has no
 * backing path (e.g. an in-memory `File`).
 */
export const getLocalFilePath = (file: File): string | null => {
  if (!isElectron) {
    return null;
  }
  const getPath = window.api?.files?.getPathForFile;
  if (!getPath) {
    return null;
  }
  try {
    const path = getPath(file);
    return path && path.length > 0 ? path : null;
  } catch {
    return null;
  }
};

/** Build a `file://` URI from an absolute disk path (POSIX or Windows). */
export const pathToFileUri = (absPath: string): string => {
  let p = absPath.replace(/\\/g, "/");
  if (!p.startsWith("/")) {
    // Windows drive paths ("C:/Users/...") need a leading slash.
    p = `/${p}`;
  }
  // encodeURI keeps "/" and ":" but escapes spaces; also escape the few path
  // characters it leaves untouched that would otherwise break URL parsing.
  const encoded = encodeURI(p)
    .replace(/#/g, "%23")
    .replace(/\?/g, "%3F");
  return `file://${encoded}`;
};

/** Convert a `file://` URI back to an absolute disk path. */
export const fileUriToPath = (uri: string): string => {
  try {
    const { pathname } = new URL(uri);
    let p = decodeURIComponent(pathname);
    // "/C:/Users/..." → "C:/Users/..." on Windows.
    if (/^\/[A-Za-z]:\//.test(p)) {
      p = p.slice(1);
    }
    return p;
  } catch {
    return decodeURIComponent(uri.replace(/^file:\/\//, ""));
  }
};

export const isFileUri = (uri: string | null | undefined): uri is string =>
  typeof uri === "string" && uri.startsWith("file://");

// Cache resolved data URLs so a reloaded workflow doesn't re-read the same file
// off disk on every render / for every node referencing it.
const dataUrlCache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();

/**
 * Read a `file://` URI off disk (via the Electron bridge) and return it as a
 * data URL suitable for `<img>` / `<audio>` / `<iframe>`. Returns "" when not
 * in Electron or when the read fails. Results are cached per URI.
 */
export const loadFileUriDataUrl = async (uri: string): Promise<string> => {
  const cached = dataUrlCache.get(uri);
  if (cached !== undefined) {
    return cached;
  }
  const existing = inflight.get(uri);
  if (existing) {
    return existing;
  }
  const read = window.api?.clipboard?.readFileAsDataURL;
  if (!read) {
    return "";
  }
  const promise = (async () => {
    try {
      const dataUrl = (await read(fileUriToPath(uri))) ?? "";
      dataUrlCache.set(uri, dataUrl);
      return dataUrl;
    } catch {
      dataUrlCache.set(uri, "");
      return "";
    } finally {
      inflight.delete(uri);
    }
  })();
  inflight.set(uri, promise);
  return promise;
};

/**
 * Resolve a `file://` URI to a previewable data URL. Returns `null` when the
 * URI is not a `file://` URI (signalling callers to use their normal resolver),
 * or the data URL string (empty while the async read is in flight).
 */
export const useFileUriDataUrl = (
  uri: string | null | undefined
): string | null => {
  const applicable = isFileUri(uri);
  const [dataUrl, setDataUrl] = useState<string>(() =>
    applicable ? dataUrlCache.get(uri) ?? "" : ""
  );

  useEffect(() => {
    if (!applicable) {
      return;
    }
    let cancelled = false;
    void loadFileUriDataUrl(uri).then((resolved) => {
      if (!cancelled) {
        setDataUrl(resolved);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [applicable, uri]);

  return applicable ? dataUrl : null;
};
