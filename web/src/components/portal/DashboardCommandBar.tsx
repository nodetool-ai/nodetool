/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import { useTheme } from "@mui/material/styles";
import { memo, useCallback, useState, type CSSProperties } from "react";
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined";
import VideocamOutlinedIcon from "@mui/icons-material/VideocamOutlined";
import GraphicEqIcon from "@mui/icons-material/GraphicEq";
import SmartToyOutlinedIcon from "@mui/icons-material/SmartToyOutlined";
import type { SvgIconComponent } from "@mui/icons-material";
import { BORDER_RADIUS, MOTION, SPACING, getSpacingPx } from "../ui_primitives";
import CommandBarModelChip from "./CommandBarModelChip";
import { WELCOME_TRACKS, type WelcomeTrackId } from "./welcomeTracks";

const TRACK_ICONS = {
  image: ImageOutlinedIcon,
  video: VideocamOutlinedIcon,
  audio: GraphicEqIcon,
  agent: SmartToyOutlinedIcon
} satisfies Record<WelcomeTrackId, SvgIconComponent>;

/** What a bare "send" means: a written answer, not a generated picture. */
const DEFAULT_TRACK: WelcomeTrackId = "agent";

const styles = (theme: Theme) =>
  css({
    ".cmd-field": {
      display: "flex",
      alignItems: "center",
      gap: getSpacingPx(SPACING.md),
      padding: `0 ${getSpacingPx(SPACING.md)}`,
      height: 48,
      background: theme.vars.palette.background.paper,
      border: `1px solid ${theme.vars.palette.divider}`,
      borderRadius: BORDER_RADIUS.lg,
      transition: `border-color ${MOTION.fast}`,
      "&:focus-within": {
        borderColor: theme.vars.palette.primary.main
      }
    },
    ".cmd-field input": {
      flex: 1,
      minWidth: 0,
      background: "transparent",
      border: "none",
      outline: "none",
      font: "inherit",
      fontSize: "var(--fontSizeNormal)",
      color: theme.vars.palette.text.primary,
      "&::placeholder": { color: theme.vars.palette.text.disabled }
    },
    ".cmd-send": {
      display: "inline-flex",
      alignItems: "center",
      gap: getSpacingPx(SPACING.sm),
      height: 32,
      flexShrink: 0,
      padding: `0 ${getSpacingPx(SPACING.lg)}`,
      borderRadius: BORDER_RADIUS.md,
      border: "none",
      background: theme.vars.palette.primary.main,
      color: theme.vars.palette.primary.contrastText,
      fontSize: "var(--fontSizeSmall)",
      cursor: "pointer",
      transition: `opacity ${MOTION.fast}`,
      "&:disabled": {
        opacity: 0.4,
        cursor: "default"
      }
    },
    ".cmd-modes": {
      display: "flex",
      alignItems: "center",
      gap: getSpacingPx(SPACING.sm),
      flexWrap: "wrap",
      marginTop: getSpacingPx(SPACING.md)
    },
    ".cmd-mode": {
      display: "inline-flex",
      alignItems: "center",
      gap: getSpacingPx(SPACING.sm),
      height: 30,
      padding: `0 ${getSpacingPx(SPACING.lg)}`,
      borderRadius: BORDER_RADIUS.pill,
      border: `1px solid ${theme.vars.palette.divider}`,
      background: "transparent",
      color: theme.vars.palette.text.secondary,
      fontSize: "var(--fontSizeSmall)",
      cursor: "pointer",
      transition: `border-color ${MOTION.fast}, color ${MOTION.fast}, background ${MOTION.fast}`,
      "&:hover": {
        borderColor: "var(--track-accent)",
        color: theme.vars.palette.text.primary
      },
      "&.on": {
        borderColor: "var(--track-accent)",
        color: "var(--track-accent)",
        background: "color-mix(in srgb, var(--track-accent) 12%, transparent)"
      },
      "& svg": { fontSize: "var(--fontSizeNormal)" }
    },
    // A vertical rule sets the model apart: the chips before it choose what
    // gets made, this chooses what makes it.
    ".cmd-model": {
      display: "inline-flex",
      alignItems: "center",
      marginLeft: getSpacingPx(SPACING.sm),
      paddingLeft: getSpacingPx(SPACING.md),
      borderLeft: `1px solid ${theme.vars.palette.divider}`
    },
    ".cmd-hint": {
      fontFamily: theme.fontFamily2,
      fontSize: "var(--fontSizeSmaller)",
      color: theme.vars.palette.text.disabled,
      marginLeft: "auto",
      [theme.breakpoints.down("sm")]: { marginLeft: 0 }
    }
  });

