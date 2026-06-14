/** @jsxImportSource @emotion/react */
import React, { memo, useCallback, useRef, useState } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import CheckIcon from "@mui/icons-material/Check";
import { Caption, FlexColumn, Popover, Text, MOTION, BORDER_RADIUS } from "../../ui_primitives";
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
    description: "Read & propose only. No actions.",
    tone: "info"
  },
  {
    id: "default",
    label: "Default",
    description: "Reads run; actions ask first.",
    tone: "warning"
  },
  {
    id: "auto",
    label: "Auto",
    description: "Everything runs, no prompts.",
    tone: "success"
  }
];

const dotColor = (theme: Theme, tone: ModeItem["tone"]): string => {
  if (tone === "info") return theme.vars.palette.info.main;
  if (tone === "success") return theme.vars.palette.success.main;
  return theme.vars.palette.warning.main;
};

const menuStyles = (theme: Theme) =>
  css({
    padding: "8px 0",
    minWidth: 260,
    ".permission-menu-header": {
      padding: "8px 16px 4px",
      color: theme.vars.palette.grey[400],
      textTransform: "uppercase",
      letterSpacing: 1
    },
    ".permission-menu-item": {
      display: "flex",
      alignItems: "flex-start",
      gap: 8,
      padding: "9px 16px",
      cursor: "pointer",
      color: theme.vars.palette.grey[100],
      transition: MOTION.background,
      "&:hover": {
        backgroundColor: "rgba(255,255,255,0.06)"
      },
      "&.selected": {
        backgroundColor: "rgba(255,255,255,0.08)"
      }
    },
    ".permission-menu-dot": {
      // Nudge down so the dot aligns with the label's first line.
      marginTop: 6
    },
    ".permission-menu-check": {
      marginLeft: "auto",
      marginTop: 2,
      color: theme.vars.palette.primary.main,
      display: "inline-flex"
    }
  });

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
 * trigger shows the active mode (label + colored status dot) and opens a
 * three-item menu (Plan / Default / Auto), each with a one-line description
 * and a check on the active mode. Reads/writes the active thread's
 * `permissionMode` directly from GlobalChatStore.
 */
const PermissionSelector: React.FC = () => {
  const theme = useTheme();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  const currentThreadId = useGlobalChatStore((s) => s.currentThreadId);
  const mode = useGlobalChatStore((s) =>
    s.getPermissionMode(s.currentThreadId)
  );
  const setPermissionMode = useGlobalChatStore((s) => s.setPermissionMode);

  const activeMode = MODES.find((m) => m.id === mode) ?? MODES[1];

  const handleSelect = useCallback(
    (next: PermissionMode) => {
      if (currentThreadId) {
        setPermissionMode(currentThreadId, next);
      }
      setOpen(false);
    },
    [currentThreadId, setPermissionMode]
  );

  return (
    <>
      <MediaControlChip
        ref={buttonRef}
        className="permission-selector-trigger"
        icon={<span css={dotCss(dotColor(theme, activeMode.tone))} />}
        title={`Permission: ${activeMode.label}`}
        active={open}
        showChevron
        onClick={() => setOpen(true)}
      />
      <Popover
        open={open}
        anchorEl={buttonRef.current}
        onClose={() => setOpen(false)}
        placement="top-left"
        paperSx={{
          backgroundColor: theme.vars.palette.grey[900],
          border: `1px solid ${theme.vars.palette.grey[800]}`,
          borderRadius: BORDER_RADIUS.sm,
          boxShadow: "0 12px 40px rgba(0,0,0,0.45)"
        }}
      >
        <div
          css={menuStyles(theme)}
          role="menu"
          aria-label="Permission mode"
        >
          <Caption className="permission-menu-header" size="small">
            Permission mode
          </Caption>
          {MODES.map((m) => {
            const selected = m.id === mode;
            return (
              <div
                key={m.id}
                role="menuitemradio"
                aria-checked={selected}
                tabIndex={0}
                className={`permission-menu-item${selected ? " selected" : ""}`}
                onClick={() => handleSelect(m.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleSelect(m.id);
                  }
                }}
              >
                <span
                  className="permission-menu-dot"
                  css={dotCss(dotColor(theme, m.tone))}
                />
                <FlexColumn gap={0.5} sx={{ flex: 1, minWidth: 0 }}>
                  <Text
                    size="small"
                    weight={500}
                    sx={{ color: "inherit", lineHeight: 1.25 }}
                  >
                    {m.label}
                  </Text>
                  <Caption size="tiny" color="secondary" sx={{ lineHeight: 1.3 }}>
                    {m.description}
                  </Caption>
                </FlexColumn>
                {selected && (
                  <span className="permission-menu-check">
                    <CheckIcon fontSize="small" />
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </Popover>
    </>
  );
};

export default memo(PermissionSelector);
