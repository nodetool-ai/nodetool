import React, { memo } from "react";
import AudiotrackIcon from "@mui/icons-material/Audiotrack";
import ImageIcon from "@mui/icons-material/Image";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import MovieIcon from "@mui/icons-material/Movie";
import MovieFilterIcon from "@mui/icons-material/MovieFilter";
import BurstModeIcon from "@mui/icons-material/BurstMode";
import GraphicEqIcon from "@mui/icons-material/GraphicEq";
import RecordVoiceOverIcon from "@mui/icons-material/RecordVoiceOver";
import ReplayIcon from "@mui/icons-material/Replay";
import TimelineIcon from "@mui/icons-material/Timeline";
import TuneIcon from "@mui/icons-material/Tune";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import {
  ContextMenu,
  ListSubheader,
  MenuItemPrimitive
} from "../../ui_primitives";
import type { MediaMode } from "../../../stores/MediaGenerationStore";

interface MediaModeMenuProps {
  anchorEl: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  value: MediaMode;
  onChange: (mode: MediaMode) => void;
  modes?: readonly MediaMode[];
}

interface ModeItem {
  id: MediaMode;
  label: string;
  description?: string;
  icon: React.ReactNode;
  enabled: boolean;
}

const MODES: ModeItem[] = [
  {
    id: "chat",
    label: "Chat",
    icon: <ChatBubbleOutlineIcon fontSize="small" />,
    enabled: true
  },
  {
    id: "image",
    label: "Generate images",
    icon: <ImageIcon fontSize="small" />,
    enabled: true
  },
  {
    id: "image_edit",
    label: "Edit images",
    icon: <AutoFixHighIcon fontSize="small" />,
    enabled: true
  },
  {
    id: "video",
    label: "Generate videos",
    icon: <MovieIcon fontSize="small" />,
    enabled: true
  },
  {
    id: "image_to_video",
    label: "Animate image",
    icon: <MovieFilterIcon fontSize="small" />,
    enabled: true
  },
  {
    id: "reference_to_video",
    label: "Reference to video",
    description: "several references, one shot",
    icon: <BurstModeIcon fontSize="small" />,
    enabled: true
  },
  {
    id: "audio",
    label: "Read aloud",
    icon: <RecordVoiceOverIcon fontSize="small" />,
    enabled: true
  },
  {
    id: "music",
    label: "Generate music",
    icon: <AudiotrackIcon fontSize="small" />,
    enabled: true
  },
  {
    id: "audio_to_video",
    label: "Audio to video",
    icon: <GraphicEqIcon fontSize="small" />,
    enabled: false
  },
  {
    id: "retake",
    label: "Retake",
    icon: <ReplayIcon fontSize="small" />,
    enabled: false
  },
  {
    id: "extend",
    label: "Extend",
    icon: <TimelineIcon fontSize="small" />,
    enabled: false
  },
  {
    id: "motion_control",
    label: "Motion control",
    icon: <TuneIcon fontSize="small" />,
    enabled: false
  }
];

/**
 * Menu shown when the user clicks the "Mode" chip in the media
 * composer. Lists the media-generation modes (chat, image, video, …).
 * Agent mode is no longer a media-menu option — the chat agent always runs
 * the unified LLM-with-tools loop and decomposes via `run_subtask` on its own.
 */
const MediaModeMenu: React.FC<MediaModeMenuProps> = ({
  anchorEl,
  open,
  onClose,
  value,
  onChange,
  modes
}) => {
  return (
    <ContextMenu
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: "top", horizontal: "left" }}
      transformOrigin={{ vertical: "bottom", horizontal: "left" }}
      minWidth={240}
      slotProps={{ list: { "aria-label": "Generation mode" } }}
    >
      <ListSubheader>Mode</ListSubheader>
      {MODES.filter((m) => !modes || modes.includes(m.id)).map((m) => {
        const selected = m.id === value;
        return (
          <MenuItemPrimitive
            key={m.id}
            label={m.label}
            secondary={m.enabled ? m.description : "Soon"}
            icon={m.icon}
            checkable="radio"
            checked={selected}
            disabled={!m.enabled}
            onClick={() => {
              onChange(m.id);
              onClose();
            }}
          />
        );
      })}
    </ContextMenu>
  );
};

export default memo(MediaModeMenu);
