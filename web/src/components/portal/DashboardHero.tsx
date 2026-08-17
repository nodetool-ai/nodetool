/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import { useTheme } from "@mui/material/styles";
import { memo } from "react";
import { MOTION, BORDER_RADIUS, SPACING, getSpacingPx } from "../ui_primitives";
import type { DashboardMode } from "../../hooks/useDashboardMode";
import DashboardCommandBar from "./DashboardCommandBar";
import WelcomeFlow from "./WelcomeFlow";
import { wrapStyles } from "./dashboardChrome";
import type { WelcomeTrackId } from "./welcomeTracks";

const heroStyles = (theme: Theme, compact: boolean) =>
  css({
    position: "relative",
    overflow: "hidden",
    borderBottom: `1px solid ${theme.vars.palette.divider}`,
    background: compact
      ? theme.vars.palette.c_app_header
      : `radial-gradient(120% 140% at 0% 0%, rgba(102,144,212,0.05), transparent 46%), ${theme.vars.palette.c_app_header}`,
    // Faint node-canvas dot grid, fading out toward the bottom.
    "&::before": {
      content: '""',
      position: "absolute",
      inset: 0,
      opacity: compact ? 0 : 0.5,
      pointerEvents: "none",
      backgroundImage: `radial-gradient(${theme.vars.palette.c_editor_grid_color} 1px, transparent 1px)`,
      backgroundSize: "26px 26px",
      maskImage: "linear-gradient(180deg, rgba(0,0,0,0.5), transparent 70%)",
      WebkitMaskImage:
        "linear-gradient(180deg, rgba(0,0,0,0.5), transparent 70%)"
    },
    ".hero-wrap": {
      position: "relative",
      paddingTop: getSpacingPx(compact ? SPACING.xxl : SPACING.md),
      paddingBottom: getSpacingPx(compact ? SPACING.xxl : SPACING.md),
      [theme.breakpoints.down("sm")]: {
        paddingTop: getSpacingPx(SPACING.md),
        paddingBottom: getSpacingPx(SPACING.md)
      }
    },
    ".hero-foot": {
      marginTop: getSpacingPx(SPACING.md),
      display: "flex",
      alignItems: "center",
      gap: getSpacingPx(SPACING.md),
      flexWrap: "wrap"
    },
    ".hero-skip": {
      display: "inline-flex",
      alignItems: "center",
      gap: `${theme.spacing(1)}`,
      height: 34,
      padding: `0 ${theme.spacing(SPACING.md)}`,
      borderRadius: BORDER_RADIUS.md,
      background: "transparent",
      color: theme.vars.palette.text.primary,
      border: `1px solid ${theme.vars.palette.divider}`,
      fontSize: "var(--fontSizeNormal)",
      cursor: "pointer",
      transition: `border-color ${MOTION.fast}, background ${MOTION.fast}`,
      "&:hover": {
        borderColor: theme.vars.palette.action.focus,
        background: theme.vars.palette.c_node_bg
      }
    },
    ".hero-hint": {
      fontFamily: theme.fontFamily2,
      fontSize: "var(--fontSizeSmaller)",
      color: theme.vars.palette.text.disabled
    },
    ".hero-hint button": {
      background: "none",
      border: "none",
      padding: 0,
      cursor: "pointer",
      color: theme.vars.palette.text.secondary,
      font: "inherit",
      "&:hover": { color: theme.vars.palette.primary.main }
    },
    ".hero-hint .sep": {
      color: theme.vars.palette.divider,
      margin: `0 ${getSpacingPx(SPACING.xs)}`
    }
  });

interface DashboardHeroProps {
  mode: DashboardMode;
  onStart: (trackId: WelcomeTrackId, prompt: string) => void;
  onOpenEmptyCanvas: () => void;
  onOpenSettings: () => void;
}

/**
 * The dashboard's one starting point. Both modes carry the same command bar —
 * describe a thing, pick its kind, send. First-run keeps the welcome copy and
 * the starter cards around it; a returning user gets the bar alone, so their
 * own work stays near the top of the page.
 */
const DashboardHero: React.FC<DashboardHeroProps> = ({
  mode,
  onStart,
  onOpenEmptyCanvas,
  onOpenSettings
}) => {
  const theme = useTheme();
  const compact = mode === "returning";

  return (
    <section css={heroStyles(theme, compact)}>
      <div css={wrapStyles(theme)} className="hero-wrap">
        {compact ? (
          <DashboardCommandBar onSubmit={onStart} />
        ) : (
          <>
            <WelcomeFlow
              onPick={(trackId) => onStart(trackId, "")}
              onSkip={onOpenEmptyCanvas}
              statusDot
              fullWidth
              hideFooter
              commandBar={
                <DashboardCommandBar onSubmit={onStart} showModes={false} />
              }
            />

            <div className="hero-foot">
              <button
                type="button"
                className="hero-skip"
                onClick={onOpenEmptyCanvas}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <path d="M8 3v10M3 8h10" />
                </svg>
                Skip, open an empty canvas
              </button>
              <span className="hero-hint">
                local model?{" "}
                <button type="button" onClick={onOpenSettings}>
                  open settings
                </button>
              </span>
            </div>
          </>
        )}
      </div>
    </section>
  );
};

export default memo(DashboardHero);
