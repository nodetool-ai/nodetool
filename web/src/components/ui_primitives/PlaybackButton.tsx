/** @jsxImportSource @emotion/react */
/**
 * PlaybackButton
 *
 * A button for audio/video playback controls (play, pause, stop).
 * Used in audio controls, video players, and workflow runners.
 *
 * @example
 * <PlaybackButton
 *   state="playing"
 *   onPlay={handlePlay}
 *   onPause={handlePause}
 *   onStop={handleStop}
 * />
 */

import { forwardRef, memo, useCallback, useMemo } from "react";
import { IconButton, IconButtonProps, Tooltip } from "@mui/material";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import PauseIcon from "@mui/icons-material/Pause";
import StopIcon from "@mui/icons-material/Stop";
import { useTheme } from "@mui/material/styles";
import {
  TOOLTIP_ENTER_DELAY,
  TOOLTIP_ENTER_NEXT_DELAY
} from "../../config/constants";
import { editorClassNames, cn } from "../editor_ui/editorUtils";

export type PlaybackState = "stopped" | "playing" | "paused";

export type PlaybackAction = "toggle" | "play" | "pause" | "stop";

export interface PlaybackButtonProps
  extends Omit<IconButtonProps, "onClick" | "children" | "action"> {
  /**
   * Current playback state
   */
  state: PlaybackState;
  /**
   * Callback when play is triggered
   */
  onPlay?: () => void;
  /**
   * Callback when pause is triggered
   */
  onPause?: () => void;
  /**
   * Callback when stop is triggered
   */
  onStop?: () => void;
  /**
   * Which action this button performs
   * - "toggle": Toggles between play and pause based on state
   * - "play": Always shows play icon
   * - "pause": Always shows pause icon
   * - "stop": Always shows stop icon
   * @default "toggle"
   */
  playbackAction?: PlaybackAction;
  /**
   * Tooltip placement
   * @default "top"
   */
  tooltipPlacement?:
    | "top"
    | "bottom"
    | "left"
    | "right"
    | "bottom-end"
    | "bottom-start"
    | "left-end"
    | "left-start"
    | "right-end"
    | "right-start"
    | "top-end"
    | "top-start";
  /**
   * Whether to add nodrag class for ReactFlow compatibility
   * @default true
   */
  nodrag?: boolean;
  /**
   * Size variant
   * @default "medium"
   */
  buttonSize?: "small" | "medium" | "large";
  /**
   * Tab index for keyboard navigation
   * @default 0
   */
  tabIndex?: number;
}

/**
 * Playback control button with state-aware icon and styling.
 */
export const PlaybackButton = memo(
  forwardRef<HTMLButtonElement, PlaybackButtonProps>(
    (
      {
        state,
        onPlay,
        onPause,
        onStop,
        playbackAction = "toggle",
        tooltipPlacement = "top",
        nodrag = true,
        buttonSize = "medium",
        className,
        sx,
        tabIndex = 0,
        ...props
      },
      ref
    ) => {
      const theme = useTheme();

      const handleClick = useCallback(() => {
        switch (playbackAction) {
          case "play":
            onPlay?.();
            break;
          case "pause":
            onPause?.();
            break;
          case "stop":
            onStop?.();
            break;
          case "toggle":
          default:
            if (state === "playing") {
              onPause?.();
            } else {
              onPlay?.();
            }
            break;
        }
      }, [playbackAction, state, onPlay, onPause, onStop]);

      const icon = useMemo(() => {
        switch (playbackAction) {
          case "play":
            return <PlayArrowIcon />;
          case "pause":
            return <PauseIcon />;
          case "stop":
            return <StopIcon />;
          case "toggle":
          default:
            return state === "playing" ? <PauseIcon /> : <PlayArrowIcon />;
        }
      }, [playbackAction, state]);

      const tooltip = useMemo(() => {
        switch (playbackAction) {
          case "play":
            return "Play";
          case "pause":
            return "Pause";
          case "stop":
            return "Stop";
          case "toggle":
          default:
            return state === "playing" ? "Pause" : "Play";
        }
      }, [playbackAction, state]);

      const sizeStyles = useMemo(() => {
        switch (buttonSize) {
          case "small":
            return {
              width: 28,
              height: 28,
              "& svg": { fontSize: 18 }
            };
          case "large":
            return {
              width: 48,
              height: 48,
              "& svg": { fontSize: 28 }
            };
          default:
            return {
              width: 36,
              height: 36,
              "& svg": { fontSize: 22 }
            };
        }
      }, [buttonSize]);

      const errorMain = theme.vars?.palette?.error?.main ?? theme.palette.error.main;
      const errorLight = theme.vars?.palette?.error?.light ?? theme.palette.error.light;
      const colorStyles = useMemo(() => {
        const isStopAction = playbackAction === "stop" || (playbackAction === "toggle" && state === "playing");
        if (isStopAction) {
          return {
            color: errorMain,
            "&:hover": {
              backgroundColor: `${errorMain}20`,
              color: errorLight
            }
          };
        }
        return {
          color: "var(--palette-primary-main)",
          "&:hover": {
            backgroundColor: "rgba(var(--palette-primaryChannel), 0.12)",
            color: "var(--palette-primary-light)"
          }
        };
      }, [playbackAction, state, errorMain, errorLight]);

      return (
        <Tooltip
          title={tooltip}
          enterDelay={TOOLTIP_ENTER_DELAY}
          enterNextDelay={TOOLTIP_ENTER_NEXT_DELAY}
          placement={tooltipPlacement}
        >
          <IconButton
            ref={ref}
            aria-label={tooltip}
            className={cn(
              "playback-button",
              nodrag && editorClassNames.nodrag,
              state,
              playbackAction,
              className
            )}
            onClick={handleClick}
            tabIndex={tabIndex}
            sx={{
              ...sizeStyles,
              ...colorStyles,
              borderRadius: "var(--rounded-circle)",
              transition: "all 0.2s ease-in-out",
              ...sx
            }}
            {...props}
          >
            {icon}
          </IconButton>
        </Tooltip>
      );
    }
  )
);

PlaybackButton.displayName = "PlaybackButton";
