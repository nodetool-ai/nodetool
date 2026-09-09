/**
 * Read an MP4's duration from its movie header without decoding the video.
 * Returns null for any container without a readable `mvhd` box.
 */

const MAX_SCAN_BYTES = 64 * 1024 * 1024;
const BOX_HEADER_BYTES = 8;

interface BoxRange {
  start: number;
  end: number;
}

export function mp4DurationSeconds(bytes: Uint8Array): number | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const moov = findBox(view, 0, Math.min(view.byteLength, MAX_SCAN_BYTES), "moov");
  if (!moov) return null;
  const mvhd = findBox(view, moov.start, moov.end, "mvhd");
  return mvhd ? readMvhdDuration(view, mvhd.start, mvhd.end) : null;
}

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
      if (offset + 16 > to) return null;
      size = view.getUint32(offset + 8) * 2 ** 32 + view.getUint32(offset + 12);
      headerBytes = 16;
    } else if (size === 0) {
      size = to - offset;
    }
    if (size < headerBytes) return null;
    const end = Math.min(offset + size, to);
    if (name === type) return { start: offset + headerBytes, end };
    offset += size;
  }
  return null;
}

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
    if (start + 32 > end) return null;
    timescale = view.getUint32(start + 20);
    duration =
      view.getUint32(start + 24) * 2 ** 32 + view.getUint32(start + 28);
  } else {
    if (start + 20 > end) return null;
    timescale = view.getUint32(start + 12);
    duration = view.getUint32(start + 16);
  }
  if (!timescale || !Number.isFinite(duration) || duration <= 0) return null;
  const seconds = duration / timescale;
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}
