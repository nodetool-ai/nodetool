/**
 * Design tokens, timing and easing for the Serein reference film.
 * The values follow demo/benchmarks/serein/BRIEF.md sections 4 and 5.
 */
import { Easing, interpolate, spring } from "remotion";

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;
export const DURATION = 780;

export const INK = "#0a0f1f";
export const INK2 = "#1e1b4b";
export const CARD = "#111a2e";
export const LINE = "rgba(148,163,184,0.18)";
export const TEXT = "#f8fafc";
export const DIM = "#94a3b8";
export const VIOLET = "#a78bfa";
export const NOW = "#fda4af";
export const LATER = "#93c5fd";
export const NEVER = "#64748b";
export const CALM = "#0f3b3a";
export const DUSK_STOPS = ["#60a5fa", "#a78bfa", "#fda4af"] as const;
export const DUSK = `linear-gradient(90deg, ${DUSK_STOPS.join(", ")})`;

export const FONT = "Inter, system-ui, sans-serif";

export type Category = "Now" | "Later" | "Never";
export const CATEGORY_COLOR: Record<Category, string> = {
  Now: NOW,
  Later: LATER,
  Never: NEVER,
};

export interface Email {
  sender: string;
  subject: string;
  category: Category;
  time: string;
}

export const EMAILS: readonly Email[] = [
  { sender: "Maya Chen", subject: "Contract renewal: need your sign-off", category: "Now", time: "9:41" },
  { sender: "Billing", subject: "Your invoice #4471 is ready", category: "Later", time: "9:38" },
  { sender: "Jonas Weber", subject: "Re: re: re: offsite dates", category: "Later", time: "9:32" },
  { sender: "Calendar", subject: "Updated: Weekly sync (moved)", category: "Never", time: "9:30" },
  { sender: "Priya Nair", subject: "Draft deck for Thursday", category: "Later", time: "9:21" },
  { sender: "GitHub", subject: "14 new notifications", category: "Later", time: "9:17" },
  { sender: "Newsletter", subject: "12 tools you missed this week", category: "Never", time: "9:05" },
  { sender: "Leo Martins", subject: "Quick question about the budget", category: "Later", time: "8:58" },
  { sender: "Flights", subject: "Check in now for your trip", category: "Now", time: "8:44" },
  { sender: "HR", subject: "Benefits enrollment closes Friday", category: "Later", time: "8:40" },
  { sender: "Sam Ortiz", subject: "Photos from Saturday", category: "Later", time: "8:31" },
  { sender: "Security", subject: "New sign-in on a new device", category: "Now", time: "8:22" },
  { sender: "Ana Silva", subject: "Can you review by EOD?", category: "Now", time: "8:15" },
  { sender: "Store", subject: "Your order has shipped", category: "Never", time: "8:02" },
  { sender: "Recruiting", subject: "Candidate feedback needed", category: "Later", time: "7:56" },
  { sender: "Team", subject: "Standup notes", category: "Never", time: "7:48" },
  { sender: "Promo", subject: "Last day: 40% off", category: "Never", time: "7:30" },
  { sender: "Dad", subject: "Call me when you can", category: "Now", time: "7:12" },
];

/** Scene start frames (BRIEF.md section 4). */
export const S1 = 0;
export const S2 = 123;
export const S3 = 192;
export const S4A = 245;
export const S4B = 350;
export const S4C = 456;
export const S4D = 562;
export const S5A = 615;
export const S5B = 642;
export const S6 = 668;

const BEAT_S = 60 / 136;
/** The frame of beat `k`, counted from the drop at 8.15 s. */
export const beat = (k: number): number => Math.round((8.15 + k * BEAT_S) * FPS);

export const ms = (m: number): number => (m * FPS) / 1000;

export const easeOutExpo = (t: number): number => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
export const easeInExpo = (t: number): number => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10));
export const easeInOutExpo = (t: number): number => {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2;
};
export const easeOutCubic = Easing.out(Easing.cubic);

/** Progress 0..1 of frame `f` in [from, from + dur], shaped by `ease`. */
export function prog(
  f: number,
  from: number,
  dur: number,
  ease: (t: number) => number = (t) => t
): number {
  return ease(interpolate(f, [from, from + dur], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  }));
}

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** spring(170, 18, 1) from frame `from`: 0 before, overshoots once, settles at 1. */
export function spr(f: number, from: number): number {
  if (f < from) return 0;
  return spring({
    frame: f - from,
    fps: FPS,
    config: { stiffness: 170, damping: 18, mass: 1 },
  });
}

/** The engine gives blur as a radius r with sigma r / 3 (BRIEF.md D3). */
export const blurCss = (radius: number): string => `blur(${(radius / 3).toFixed(2)}px)`;

/** Deterministic 0..1 noise from an integer key. */
export function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export function mixHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (p: number, s: number): number => (p >> s) & 255;
  const c = (s: number): string => Math.round(lerp(ch(pa, s), ch(pb, s), t)).toString(16).padStart(2, "0");
  return `#${c(16)}${c(8)}${c(0)}`;
}
