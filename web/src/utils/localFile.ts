/**
 * Local-file helpers for the Electron desktop app.
 *
 * In local (desktop) mode a file dropped into the editor is referenced in place
 * by a `file://` URI instead of being uploaded to the asset store. The backend
 * already resolves `file://` URIs from disk when a workflow runs; these helpers
 * cover the renderer side: getting a dropped file's path, building the URI, and
 * resolving the URI to a previewable URL. The renderer can't load a raw
 * `file://` URL under `webSecurity`, so previews point at the backend's
 * `/api/files/local` endpoint, which streams the bytes off disk with HTTP Range
 * support — no reading in Electron, no data URIs.
 *
 * None of this applies in a plain browser: a dropped `File` never exposes its
 * disk path there, so `getLocalFilePath` returns `null` and callers fall back
 * to uploading.
 */
import { isElectron } from "./browser";
import { BASE_URL } from "../stores/BASE_URL";

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

/**
 * Map a local `file://` URI to the backend endpoint that streams it over HTTP.
 * Returns `null` for any non-`file://` URI, signalling callers to use their
 * normal resolver. The backend reads the file off disk (with Range support for
 * audio/video seeking), so the renderer never loads a raw `file://` URL and no
 * bytes pass through Electron.
 */
export const fileUriToHttpUrl = (
  uri: string | null | undefined
): string | null => {
  if (!isFileUri(uri)) {
    return null;
  }
  const encodedPath = encodeURIComponent(fileUriToPath(uri));
  return `${BASE_URL}/api/files/local?path=${encodedPath}`;
};
