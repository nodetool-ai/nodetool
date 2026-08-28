export type RunTone = "running" | "failed" | "done";

/** Jobs the backend has not settled yet. */
const RUNNING_STATUSES = new Set(["running", "starting", "queued", "pending"]);
const FAILED_STATUSES = new Set(["failed", "error", "cancelled"]);

export const toneFor = (status: string | null | undefined): RunTone => {
  const normalized = (status ?? "").toLowerCase();
  if (RUNNING_STATUSES.has(normalized)) {
    return "running";
  }
  if (FAILED_STATUSES.has(normalized)) {
    return "failed";
  }
  return "done";
};

/** Compact relative time: "now", "12m", "3h", "5d". */
export function shortAgo(iso: string | null | undefined): string {
  if (!iso) {
    return "";
  }
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) {
    return "";
  }
  const mins = Math.floor((Date.now() - then) / 60_000);
  if (mins < 1) {
    return "now";
  }
  if (mins < 60) {
    return `${mins}m`;
  }
  const hours = Math.floor(mins / 60);
  if (hours < 24) {
    return `${hours}h`;
  }
  return `${Math.floor(hours / 24)}d`;
}
