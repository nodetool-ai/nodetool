import { nativePreparedImage } from "@nodetool-ai/protocol/native-game";

export interface NativeModelImageAssetSource {
  readonly entries: readonly { readonly id: string; readonly kind: string; readonly size: number; readonly dependencies: readonly string[] }[];
  /** Copies only a range from an already verified cache entry. It must never fetch or read a file. */
  verifiedRange(assetId: string, offset: number, length: number): Uint8Array;
}
export interface NativeResolvedModelImage {
  readonly bytes: Uint8Array;
  readonly digest: string;
  readonly mimeType: "image/png" | "image/jpeg";
}

/** Resolve encoded image provenance without URLs, external IO, or access outside the model's declared closure. */
export async function resolveNativeModelImage(image: unknown, modelAssetId: string,
  assets: NativeModelImageAssetSource): Promise<NativeResolvedModelImage> {
  const descriptor = nativePreparedImage.parse(image), source = descriptor.source;
  if (assets.entries.length > 4096) { throw new Error("Native asset count exceeds budget"); }
  const entries = new Map(assets.entries.map((entry) => [entry.id, entry]));
  if (entries.size !== assets.entries.length) { throw new Error("Duplicate native image source asset ID"); }
  if (entries.get(modelAssetId)?.kind !== "model") { throw new Error("Native image resolution requires a declared model"); }
  const closure = new Set<string>(), pending = [modelAssetId];
  while (pending.length) {
    const id = pending.pop();
    if (id === undefined || closure.has(id)) { continue; }
    const entry = entries.get(id);
    if (!entry) { throw new Error(`Undeclared native model dependency ${id}`); }
    if (entry.dependencies.length > 1024) { throw new Error("Native model dependency count exceeds budget"); }
    closure.add(id);
    for (const dependency of entry.dependencies) { if (!closure.has(dependency)) { pending.push(dependency); } }
  }
  const entry = entries.get(source.assetId);
  if (!entry || !closure.has(source.assetId)) { throw new Error("Native image source is outside the declared model dependency closure"); }
  if (!["model", "buffer", "image"].includes(entry.kind)) { throw new Error("Native image source has an invalid asset kind"); }
  if (!Number.isSafeInteger(entry.size) || entry.size < 0 || source.offset > entry.size || source.length > entry.size - source.offset) {
    throw new Error("Native image source range exceeds its declared asset");
  }
  const bytes = assets.verifiedRange(source.assetId, source.offset, source.length);
  if (bytes.byteLength !== source.length) { throw new Error("Native verified image range has an invalid length"); }
  const owned = Uint8Array.from(bytes);
  const hash = await crypto.subtle.digest("SHA-256", owned);
  const digest = Array.from(new Uint8Array(hash), (value) => value.toString(16).padStart(2, "0")).join("");
  if (digest !== source.digest) { throw new Error("Native image source digest mismatch"); }
  const png = [137, 80, 78, 71, 13, 10, 26, 10];
  const matchesMime = descriptor.mimeType === "image/png" ? png.every((value, index) => owned[index] === value)
    : owned[0] === 0xff && owned[1] === 0xd8 && owned[2] === 0xff;
  if (!matchesMime) { throw new Error("Native image source MIME signature mismatch"); }
  return { bytes: owned, digest, mimeType: descriptor.mimeType };
}

export function nativeAssetPath(path: string): string {
  if (!path || path.length > 4096 || /[\\\x00-\x1f?#:%]/u.test(path) || path.startsWith("/") ||
      path.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error("Native assets require closed relative paths");
  }
  return `/assets/${path}`;
}

