/**
 * Context menu for timeline clips.
 *
 * Provides common actions:
 * - Cut, Copy, Delete
 * - Split at Playhead
 * - Duplicate
 * - Lock/Unlock
 * - Set Clip Color
 */
/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useCallback, useState } from "react";
import {
  Menu,
  MenuItem,
  Divider,
  ListItemIcon,
  ListItemText,
  Popover,
  Box
} from "@mui/material";
import { useTheme, Theme } from "@mui/material/styles";
import {
  ContentCut as CutIcon,
  ContentCopy as CopyIcon,
  ContentPaste as PasteIcon,
  Delete as DeleteIcon,
  ContentPasteGo as SplitIcon,
  FileCopy as DuplicateIcon,
  Lock as LockIcon,
  LockOpen as UnlockIcon,
  ColorLens as ColorIcon
} from "@mui/icons-material";
import useTimelineStore, { Clip } from "../../stores/TimelineStore";
import { useTimelineClipboardStore } from "../../stores/TimelineClipboardStore";

const styles = (theme: Theme) =>
  css({
    ".MuiPaper-root": {
      minWidth: "180px",
      backgroundColor:
        theme.vars?.palette?.background?.paper || theme.palette.background.paper
    }
  });

// Predefined clip colors
const CLIP_COLORS = [
  { name: "Blue", value: "#3a7bc8" },
  { name: "Green", value: "#4ca84c" },
  { name: "Orange", value: "#c96b3a" },
  { name: "Purple", value: "#8a4cd9" },
  { name: "Red", value: "#d9534f" },
  { name: "Teal", value: "#3ab5a8" },
  { name: "Yellow", value: "#d9a23a" },
  { name: "Pink", value: "#d94c9b" }
];

interface ClipContextMenuProps {
  /** Position of the context menu */
  anchorPosition: { x: number; y: number } | null;
  /** Clip being right-clicked */
  clip: Clip | null;
  /** Track ID the clip belongs to */
  trackId: string | null;
  /** Close handler */
  onClose: () => void;
}

