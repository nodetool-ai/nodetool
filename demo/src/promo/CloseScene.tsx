/**
 * Scene 7 — export and close. A quick Export beat over the finished editor,
 * a white flash into the trailer's finale playing full-frame with sound, then
 * the brand card: logo, the landing page's hero line, and the CTA.
 */
import React from "react";
import {
  AbsoluteFill,
  Img,
  OffthreadVideo,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { TimelineDemoPlayer, promoTimelineCast } from "@web-demo";
import { usePendingMediaDelay } from "./usePendingMediaDelay";
import { Cursor } from "./Cursor";
import { easeOutProgress } from "./helpers";
import {
  PROMO_ACCENT_GRADIENT,
  PROMO_BG,
  PROMO_FONT,
  PROMO_FONT_MONO,
  PROMO_PANEL_BORDER,
  PROMO_TEXT,
  PROMO_TEXT_DIM,
} from "./theme";

const resolvePromoAsset = (file: string): string =>
  staticFile(`casts/promo/${file}`);

const EXPORT_END = 20;
const FILM_START = 16;
const CARD_START = 104;

export const CloseScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const onPendingMedia = usePendingMediaDelay("close");

  const flash = interpolate(frame, [14, 18, 24], [0, 0.95, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const filmZoom = interpolate(frame, [FILM_START, 120], [1, 1.07], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const filmVolume = interpolate(frame, [FILM_START, 24, 96, 118], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const cardIn = easeOutProgress(frame, CARD_START, CARD_START + 16);

  const buttonX = width / 2;
  const buttonY = height * 0.42;

  return (
    <AbsoluteFill style={{ background: PROMO_BG }}>
      {/* Export beat over the finished editor */}
      {frame < EXPORT_END + 6 ? (
        <AbsoluteFill>
          <TimelineDemoPlayer
            cast={promoTimelineCast}
            timeMs={16900}
            resolveAssetUrl={resolvePromoAsset}
            tracksHeightPx={Math.round(height * 0.3)}
            onPendingMedia={onPendingMedia}
          />
          <AbsoluteFill style={{ background: "rgba(2,6,23,0.55)" }} />
          <div
            style={{
              position: "absolute",
              left: buttonX,
              top: buttonY,
              transform: `translate(-50%, -50%) scale(${
                frame >= 10 && frame <= 14 ? 0.94 : 1
              })`,
              padding: "18px 44px",
              borderRadius: 14,
              background: "#2563eb",
              color: PROMO_TEXT,
              fontFamily: PROMO_FONT,
              fontWeight: 600,
              fontSize: 34,
              boxShadow: "0 16px 60px rgba(37,99,235,0.5)",
            }}
          >
            Export a finished cut
          </div>
          <Cursor
            frame={frame}
            waypoints={[
              { frame: 0, x: buttonX + 260, y: buttonY + 190 },
              { frame: 10, x: buttonX + 40, y: buttonY + 14, click: true },
            ]}
          />
        </AbsoluteFill>
      ) : null}

      {/* The finale plays full-frame */}
      {frame >= FILM_START ? (
        <AbsoluteFill
          style={{
            opacity: interpolate(frame, [FILM_START, 22], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          <OffthreadVideo
            src={resolvePromoAsset("close.mp4")}
            volume={filmVolume}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              transform: `scale(${filmZoom})`,
            }}
          />
        </AbsoluteFill>
      ) : null}

      {/* Brand card */}
      {frame >= CARD_START ? (
        <AbsoluteFill
          style={{
            opacity: cardIn,
            background: `radial-gradient(70% 55% at 50% 38%, rgba(232,121,249,0.14), transparent 65%), radial-gradient(60% 50% at 50% 80%, rgba(59,130,246,0.12), transparent 60%), ${PROMO_BG}`,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              transform: `translateY(${(1 - cardIn) * 24}px)`,
            }}
          >
            <Img
              src={resolvePromoAsset("logo.png")}
              style={{ height: 108, marginBottom: 34 }}
            />
            <div
              style={{
                fontFamily: PROMO_FONT,
                fontWeight: 800,
                fontSize: 92,
                letterSpacing: "-0.03em",
                color: PROMO_TEXT,
                lineHeight: 1,
              }}
            >
              NodeTool
            </div>
            <div
              style={{
                marginTop: 20,
                fontFamily: PROMO_FONT,
                fontWeight: 600,
                fontSize: 40,
                color: PROMO_TEXT,
              }}
            >
              The open creative{" "}
              <span
                style={{
                  background: PROMO_ACCENT_GRADIENT,
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  color: "transparent",
                }}
              >
                AI workspace.
              </span>
            </div>
            <div
              style={{
                marginTop: 38,
                padding: "16px 34px",
                borderRadius: 999,
                border: `1px solid ${PROMO_PANEL_BORDER}`,
                background: "rgba(15,23,42,0.7)",
                fontFamily: PROMO_FONT_MONO,
                fontSize: 26,
                color: PROMO_TEXT_DIM,
              }}
            >
              Free &amp; open source · <span style={{ color: PROMO_TEXT }}>nodetool.ai</span>
            </div>
          </div>
        </AbsoluteFill>
      ) : null}

      {/* Flash on export */}
      {flash > 0 ? (
        <AbsoluteFill style={{ background: "#fff", opacity: flash }} />
      ) : null}
    </AbsoluteFill>
  );
};
