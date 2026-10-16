/**
 * Read just enough of a GGUF header to tell a language model from other
 * GGUF weights. Diffusion models, VAEs and vision projectors use the same
 * container, and the Hugging Face cache holds all of them side by side.
 */
import { importNodeBuiltin } from "@nodetool-ai/config";

/** Bytes to read. Language models put their context length near the start. */
const HEADER_BYTES = 1 << 20;

const SCALAR_SIZES: Readonly<Record<number, number>> = {
  0: 1, 1: 1, 2: 2, 3: 2, 4: 4, 5: 4, 6: 4, 7: 1, 10: 8, 11: 8, 12: 8
};
const STRING = 8;
const ARRAY = 9;

/**
 * Whether a GGUF header describes a language model: it has a
 * `<architecture>.context_length` key. Null when the bytes are not a GGUF
 * header or the header does not fit in them, so a caller can keep the file
 * rather than guess.
 */
export function ggufIsLanguageModel(bytes: Uint8Array): boolean | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  if (bytes.length < 24 || decoder.decode(bytes.subarray(0, 4)) !== "GGUF") {
    return null;
  }
  let offset = 16;
  const kvCount = Number(view.getBigUint64(offset, true));
  offset += 8;
  const readString = (): string => {
    const length = Number(view.getBigUint64(offset, true));
    offset += 8;
    const text = decoder.decode(bytes.subarray(offset, offset + length));
    offset += length;
    return text;
  };
  const skipValue = (type: number): void => {
    if (type === STRING) {
      offset += 8 + Number(view.getBigUint64(offset, true));
    } else if (type === ARRAY) {
      const itemType = view.getUint32(offset, true);
      const count = Number(view.getBigUint64(offset + 4, true));
      offset += 12;
      if (itemType === STRING || itemType === ARRAY) {
        for (let i = 0; i < count && offset < bytes.length; i++) skipValue(itemType);
      } else {
        offset += count * (SCALAR_SIZES[itemType] ?? 0);
      }
    } else {
      const size = SCALAR_SIZES[type];
      if (size === undefined) throw new RangeError(`unknown GGUF type ${type}`);
      offset += size;
    }
  };
  try {
    for (let i = 0; i < kvCount; i++) {
      const key = readString();
      const type = view.getUint32(offset, true);
      offset += 4;
      if (key.endsWith(".context_length")) {
        return true;
      }
      skipValue(type);
    }
    return false;
  } catch (error) {
    // The header ran past the bytes read.
    if (error instanceof RangeError) return null;
    throw error;
  }
}

/** Read a GGUF file's header and test it with {@link ggufIsLanguageModel}. */
export async function ggufFileIsLanguageModel(path: string): Promise<boolean | null> {
  const fsp = await importNodeBuiltin<typeof import("node:fs/promises")>("node:fs/promises");
  if (!fsp) return null;
  let handle: import("node:fs/promises").FileHandle | undefined;
  try {
    handle = await fsp.open(path, "r");
    const buffer = new Uint8Array(HEADER_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, HEADER_BYTES, 0);
    return ggufIsLanguageModel(buffer.subarray(0, bytesRead));
  } catch {
    return null;
  } finally {
    await handle?.close();
  }
}
