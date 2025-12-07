import React from "react";
import { useTheme } from "@mui/material/styles";
import FolderList from "../FolderList";

const AssetFoldersPanel: React.FC = () => {
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
};

export default AssetFoldersPanel;
