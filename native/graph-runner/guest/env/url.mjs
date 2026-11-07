// The parser performs no I/O. File access still passes through host grants.
import "./text-encoding.mjs";
import { URL, URLSearchParams } from "whatwg-url";

export { URL, URLSearchParams };

export function installUrl(target = globalThis) {
  target.URL ??= URL;
  target.URLSearchParams ??= URLSearchParams;
}

installUrl();
