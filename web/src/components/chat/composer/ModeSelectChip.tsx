/**
 * ModeSelectChip — the chip that picks the composer's media mode, plus the
 * menu it opens. Mode-independent, so it sits beside `ModeChips` rather than
 * inside it.
 */
import React, { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import AudiotrackIcon from "@mui/icons-material/Audiotrack";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import ImageIcon from "@mui/icons-material/Image";
import BurstModeIcon from "@mui/icons-material/BurstMode";
import MovieFilterIcon from "@mui/icons-material/MovieFilter";
import RecordVoiceOverIcon from "@mui/icons-material/RecordVoiceOver";
import VideocamIcon from "@mui/icons-material/Videocam";

import MediaControlChip from "./MediaControlChip";
import MediaModeMenu from "./MediaModeMenu";
import type { MediaMode } from "../../../stores/MediaGenerationStore";

export function modeIconFor(mode: MediaMode): React.ReactNode {
  if (mode === "music") return <AudiotrackIcon fontSize="small" />;
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
  if (mode === "reference_to_video") {
    return <BurstModeIcon fontSize="small" />;
  }
  if (mode === "audio") {
    return <RecordVoiceOverIcon fontSize="small" />;
  }
  if (mode === "chat") {
    return <ChatBubbleOutlineIcon fontSize="small" />;
  }
  return <AutoAwesomeIcon fontSize="small" />;
}

export function modeLabelFor(mode: MediaMode, translate: (key: string) => string = (key) => key): string {
  if (mode === "music") return translate("i18n-next54.composer.mode.music");
  if (mode === "image") {
    return translate("i18n-next54.composer.mode.image");
  }
  if (mode === "image_edit") {
    return translate("i18n-next54.composer.mode.imageEdit");
  }
  if (mode === "video") {
    return translate("i18n-next54.composer.mode.video");
  }
  if (mode === "image_to_video") {
    return translate("i18n-next54.composer.mode.imageToVideo");
  }
  if (mode === "reference_to_video") {
    return translate("i18n-next54.composer.mode.referenceToVideo");
  }
  if (mode === "audio") {
    return translate("i18n-next54.composer.mode.speech");
  }
  if (mode === "chat") {
    return translate("i18n-next54.composer.mode.chat");
  }
  if (mode === "audio_to_video") {
    return translate("i18n-next54.composer.mode.audioToVideo");
  }
  if (mode === "retake") {
    return translate("i18n-next54.composer.mode.retake");
  }
  if (mode === "extend") {
    return translate("i18n-next54.composer.mode.extend");
  }
  return translate("i18n-next54.composer.mode.motion");
}

interface ModeSelectChipProps {
  mode: MediaMode;
  onChange: (mode: MediaMode) => void;
  modes?: readonly MediaMode[];
  /** Icon plus chevron only: the mode reads from its icon, and the label
   *  costs room the model and workspace chips need on one line. */
  compact?: boolean;
}

export function ModeSelectChip({
  mode,
  onChange,
  modes,
  compact = false
}: ModeSelectChipProps) {
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const close = useCallback(() => setAnchor(null), []);
  const { t } = useTranslation();
  const label = modeLabelFor(mode, t);

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
        modes={modes}
      />
    </>
  );
}

export default ModeSelectChip;
