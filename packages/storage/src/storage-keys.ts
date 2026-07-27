import { isAbsolute, relative } from "node:path";

export function isWithinRoot(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

export function normalizeStorageKey(key: string): string {
  const segments: string[] = [];
  for (const segment of key.replaceAll("\\", "/").split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (segments.length === 0) {
        throw new Error(`Invalid storage key: ${key}`);
      }
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  const cleaned = segments.join("/");
  if (!cleaned) {
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
