import React, { memo } from "react";
import { useTranslation } from "react-i18next";
import {
  ContextMenu,
  ListSubheader,
  MenuItemPrimitive
} from "../../ui_primitives";
import type { MediaMode } from "../../../stores/MediaGenerationStore";
import { MEDIA_MODES } from "./mediaModes";

interface MediaModeMenuProps {
  anchorEl: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  value: MediaMode;
  onChange: (mode: MediaMode) => void;
  modes?: readonly MediaMode[];
}

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
      {MEDIA_MODES.filter((m) => !modes || modes.includes(m.id)).map((m) => {
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
