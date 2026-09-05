/**
 * ModeSelectChip — the chip that picks the composer's media mode, plus the
 * menu it opens. Mode-independent, so it sits beside `ModeChips` rather than
 * inside it.
 */
import React, { useCallback, useState } from "react";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import ImageIcon from "@mui/icons-material/Image";
import MovieFilterIcon from "@mui/icons-material/MovieFilter";
import RecordVoiceOverIcon from "@mui/icons-material/RecordVoiceOver";
import VideocamIcon from "@mui/icons-material/Videocam";

import MediaControlChip from "./MediaControlChip";
import MediaModeMenu from "./MediaModeMenu";
import type { MediaMode } from "../../../stores/MediaGenerationStore";

export function modeIconFor(mode: MediaMode): React.ReactNode {
  if (mode === "image") {
    return <ImageIcon fontSize="small" />;
  }
  if (mode === "image_edit") {
    return <AutoFixHighIcon fontSize="small" />;
  }
  if (mode === "video") {
    return <VideocamIcon fontSize="small" />;
  }
  if (mode === "image_to_video") {
    return <MovieFilterIcon fontSize="small" />;
  }
  if (mode === "audio") {
    return <RecordVoiceOverIcon fontSize="small" />;
  }
  if (mode === "chat") {
    return <ChatBubbleOutlineIcon fontSize="small" />;
  }
  return <AutoAwesomeIcon fontSize="small" />;
}

export function modeLabelFor(mode: MediaMode): string {
  if (mode === "image") {
    return "Image";
  }
  if (mode === "image_edit") {
    return "Image Edit";
  }
  if (mode === "video") {
    return "Video";
  }
  if (mode === "image_to_video") {
    return "Image→Video";
  }
  if (mode === "audio") {
    return "Speech";
  }
  if (mode === "chat") {
    return "Chat";
  }
  if (mode === "audio_to_video") {
    return "Audio→Video";
  }
  if (mode === "retake") {
    return "Retake";
  }
  if (mode === "extend") {
    return "Extend";
  }
  return "Motion";
}

interface ModeSelectChipProps {
  mode: MediaMode;
  onChange: (mode: MediaMode) => void;
  /** Icon plus chevron only: the mode reads from its icon, and the label
   *  costs room the model and workspace chips need on one line. */
  compact?: boolean;
}

export function ModeSelectChip({
  mode,
  onChange,
  compact = false
}: ModeSelectChipProps) {
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const close = useCallback(() => setAnchor(null), []);
  const label = modeLabelFor(mode);

  return (
    <>
      <MediaControlChip
        icon={modeIconFor(mode)}
        label={compact ? undefined : label}
        title={label}
        active={anchor !== null}
        onClick={(e) => setAnchor(e.currentTarget)}
        showChevron
      />
      <MediaModeMenu
        anchorEl={anchor}
        open={anchor !== null}
        onClose={close}
        value={mode}
        onChange={onChange}
      />
    </>
  );
}

export default ModeSelectChip;
