import React, { useState } from "react";
import FolderOutlinedIcon from "@mui/icons-material/FolderOutlined";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowRightIcon from "@mui/icons-material/KeyboardArrowRight";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import type { TimelineTrackFolder } from "@nodetool-ai/timeline";

import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import {
  ContextMenu,
  Caption,
  FlexRow,
  InlineEditableText,
  MenuItemPrimitive,
  SPACING,
  ToolbarIconButton
} from "../../ui_primitives";
import { TRACK_FOLDER_HEIGHT_PX } from "./trackWindow";

interface TrackFolderHeaderProps {
  folder: TimelineTrackFolder;
  count: number;
  collapsed: boolean;
  onToggle: (folderId: string) => void;
}

export const TrackFolderHeader: React.FC<TrackFolderHeaderProps> = ({
  folder,
  count,
  collapsed,
  onToggle
}) => {
  const renameTrackFolder = useTimelineStore((state) => state.renameTrackFolder);
  const removeTrackFolder = useTimelineStore((state) => state.removeTrackFolder);
  const [editing, setEditing] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);

  return (
    <>
      <FlexRow
        align="center"
        fullWidth
        sx={{
          height: TRACK_FOLDER_HEIGHT_PX,
          px: SPACING.sm,
          gap: SPACING.xs,
          bgcolor: "action.hover",
          borderBottom: 1,
          borderColor: "divider"
        }}
        data-testid={`track-folder-${folder.id}`}
      >
        <ToolbarIconButton
          icon={
            collapsed ? (
              <KeyboardArrowRightIcon fontSize="small" />
            ) : (
              <KeyboardArrowDownIcon fontSize="small" />
            )
          }
          onClick={() => onToggle(folder.id)}
          aria-label={`${collapsed ? "Expand" : "Collapse"} folder ${folder.name}`}
          aria-expanded={!collapsed}
          size="small"
          sx={{ p: SPACING.none }}
        />
        <FolderOutlinedIcon fontSize="small" aria-hidden />
        <InlineEditableText
          value={folder.name}
          editing={editing}
          onEditingChange={setEditing}
          onCommit={(name) => renameTrackFolder(folder.id, name)}
          ariaLabel={`Folder name: ${folder.name}`}
          title="Double-click to rename folder"
          displayAsInput
          sx={{ flex: "1 1 auto", minWidth: 0 }}
        />
        <Caption aria-label={`${count} tracks`}>({count})</Caption>
        <ToolbarIconButton
          icon={<MoreHorizIcon fontSize="small" />}
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            setMenuPosition({ x: rect.right, y: rect.bottom });
          }}
          aria-label={`Folder options for ${folder.name}`}
          size="small"
          sx={{ p: SPACING.none }}
        />
      </FlexRow>
      <ContextMenu
        open={menuPosition !== null}
        position={menuPosition}
        onClose={() => setMenuPosition(null)}
        compact
      >
        <MenuItemPrimitive
          label="Rename folder"
          onClick={() => {
            setMenuPosition(null);
            setEditing(true);
          }}
          compact
        />
        <MenuItemPrimitive
          label="Ungroup tracks"
          onClick={() => {
            removeTrackFolder(folder.id);
            setMenuPosition(null);
          }}
          compact
        />
      </ContextMenu>
    </>
  );
};
