import { isAbsolute, normalize, relative, sep } from "node:path";

export function isWithinRoot(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

export function normalizeStorageKey(key: string): string {
  const cleaned = normalize(key.replaceAll("\\", "/")).replace(/^\/+/, "");
  if (
    !cleaned ||
    cleaned === "." ||
    cleaned.startsWith("..") ||
    cleaned.includes(`..${sep}`)
  ) {
    throw new Error(`Invalid storage key: ${key}`);
  }
  return cleaned;
}

export function joinStorageKey(
  prefix: string | undefined,
  key: string
): string {
  const normalizedKey = normalizeStorageKey(key);
  if (!prefix) return normalizedKey;
  const normalizedPrefix = normalizeStorageKey(prefix);
  return `${normalizedPrefix}/${normalizedKey}`;
}
