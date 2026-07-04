/**
 * Scene 6 — the honesty beat. A faithful recreation of the cost dashboard
 * from the landing page (marketing CostDashboardSection: same rows, same
 * totals, same provider split), animated: rows stagger in, share bars grow,
 * the total counts up. BYOK is the differentiator; it gets its own scene.
 */
import React from "react";
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Headline } from "./overlays";
import { easeOutProgress } from "./helpers";
import {
  PROMO_BG,
  PROMO_FONT,
  PROMO_FONT_MONO,
  PROMO_PANEL_BORDER,
  PROMO_TEXT,
  PROMO_TEXT_DIM,
} from "./theme";

const PROVIDERS = [
  { label: "Kie", amount: "$4.35", color: "#4d8bff" },
  { label: "OpenAI", amount: "$1.85", color: "#34d399" },
  { label: "fal.ai", amount: "$1.50", color: "#8b7bf0" },
];

const ROWS = [
  { name: "BytedanceSeedance2", runs: 1, share: 40, cost: "$3.08" },
  { name: "GptImage2Edit", runs: 10, share: 18, cost: "$1.41" },
  { name: "gpt-5.4-mini", runs: 37, share: 16, cost: "$1.25" },
  { name: "GrokImagineTextToVideo", runs: 21, share: 13, cost: "$1.01" },
  { name: "gpt-5-mini", runs: 29, share: 4, cost: "$0.34" },
];

const TOTAL = 7.71;

export const CostScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const enter = easeOutProgress(frame, 0, 14);
  const panelWidth = Math.min(1360, width * 0.74);
  const scale = Math.min(1, (height * 0.62) / 620);

  const total = TOTAL * easeOutProgress(frame, 8, 40);

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(90% 70% at 50% 20%, rgba(37,99,235,0.14), transparent 60%), ${PROMO_BG}`,
        alignItems: "center",
        justifyContent: "flex-start",
      }}
    >
      <div
        style={{
          marginTop: height * 0.075,
          width: panelWidth,
          transform: `scale(${scale}) translateY(${(1 - enter) * 26}px)`,
          transformOrigin: "top center",
          opacity: enter,
          borderRadius: 22,
          border: `1px solid ${PROMO_PANEL_BORDER}`,
          background: "rgba(15, 23, 42, 0.78)",
          boxShadow: "0 30px 90px rgba(0,0,0,0.55)",
          padding: "34px 42px",
          fontFamily: PROMO_FONT,
        }}
      >
        {/* Header row */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
          }}
        >
          <div
            style={{
              fontFamily: PROMO_FONT_MONO,
              fontSize: 20,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: PROMO_TEXT_DIM,
            }}
          >
            Cost dashboard
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {["7d", "14d", "30d"].map((r, i) => (
              <div
                key={r}
                style={{
                  padding: "6px 14px",
                  borderRadius: 8,
                  fontSize: 18,
                  color: i === 0 ? PROMO_TEXT : PROMO_TEXT_DIM,
                  background: i === 0 ? "rgba(59,130,246,0.25)" : "transparent",
                  border: `1px solid ${
                    i === 0 ? "rgba(59,130,246,0.5)" : PROMO_PANEL_BORDER
                  }`,
                }}
              >
                {r}
              </div>
            ))}
          </div>
        </div>

        {/* Stats + provider split */}
        <div style={{ display: "flex", gap: 46, marginTop: 26 }}>
          <div>
            <div style={{ fontSize: 20, color: PROMO_TEXT_DIM }}>Total spend</div>
            <div
              style={{
                fontSize: 64,
                fontWeight: 800,
                letterSpacing: "-0.02em",
                color: PROMO_TEXT,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              ${total.toFixed(2)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 20, color: PROMO_TEXT_DIM }}>Avg per run</div>
            <div
              style={{
                fontSize: 64,
                fontWeight: 800,
                letterSpacing: "-0.02em",
                color: PROMO_TEXT,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              $0.040
            </div>
          </div>
          <div
            style={{
              marginLeft: "auto",
              display: "flex",
              flexDirection: "column",
              gap: 10,
              justifyContent: "center",
            }}
          >
            {PROVIDERS.map((p, i) => {
              const rowIn = easeOutProgress(frame, 14 + i * 6, 28 + i * 6);
              return (
                <div
                  key={p.label}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    opacity: rowIn,
                    transform: `translateX(${(1 - rowIn) * 16}px)`,
                    fontSize: 22,
                  }}
                >
                  <span
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: "50%",
                      background: p.color,
                    }}
                  />
                  <span style={{ color: PROMO_TEXT_DIM, width: 110 }}>
                    {p.label}
                  </span>
                  <span
                    style={{
                      color: PROMO_TEXT,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {p.amount}
                  </span>
                  <span style={{ color: PROMO_TEXT_DIM, fontSize: 18 }}>
                    paid directly
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Per-node table */}
        <div style={{ marginTop: 30 }}>
          {ROWS.map((row, i) => {
            const rowIn = easeOutProgress(frame, 20 + i * 7, 36 + i * 7);
            const bar = interpolate(
              easeOutProgress(frame, 26 + i * 7, 56 + i * 7),
              [0, 1],
              [0, row.share]
            );
            return (
              <div
                key={row.name}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 18,
                  padding: "11px 0",
                  borderTop: `1px solid rgba(148,163,184,0.12)`,
                  opacity: rowIn,
                  transform: `translateY(${(1 - rowIn) * 10}px)`,
                }}
              >
                <div
                  style={{
                    width: 340,
                    fontFamily: PROMO_FONT_MONO,
                    fontSize: 21,
                    color: PROMO_TEXT,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {row.name}
                </div>
                <div style={{ width: 110, fontSize: 19, color: PROMO_TEXT_DIM }}>
                  {row.runs} {row.runs === 1 ? "run" : "runs"}
                </div>
                <div
                  style={{
                    flex: 1,
                    height: 10,
                    borderRadius: 6,
                    background: "rgba(148,163,184,0.14)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${(bar / 40) * 100}%`,
                      height: "100%",
                      borderRadius: 6,
                      background:
                        "linear-gradient(90deg, #3b82f6, #8b7bf0)",
                    }}
                  />
                </div>
                <div
                  style={{
                    width: 92,
                    textAlign: "right",
                    fontSize: 22,
                    fontWeight: 600,
                    color: PROMO_TEXT,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {row.cost}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Headline from={6} to={78} text="Your keys. Provider prices." />
      <Headline
        from={80}
        to={148}
        text="No credits. No markup."
        small="The bill comes from the provider, not from us."
      />
    </AbsoluteFill>
  );
};
