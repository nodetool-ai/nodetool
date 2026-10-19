/** @jsxImportSource @emotion/react */
import React, { memo, useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import {
  ContextMenu,
  ListSubheader,
  MenuItemPrimitive,
  StatusDot
} from "../../ui_primitives";
import MediaControlChip from "./MediaControlChip";
import useGlobalChatStore from "../../../stores/GlobalChatStore";
import type { PermissionMode } from "../../../stores/ApiTypes";

interface ModeItem {
  id: PermissionMode;
  labelKey: string;
  descriptionKey: string;
  /** Theme palette key driving the status dot color. */
  tone: "info" | "warning" | "success";
}

const MODES: ModeItem[] = [
  {
    id: "plan",
    labelKey: "plan",
    descriptionKey: "planDescription",
    tone: "info"
  },
  {
    id: "default",
    labelKey: "default",
    descriptionKey: "defaultDescription",
    tone: "warning"
  },
  {
    id: "auto",
    labelKey: "auto",
    descriptionKey: "autoDescription",
    tone: "success"
  }
];

const dotColor = (theme: Theme, tone: ModeItem["tone"]): string => {
  if (tone === "info") return theme.vars.palette.grey[500];
  if (tone === "success") return theme.vars.palette.grey[200];
  return theme.vars.palette.grey[400];
};

const ModeDot = ({ color }: { color: string }) => (
  <StatusDot
    size="medium"
    sx={{ bgcolor: color, boxShadow: `0 0 6px ${color}` }}
  />
);

/**
 * Compact composer-footer dropdown for the per-thread permission mode. The
 * trigger shows the active mode (label + monochrome status dot) and opens a
 * three-item menu (Plan / Default / Auto), each with a short description
 * and a check on the active mode. Reads/writes the active thread's
 * `permissionMode` directly from GlobalChatStore.
 */
interface PermissionSelectorProps {
  threadId?: string | null;
  /** Dot only, no label. The composer sets it from its own width. */
  compact?: boolean;
}

const PermissionSelector: React.FC<PermissionSelectorProps> = ({
  threadId,
  compact = false
}) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  const currentThreadId = useGlobalChatStore((s) => s.currentThreadId);
  const selectedThreadId = threadId ?? currentThreadId;
  const mode = useGlobalChatStore((s) => s.getPermissionMode(selectedThreadId));
  const setPermissionMode = useGlobalChatStore((s) => s.setPermissionMode);

  const activeMode = MODES.find((m) => m.id === mode) ?? MODES[1];

  const handleSelect = useCallback(
    (next: PermissionMode) => {
      setPermissionMode(selectedThreadId, next);
      setOpen(false);
    },
    [selectedThreadId, setPermissionMode]
  );

  return (
    <>
      <MediaControlChip
        ref={buttonRef}
        className="permission-selector-trigger"
        icon={<ModeDot color={dotColor(theme, activeMode.tone)} />}
        label={compact ? undefined : t(`i18n-next22.chat.composer.permission.modes.${activeMode.labelKey}`)}
        title={t("i18n-next22.chat.composer.permission.activeModeTitle", {
          mode: t(`i18n-next22.chat.composer.permission.modes.${activeMode.labelKey}`),
          description: t(`i18n-next22.chat.composer.permission.modes.${activeMode.descriptionKey}`)
        })}
        active={open}
        showChevron
        onClick={() => setOpen(true)}
      />
      <ContextMenu
        open={open}
        anchorEl={buttonRef.current}
        onClose={() => setOpen(false)}
        anchorOrigin={{ vertical: "top", horizontal: "left" }}
        transformOrigin={{ vertical: "bottom", horizontal: "left" }}
        minWidth={260}
        paperSx={{ maxWidth: 320 }}
        slotProps={{ list: { "aria-label": t("i18n-next22.chat.composer.permission.permissionMode") } }}
      >
        <ListSubheader>{t("i18n-next22.chat.composer.permission.permissionMode")}</ListSubheader>
        {MODES.map((m) => {
          const selected = m.id === mode;
          return (
            <MenuItemPrimitive
              key={m.id}
              label={t(`i18n-next22.chat.composer.permission.modes.${m.labelKey}`)}
              secondary={t(`i18n-next22.chat.composer.permission.modes.${m.descriptionKey}`)}
              icon={<ModeDot color={dotColor(theme, m.tone)} />}
              checkable="radio"
              checked={selected}
              onClick={() => handleSelect(m.id)}
            />
          );
        })}
      </ContextMenu>
    </>
  );
};

export default memo(PermissionSelector);
