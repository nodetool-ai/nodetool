/**
 * One row header of the Step Editor: icon, name, the mute toggle and the row
 * menu. Same height as the row it names.
 */

import React, { memo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "@mui/material/styles";
import MusicNoteIcon from "@mui/icons-material/MusicNote";
import TuneIcon from "@mui/icons-material/Tune";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";

import {
  ContextMenu,
  EditorButton,
  FlexColumn,
  FlexRow,
  MenuItemPrimitive,
  SPACING,
  Text,
  ToolbarIconButton
} from "../../ui_primitives";
import type { MenuRow } from "../pianoRoll/PianoRollMenus";

interface StepLaneHeaderProps {
  laneKey: string;
  name: string;
  type: "note" | "controller";
  heightPx: number;
  selected: boolean;
  /** Every event of the row is muted. */
  muted: boolean;
  /** Null when the row cannot be muted (a controller row). */
  onToggleMute: (() => void) | null;
  onSelect: () => void;
  menuRows: MenuRow[];
}

export const StepLaneHeader: React.FC<StepLaneHeaderProps> = memo(
  ({ laneKey, name, type, heightPx, selected, muted, onToggleMute, onSelect, menuRows }) => {
    const { t } = useTranslation();
    const theme = useTheme();
    const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
    const Icon = type === "note" ? MusicNoteIcon : TuneIcon;
    return (
      <FlexColumn
        role="button"
        tabIndex={0}
        aria-pressed={selected}
        data-testid={`step-editor-lane-${laneKey}`}
        justify="center"
        gap={SPACING.xs}
        onClick={onSelect}
        onKeyDown={(event) => {
          if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            onSelect();
          }
        }}
        sx={{
          height: heightPx,
          px: SPACING.sm,
          cursor: "pointer",
          overflow: "hidden",
          borderBottom: `1px solid ${theme.vars.palette.divider}`,
          backgroundColor: selected ? theme.vars.palette.action.hover : "transparent"
        }}
      >
        <FlexRow align="center" gap={SPACING.xs}>
          <Icon fontSize="small" color={selected ? "primary" : "inherit"} aria-hidden />
          <Text size="small" truncate>{name}</Text>
        </FlexRow>
        <FlexRow align="center" gap={SPACING.xs}>
          {onToggleMute && (
            <EditorButton
              variant={muted ? "contained" : "outlined"}
              density="compact"
              aria-label={t("pass3_20.stepEditor.row.mute")}
              aria-pressed={muted}
              onClick={(event) => {
                event.stopPropagation();
                onToggleMute();
              }}
            >
              M
            </EditorButton>
          )}
          <ToolbarIconButton
            tooltip={t("pass3_20.stepEditor.row.options")}
            aria-label={t("pass3_20.stepEditor.row.options")}
            aria-haspopup="menu"
            aria-expanded={anchorEl !== null}
            sx={{ marginLeft: "auto" }}
            onClick={(event) => {
              event.stopPropagation();
              onSelect();
              setAnchorEl(event.currentTarget);
            }}
          >
            <MoreHorizIcon fontSize="small" />
          </ToolbarIconButton>
        </FlexRow>
        <ContextMenu open={anchorEl !== null} anchorEl={anchorEl} onClose={() => setAnchorEl(null)}>
          {menuRows.map((row) => (
            <MenuItemPrimitive
              key={row.id}
              label={row.label}
              disabled={row.disabled}
              dividerBefore={row.dividerBefore}
              onClick={() => {
                setAnchorEl(null);
                row.run();
              }}
            />
          ))}
        </ContextMenu>
      </FlexColumn>
    );
  }
);

StepLaneHeader.displayName = "StepLaneHeader";
