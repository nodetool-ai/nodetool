import React from "react";
import FolderList from "../FolderList";

const AssetFoldersPanel: React.FC = () => {
  return (
    <div
      style={{
        height: "100%",
        overflowY: "auto",
        overflowX: "hidden"
      }}
    >
      <FolderList isHorizontal={false} />
    </div>
  );
};

export default AssetFoldersPanel;