const ClipContextMenu: React.FC<ClipContextMenuProps> = ({
  anchorPosition,
  clip,
  trackId,
  onClose
}) => {
  const theme = useTheme();
  const [colorAnchor, setColorAnchor] = useState<HTMLElement | null>(null);

  const {
    playback,
    updateClip,
    removeClip,
    splitClip,
    duplicateClip,
    selectClips,
    selection,
    deleteSelectedClips
  } = useTimelineStore();

  const { copySelectedClips, cutSelectedClips, pasteClips, hasClips } =
    useTimelineClipboardStore();

  // Check if the clip is part of the selection
  const isMultiSelection = selection.selectedClipIds.length > 1;
  const clipIsSelected = clip && selection.selectedClipIds.includes(clip.id);

  const handleCopy = useCallback(() => {
    if (clip && !clipIsSelected) {
      // Select the clip first if not already selected
      selectClips([clip.id]);
    }
    copySelectedClips();
    onClose();
  }, [clip, clipIsSelected, selectClips, copySelectedClips, onClose]);

  const handleCut = useCallback(() => {
    if (clip && !clipIsSelected) {
      selectClips([clip.id]);
    }
    cutSelectedClips();
    onClose();
  }, [clip, clipIsSelected, selectClips, cutSelectedClips, onClose]);

  const handlePaste = useCallback(() => {
    pasteClips();
    onClose();
  }, [pasteClips, onClose]);

  const handleDelete = useCallback(() => {
    if (!clip || !trackId) return;

    if (isMultiSelection && clipIsSelected) {
      // Delete all selected clips
      deleteSelectedClips();
    } else {
      // Delete just this clip
      removeClip(trackId, clip.id);
    }
    onClose();
  }, [clip, trackId, isMultiSelection, clipIsSelected, removeClip, deleteSelectedClips, onClose]);

  const handleSplit = useCallback(() => {
    if (!clip || !trackId) return;

    const playheadTime = playback.playheadPosition;
    const clipEnd = clip.startTime + clip.duration;

    // Only split if playhead is within the clip
    if (playheadTime > clip.startTime && playheadTime < clipEnd) {
      splitClip(trackId, clip.id, playheadTime);
    }
    onClose();
  }, [clip, trackId, playback.playheadPosition, splitClip, onClose]);

  const handleDuplicate = useCallback(() => {
    if (!clip || !trackId) return;
    const newClipId = duplicateClip(trackId, clip.id);
    if (newClipId) {
      selectClips([newClipId]);
    }
    onClose();
  }, [clip, trackId, duplicateClip, selectClips, onClose]);

  const handleToggleLock = useCallback(() => {
    if (!clip || !trackId) return;
    updateClip(trackId, clip.id, { locked: !clip.locked });
    onClose();
  }, [clip, trackId, updateClip, onClose]);

  const handleOpenColorPicker = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      setColorAnchor(event.currentTarget);
    },
    []
  );

  const handleCloseColorPicker = useCallback(() => {
    setColorAnchor(null);
  }, []);

  const handleSetColor = useCallback(
    (color: string) => {
      if (!clip || !trackId) return;
      updateClip(trackId, clip.id, { color });
      handleCloseColorPicker();
      onClose();
    },
    [clip, trackId, updateClip, handleCloseColorPicker, onClose]
  );

  // Check if split is possible
  const canSplit =
    clip &&
    playback.playheadPosition > clip.startTime &&
    playback.playheadPosition < clip.startTime + clip.duration;

  const isOpen = anchorPosition !== null && clip !== null;

  return (
    <>
      <Menu
        css={styles(theme)}
        open={isOpen}
        onClose={onClose}
        anchorReference="anchorPosition"
        anchorPosition={
          anchorPosition
            ? { top: anchorPosition.y, left: anchorPosition.x }
            : undefined
        }
      >
        <MenuItem onClick={handleCut}>
          <ListItemIcon>
            <CutIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Cut</ListItemText>
        </MenuItem>

        <MenuItem onClick={handleCopy}>
          <ListItemIcon>
            <CopyIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Copy</ListItemText>
        </MenuItem>

        <MenuItem onClick={handlePaste} disabled={!hasClips()}>
          <ListItemIcon>
            <PasteIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Paste</ListItemText>
        </MenuItem>

        <MenuItem onClick={handleDelete}>
          <ListItemIcon>
            <DeleteIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>
            {isMultiSelection && clipIsSelected ? "Delete Selected" : "Delete"}
          </ListItemText>
        </MenuItem>

        <Divider />

        <MenuItem onClick={handleSplit} disabled={!canSplit}>
          <ListItemIcon>
            <SplitIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Split at Playhead</ListItemText>
        </MenuItem>

        <MenuItem onClick={handleDuplicate} disabled={clip?.locked}>
          <ListItemIcon>
            <DuplicateIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Duplicate</ListItemText>
        </MenuItem>

        <Divider />

        <MenuItem onClick={handleToggleLock}>
          <ListItemIcon>
            {clip?.locked ? (
              <UnlockIcon fontSize="small" />
            ) : (
              <LockIcon fontSize="small" />
            )}
          </ListItemIcon>
          <ListItemText>{clip?.locked ? "Unlock" : "Lock"}</ListItemText>
        </MenuItem>

        <MenuItem onClick={handleOpenColorPicker} disabled={clip?.locked}>
          <ListItemIcon>
            <ColorIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Set Color</ListItemText>
        </MenuItem>
      </Menu>

      {/* Color picker popover */}
      <Popover
        open={Boolean(colorAnchor)}
        anchorEl={colorAnchor}
        onClose={handleCloseColorPicker}
        anchorOrigin={{
          vertical: "center",
          horizontal: "right"
        }}
        transformOrigin={{
          vertical: "center",
          horizontal: "left"
        }}
      >
        <Box sx={{ display: "flex", flexWrap: "wrap", p: 1, maxWidth: 160 }}>
          {CLIP_COLORS.map((color) => (
            <Box
              key={color.value}
              onClick={() => handleSetColor(color.value)}
              title={color.name}
              sx={{
                width: 32,
                height: 32,
                m: 0.5,
                backgroundColor: color.value,
                borderRadius: 1,
                cursor: "pointer",
                border:
                  clip?.color === color.value ? "2px solid white" : "none",
                "&:hover": {
                  opacity: 0.8,
                  transform: "scale(1.1)"
                },
                transition: "all 0.15s ease"
              }}
            />
          ))}
        </Box>
      </Popover>
    </>
  );
};

export default ClipContextMenu;
