/**
 * Thin wrapper over Plausible's queued global. The script is loaded in
 * `app/layout.tsx`; this gives call sites a typed, fail-safe `track()` so CTAs
 * and downloads emit consistent custom events (P4 — conversion instrumentation).
 */

type PlausibleProps = Record<string, string | number | boolean>;

type PlausibleFn = (
  event: string,
  options?: { props?: PlausibleProps }
) => void;

declare global {
  interface Window {
    plausible?: PlausibleFn & { q?: unknown[] };
  }
}

/** Known custom events. Keep names stable — they become Plausible goals. */
export type TrackEvent =
  | "Download"
  | "View Demo"
  | "Star GitHub"
  | "Try Cloud"
  | "Open Docs"
  | "Join Discord"
  | "Contact";

export function track(event: TrackEvent, props?: PlausibleProps): void {
  if (typeof window === "undefined") return;
  try {
    window.plausible?.(event, props ? { props } : undefined);
  } catch {
    // Analytics must never break a click handler.
  }
}
