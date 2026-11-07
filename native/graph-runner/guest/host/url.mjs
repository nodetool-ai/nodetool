// node:url for the guest: file URL conversion on the POSIX path rules.
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
  if (/%2f/i.test(pathname)) {
    throw invalid("ERR_INVALID_FILE_URL_PATH", "File URL path must not include encoded / characters");
  }
  return decodeURIComponent(pathname);
}

export function pathToFileURL(path) {
  const resolved = resolve(path);
  const pathname = path.endsWith("/") && !resolved.endsWith("/") ? `${resolved}/` : resolved;
  const href = `file://${pathname
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")}`;
  return new URL(href);
}

export { URL, URLSearchParams };
export default { fileURLToPath, pathToFileURL, URL, URLSearchParams };
