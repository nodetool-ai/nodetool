/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useCallback, useState } from "react";
import { Box, Menu, MenuItem, ListItemIcon, ListItemText } from "@mui/material";
import { useTheme, Theme } from "@mui/material/styles";

// Icons
import ContentCutIcon from "@mui/icons-material/ContentCut";
import BlurOnIcon from "@mui/icons-material/BlurOn";
import GradientIcon from "@mui/icons-material/Gradient";

import useTimelineStore, { Clip, Transition } from "../../stores/TimelineStore";
import { timeToPixels } from "../../utils/timelineUtils";

const styles = (theme: Theme) =>
  css({
    position: "absolute",
    top: "50%",
    transform: "translate(-50%, -50%)",
    width: "20px",
    height: "20px",
    borderRadius: "50%",
    backgroundColor:
      theme.vars?.palette?.background?.paper || theme.palette.background.paper,
    border: `2px solid ${
      theme.vars?.palette?.divider || theme.palette.divider
    }`,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
    transition: "all 0.15s ease",

    "&:hover": {
      backgroundColor:
        theme.vars?.palette?.primary?.main || theme.palette.primary.main,
      borderColor:
        theme.vars?.palette?.primary?.main || theme.palette.primary.main,
      transform: "translate(-50%, -50%) scale(1.2)"
    },

    "&.has-transition": {
      backgroundColor:
        theme.vars?.palette?.primary?.main || theme.palette.primary.main,
      borderColor:
        theme.vars?.palette?.primary?.light || theme.palette.primary.light
    },

    ".transition-icon": {
      fontSize: "12px",
      color: theme.vars?.palette?.text?.primary || theme.palette.text.primary
    },

    ".transition-preview": {
      position: "absolute",
      top: "100%",
      left: "50%",
      transform: "translateX(-50%)",
      marginTop: "4px",
      padding: "2px 6px",
      backgroundColor:
        theme.vars?.palette?.background?.paper ||
        theme.palette.background.paper,
      borderRadius: "4px",
      fontSize: "0.6rem",
      whiteSpace: "nowrap",
      boxShadow: theme.shadows[2],
      pointerEvents: "none",
      opacity: 0,
      transition: "opacity 0.15s ease",
      color: theme.vars?.palette?.text?.primary || theme.palette.text.primary
    },

    "&:hover .transition-preview": {
      opacity: 1
    }
  });

interface TransitionHandleProps {
  fromClip: Clip;
  toClip: Clip;
  trackId: string;
  pixelsPerSecond: number;
  position: "between" | "start" | "end";
}

const TransitionHandle: React.FC<TransitionHandleProps> = ({
  fromClip,
  toClip,
  trackId,
  pixelsPerSecond,
  position
}) => {
  const theme = useTheme();
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);

  const { updateClip } = useTimelineStore();

  // Calculate position
  const transitionTime =
    position === "between"
      ? (fromClip.startTime + fromClip.duration + toClip.startTime) / 2
      : position === "start"
      ? fromClip.startTime
      : fromClip.startTime + fromClip.duration;

  const left = timeToPixels(transitionTime, pixelsPerSecond);

  // Get current transition
  const currentTransition: Transition | undefined =
    position === "between" || position === "end"
      ? fromClip.transitions?.out
      : toClip?.transitions?.in;

  const handleClick = useCallback((e: React.MouseEvent<HTMLElement>) => {
    e.stopPropagation();
    setMenuAnchor(e.currentTarget);
  }, []);

  const handleClose = useCallback(() => {
    setMenuAnchor(null);
  }, []);

  const handleSelectTransition = useCallback(
    (type: Transition["type"] | "none") => {
      if (type === "none") {
        // Remove transition
        if (position === "between" || position === "end") {
          updateClip(trackId, fromClip.id, {
            transitions: {
              ...fromClip.transitions,
              out: undefined
            }
          });
        }
        if (position === "between" || position === "start") {
          updateClip(trackId, toClip.id, {
            transitions: {
              ...toClip.transitions,
              in: undefined
            }
          });
        }
      } else {
        const transition: Transition = {
          type,
          duration: 0.5 // Default 500ms transition
        };

        // Set transition on both clips for "between"
        if (position === "between" || position === "end") {
          updateClip(trackId, fromClip.id, {
            transitions: {
              ...fromClip.transitions,
              out: transition
            }
          });
        }
        if (position === "between" || position === "start") {
          updateClip(trackId, toClip.id, {
            transitions: {
              ...toClip.transitions,
              in: transition
            }
          });
        }
      }
      handleClose();
    },
    [trackId, fromClip, toClip, position, updateClip, handleClose]
  );

  const getTransitionIcon = () => {
    if (!currentTransition) {
      return <ContentCutIcon className="transition-icon" />;
    }
    switch (currentTransition.type) {
      case "crossfade":
        return <GradientIcon className="transition-icon" />;
      case "dissolve":
        return <BlurOnIcon className="transition-icon" />;
      case "cut":
      default:
        return <ContentCutIcon className="transition-icon" />;
    }
  };

  const getTransitionLabel = () => {
    if (!currentTransition) {
      return "Cut";
    }
    switch (currentTransition.type) {
      case "crossfade":
        return `Crossfade (${currentTransition.duration}s)`;
      case "dissolve":
        return `Dissolve (${currentTransition.duration}s)`;
      case "cut":
      default:
        return "Cut";
    }
  };

  const classNames = [
    "transition-handle",
    currentTransition ? "has-transition" : ""
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <>
      <Box
        css={styles(theme)}
        className={classNames}
        style={{ left }}
        onClick={handleClick}
      >
        {getTransitionIcon()}
        <div className="transition-preview">{getTransitionLabel()}</div>
      </Box>

      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={handleClose}
      >
        <MenuItem onClick={() => handleSelectTransition("cut")}>
          <ListItemIcon>
            <ContentCutIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Cut</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => handleSelectTransition("crossfade")}>
          <ListItemIcon>
            <GradientIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Crossfade</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => handleSelectTransition("dissolve")}>
          <ListItemIcon>
            <BlurOnIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Dissolve</ListItemText>
        </MenuItem>
        {currentTransition && (
          <MenuItem onClick={() => handleSelectTransition("none")}>
            <ListItemText>Remove Transition</ListItemText>
          </MenuItem>
        )}
      </Menu>
    </>
  );
};

export default React.memo(TransitionHandle);
