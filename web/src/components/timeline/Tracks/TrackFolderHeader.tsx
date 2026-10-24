import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import FolderOutlinedIcon from "@mui/icons-material/FolderOutlined";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowRightIcon from "@mui/icons-material/KeyboardArrowRight";
import MoreVertIcon from "@mui/icons-material/MoreVert";
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
  const { t } = useTranslation();
  const renameTrackFolder = useTimelineStore((state) => state.renameTrackFolder);
  const removeTrackFolder = useTimelineStore((state) => state.removeTrackFolder);
  const [editing, setEditing] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);

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
          aria-label={t(collapsed ? "i18n-next59.folder.expand" : "i18n-next59.folder.collapse", { name: folder.name })}
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
          ariaLabel={t("i18n-next59.folder.name", { name: folder.name })}
          title={t("i18n-next59.folder.renameHint")}
          displayAsInput
          sx={{ flex: "1 1 auto", minWidth: 0 }}
        />
        <Caption aria-label={t("i18n-next59.folder.trackCount", { count })}>({count})</Caption>
        <ToolbarIconButton
          icon={<MoreVertIcon fontSize="small" />}
          onClick={(event) => setMenuAnchor(event.currentTarget)}
          aria-label={t("i18n-next59.folder.options", { name: folder.name })}
          size="small"
          sx={{ p: SPACING.none }}
        />
      </FlexRow>
      <ContextMenu
        open={menuAnchor !== null}
        anchorEl={menuAnchor}
        onClose={() => setMenuAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
      >
        <MenuItemPrimitive
          label={t("i18n-next59.folder.rename")}
          onClick={() => {
            setMenuAnchor(null);
            setEditing(true);
          }}
        />
        <MenuItemPrimitive
          label={t("i18n-next59.folder.ungroup")}
          onClick={() => {
            removeTrackFolder(folder.id);
            setMenuAnchor(null);
          }}
        />
      </ContextMenu>
    </>
  );
};
