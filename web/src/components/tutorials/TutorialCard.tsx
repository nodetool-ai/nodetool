/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import { useTheme } from "@mui/material/styles";
import { memo } from "react";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import { MOTION, BORDER_RADIUS } from "../ui_primitives";
import type { Tutorial } from "./tutorialsData";

const styles = (theme: Theme, accent: string, active: boolean) =>
  css({
    display: "flex",
    flexDirection: "column",
    textAlign: "left",
    width: "100%",
    padding: 0,
    border: `1px solid ${
      active ? accent : theme.vars.palette.divider
    }`,
    borderRadius: BORDER_RADIUS.lg,
    background: active
      ? `rgba(${theme.vars.palette.primary.mainChannel} / 0.04)`
      : theme.vars.palette.c_node_bg,
    cursor: "pointer",
    overflow: "hidden",
    transition: `border-color ${MOTION.fast}, transform ${MOTION.fast}, box-shadow ${MOTION.fast}`,
    boxShadow: active ? `0 0 0 1px ${accent}` : "none",
    "&:hover": {
      borderColor: accent,
      transform: "translateY(-2px)",
      boxShadow: "0 10px 24px rgba(0,0,0,0.28)"
    },
    "&:focus-visible": {
      outline: `2px solid ${accent}`,
      outlineOffset: 2
    },
    ".thumb": {
      position: "relative",
      aspectRatio: "16 / 9",
      width: "100%",
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
    "&:hover .thumb img": {
      transform: "scale(1.03)",
      opacity: 1
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
      width: 44,
      height: 44,
      borderRadius: BORDER_RADIUS.circle,
      color: theme.vars.palette.common.white,
      background: `${accent}e6`,
      boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
      transition: `transform ${MOTION.fast}`,
      "& svg": { fontSize: 28 }
    },
    "&:hover .play-dot": { transform: "scale(1.08)" },
    ".duration": {
      position: "absolute",
      right: 8,
      bottom: 8,
      padding: "2px 7px",
      borderRadius: BORDER_RADIUS.sm,
      fontFamily: theme.fontFamily2,
      fontSize: "var(--fontSizeSmaller)",
      color: theme.vars.palette.common.white,
      background: "rgba(0,0,0,0.6)",
      fontVariantNumeric: "tabular-nums"
    },
    ".body": {
      display: "flex",
      flexDirection: "column",
      gap: 4,
      padding: `${theme.spacing(1.25)} ${theme.spacing(1.5)}`
    },
    ".level": {
      alignSelf: "flex-start",
      fontSize: "var(--fontSizeSmaller)",
      fontWeight: 600,
      letterSpacing: "0.04em",
      textTransform: "uppercase",
      color: accent
    },
    ".title": {
      margin: 0,
      fontSize: "var(--fontSizeNormal)",
      fontWeight: 600,
      color: theme.vars.palette.text.primary
    },
    ".tagline": {
      margin: 0,
      fontSize: "var(--fontSizeSmall)",
      color: theme.vars.palette.text.secondary,
      lineHeight: 1.4
    }
  });

export interface TutorialCardProps {
  tutorial: Tutorial;
  active?: boolean;
  onClick: (id: string) => void;
}

const TutorialCardInner: React.FC<TutorialCardProps> = ({
  tutorial,
  active = false,
  onClick
}) => {
  const theme = useTheme();
  return (
    <button
      type="button"
      css={styles(theme, tutorial.accent, active)}
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
        <span className="duration">{tutorial.durationLabel}</span>
      </span>
      <span className="body">
        <span className="level">{tutorial.level}</span>
        <h3 className="title">{tutorial.title}</h3>
        <p className="tagline">{tutorial.tagline}</p>
      </span>
    </button>
  );
};

export const TutorialCard = memo(TutorialCardInner);
TutorialCard.displayName = "TutorialCard";

export default TutorialCard;
