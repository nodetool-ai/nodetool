/** @jsxImportSource @emotion/react */
import { css, keyframes } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import { useTheme } from "@mui/material/styles";
import { memo, type CSSProperties } from "react";
import { MOTION, BORDER_RADIUS, SPACING, getSpacingPx } from "../ui_primitives";
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined";
import VideocamOutlinedIcon from "@mui/icons-material/VideocamOutlined";
import GraphicEqIcon from "@mui/icons-material/GraphicEq";
import SmartToyOutlinedIcon from "@mui/icons-material/SmartToyOutlined";
import type { SvgIconComponent } from "@mui/icons-material";
import { WELCOME_TRACKS, type WelcomeTrackId } from "./welcomeTracks";

const TRACK_ICONS: Record<WelcomeTrackId, SvgIconComponent> = {
  image: ImageOutlinedIcon,
  video: VideocamOutlinedIcon,
  audio: GraphicEqIcon,
  agent: SmartToyOutlinedIcon
};

const rise = keyframes`
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
`;

const pulse = keyframes`
  0%, 100% { box-shadow: 0 0 0 3px rgba(80,250,123,0.12); }
  50% { box-shadow: 0 0 0 5px rgba(80,250,123,0.05); }
`;

const styles = (theme: Theme, fullWidth: boolean) =>
  css({
    width: "100%",
    maxWidth: fullWidth ? "100%" : 940,
    textAlign: "left" as const,

    ".welcome-eyebrow": {
      display: "flex",
      alignItems: "center",
      gap: `${theme.spacing(1)}`,
      textTransform: "uppercase" as const,
      letterSpacing: "0.12em",
      fontSize: "var(--fontSizeSmaller)",
      fontWeight: 500,
      color: theme.vars.palette.text.secondary,
      animation: `${rise} ${MOTION.slow} ${80}ms backwards`
    },
    ".welcome-eyebrow-dot": {
      width: 6,
      height: 6,
      borderRadius: BORDER_RADIUS.circle,
      background: theme.vars.palette.success.main,
      animation: `${pulse} ${MOTION.pulse} infinite`
    },
    ".welcome-heading": {
      margin: `${getSpacingPx(SPACING.sm)} 0 ${getSpacingPx(SPACING.lg)}`,
      maxWidth: 720,
      fontSize: "clamp(2rem, 4vw, 2.75rem)",
      fontWeight: 500,
      lineHeight: 1.15,
      letterSpacing: "-0.02em",
      color: theme.vars.palette.text.primary,
      animation: `${rise} ${MOTION.slow} ${160}ms backwards`
    },
    ".welcome-sub": {
      color: theme.vars.palette.text.secondary,
      maxWidth: 560,
      margin: `0 0 ${getSpacingPx(SPACING.xxxl)}`,
      fontSize: 15,
      lineHeight: 1.45,
      animation: `${rise} ${MOTION.slow} ${240}ms backwards`
    },

    ".welcome-grid": {
      display: "grid",
      gridTemplateColumns: "repeat(4, 1fr)",
      gap: 8,
      animation: `${rise} ${MOTION.slow} ${320}ms backwards`,
      [theme.breakpoints.down("md")]: {
        gridTemplateColumns: "repeat(2, 1fr)"
      },
      [theme.breakpoints.down("sm")]: {
        gridTemplateColumns: "1fr"
      }
    },

    ".welcome-card": {
      textAlign: "left" as const,
      cursor: "pointer",
      background: theme.vars.palette.background.paper,
      border: `1px solid ${theme.vars.palette.divider}`,
      borderRadius: BORDER_RADIUS.xl,
      padding: `${theme.spacing(1)}`,
      color: "inherit",
      font: "inherit",
      position: "relative",
      overflow: "hidden",
      transition: `${MOTION.border}, transform ${MOTION.normal}, background ${MOTION.normal}`,
      "&:hover, &:focus-visible": {
        transform: "translateY(-2px)",
        borderColor: "var(--card-accent)",
        outline: "none"
      }
    },
    ".welcome-card-icon": {
      width: 32,
      height: 32,
      borderRadius: BORDER_RADIUS.sm,
      display: "grid",
      placeItems: "center",
      marginBottom: `${theme.spacing(1)}`,
      "& svg": { fontSize: "var(--fontSizeBig)" }
    },
    ".welcome-card-title": {
      fontSize: "var(--fontSizeBig)",
      fontWeight: 500,
      letterSpacing: "-0.01em",
      color: theme.vars.palette.text.primary
    },
    ".welcome-card-blurb": {
      marginTop: `${theme.spacing(0.25)}`,
      marginBottom: `${theme.spacing(1)}`,
      fontSize: "var(--fontSizeSmall)",
      lineHeight: 1.45,
      color: theme.vars.palette.text.secondary
    },
    ".welcome-card-node": {
      display: "inline-flex",
      alignItems: "center",
      padding: `${theme.spacing(0.25)} ${theme.spacing(1)}`,
      borderRadius: BORDER_RADIUS.pill,
      background: theme.vars.palette.action.selected,
      color: theme.vars.palette.text.secondary,
      fontFamily: theme.fontFamily2,
      fontSize: "var(--fontSizeSmaller)"
    },

    ".welcome-footer": {
      display: "flex",
      alignItems: "center",
      gap: `${theme.spacing(1)}`,
      marginTop: `${theme.spacing(1)}`,
      animation: `${rise} ${MOTION.slow} ${480}ms backwards`
    },
    ".welcome-skip": {
      background: "none",
      border: "none",
      padding: `${theme.spacing(0.75)} ${theme.spacing(1.25)}`,
      borderRadius: BORDER_RADIUS.sm,
      fontSize: "var(--fontSizeSmall)",
      color: theme.vars.palette.text.secondary,
      cursor: "pointer",
      transition: `color ${MOTION.normal}, background ${MOTION.normal}`,
      "&:hover": {
        color: theme.vars.palette.text.primary,
        background: theme.vars.palette.action.hover
      }
    },
    ".welcome-footer-divider": {
      width: 1,
      height: 14,
      background: theme.vars.palette.divider
    },
    ".welcome-footer-hint": {
      fontSize: "var(--fontSizeSmaller)",
      color: theme.vars.palette.text.disabled
    }
  });

