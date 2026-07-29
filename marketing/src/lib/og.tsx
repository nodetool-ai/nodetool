import { ImageResponse } from "next/og";
import fs from "node:fs";
import path from "node:path";

/**
 * Shared Open Graph image generator (A5). Build-time PNG generation via
 * next/og so every key route ships a distinct, on-brand social card. 1200×630,
 * the standard OG size.
 *
 * The card composites a real product screenshot into a branded "window" frame
 * (legible headline on the left, product peeking in from the right) instead of
 * a text-only card. Screenshots are read from `public/` at build time and
 * inlined as data URIs — these routes prerender statically on Node, so `fs` is
 * available during generation.
 */
export const ogSize = { width: 1200, height: 630 };
export const ogContentType = "image/png";

export type OgAccent = "blue" | "violet" | "emerald" | "rose" | "amber" | "cyan";

type AccentSpec = {
  glowA: string;
  glowB: string;
  bar: string;
  chipBg: string;
  chipBorder: string;
  chipText: string;
};

const ACCENTS: Record<OgAccent, AccentSpec> = {
  blue: {
    glowA: "rgba(37,99,235,0.40)",
    glowB: "rgba(56,189,248,0.22)",
    bar: "#60a5fa",
    chipBg: "rgba(37,99,235,0.16)",
    chipBorder: "rgba(96,165,250,0.45)",
    chipText: "#bfdbfe",
  },
  violet: {
    glowA: "rgba(139,92,246,0.40)",
    glowB: "rgba(232,121,249,0.22)",
    bar: "#c4b5fd",
    chipBg: "rgba(139,92,246,0.16)",
    chipBorder: "rgba(196,181,253,0.45)",
    chipText: "#ddd6fe",
  },
  emerald: {
    glowA: "rgba(16,185,129,0.36)",
    glowB: "rgba(56,189,248,0.20)",
    bar: "#6ee7b7",
    chipBg: "rgba(16,185,129,0.16)",
    chipBorder: "rgba(110,231,183,0.45)",
    chipText: "#a7f3d0",
  },
  rose: {
    glowA: "rgba(244,63,94,0.36)",
    glowB: "rgba(251,191,36,0.22)",
    bar: "#fda4af",
    chipBg: "rgba(244,63,94,0.16)",
    chipBorder: "rgba(253,164,175,0.45)",
    chipText: "#fecdd3",
  },
  amber: {
    glowA: "rgba(245,158,11,0.34)",
    glowB: "rgba(244,114,182,0.20)",
    bar: "#fcd34d",
    chipBg: "rgba(245,158,11,0.16)",
    chipBorder: "rgba(252,211,77,0.45)",
    chipText: "#fde68a",
  },
  cyan: {
    glowA: "rgba(34,211,238,0.34)",
    glowB: "rgba(59,130,246,0.22)",
    bar: "#67e8f9",
    chipBg: "rgba(34,211,238,0.16)",
    chipBorder: "rgba(103,232,249,0.45)",
    chipText: "#a5f3fc",
  },
};

const imageCache = new Map<string, string | null>();

