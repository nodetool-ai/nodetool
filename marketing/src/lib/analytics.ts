/**
 * Thin wrapper over Plausible's queued global. The script is loaded in
 * `app/layout.tsx`; this gives call sites a typed, fail-safe `track()` so CTAs
 * and downloads emit consistent custom events (P4 — conversion instrumentation).
 */

export type PlausibleProps = Record<string, string | number | boolean>;

const LANDING_PAGES = {
  "/": "home",
  "/alternatives/comfyui": "comfyui",
  "/alternatives/figma-weave": "figma-weave",
  "/alternatives/higgsfield": "higgsfield",
  "/alternatives/openart": "openart",
  "/alternatives/ltx-studio": "ltx-studio",
  "/alternatives/google-flow": "google-flow",
  "/alternatives/artlist": "artlist",
  "/alternatives/invideo": "invideo",
  "/alternatives/katalist": "katalist",
  "/alternatives/storyboarder-ai": "storyboarder-ai",
  "/alternatives/story-com": "story-com",
  "/alternatives/mootion": "mootion",
  "/alternatives/moonvalley": "moonvalley",
  "/alternatives/kling-ai": "kling-ai",
  "/alternatives/pika": "pika",
  "/alternatives/luma-dream-machine": "luma-dream-machine",
  "/alternatives/pixverse": "pixverse",
  "/alternatives/leonardo-ai": "leonardo-ai",
  "/alternatives/midjourney": "midjourney",
  "/alternatives/adobe-firefly": "adobe-firefly",
  "/alternatives/ideogram": "ideogram",
  "/alternatives/recraft": "recraft",
  "/alternatives/dreamina": "dreamina",
  "/use-cases/movie-poster": "movie-poster",
  "/node-based-ai": "node-based-ai",
  "/studio": "studio",
  "/cloud": "cloud",
  "/download": "download",
} as const;

export type LandingPage = typeof LANDING_PAGES[keyof typeof LANDING_PAGES];

export function getLandingPage(value: string | null): LandingPage | undefined {
  return Object.values(LANDING_PAGES).find((page) => page === value);
}

function pageLabel(pathname: string): LandingPage | "template" | "other" {
  const entry = Object.entries(LANDING_PAGES).find(([path]) => path === pathname);
  return entry?.[1] ?? (pathname.startsWith("/templates/") ? "template" : "other");
}

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
  // The CTA click and the installer click are separate now that /download
  // sits between them: one measures intent, the other measures a file leaving.
  | "Download CTA"
  | "Download"
  | "Browse Releases"
  | "Open Starter"
  | "View Demo"
  | "Star GitHub"
  | "Try Cloud"
  | "Cloud CTA"
  | "Open Docs"
  | "Join Discord"
  | "Contact"
  | "Calculator Interaction";

export function track(event: TrackEvent, props?: PlausibleProps): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    const page = pageLabel(window.location.pathname);
    const source = getLandingPage(new URLSearchParams(window.location.search).get("from"));
    window.plausible?.(event, { props: { page, landing_page: source ?? page, ...props } });
  } catch {
    // Analytics must never break a click handler.
  }
}
