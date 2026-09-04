/**
 * How long a rendered video actually is, read from its own container.
 *
 * A video model quantizes the length it is asked for: a shot directed at 1.5s
 * comes back as 5.184s, and nothing downstream knew. The storyboard then laid
 * a 1.5s clip over 5.184s of footage, silently discarding the rest, and the
 * cut no longer matched what had been paid for. Recording the real length at
 * render time is what lets assembly trim on purpose instead of by accident.
 *
 * Reads the MP4 `mvhd` header only — no decode, no codecs, no host binary —
 * so it can run on the bytes already in hand. Returns null for anything that
 * is not an MP4 with a readable movie header; the caller treats an unknown
 * length as unknown, never as zero.
 */

/** Bytes of header a probe will scan before giving up. */
const MAX_SCAN_BYTES = 64 * 1024 * 1024;

const BOX_HEADER_BYTES = 8;

/** Containers whose `moov` may sit after the payload still parse: we walk all boxes. */
export function mp4DurationSeconds(bytes: Uint8Array): number | null {
  const view = new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength
  );
  const moov = findBox(view, 0, Math.min(view.byteLength, MAX_SCAN_BYTES), "moov");
  if (!moov) return null;
  const mvhd = findBox(view, moov.start, moov.end, "mvhd");
  if (!mvhd) return null;
  return readMvhdDuration(view, mvhd.start, mvhd.end);
}

interface BoxRange {
  /** First byte of the box payload. */
  start: number;
  /** One past the last byte of the box payload. */
  end: number;
}

/** The first `type` box whose header lies in [from, to). */
function findBox(
  view: DataView,
  from: number,
  to: number,
  type: string
): BoxRange | null {
  let offset = from;
  while (offset + BOX_HEADER_BYTES <= to) {
    let size = view.getUint32(offset);
    const name = String.fromCharCode(
      view.getUint8(offset + 4),
      view.getUint8(offset + 5),
      view.getUint8(offset + 6),
      view.getUint8(offset + 7)
    );
    let headerBytes = BOX_HEADER_BYTES;
    if (size === 1) {
      // 64-bit largesize follows the header.
      if (offset + 16 > to) return null;
      const high = view.getUint32(offset + 8);
      const low = view.getUint32(offset + 12);
      size = high * 2 ** 32 + low;
      headerBytes = 16;
    } else if (size === 0) {
      size = to - offset; // extends to the end of the enclosing range
    }
    if (size < headerBytes) return null; // malformed: a box cannot be shorter than its header
    const end = Math.min(offset + size, to);
    if (name === type) return { start: offset + headerBytes, end };
    offset += size;
  }
  return null;
}

/** Duration in seconds from an `mvhd` payload, or null when it reads as zero. */
function readMvhdDuration(
  view: DataView,
  start: number,
  end: number
): number | null {
  if (start + 4 > end) return null;
  const version = view.getUint8(start);
  let timescale: number;
  let duration: number;
  if (version === 1) {
    // version(1) flags(3) creation(8) modification(8) timescale(4) duration(8)
    if (start + 32 > end) return null;
    timescale = view.getUint32(start + 20);
    duration =
      view.getUint32(start + 24) * 2 ** 32 + view.getUint32(start + 28);
  } else {
    // version(1) flags(3) creation(4) modification(4) timescale(4) duration(4)
    if (start + 20 > end) return null;
    timescale = view.getUint32(start + 12);
    duration = view.getUint32(start + 16);
  }
  if (!timescale || !Number.isFinite(duration) || duration <= 0) return null;
  const seconds = duration / timescale;
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}
