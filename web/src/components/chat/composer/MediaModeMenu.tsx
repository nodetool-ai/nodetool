/** @jsxImportSource @emotion/react */
import React, { memo } from "react";
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
import PsychologyIcon from "@mui/icons-material/Psychology";
import CheckIcon from "@mui/icons-material/Check";
import {
  Caption,
  FlexRow,
  Popover,
  Text
} from "../../ui_primitives";
import type { MediaMode } from "../../../stores/MediaGenerationStore";

interface MediaModeMenuProps {
  anchorEl: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  value: MediaMode;
  agentMode: boolean;
  onChange: (mode: MediaMode, agentMode: boolean) => void;
}

type ModeItemId = MediaMode | "agent";

interface ModeItem {
  id: ModeItemId;
  label: string;
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
    id: "agent",
    label: "Agent",
    icon: <PsychologyIcon fontSize="small" />,
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
    padding: "8px 0",
    minWidth: 240,
    ".mode-menu-header": {
      padding: "8px 16px 4px",
      color: theme.vars.palette.grey[400],
      textTransform: "uppercase",
      letterSpacing: 1
    },
    ".mode-menu-item": {
      display: "flex",
      alignItems: "center",
      gap: 12,
      padding: "10px 16px",
      cursor: "pointer",
      color: theme.vars.palette.grey[100],
      transition: "background-color 120ms ease",
      "&:hover": {
        backgroundColor: "rgba(255,255,255,0.06)"
      },
      "&.selected": {
        backgroundColor: "rgba(255,255,255,0.08)"
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
 * composer. Mirrors the MODE popover from the reference screenshots.
 */
const MediaModeMenu: React.FC<MediaModeMenuProps> = ({
  anchorEl,
  open,
  onClose,
  value,
  agentMode,
  onChange
}) => {
  const theme = useTheme();
  return (
    <Popover
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      placement="top-left"
      paperSx={{
        backgroundColor: theme.vars.palette.grey[900],
        border: `1px solid ${theme.vars.palette.grey[800]}`,
        borderRadius: 2,
        boxShadow: "0 12px 40px rgba(0,0,0,0.45)"
      }}
    >
      <div css={styles(theme)} role="menu" aria-label="Generation mode">
        <Caption className="mode-menu-header" size="small">
          Mode
        </Caption>
        {MODES.map((m) => {
          const selected =
            m.id === "agent"
              ? value === "chat" && agentMode
              : m.id === "chat"
                ? value === "chat" && !agentMode
                : m.id === value;
          return (
            <div
              key={m.id}
              role="menuitemradio"
              aria-checked={selected}
              aria-disabled={!m.enabled || undefined}
              className={`mode-menu-item${selected ? " selected" : ""}${m.enabled ? "" : " disabled"}`}
              onClick={() => {
                if (!m.enabled) {
                  return;
                }
                if (m.id === "agent") {
                  onChange("chat", true);
                } else {
                  onChange(m.id, false);
                }
                onClose();
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
                {!m.enabled && (
                  <Caption size="tiny" color="secondary">
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
      </div>
    </Popover>
  );
};

export default memo(MediaModeMenu);
