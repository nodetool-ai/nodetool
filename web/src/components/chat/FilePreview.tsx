import React from "react";
import FileIcon from "@mui/icons-material/InsertDriveFile";
import { DroppedFile } from "./types";

interface FilePreviewProps {
  file: DroppedFile;
  onRemove: () => void;
}

export const FilePreview: React.FC<FilePreviewProps> = ({ file, onRemove }) => (
  <div className="file-preview">
    {file.type.startsWith("image/") ? (
      <img src={file.dataUri} alt={file.name} />
    ) : (
      <div className="file-icon-wrapper">
        <FileIcon />
        <div className="file-name">{file.name}</div>
      </div>
    )}
    <div className="remove-button" onClick={onRemove}>
      ×
    </div>
  </div>
);