interface DashboardCommandBarProps {
  /**
   * Runs the prompt in a track's composer mode. An empty prompt falls back to
   * that track's own example, so a bare chip click still opens something.
   */
  onSubmit: (trackId: WelcomeTrackId, prompt: string) => void;
  /**
   * The mode chips. Hidden where the host already shows the four starter
   * cards (the first-run hero), which say the same thing at more length.
   */
  showModes?: boolean;
}

/**
 * One door into the product: describe what you want, pick the kind of output,
 * press send. Replaces four starter cards that all led to the same chat.
 */
const DashboardCommandBar: React.FC<DashboardCommandBarProps> = ({
  onSubmit,
  showModes = true
}) => {
  const theme = useTheme();
  const [prompt, setPrompt] = useState("");
  const [track, setTrack] = useState<WelcomeTrackId>(DEFAULT_TRACK);

  const submit = useCallback(() => {
    onSubmit(track, prompt);
  }, [onSubmit, prompt, track]);

  const hasPrompt = prompt.trim().length > 0;

  return (
    <div css={styles(theme)}>
      <div className="cmd-field">
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden
        >
          <path d="M8 2.5 9.4 6.6 13.5 8l-4.1 1.4L8 13.5 6.6 9.4 2.5 8l4.1-1.4z" />
        </svg>
        <input
          value={prompt}
          placeholder="Describe what you want to make…"
          aria-label="Describe what you want to make"
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
        />
        <button
          type="button"
          className="cmd-send"
          onClick={submit}
          disabled={!hasPrompt}
        >
          Send
          <svg
            width="13"
            height="13"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            aria-hidden
          >
            <path d="m6 4 4 4-4 4" />
          </svg>
        </button>
      </div>

      {/* The row carries the model chip in both modes: the first-run hero
          hides the kind chips because its starter cards say the same thing,
          but which model runs is not something the cards cover. */}
      <div className="cmd-modes" role="group" aria-label="Output kind">
        {showModes &&
          WELCOME_TRACKS.map((t) => {
            const active = t.id === track;
            const Icon = TRACK_ICONS[t.id];
            return (
              <button
                key={t.id}
                type="button"
                className={`cmd-mode${active ? " on" : ""}`}
                aria-pressed={active}
                style={{ "--track-accent": t.accent } as CSSProperties}
                onClick={() => {
                  setTrack(t.id);
                  // A chip on an empty box writes that track's example into
                  // the box rather than opening a chat outright. Choosing a
                  // kind is also how you reach its model, so the click has to
                  // leave the user here.
                  if (!hasPrompt) {
                    setPrompt(t.samplePrompt);
                  }
                }}
              >
                <Icon />
                {t.label}
              </button>
            );
          })}
        <span className={showModes ? "cmd-model" : undefined}>
          <CommandBarModelChip track={track} />
        </span>
        <span className="cmd-hint">
          {hasPrompt
            ? "enter to open a chat with this prompt"
            : showModes
              ? "pick a kind for an example prompt"
              : "pick a starter below, or describe your own"}
        </span>
      </div>
    </div>
  );
};

export default memo(DashboardCommandBar);
