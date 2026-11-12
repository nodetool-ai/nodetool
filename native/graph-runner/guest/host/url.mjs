// node:url for the guest: file URL conversion for the host's path rules.
// URL parsing itself does not grant filesystem access.
import { resolve } from "./path.mjs";
import { URL, URLSearchParams } from "../env/url.mjs";

function invalid(code, message) {
  const err = new TypeError(message);
  err.code = code;
  return err;
}

export function fileURLToPath(value) {
  const href = typeof value === "string" ? value : value instanceof URL ? value.href : undefined;
  if (typeof href !== "string") {
    throw invalid("ERR_INVALID_ARG_TYPE", 'The "path" argument must be of type string or an instance of URL');
  }
  let url;
  try { url = new URL(href); }
  catch { throw invalid("ERR_INVALID_URL", "Invalid URL"); }
  if (url.protocol !== "file:") {
    throw invalid("ERR_INVALID_URL_SCHEME", "The URL must be of scheme file");
  }
  if (url.hostname !== "") {
    throw invalid("ERR_INVALID_FILE_URL_HOST", 'File URL host must be "localhost" or empty on linux');
  }
  const pathname = url.pathname;
  const windows = globalThis.__host?.process?.platform === "win32";
  if (/%2f/i.test(pathname) || (windows && /%5c/i.test(pathname))) {
    throw invalid("ERR_INVALID_FILE_URL_PATH", "File URL path must not include encoded / characters");
  }
  if (windows) {
    if (!/^\/[a-z]:\//i.test(pathname)) {
      throw invalid("ERR_INVALID_FILE_URL_PATH", "File URL path must include an absolute drive path");
    }
    return decodeURIComponent(pathname.slice(1)).replaceAll("/", "\\");
  }
  return decodeURIComponent(pathname);
}

export function pathToFileURL(path) {
  const resolved = resolve(path);
  const windows = globalThis.__host?.process?.platform === "win32";
  const trailingSlash = path.endsWith("/") || (windows && path.endsWith("\\"));
  const pathname = trailingSlash && !resolved.endsWith("/") ? `${resolved}/` : resolved;
  if (windows) {
    if (!/^[a-z]:\//i.test(pathname)) {
      throw invalid("ERR_INVALID_FILE_URL_PATH", "File path must include an absolute drive path");
    }
    return new URL(`file:///${pathname.slice(0, 2)}${pathname.slice(2).split("/").map(encodeURIComponent).join("/")}`);
  }
  const href = `file://${pathname
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")}`;
  return new URL(href);
}

export { URL, URLSearchParams };
export default { fileURLToPath, pathToFileURL, URL, URLSearchParams };
