/**
 * TrackList Component
 * Displays the list of tracks in the timeline sidebar with add/reorder functionality
 */
/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useCallback, useState, useRef } from "react";
import {
  Box,
  Typography,
  IconButton,
  Tooltip,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText
} from "@mui/material";
import { useTheme, Theme } from "@mui/material/styles";
import AudiotrackIcon from "@mui/icons-material/Audiotrack";
import VideocamIcon from "@mui/icons-material/Videocam";
import ImageIcon from "@mui/icons-material/Image";
import AddIcon from "@mui/icons-material/Add";

import useTimelineStore, { TrackType } from "../../stores/TimelineStore";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import TrackHeader from "./TrackHeader";

const styles = (theme: Theme) =>
  css({
    display: "flex",
    flexDirection: "column",
    flex: 1,
    overflow: "auto",

    ".tracks-headline": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: theme.spacing(0.5, 1),
      borderBottom: `1px solid ${
        theme.vars?.palette?.divider || theme.palette.divider
      }`,
      backgroundColor:
        theme.vars?.palette?.background?.default ||
        theme.palette.background.default,
      minHeight: "32px"
    },

    ".tracks-headline-title": {
      fontSize: "0.75rem",
      fontWeight: 500,
      color:
        theme.vars?.palette?.text?.secondary || theme.palette.text.secondary
    },

    ".track-row": {
      display: "flex",
      alignItems: "center",
      padding: theme.spacing(0.5, 1),
      borderBottom: `1px solid ${
        theme.vars?.palette?.divider || theme.palette.divider
      }`,
      backgroundColor:
        theme.vars?.palette?.background?.paper ||
        theme.palette.background.paper,
      minHeight: "60px",
      gap: theme.spacing(0.5),
      cursor: "pointer",
      transition: "background-color 0.15s ease",

      "&:hover": {
        backgroundColor:
          theme.vars?.palette?.action?.hover || theme.palette.action.hover
      },

      "&.selected": {
        backgroundColor:
          theme.vars?.palette?.action?.selected || theme.palette.action.selected
      },

      "&.muted": {
        opacity: 0.6
      },

      "&.drag-over": {
        borderTop: `2px solid ${
          theme.vars?.palette?.primary?.main || theme.palette.primary.main
        }`
      }
    },

    ".drag-handle": {
      cursor: "grab",
      color: theme.vars?.palette?.text?.disabled || theme.palette.text.disabled,
      display: "flex",
      alignItems: "center",
      padding: "2px",
      borderRadius: "2px",

      "&:hover": {
        color:
          theme.vars?.palette?.text?.secondary || theme.palette.text.secondary,
        backgroundColor:
          theme.vars?.palette?.action?.hover || theme.palette.action.hover
      },

      "&:active": {
        cursor: "grabbing"
      }
    },

    ".track-icon": {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: "24px",
      height: "24px",
      borderRadius: "4px",
      marginRight: theme.spacing(0.5)
    },

    ".track-info": {
      flex: 1,
      minWidth: 0,
      display: "flex",
      flexDirection: "column"
    },

    ".track-name": {
      fontWeight: 500,
      fontSize: "0.8rem",
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
      color: theme.vars?.palette?.text?.primary || theme.palette.text.primary
    },

    ".track-type": {
      fontSize: "0.65rem",
      color:
        theme.vars?.palette?.text?.secondary || theme.palette.text.secondary,
      textTransform: "capitalize"
    },

    ".track-controls": {
      display: "flex",
      alignItems: "center",
      gap: "2px"
    },

    ".track-control-btn": {
      padding: "4px",
      "& svg": {
        fontSize: "1rem"
      }
    },

    ".empty-tracks": {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flex: 1,
      color:
        theme.vars?.palette?.text?.secondary || theme.palette.text.secondary,
      fontSize: "0.75rem",
      padding: theme.spacing(2)
    }
  });

