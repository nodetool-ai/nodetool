// Minimal browser stub for `node:path` — POSIX-only join/resolve/etc.
// Enough that occasional `path.join("a","b")` calls in lazy-loaded
// code paths don't crash on parse. Browser-tagged code should never
// hit the file system.
export const sep = "/";
export const delimiter = ":";

export function join(...parts) {
  return parts
    .filter((p) => typeof p === "string" && p.length > 0)
    .join("/")
    .replace(/\/+/g, "/");
}

export function resolve(...parts) {
  let result = "";
  for (const p of parts) {
    if (typeof p !== "string") continue;
    if (p.startsWith("/")) result = p;
    else result = join(result, p);
  }
  return result || "/";
}

export function dirname(p) {
  if (typeof p !== "string") return ".";
  const i = p.lastIndexOf("/");
  if (i === -1) return ".";
  if (i === 0) return "/";
  return p.slice(0, i);
}

export function basename(p, ext) {
  if (typeof p !== "string") return "";
  const name = p.slice(p.lastIndexOf("/") + 1);
  if (ext && name.endsWith(ext)) return name.slice(0, -ext.length);
  return name;
}

export function extname(p) {
  if (typeof p !== "string") return "";
  const dot = p.lastIndexOf(".");
  const slash = p.lastIndexOf("/");
  if (dot <= slash) return "";
  return p.slice(dot);
}

export function isAbsolute(p) {
  return typeof p === "string" && p.startsWith("/");
}
export function relative(from, to) {
  const fromParts = resolve(String(from)).split("/").filter(Boolean);
  const toParts = resolve(String(to)).split("/").filter(Boolean);
  let common = 0;
  while (
    common < fromParts.length &&
    common < toParts.length &&
    fromParts[common] === toParts[common]
  ) {
    common += 1;
  }
  const up = fromParts.slice(common).map(() => "..");
  return [...up, ...toParts.slice(common)].join("/");
}


// Real POSIX semantics rather than a thrower: callers use the result as a
// string (a pack-relative module id), so returning a wrong-but-plausible value
// would be worse than being correct here.
export function relative(from, to) {
  if (typeof from !== "string" || typeof to !== "string") return "";
  const split = (p) => resolve(p).split("/").filter(Boolean);
  const a = split(from);
  const b = split(to);
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return [...Array(a.length - i).fill(".."), ...b.slice(i)].join("/");
}

export const posix = {
  sep,
  delimiter,
  join,
  resolve,
  dirname,
  basename,
  extname,
  isAbsolute,
  relative
};

export default {
  sep,
  delimiter,
  join,
  resolve,
  dirname,
  basename,
  extname,
  isAbsolute,
  relative,
  posix
};
