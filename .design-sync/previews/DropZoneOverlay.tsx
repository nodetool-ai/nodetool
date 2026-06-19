import * as React from "react";
import { DropZoneOverlay } from "nodetool";
import UploadFileIcon from "@mui/icons-material/UploadFile";

export const AssetDrop = () => (
  <div
    style={{
      position: "relative",
      height: 260,
      borderRadius: 8,
      border: "2px dashed var(--palette-primary-main)",
      background: "var(--palette-action-hover)"
    }}
  >
    <DropZoneOverlay
      visible
      icon={<UploadFileIcon />}
      message="Drop images to add to your assets"
    />
  </div>
);
