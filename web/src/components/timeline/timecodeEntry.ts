/**
 * What a typed timecode means, the way Premiere reads its timecode field.
 * Fields fill from the right, frames first: "00:00:10:00", "10:00" and
 * "1000" are all ten seconds, and "5" is five frames. A leading "+" or "-"
 * moves by that much from the current time.
 */

/** Milliseconds for fields read right to left as FF, SS, MM, HH. */
function fieldsToMs(fields: readonly number[], fps: number): number {
  const [ff = 0, ss = 0, mm = 0, hh = 0] = [...fields].reverse();
  const actualFps = Math.max(1, fps);
  const nominalFps = Math.max(1, Math.round(fps));
  const totalSec = hh * 3600 + mm * 60 + ss;
  return Math.round(((totalSec * nominalFps + ff) * 1000) / actualFps);
}

/** A digit run split into two-digit fields from the right. */
function digitFields(digits: string): number[] {
  const fields: number[] = [];
  for (let end = digits.length; end > 0; end -= 2) {
    fields.unshift(Number(digits.slice(Math.max(0, end - 2), end)));
    if (fields.length === 3 && end - 2 > 0) {
      fields.unshift(Number(digits.slice(0, end - 2)));
      break;
    }
  }
  return fields;
}

/** The time `input` names, or null when it is not a timecode. */
export function parseTimecodeEntry(
  input: string,
  fps: number,
  currentMs: number
): number | null {
  const trimmed = input.trim();
  const sign = trimmed.startsWith("+") ? 1 : trimmed.startsWith("-") ? -1 : 0;
  const body = sign === 0 ? trimmed : trimmed.slice(1).trim();
  let fields: number[];
  if (/^\d+$/.test(body)) {
    fields = digitFields(body);
  } else if (/^\d+([:;.]\d+){1,3}$/.test(body)) {
    fields = body.split(/[:;.]/).map(Number);
  } else {
    return null;
  }
  const ms = fieldsToMs(fields, fps);
  return Math.max(0, sign === 0 ? ms : currentMs + sign * ms);
}
