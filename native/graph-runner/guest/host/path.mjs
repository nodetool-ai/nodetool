// node:path for the guest: Node's POSIX path functions. `resolve` starts
// from the run's working directory, the workspace (`__host.files.cwd()`),
// or `/` when there is none.
// On Windows, host paths retain their drive prefix and use forward slashes.

function hostPath(value) {
  return globalThis.__host?.process?.platform === "win32" ? value.replaceAll("\\", "/") : value;
}

function rootOf(value) {
  if (globalThis.__host?.process?.platform === "win32" && /^[a-z]:\//i.test(value)) return value.slice(0, 3);
  return value.startsWith("/") ? "/" : "";
}

function cwd() {
  return globalThis.__host?.files?.cwd?.() || "/";
}

function normalizeString(path, allowAboveRoot) {
  let res = "";
  let lastSegmentLength = 0;
  let lastSlash = -1;
  let dots = 0;
  let code;
  for (let i = 0; i <= path.length; ++i) {
    if (i < path.length) code = path[i];
    else if (code === "/") break;
    else code = "/";
    if (code === "/") {
      if (lastSlash === i - 1 || dots === 1) {
        // empty segment or "."
      } else if (dots === 2) {
        if (res.length < 2 || lastSegmentLength !== 2 || !res.endsWith("..")) {
          if (res.length > 2) {
            const lastSlashIndex = res.lastIndexOf("/");
            if (lastSlashIndex === -1) {
              res = "";
              lastSegmentLength = 0;
            } else {
              res = res.slice(0, lastSlashIndex);
              lastSegmentLength = res.length - 1 - res.lastIndexOf("/");
            }
            lastSlash = i;
            dots = 0;
            continue;
          } else if (res.length !== 0) {
            res = "";
            lastSegmentLength = 0;
            lastSlash = i;
            dots = 0;
            continue;
          }
        }
        if (allowAboveRoot) {
          res += res.length > 0 ? "/.." : "..";
          lastSegmentLength = 2;
        }
      } else {
        if (res.length > 0) res += `/${path.slice(lastSlash + 1, i)}`;
        else res = path.slice(lastSlash + 1, i);
        lastSegmentLength = i - lastSlash - 1;
      }
      lastSlash = i;
      dots = 0;
    } else if (code === "." && dots !== -1) {
      ++dots;
    } else {
      dots = -1;
    }
  }
  return res;
}

function check(value, name) {
  if (typeof value !== "string") {
    const err = new TypeError(`The "${name}" argument must be of type string. Received ${value === null ? "null" : typeof value}`);
    err.code = "ERR_INVALID_ARG_TYPE";
    throw err;
  }
}

export function resolve(...args) {
  let resolved = "";
  let root = "";
  for (let i = args.length - 1; i >= -1 && !root; i--) {
    let path = i >= 0 ? args[i] : cwd();
    check(path, `paths[${i}]`);
    path = hostPath(path);
    if (path.length === 0) continue;
    root = rootOf(path);
    resolved = `${path.slice(root.length)}/${resolved}`;
  }
  resolved = normalizeString(resolved, !root);
  if (root) return `${root}${resolved}`;
  return resolved.length > 0 ? resolved : ".";
}

export function normalize(path) {
  check(path, "path");
  path = hostPath(path);
  if (path.length === 0) return ".";
  const root = rootOf(path);
  const trailing = path[path.length - 1] === "/";
  let out = normalizeString(path.slice(root.length), !root);
  if (out.length === 0) {
    if (root) return root;
    return trailing ? "./" : ".";
  }
  if (trailing) out += "/";
  return root ? `${root}${out}` : out;
}

export function isAbsolute(path) {
  check(path, "path");
  return Boolean(rootOf(hostPath(path)));
}

export function join(...args) {
  if (args.length === 0) return ".";
  const parts = [];
  for (const a of args) {
    check(a, "path");
    if (a.length > 0) parts.push(a);
  }
  return parts.length === 0 ? "." : normalize(parts.join("/"));
}

export function relative(from, to) {
  check(from, "from");
  check(to, "to");
  if (from === to) return "";
  from = resolve(from);
  to = resolve(to);
  if (from === to) return "";
  if (rootOf(from).toLowerCase() !== rootOf(to).toLowerCase()) return to;
  const fromParts = from.slice(rootOf(from).length).split("/").filter(Boolean);
  const toParts = to.slice(rootOf(to).length).split("/").filter(Boolean);
  let i = 0;
  while (i < fromParts.length && i < toParts.length && fromParts[i] === toParts[i]) i++;
  return [...fromParts.slice(i).map(() => ".."), ...toParts.slice(i)].join("/");
}

export function dirname(path) {
  check(path, "path");
  path = hostPath(path);
  if (path.length === 0) return ".";
  const root = rootOf(path);
  let end = -1;
  let matchedSlash = true;
  for (let i = path.length - 1; i >= Math.max(1, root.length); --i) {
    if (path[i] === "/") {
      if (!matchedSlash) {
        end = i;
        break;
      }
    } else {
      matchedSlash = false;
    }
  }
  if (end === -1) return root || ".";
  if (root === "/" && end === 1) return "//";
  return path.slice(0, end);
}

export function basename(path, suffix) {
  check(path, "path");
  path = hostPath(path);
  if (path === rootOf(path)) return "";
  let end = path.length;
  while (end > 0 && path[end - 1] === "/") end--;
  let start = path.lastIndexOf("/", end - 1) + 1;
  let base = path.slice(start, end);
  if (suffix !== undefined && suffix !== base && base.endsWith(suffix)) {
    base = base.slice(0, base.length - suffix.length);
  }
  return base;
}

export function extname(path) {
  check(path, "path");
  const base = basename(path);
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return "";
  return base.slice(dot);
}

export function parse(path) {
  check(path, "path");
  path = hostPath(path);
  const root = rootOf(path);
  const base = basename(path);
  const ext = extname(path);
  let dir = dirname(path);
  if (dir === "." && !path.startsWith(".")) dir = "";
  return { root, dir, base, ext, name: ext ? base.slice(0, base.length - ext.length) : base };
}

export function format(obj) {
  const dir = obj.dir || obj.root || "";
  const base = obj.base || `${obj.name || ""}${obj.ext ? (obj.ext[0] === "." ? "" : ".") + obj.ext : ""}`;
  if (!dir) return base;
  return dir === obj.root ? `${dir}${base}` : `${dir}/${base}`;
}

export function toNamespacedPath(path) {
  return path;
}

export const sep = "/";
export const delimiter = ":";

const path = {
  resolve, normalize, isAbsolute, join, relative, dirname, basename, extname, parse, format,
  toNamespacedPath, sep, delimiter
};
path.posix = path;
export const posix = path;
export default path;
