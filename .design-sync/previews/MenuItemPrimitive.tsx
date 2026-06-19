import * as React from "react";
import { MenuItemPrimitive } from "nodetool";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteIcon from "@mui/icons-material/Delete";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import FileDownloadIcon from "@mui/icons-material/FileDownload";

const menuStyle: React.CSSProperties = {
  width: 240,
  background: "#141517",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 8,
  padding: "4px 0"
};

export const ContextMenu = () => (
  <div style={menuStyle}>
    <MenuItemPrimitive
      label="Run node"
      icon={<PlayArrowIcon fontSize="small" />}
      shortcut="⌘↵"
    />
    <MenuItemPrimitive
      label="Duplicate"
      icon={<ContentCopyIcon fontSize="small" />}
      shortcut="⌘D"
    />
    <MenuItemPrimitive
      label="Export as DSL"
      icon={<FileDownloadIcon fontSize="small" />}
      hasSubmenu
    />
    <MenuItemPrimitive
      label="Delete"
      icon={<DeleteIcon fontSize="small" />}
      color="error"
      dividerBefore
    />
  </div>
);

export const States = () => (
  <div style={menuStyle}>
    <MenuItemPrimitive label="Default item" />
    <MenuItemPrimitive label="Selected item" selected />
    <MenuItemPrimitive label="Disabled item" disabled />
    <MenuItemPrimitive
      label="With secondary"
      secondary="Saved 2 minutes ago"
    />
  </div>
);

export const Compact = () => (
  <div style={menuStyle}>
    <MenuItemPrimitive label="Add comment" compact shortcut="C" />
    <MenuItemPrimitive label="Group nodes" compact shortcut="⌘G" />
    <MenuItemPrimitive label="Align selection" compact hasSubmenu />
  </div>
);