const TrackList: React.FC = () => {
  const theme = useTheme();
  const [addTrackAnchor, setAddTrackAnchor] = useState<null | HTMLElement>(
    null
  );
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Use refs to track current drag state for event handlers (avoids stale closures)
  const dragIndexRef = useRef<number | null>(null);
  const dragOverIndexRef = useRef<number | null>(null);

  const { project, selection, selectTrack, addTrack, reorderTrack } =
    useTimelineStore();

  const handleSelectTrack = useCallback(
    (trackId: string) => {
      selectTrack(trackId);
    },
    [selectTrack]
  );

  const handleAddTrackClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      setAddTrackAnchor(e.currentTarget);
    },
    []
  );

  const handleAddTrackClose = useCallback(() => {
    setAddTrackAnchor(null);
  }, []);

  const handleAddTrack = useCallback(
    (type: TrackType) => {
      addTrack(type);
      handleAddTrackClose();
    },
    [addTrack, handleAddTrackClose]
  );

  // Drag reorder handlers
  const handleDragStart = useCallback(
    (index: number) => {
      // Update both state (for rendering) and ref (for event handlers)
      setDragIndex(index);
      dragIndexRef.current = index;

      const handleMouseMove = (e: MouseEvent) => {
        e.preventDefault();
      };

      const handleMouseUp = () => {
        // Use refs to get current values (avoids stale closure issue)
        const currentDragIndex = dragIndexRef.current;
        const currentDragOverIndex = dragOverIndexRef.current;

        if (
          currentDragIndex !== null &&
          currentDragOverIndex !== null &&
          currentDragIndex !== currentDragOverIndex &&
          project
        ) {
          const track = project.tracks[currentDragIndex];
          if (track) {
            reorderTrack(track.id, currentDragOverIndex);
          }
        }

        // Reset both state and refs
        setDragIndex(null);
        setDragOverIndex(null);
        dragIndexRef.current = null;
        dragOverIndexRef.current = null;

        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [project, reorderTrack]
  );

  const handleDragOver = useCallback(
    (index: number) => {
      if (dragIndexRef.current !== null) {
        setDragOverIndex(index);
        dragOverIndexRef.current = index;
      }
    },
    []
  );

  const handleDragEnd = useCallback(() => {
    setDragIndex(null);
    setDragOverIndex(null);
    dragIndexRef.current = null;
    dragOverIndexRef.current = null;
  }, []);

  if (!project) {
    return null;
  }

  return (
    <Box css={styles(theme)} className="track-list">
      {/* Headline with Add Track button */}
      <div className="tracks-headline">
        <Typography className="tracks-headline-title">
          Tracks ({project.tracks.length})
        </Typography>
        <Tooltip title="Add Track" enterDelay={TOOLTIP_ENTER_DELAY}>
          <IconButton size="small" onClick={handleAddTrackClick}>
            <AddIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Menu
          anchorEl={addTrackAnchor}
          open={Boolean(addTrackAnchor)}
          onClose={handleAddTrackClose}
        >
          <MenuItem onClick={() => handleAddTrack("video")}>
            <ListItemIcon>
              <VideocamIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Video Track</ListItemText>
          </MenuItem>
          <MenuItem onClick={() => handleAddTrack("audio")}>
            <ListItemIcon>
              <AudiotrackIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Audio Track</ListItemText>
          </MenuItem>
          <MenuItem onClick={() => handleAddTrack("image")}>
            <ListItemIcon>
              <ImageIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Image Track</ListItemText>
          </MenuItem>
        </Menu>
      </div>

      {/* Track list */}
      {project.tracks.length === 0 ? (
        <div className="empty-tracks">Click + to add a track</div>
      ) : (
        project.tracks.map((track, index) => (
          <TrackHeader
            key={track.id}
            track={track}
            index={index}
            isSelected={selection.selectedTrackId === track.id}
            onSelect={() => handleSelectTrack(track.id)}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            isDragOver={
              dragIndex !== null &&
              dragOverIndex === index &&
              dragIndex !== index
            }
          />
        ))
      )}
    </Box>
  );
};

export default TrackList;
