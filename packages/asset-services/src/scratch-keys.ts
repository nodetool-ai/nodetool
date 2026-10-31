const RUNTIME_SCRATCH_PREFIXES = ["temp/", "assets/"];

export function normalizeKey(key: string): string {
  return key.replace(/\\/g, "/").replace(/^\/+/, "");
}

export function isRuntimeScratchKey(key: string): boolean {
  const normalized = normalizeKey(key);
  return RUNTIME_SCRATCH_PREFIXES.some((prefix) =>
    normalized.startsWith(prefix)
  );
}
