/** Formats ms as HH:MM:SS:FF (frames) — used for the Start field. */
export function formatTimecode(ms: number, fps: number): string {
  const safeFps = Math.max(1, Math.round(fps));
  const totalFrames = Math.max(0, Math.round((ms / 1000) * safeFps));
  const ff = totalFrames % safeFps;
  const totalSec = Math.floor(totalFrames / safeFps);
  const ss = totalSec % 60;
  const mm = Math.floor(totalSec / 60) % 60;
  const hh = Math.floor(totalSec / 3600);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(hh)}:${pad(mm)}:${pad(ss)}:${pad(ff)}`;
}

/** Parses HH:MM:SS:FF (or M:SS, or plain ms) back into milliseconds. */
export function parseTimecode(input: string, fps: number): number | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;
  const safeFps = Math.max(1, Math.round(fps));
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const n = Number(trimmed);
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.round(n);
  }
  const parts = trimmed.split(":").map((p) => p.trim());
  if (parts.some((p) => !/^\d+$/.test(p))) return null;
  const nums = parts.map(Number);
  if (nums.some((n) => !Number.isFinite(n) || n < 0)) return null;
  let hh = 0;
  let mm = 0;
  let ss = 0;
  let ff = 0;
  if (nums.length === 4) {
    [hh, mm, ss, ff] = nums;
  } else if (nums.length === 3) {
    [hh, mm, ss] = nums;
  } else if (nums.length === 2) {
    [mm, ss] = nums;
  } else if (nums.length === 1) {
    [ss] = nums;
  } else {
    return null;
  }
  const totalSec = hh * 3600 + mm * 60 + ss;
  return Math.round(totalSec * 1000 + (ff * 1000) / safeFps);
}

/** "4.60s" → 4.6 seconds, returns ms. */
export function parseSeconds(input: string): number | null {
  const trimmed = input.trim().replace(/s$/i, "").trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 1000);
}
