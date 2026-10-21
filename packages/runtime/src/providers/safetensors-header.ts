/**
 * Read the tensor names of a `.safetensors` file. The format starts with an
 * 8-byte little-endian header length, then a JSON object keyed by tensor
 * name, so the names come without reading any weights.
 */
import { importNodeBuiltin } from "@nodetool-ai/config";

/** A header larger than this is not a real safetensors header. */
const MAX_HEADER_BYTES = 100 * 1024 * 1024;

/** The tensor names in a safetensors header, or null when the bytes are not one. */
export function safetensorsTensorNames(header: Uint8Array): string[] | null {
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(header));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return Object.keys(parsed).filter((key) => key !== "__metadata__");
  } catch {
    return null;
  }
}

/** Read a safetensors file's tensor names, or null when it is not one. */
export async function readSafetensorsTensorNames(path: string): Promise<string[] | null> {
  const fsp = await importNodeBuiltin<typeof import("node:fs/promises")>("node:fs/promises");
  if (!fsp) return null;
  let handle: import("node:fs/promises").FileHandle | undefined;
  try {
    handle = await fsp.open(path, "r");
    const prefix = new Uint8Array(8);
    const { bytesRead } = await handle.read(prefix, 0, 8, 0);
    if (bytesRead < 8) return null;
    const length = Number(new DataView(prefix.buffer).getBigUint64(0, true));
    if (length < 2 || length > MAX_HEADER_BYTES) return null;
    const header = new Uint8Array(length);
    const read = await handle.read(header, 0, length, 8);
    if (read.bytesRead < length) return null;
    return safetensorsTensorNames(header);
  } catch {
    return null;
  } finally {
    await handle?.close();
  }
}
