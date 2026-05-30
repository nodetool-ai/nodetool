/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import { useTheme } from "@mui/material/styles";
import { memo, type ReactNode } from "react";
import WelcomeFlow from "./WelcomeFlow";
import { wrapStyles } from "./dashboardChrome";
import type { WelcomeTrackId } from "./welcomeTracks";

const heroStyles = (theme: Theme) =>
  css({
    position: "relative",
    overflow: "hidden",
    borderBottom: `1px solid ${theme.vars.palette.divider}`,
    background: `radial-gradient(120% 140% at 0% 0%, rgba(102,144,212,0.05), transparent 46%), ${theme.vars.palette.c_app_header}`,
    // Faint node-canvas dot grid, fading out toward the bottom.
    "&::before": {
      content: '""',
      position: "absolute",
      inset: 0,
      opacity: 0.5,
      pointerEvents: "none",
      backgroundImage: `radial-gradient(${theme.vars.palette.c_editor_grid_color} 1px, transparent 1px)`,
      backgroundSize: "26px 26px",
      maskImage: "linear-gradient(180deg, rgba(0,0,0,0.5), transparent 70%)",
      WebkitMaskImage:
        "linear-gradient(180deg, rgba(0,0,0,0.5), transparent 70%)"
    },
    ".hero-wrap": {
      position: "relative",
      paddingTop: 8,
      paddingBottom: 8,
      [theme.breakpoints.down("sm")]: {
        paddingTop: 8,
        paddingBottom: 8
      }
    },
    ".hero-composer": {
      margin: "26px auto 0",
      maxWidth: 720
    },
    ".hero-foot": {
      marginTop: 8,
      display: "flex",
      alignItems: "center",
      gap: 8,
      flexWrap: "wrap"
    },
    ".hero-skip": {
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      height: 34,
      padding: "0 14px",
      borderRadius: 7,
      background: "transparent",
      color: theme.vars.palette.text.primary,
      border: `1px solid ${theme.vars.palette.divider}`,
      fontSize: 13.5,
      cursor: "pointer",
      transition: "border-color 0.15s ease, background 0.15s ease",
      "&:hover": {
        borderColor: theme.vars.palette.action.focus,
        background: theme.vars.palette.c_node_bg
      }
    },
    ".hero-hint": {
      fontFamily: theme.fontFamily2,
      fontSize: 12,
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
    ".hero-hint .sep": { color: theme.vars.palette.divider, margin: "0 4px" }
  });

interface DashboardHeroProps {
  onPickTrack: (trackId: WelcomeTrackId) => void;
  onOpenEmptyCanvas: () => void;
  onOpenSettings: () => void;
  /** The persistent-composer slot, anchored below the modality cards. */
  composer: ReactNode;
}

const DashboardHero: React.FC<DashboardHeroProps> = ({
  onPickTrack,
  onOpenEmptyCanvas,
  onOpenSettings,
  composer
}) => {
  const theme = useTheme();

  return (
    <section css={heroStyles(theme)}>
      <div css={wrapStyles(theme)} className="hero-wrap">
        <WelcomeFlow
          onPick={onPickTrack}
          onSkip={onOpenEmptyCanvas}
          statusDot
          fullWidth
          hideFooter
        />

        <div className="hero-composer">{composer}</div>

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
            local model? <button type="button" onClick={onOpenSettings}>open settings</button>
          </span>
        </div>
      </div>
    </section>
  );
};

export default memo(DashboardHero);
