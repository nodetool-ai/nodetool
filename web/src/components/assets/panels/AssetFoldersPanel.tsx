import React, { memo } from "react";
import { useTheme } from "@mui/material/styles";
import FolderList from "../FolderList";

const AssetFoldersPanel: React.FC = memo(function AssetFoldersPanel() {
  const theme = useTheme();
  return (
    <div
      style={{
        height: "100%",
        overflowY: "auto",
        overflowX: "hidden",
        backgroundColor: theme.vars.palette.c_editor_bg_color
      }}
    >
      <FolderList isHorizontal={false} />
    </div>
  );
});

export default AssetFoldersPanel;
