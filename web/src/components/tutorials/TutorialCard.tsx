/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import type { CSSObject } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import { useTheme } from "@mui/material/styles";
import { memo } from "react";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import { MOTION, BORDER_RADIUS, SPACING, getSpacingPx } from "../ui_primitives";
import type { Tutorial } from "./tutorialsData";

const styles = (
  theme: Theme,
  accent: string,
  active: boolean,
  compact: boolean
) =>
  css({
    display: "flex",
    flexDirection: compact ? "row" : "column",
    alignItems: compact ? "stretch" : undefined,
    textAlign: "left",
    width: "100%",
    padding: 0,
    border: `1px solid ${active ? accent : theme.vars.palette.divider}`,
    borderRadius: BORDER_RADIUS.lg,
    background: active
      ? `rgba(${theme.vars.palette.primary.mainChannel} / 0.04)`
      : theme.vars.palette.c_node_bg,
    cursor: "pointer",
    overflow: "hidden",
    transition: `border-color ${MOTION.fast}, transform ${MOTION.fast}, box-shadow ${MOTION.fast}`,
    boxShadow: active ? `0 0 0 1px ${accent}` : "none",
    // Touch devices keep :hover styles latched after a tap, so gate them on a
    // real pointer.
    "@media (hover: hover)": {
      "&:hover": {
        borderColor: accent,
        transform: "translateY(-2px)",
        boxShadow: "0 10px 24px rgba(0,0,0,0.28)"
      },
      "&:hover .thumb img": { transform: "scale(1.03)", opacity: 1 },
      "&:hover .play-dot": { transform: "scale(1.08)" }
    },
    "&:focus-visible": {
      outline: `2px solid ${accent}`,
      outlineOffset: 2
    },
    ".thumb": {
      position: "relative",
      aspectRatio: "16 / 9",
      width: compact ? 132 : "100%",
      // Row layout: hold the thumbnail width. Column layout it must be able to
      // shrink, or the card body gets squeezed out in the scrolling sidebar.
      flexShrink: compact ? 0 : 1,
      overflow: "hidden",
      background: theme.vars.palette.common.black
    },
    ".thumb img": {
      width: "100%",
      height: "100%",
      objectFit: "cover",
      display: "block",
      opacity: 0.92,
      transition: `transform ${MOTION.normal}, opacity ${MOTION.fast}`
    },
    ".play": {
      position: "absolute",
      inset: 0,
      display: "grid",
      placeItems: "center"
    },
    ".play-dot": {
      display: "grid",
      placeItems: "center",
      width: compact ? 28 : 44,
      height: compact ? 28 : 44,
      borderRadius: BORDER_RADIUS.circle,
      color: theme.vars.palette.common.white,
      background: `${accent}e6`,
      boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
      transition: `transform ${MOTION.fast}`,
      "& svg": { fontSize: compact ? 18 : 28 }
    },
    ".duration": {
      position: "absolute",
      right: 8,
      bottom: 8,
      padding: `${getSpacingPx(SPACING.micro)} ${getSpacingPx(SPACING.sm)}`,
      borderRadius: BORDER_RADIUS.sm,
      fontFamily: theme.fontFamily2,
      fontSize: "var(--fontSizeSmaller)",
      color: theme.vars.palette.common.white,
      background: `rgba(${theme.vars.palette.common.blackChannel || "0, 0, 0"}, 0.6)`,
      fontVariantNumeric: "tabular-nums"
    },
    ".body": {
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      minWidth: 0,
      gap: 4,
      padding: `${theme.spacing(SPACING.sm)} ${theme.spacing(1.5)}`
    },
    ".meta": {
      display: "flex",
      alignItems: "baseline",
      gap: theme.spacing(SPACING.xs)
    },
    ".level": {
      fontSize: "var(--fontSizeSmaller)",
      fontWeight: 600,
      letterSpacing: "0.04em",
      textTransform: "uppercase",
      color: accent
    },
    ".meta .duration-inline": {
      fontFamily: theme.fontFamily2,
      fontSize: "var(--fontSizeSmaller)",
      color: theme.vars.palette.text.secondary,
      fontVariantNumeric: "tabular-nums"
    },
    ".title": {
      margin: 0,
      fontSize: "var(--fontSizeNormal)",
      fontWeight: 600,
      color: theme.vars.palette.text.primary
    },
    ".tagline": taglineStyles(theme, compact)
  });

/** The tagline, clamped to two lines in the compact row layout. */
const taglineStyles = (theme: Theme, compact: boolean): CSSObject => {
  const styles: CSSObject = {
    margin: 0,
    fontSize: "var(--fontSizeSmall)",
    color: theme.vars.palette.text.secondary,
    lineHeight: 1.4
  };
  if (compact) {
    styles.display = "-webkit-box";
    styles.WebkitBoxOrient = "vertical";
    styles.WebkitLineClamp = 2;
    styles.overflow = "hidden";
  }
  return styles;
};

interface TutorialCardProps {
  tutorial: Tutorial;
  active?: boolean;
  /** Row layout with a small thumbnail — for narrow viewports. */
  compact?: boolean;
  onClick: (id: string) => void;
}

const TutorialCardInner: React.FC<TutorialCardProps> = ({
  tutorial,
  active = false,
  compact = false,
  onClick
}) => {
  const theme = useTheme();
  return (
    <button
      type="button"
      css={styles(theme, tutorial.accent, active, compact)}
      onClick={() => onClick(tutorial.id)}
      aria-label={`Play tutorial: ${tutorial.title}`}
      aria-pressed={active}
    >
      <span className="thumb">
        <img src={tutorial.poster} alt="" loading="lazy" />
        <span className="play">
          <span className="play-dot">
            <PlayArrowRoundedIcon />
          </span>
        </span>
        {!compact && <span className="duration">{tutorial.durationLabel}</span>}
      </span>
      <span className="body">
        <span className="meta">
          <span className="level">{tutorial.level}</span>
          {compact && (
            <span className="duration-inline">{tutorial.durationLabel}</span>
          )}
        </span>
        <h3 className="title">{tutorial.title}</h3>
        <p className="tagline">{tutorial.tagline}</p>
      </span>
    </button>
  );
};

export const TutorialCard = memo(TutorialCardInner);
TutorialCard.displayName = "TutorialCard";

export default TutorialCard;
