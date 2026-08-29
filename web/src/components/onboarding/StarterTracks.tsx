/** @jsxImportSource @emotion/react */
/**
 * First-run starter cards: one per creative modality, each opening a chat in
 * that mode with the track's sample prompt already typed. The card grid from
 * the retired dashboard welcome flow, without the hero copy — the host surface
 * owns the heading.
 */
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import { useTheme } from "@mui/material/styles";
import { memo, type CSSProperties } from "react";
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined";
import VideocamOutlinedIcon from "@mui/icons-material/VideocamOutlined";
import GraphicEqIcon from "@mui/icons-material/GraphicEq";
import SmartToyOutlinedIcon from "@mui/icons-material/SmartToyOutlined";
import type { SvgIconComponent } from "@mui/icons-material";
import { MOTION, BORDER_RADIUS, SPACING, getSpacingPx } from "../ui_primitives";
import { WELCOME_TRACKS, type WelcomeTrackId } from "./welcomeTracks";

const TRACK_ICONS = {
  image: ImageOutlinedIcon,
  video: VideocamOutlinedIcon,
  audio: GraphicEqIcon,
  agent: SmartToyOutlinedIcon
} satisfies Record<WelcomeTrackId, SvgIconComponent>;

const styles = (theme: Theme) =>
  css({
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: getSpacingPx(SPACING.md),
    width: "100%",
    [theme.breakpoints.down("md")]: {
      gridTemplateColumns: "repeat(2, 1fr)"
    },
    [theme.breakpoints.down("sm")]: {
      gridTemplateColumns: "1fr"
    },

    ".starter-card": {
      textAlign: "left" as const,
      cursor: "pointer",
      background: theme.vars.palette.background.paper,
      border: `1px solid ${theme.vars.palette.divider}`,
      borderRadius: BORDER_RADIUS.xl,
      padding: `${theme.spacing(1)}`,
      color: "inherit",
      font: "inherit",
      transition: `${MOTION.border}, transform ${MOTION.normal}`,
      "&:hover, &:focus-visible": {
        transform: "translateY(-2px)",
        borderColor: "var(--card-accent)",
        outline: "none"
      }
    },
    ".starter-card-icon": {
      width: 32,
      height: 32,
      borderRadius: BORDER_RADIUS.sm,
      display: "grid",
      placeItems: "center",
      marginBottom: `${theme.spacing(1)}`,
      "& svg": { fontSize: "var(--fontSizeBig)" }
    },
    ".starter-card-title": {
      fontSize: "var(--fontSizeBig)",
      fontWeight: 500,
      letterSpacing: "-0.01em",
      color: theme.vars.palette.text.primary
    },
    ".starter-card-blurb": {
      marginTop: `${theme.spacing(SPACING.micro)}`,
      marginBottom: `${theme.spacing(1)}`,
      fontSize: "var(--fontSizeSmall)",
      lineHeight: 1.45,
      color: theme.vars.palette.text.secondary
    },
    ".starter-card-node": {
      display: "inline-flex",
      alignItems: "center",
      padding: `${theme.spacing(SPACING.micro)} ${theme.spacing(1)}`,
      borderRadius: BORDER_RADIUS.pill,
      background: theme.vars.palette.action.selected,
      color: theme.vars.palette.text.secondary,
      fontFamily: theme.fontFamily2,
      fontSize: "var(--fontSizeSmaller)"
    }
  });

interface StarterTracksProps {
  onPick: (trackId: WelcomeTrackId) => void;
}

const StarterTracks: React.FC<StarterTracksProps> = ({ onPick }) => {
  const theme = useTheme();

  return (
    <div css={styles(theme)}>
      {WELCOME_TRACKS.map((track) => {
        const Icon = TRACK_ICONS[track.id];
        return (
          <button
            key={track.id}
            type="button"
            className="starter-card"
            onClick={() => onPick(track.id)}
            aria-label={`Start with ${track.label}: ${track.blurb}`}
            style={{ "--card-accent": track.accent } as CSSProperties}
          >
            <div
              className="starter-card-icon"
              style={{
                background: `${track.accent}1a`,
                color: track.accent
              }}
            >
              <Icon />
            </div>
            <div className="starter-card-title">{track.label}</div>
            <div className="starter-card-blurb">{track.blurb}</div>
            <span className="starter-card-node">{track.modeLabel}</span>
          </button>
        );
      })}
    </div>
  );
};

export default memo(StarterTracks);
