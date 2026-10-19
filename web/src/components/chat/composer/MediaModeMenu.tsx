import React, { memo } from "react";
import { useTranslation } from "react-i18next";
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
  labelKey: string;
  descriptionKey?: string;
  icon: React.ReactNode;
  enabled: boolean;
}

const MODES: ModeItem[] = [
  {
    id: "chat",
    labelKey: "chat",
    icon: <ChatBubbleOutlineIcon fontSize="small" />,
    enabled: true
  },
  {
    id: "image",
    labelKey: "generateImages",
    icon: <ImageIcon fontSize="small" />,
    enabled: true
  },
  {
    id: "image_edit",
    labelKey: "editImages",
    icon: <AutoFixHighIcon fontSize="small" />,
    enabled: true
  },
  {
    id: "video",
    labelKey: "generateVideos",
    icon: <MovieIcon fontSize="small" />,
    enabled: true
  },
  {
    id: "image_to_video",
    labelKey: "animateImage",
    icon: <MovieFilterIcon fontSize="small" />,
    enabled: true
  },
  {
    id: "reference_to_video",
    labelKey: "referenceToVideo",
    descriptionKey: "referenceToVideoDescription",
    icon: <BurstModeIcon fontSize="small" />,
    enabled: true
  },
  {
    id: "audio",
    labelKey: "readAloud",
    icon: <RecordVoiceOverIcon fontSize="small" />,
    enabled: true
  },
  {
    id: "music",
    labelKey: "generateMusic",
    icon: <AudiotrackIcon fontSize="small" />,
    enabled: true
  },
  {
    id: "audio_to_video",
    labelKey: "audioToVideo",
    icon: <GraphicEqIcon fontSize="small" />,
    enabled: false
  },
  {
    id: "retake",
    labelKey: "retake",
    icon: <ReplayIcon fontSize="small" />,
    enabled: false
  },
  {
    id: "extend",
    labelKey: "extend",
    icon: <TimelineIcon fontSize="small" />,
    enabled: false
  },
  {
    id: "motion_control",
    labelKey: "motionControl",
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
  const { t } = useTranslation();
  return (
    <ContextMenu
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: "top", horizontal: "left" }}
      transformOrigin={{ vertical: "bottom", horizontal: "left" }}
      minWidth={240}
      slotProps={{ list: { "aria-label": t("i18n-next22.chat.composer.mediaMode.generationMode") } }}
    >
      <ListSubheader>{t("i18n-next22.chat.composer.mediaMode.mode")}</ListSubheader>
      {MODES.filter((m) => !modes || modes.includes(m.id)).map((m) => {
        const selected = m.id === value;
        return (
          <MenuItemPrimitive
            key={m.id}
            label={t(`i18n-next22.chat.composer.mediaMode.modes.${m.labelKey}`)}
            secondary={m.enabled ? (m.descriptionKey ? t(`i18n-next22.chat.composer.mediaMode.modes.${m.descriptionKey}`) : undefined) : t("i18n-next22.chat.composer.mediaMode.soon")}
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
