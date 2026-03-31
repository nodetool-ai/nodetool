import React from "react";
import FileIcon from "@mui/icons-material/InsertDriveFile";
import { ResponsiveImage } from "../../ui_primitives/ResponsiveImage";
import { DroppedFile } from "../types/chat.types";

const isValidImageDataUri = (uri: string) =>
  /^data:image\/(jpeg|jpg|png|gif|webp);base64,/.test(uri);

interface FilePreviewProps {
  file: DroppedFile;
  onRemove: () => void;
}

export const FilePreview: React.FC<FilePreviewProps> = ({ file, onRemove }) => (
  <div className="file-preview">
    {file.type.startsWith("image/") && isValidImageDataUri(file.dataUri) ? (
      <ResponsiveImage
        src={file.dataUri}
        alt={file.name}
        fit="cover"
        borderRadius="4px"
        showErrorFallback
        sx={{ width: "24px", height: "24px" }}
      />
    ) : (
      <div className="file-icon-wrapper">
        <FileIcon />
        <div className="file-name">{file.name}</div>
      </div>
    )}
    <button
      className="remove-button"
      onClick={onRemove}
      aria-label={`Remove file ${file.name}`}
      type="button"
    >
      ×
    </button>
  </div>
);