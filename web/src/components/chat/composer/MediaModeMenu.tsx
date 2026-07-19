/** @jsxImportSource @emotion/react */
import React, { memo, useMemo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import ImageIcon from "@mui/icons-material/Image";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import MovieIcon from "@mui/icons-material/Movie";
import MovieFilterIcon from "@mui/icons-material/MovieFilter";
import GraphicEqIcon from "@mui/icons-material/GraphicEq";
import RecordVoiceOverIcon from "@mui/icons-material/RecordVoiceOver";
import ReplayIcon from "@mui/icons-material/Replay";
import TimelineIcon from "@mui/icons-material/Timeline";
import TuneIcon from "@mui/icons-material/Tune";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import SmartToyOutlinedIcon from "@mui/icons-material/SmartToyOutlined";
import CheckIcon from "@mui/icons-material/Check";
import {
  Caption,
  FlexRow,
  Popover,
  Text,
  MOTION,
  BORDER_RADIUS,
  SPACING,
  getSpacingPx
} from "../../ui_primitives";
import type { MediaMode } from "../../../stores/MediaGenerationStore";

interface MediaModeMenuProps {
  anchorEl: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  value: MediaMode;
  onChange: (mode: MediaMode) => void;
  /** Show the workspace-aware Pi agent as a selectable mode. */
  showPi?: boolean;
  /** Whether Pi is the active mode (so media `value` is not highlighted). */
  piSelected?: boolean;
  /** Called when the user picks Pi. */
  onSelectPi?: () => void;
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
    label: "Generate Images",
    icon: <ImageIcon fontSize="small" />,
    enabled: true
  },
  {
    id: "image_edit",
    label: "Edit Images",
    icon: <AutoFixHighIcon fontSize="small" />,
    enabled: true
  },
  {
    id: "video",
    label: "Generate Videos",
    icon: <MovieIcon fontSize="small" />,
    enabled: true
  },
  {
    id: "image_to_video",
    label: "Animate Image",
    icon: <MovieFilterIcon fontSize="small" />,
    enabled: true
  },
  {
    id: "audio",
    label: "Generate Speech",
    icon: <RecordVoiceOverIcon fontSize="small" />,
    enabled: true
  },
  {
    id: "audio_to_video",
    label: "Audio to Video",
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
    label: "Motion Control",
    icon: <TuneIcon fontSize="small" />,
    enabled: false
  }
];

const styles = (theme: Theme) =>
  css({
    padding: `${getSpacingPx(SPACING.md)} 0`,
    minWidth: 240,
    ".mode-menu-header": {
      padding: `${getSpacingPx(SPACING.md)} ${getSpacingPx(SPACING.xl)} ${getSpacingPx(SPACING.xs)}`,
      color: theme.vars.palette.grey[400],
      textTransform: "uppercase",
      letterSpacing: 1
    },
    ".mode-menu-item": {
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: theme.spacing(3, 4),
      cursor: "pointer",
      color: theme.vars.palette.grey[100],
      transition: MOTION.background,
      "&:hover": {
        backgroundColor: theme.vars.palette.c_overlay
      },
      "&.selected": {
        backgroundColor: theme.vars.palette.c_overlay
      },
      "&.disabled": {
        opacity: 0.45,
        cursor: "not-allowed"
      }
    },
    ".mode-menu-icon": {
      color: theme.vars.palette.grey[300],
      display: "inline-flex"
    },
    ".mode-menu-check": {
      marginLeft: "auto",
      color: theme.vars.palette.primary.main,
      display: "inline-flex"
    }
  });

/**
 * Popover menu shown when the user clicks the "Mode" chip in the media
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
  showPi = false,
  piSelected = false,
  onSelectPi
}) => {
  const theme = useTheme();
  const cssStyles = useMemo(() => styles(theme), [theme]);
  return (
    <Popover
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      placement="top-left"
      paperSx={{
        backgroundColor: theme.vars.palette.grey[900],
        border: `1px solid ${theme.vars.palette.grey[800]}`,
        borderRadius: BORDER_RADIUS.sm,
        boxShadow: `0 12px 40px ${theme.vars.palette.c_scrim}`
      }}
    >
      <div css={cssStyles} role="menu" aria-label="Generation mode">
        <Caption className="mode-menu-header" size="small">
          Mode
        </Caption>
        {MODES.map((m) => {
          const selected = !piSelected && m.id === value;
          return (
            <div
              key={m.id}
              role="menuitemradio"
              aria-checked={selected}
              aria-disabled={!m.enabled || undefined}
              tabIndex={0}
              className={`mode-menu-item${selected ? " selected" : ""}${m.enabled ? "" : " disabled"}`}
              onClick={() => {
                if (!m.enabled) {
                  return;
                }
                onChange(m.id);
                onClose();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  if (!m.enabled) {
                    return;
                  }
                  onChange(m.id);
                  onClose();
                }
              }}
            >
              <span className="mode-menu-icon">{m.icon}</span>
              <FlexRow
                gap={0.5}
                align="center"
                sx={{ flex: 1, minWidth: 0 }}
              >
                <Text size="normal" weight={500} sx={{ color: "inherit" }}>
                  {m.label}
                </Text>
                {m.description && (
                  <Caption size="smaller" color="secondary">
                    {m.description}
                  </Caption>
                )}
                {!m.enabled && (
                  <Caption size="smaller" color="secondary">
                    soon
                  </Caption>
                )}
              </FlexRow>
              {selected && (
                <span className="mode-menu-check">
                  <CheckIcon fontSize="small" />
                </span>
              )}
            </div>
          );
        })}

        {showPi && onSelectPi && (
          <>
            <Caption className="mode-menu-header" size="small">
              Agent
            </Caption>
            <div
              role="menuitemradio"
              aria-checked={piSelected}
              tabIndex={0}
              className={`mode-menu-item${piSelected ? " selected" : ""}`}
              onClick={() => {
                onSelectPi();
                onClose();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelectPi();
                  onClose();
                }
              }}
            >
              <span className="mode-menu-icon">
                <SmartToyOutlinedIcon fontSize="small" />
              </span>
              <FlexRow gap={0.5} align="center" sx={{ flex: 1, minWidth: 0 }}>
                <Text size="normal" weight={500} sx={{ color: "inherit" }}>
                  Pi Agent
                </Text>
                <Caption size="smaller" color="secondary">
                  workspace
                </Caption>
              </FlexRow>
              {piSelected && (
                <span className="mode-menu-check">
                  <CheckIcon fontSize="small" />
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </Popover>
  );
};

export default memo(MediaModeMenu);