/** Read a `public/` image and inline it as a base64 data URI (cached). */
function loadPublicImage(file: string): string | null {
  if (imageCache.has(file)) return imageCache.get(file) ?? null;
  let uri: string | null = null;
  try {
    const buf = fs.readFileSync(path.join(process.cwd(), "public", file));
    const ext = path.extname(file).slice(1).toLowerCase();
    const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : `image/${ext}`;
    uri = `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    uri = null;
  }
  imageCache.set(file, uri);
  return uri;
}

export type OgOptions = {
  /** Filename in `public/` to composite into the window frame. */
  image?: string;
  /** Glow / chip color theme. */
  accent?: OgAccent;
  /** Small label above the headline (e.g. "Studio", "vs ComfyUI"). */
  eyebrow?: string;
};

export function ogImage(title: string, subtitle: string, opts: OgOptions = {}) {
  const accent = ACCENTS[opts.accent ?? "blue"];
  const shot = opts.image ? loadPublicImage(opts.image) : null;
  // Keep long headlines from overflowing the left column.
  const titleSize = title.length > 30 ? 50 : title.length > 20 ? 58 : 66;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          overflow: "hidden",
          backgroundColor: "#050510",
          backgroundImage: `radial-gradient(55% 70% at 78% 18%, ${accent.glowA}, transparent 60%), radial-gradient(45% 60% at 100% 100%, ${accent.glowB}, transparent 60%)`,
          fontFamily: "sans-serif",
        }}
      >
        {/* Left column: copy */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            width: 560,
            flexShrink: 0,
            padding: "60px 56px",
            zIndex: 10,
          }}
        >
          {/* Wordmark */}
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div
              style={{
                display: "flex",
                width: 40,
                height: 40,
                borderRadius: 11,
                backgroundImage:
                  "linear-gradient(135deg, #f43f5e 0%, #e879f9 50%, #fbbf24 100%)",
              }}
            />
            <div
              style={{
                fontSize: 28,
                fontWeight: 700,
                color: "#ffffff",
                letterSpacing: 6,
                textTransform: "uppercase",
              }}
            >
              nodetool
            </div>
          </div>

          {/* Headline block */}
          <div style={{ display: "flex", flexDirection: "column" }}>
            {opts.eyebrow ? (
              <div
                style={{
                  display: "flex",
                  alignSelf: "flex-start",
                  marginBottom: 22,
                  padding: "7px 16px",
                  borderRadius: 999,
                  fontSize: 20,
                  fontWeight: 600,
                  color: accent.chipText,
                  backgroundColor: accent.chipBg,
                  border: `1px solid ${accent.chipBorder}`,
                }}
              >
                {opts.eyebrow}
              </div>
            ) : null}
            <div
              style={{
                fontSize: titleSize,
                fontWeight: 700,
                color: "#ffffff",
                lineHeight: 1.05,
                letterSpacing: -1,
              }}
            >
              {title}
            </div>
            <div
              style={{
                display: "flex",
                width: 72,
                height: 5,
                marginTop: 26,
                borderRadius: 999,
                backgroundColor: accent.bar,
              }}
            />
            <div
              style={{
                marginTop: 22,
                fontSize: 26,
                color: "#cbd5e1",
                lineHeight: 1.35,
              }}
            >
              {subtitle}
            </div>
          </div>

          {/* Footer */}
          <div
            style={{ display: "flex", color: "#94a3b8", fontSize: 21, fontWeight: 500 }}
          >
            Open source · your own keys · nodetool.ai
          </div>
        </div>

        {/* Right column: product screenshot in a window frame, bleeding off-edge */}
        {shot ? (
          <div style={{ display: "flex", flex: 1, position: "relative" }}>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                position: "absolute",
                top: 96,
                left: 20,
                right: -90,
                bottom: -70,
                borderRadius: 20,
                overflow: "hidden",
                border: "1px solid rgba(148,163,184,0.25)",
                backgroundColor: "#0b1020",
                boxShadow: "0 40px 90px rgba(0,0,0,0.55)",
              }}
            >
              {/* Title bar */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 9,
                  height: 40,
                  flexShrink: 0,
                  padding: "0 18px",
                  backgroundColor: "rgba(15,23,42,0.95)",
                  borderBottom: "1px solid rgba(148,163,184,0.18)",
                }}
              >
                <div style={{ display: "flex", width: 12, height: 12, borderRadius: 999, backgroundColor: "#f87171" }} />
                <div style={{ display: "flex", width: 12, height: 12, borderRadius: 999, backgroundColor: "#fbbf24" }} />
                <div style={{ display: "flex", width: 12, height: 12, borderRadius: 999, backgroundColor: "#34d399" }} />
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={shot}
                alt=""
                width={820}
                height={520}
                style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "left top" }}
              />
            </div>
          </div>
        ) : null}
      </div>
    ),
    { ...ogSize }
  );
}
