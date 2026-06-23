import React from "react";
import { IDockviewPanelProps } from "dockview";
import { useTheme } from "@mui/material/styles";
import FolderList from "../FolderList";
import WorkflowTree from "../WorkflowTree";

export interface AssetFoldersPanelParams {
  isFullscreenAssets?: boolean;
}

const AssetFoldersPanel: React.FC<
  Partial<IDockviewPanelProps<AssetFoldersPanelParams>>
> = (props) => {
  const theme = useTheme();
  const isFullscreenAssets = props.params?.isFullscreenAssets ?? false;
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
      {/* The WORKFLOWS tree is a cross-workflow browser, only useful in the
          global fullscreen view. The sidebar stays scoped to the current
          workflow. */}
      {isFullscreenAssets && <WorkflowTree />}
    </div>
  );
};

export default AssetFoldersPanel;
