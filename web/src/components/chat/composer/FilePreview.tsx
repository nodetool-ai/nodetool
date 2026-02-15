import React, { memo, useMemo, useCallback } from "react";
import FileIcon from "@mui/icons-material/InsertDriveFile";
import { DroppedFile } from "../types/chat.types";
import isEqual from "lodash/isEqual";

const isValidImageDataUri = (uri: string) =>
  /^data:image\/(jpeg|jpg|png|gif|webp);base64,/.test(uri);

interface FilePreviewProps {
  file: DroppedFile;
  onRemove: () => void;
}

export const FilePreview: React.FC<FilePreviewProps> = memo(function FilePreview({ file, onRemove }) {
  // Memoize image validity check to avoid recomputing on every render
  const isValidImage = useMemo(() => {
    return file.type.startsWith("image/") && isValidImageDataUri(file.dataUri);
  }, [file.type, file.dataUri]);

  // Stable remove handler
  const handleRemove = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    onRemove();
  }, [onRemove]);

  return (
    <div className="file-preview">
      {isValidImage ? (
        <img src={file.dataUri} alt={file.name} />
      ) : (
        <div className="file-icon-wrapper">
          <FileIcon />
          <div className="file-name">{file.name}</div>
        </div>
      )}
      <button
        className="remove-button"
        onClick={handleRemove}
        aria-label={`Remove file ${file.name}`}
        type="button"
      >
        ×
      </button>
    </div>
  );
}, isEqual);