interface WelcomeFlowProps {
  onPick: (trackId: WelcomeTrackId) => void;
  onSkip: () => void;
  /** Pulsing status dot before the eyebrow (used on the dashboard hero). */
  statusDot?: boolean;
  /** Span the parent container instead of capping at 940px, so the card grid
   *  lines up with the template / workflow grids below it. */
  fullWidth?: boolean;
  /** Suppress the built-in skip footer when the host renders its own (e.g. the
   *  dashboard hero, which places a composer and an "open empty canvas" action
   *  below the cards). */
  hideFooter?: boolean;
}

const WelcomeFlow: React.FC<WelcomeFlowProps> = ({
  onPick,
  onSkip,
  statusDot = false,
  fullWidth = false,
  hideFooter = false
}) => {
  const theme = useTheme();

  return (
    <div css={styles(theme, fullWidth)}>
      <div className="welcome-eyebrow">
        {statusDot && <span className="welcome-eyebrow-dot" />}
        Welcome to NodeTool
      </div>
      <h1 className="welcome-heading">What do you want to make today?</h1>
      <p className="welcome-sub">
        Pick one. We&apos;ll drop a starter graph onto the canvas so you can run
        it and make it your own. You can always change your mind, or skip and
        explore.
      </p>

      <div className="welcome-grid">
        {WELCOME_TRACKS.map((track) => {
          const Icon = TRACK_ICONS[track.id];
          return (
            <button
              key={track.id}
              type="button"
              className="welcome-card"
              onClick={() => onPick(track.id)}
              aria-label={`Start with ${track.label}: ${track.blurb}`}
              style={{ "--card-accent": track.accent } as CSSProperties}
            >
              <div
                className="welcome-card-icon"
                style={{
                  background: `${track.accent}1a`,
                  color: track.accent
                }}
              >
                <Icon />
              </div>
              <div className="welcome-card-title">{track.label}</div>
              <div className="welcome-card-blurb">{track.blurb}</div>
              <span className="welcome-card-node">{track.nodeLabel}</span>
            </button>
          );
        })}
      </div>

      {!hideFooter && (
        <div className="welcome-footer">
          <button type="button" className="welcome-skip" onClick={onSkip}>
            Skip - explore on my own
          </button>
          <span className="welcome-footer-divider" />
          <span className="welcome-footer-hint">
            Each pick is a real, editable workflow.
          </span>
        </div>
      )}
    </div>
  );
};

export default memo(WelcomeFlow);
