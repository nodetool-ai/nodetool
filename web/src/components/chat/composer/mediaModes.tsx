/**
 * The composer's media modes, in menu order. The Mode menu and the `+ New`
 * menu both list them, so a mode added here shows in both.
 */
import React from "react";
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
import type { MediaMode } from "../../../stores/MediaGenerationStore";

export interface MediaModeItem {
  id: MediaMode;
  /** Key under `i18n-next22.chat.composer.mediaMode.modes`. */
  labelKey: string;
  descriptionKey?: string;
  icon: React.ReactNode;
  /** False for modes listed as "Soon". */
  enabled: boolean;
}

export const MEDIA_MODES: readonly MediaModeItem[] = [
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
