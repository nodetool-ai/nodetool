/** @jsxImportSource @emotion/react */
import React, { memo, useCallback, useRef, useState } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import {
  ContextMenu,
  ListSubheader,
  BORDER_RADIUS,
  MenuItemPrimitive
} from "../../ui_primitives";
import MediaControlChip from "./MediaControlChip";
import useGlobalChatStore from "../../../stores/GlobalChatStore";
import type { PermissionMode } from "../../../stores/ApiTypes";

interface ModeItem {
  id: PermissionMode;
  label: string;
  description: string;
  /** Theme palette key driving the status dot color. */
  tone: "info" | "warning" | "success";
}

const MODES: ModeItem[] = [
  {
    id: "plan",
    label: "Plan",
    description: "Investigate and propose a plan. Nothing runs.",
    tone: "info"
  },
  {
    id: "default",
    label: "Default",
    description: "Reads run. Actions ask first.",
    tone: "warning"
  },
  {
    id: "auto",
    label: "Auto",
    description:
      "Routine work runs unattended. A step that deletes, publishes, or spends asks once.",
    tone: "success"
  }
];

const dotColor = (theme: Theme, tone: ModeItem["tone"]): string => {
  if (tone === "info") return theme.vars.palette.grey[500];
  if (tone === "success") return theme.vars.palette.grey[200];
  return theme.vars.palette.grey[400];
};

const dotCss = (color: string) =>
  css({
    width: 8,
    height: 8,
    borderRadius: BORDER_RADIUS.circle,
    flexShrink: 0,
    backgroundColor: color,
    boxShadow: `0 0 6px ${color}`
  });

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
        icon={<span css={dotCss(dotColor(theme, activeMode.tone))} />}
        label={compact ? undefined : activeMode.label}
        title={`Permission: ${activeMode.label} — ${activeMode.description}`}
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
        slotProps={{ list: { "aria-label": "Permission mode" } }}
      >
        <ListSubheader>Permission mode</ListSubheader>
        {MODES.map((m) => {
          const selected = m.id === mode;
          return (
            <MenuItemPrimitive
              key={m.id}
              label={m.label}
              secondary={m.description}
              icon={<span css={dotCss(dotColor(theme, m.tone))} />}
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
