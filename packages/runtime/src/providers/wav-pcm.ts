/**
 * Extract raw PCM Int16 samples and the sample rate from a WAV buffer.
 * Handles non-standard chunk ordering by scanning for the "fmt " and "data"
 * chunks rather than assuming a fixed 44-byte header.
 */
export function parseWavPCM(
  bytes: Uint8Array,
  defaultSampleRate = 24000
): { samples: Int16Array; sampleRate: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let sampleRate = defaultSampleRate;
  let offset = 12; // Skip "RIFF", file-size, "WAVE"

  while (offset + 8 <= bytes.byteLength) {
    // Chunk IDs are ASCII — read as big-endian uint32 to compare with literals
    const chunkId = view.getUint32(offset, false);
    const chunkSize = view.getUint32(offset + 4, true);

    if (
      chunkId === 0x666d7420 /* "fmt " */ &&
      offset + 16 <= bytes.byteLength
    ) {
      // The sampleRate read is a 4-byte uint32 at offset+12, so it needs
      // offset+16 in bounds — the previous offset+12 guard let getUint32 throw
      // RangeError on a WAV truncated between offset+12 and offset+15.
      sampleRate = view.getUint32(offset + 12, true);
    } else if (chunkId === 0x64617461 /* "data" */) {
      const dataStart = offset + 8;
      const dataEnd = Math.min(dataStart + chunkSize, bytes.byteLength);
      const pcmBytes = bytes.slice(dataStart, dataEnd);
      return {
        samples: new Int16Array(
          pcmBytes.buffer,
          pcmBytes.byteOffset,
          Math.floor(pcmBytes.byteLength / 2)
        ),
        sampleRate
      };
    }

    const advance = 8 + chunkSize + (chunkSize % 2 === 0 ? 0 : 1);
    // Guard against malformed chunk sizes that would loop forever
    if (advance > bytes.byteLength - offset) break;
    offset += advance;
  }

  // Fallback: assume standard 44-byte PCM header if "data" chunk was not found
  const pcmBytes = bytes.slice(44);
  return {
    samples: new Int16Array(
      pcmBytes.buffer,
      pcmBytes.byteOffset,
      Math.floor(pcmBytes.byteLength / 2)
    ),
    sampleRate
  };
}
