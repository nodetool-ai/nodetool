import { ImageResponse } from "next/og";

/**
 * Shared Open Graph image generator (A5). Build-time PNG generation via
 * next/og so every key route can ship a distinct, on-brand social card instead
 * of one shared preview.png. 1200×630, the standard OG size.
 */
export const ogSize = { width: 1200, height: 630 };
export const ogContentType = "image/png";

export function ogImage(title: string, subtitle: string) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: "#020617",
          backgroundImage:
            "radial-gradient(60% 60% at 20% 0%, rgba(37,99,235,0.30), transparent 60%), radial-gradient(50% 60% at 100% 100%, rgba(232,121,249,0.18), transparent 60%)",
          padding: "80px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", color: "#ffffff" }}>
          <div
            style={{
              fontSize: 34,
              fontWeight: 700,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
            }}
          >
            nodetool
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: 72,
              fontWeight: 700,
              color: "#ffffff",
              lineHeight: 1.05,
              letterSpacing: "-0.02em",
            }}
          >
            {title}
          </div>
          <div
            style={{
              marginTop: 28,
              fontSize: 34,
              color: "#cbd5e1",
              lineHeight: 1.3,
              maxWidth: 900,
            }}
          >
            {subtitle}
          </div>
        </div>

        <div style={{ display: "flex", color: "#60a5fa", fontSize: 26 }}>
          Open source · BYOK · nodetool.ai
        </div>
      </div>
    ),
    { ...ogSize }
  );
}
