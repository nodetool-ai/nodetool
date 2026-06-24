import React from "react";
import FileIcon from "@mui/icons-material/InsertDriveFile";
import { ResponsiveImage } from "../../ui_primitives/ResponsiveImage";
import { CloseButton } from "../../ui_primitives/CloseButton";
import { BORDER_RADIUS } from "../../ui_primitives";
import { DroppedFile } from "../types/chat.types";

const isDisplayableImage = (uri: string) =>
  /^data:image\/(jpeg|jpg|png|gif|webp|svg\+xml|bmp);base64,/.test(uri) ||
  /^https?:\/\//.test(uri) ||
  uri.startsWith("/");

interface FilePreviewProps {
  file: DroppedFile;
  onRemove: () => void;
}

export const FilePreview: React.FC<FilePreviewProps> = React.memo(({ file, onRemove }) => (
  <div className="file-preview">
    {file.type.startsWith("image/") && isDisplayableImage(file.dataUri) ? (
      <ResponsiveImage
        src={file.dataUri}
        alt={file.name}
        fit="cover"
        borderRadius={BORDER_RADIUS.sm}
        showErrorFallback
        sx={{ width: "48px", height: "48px" }}
      />
    ) : (
      <div className="file-icon-wrapper">
        <FileIcon />
        <div className="file-name">{file.name}</div>
      </div>
    )}
    <CloseButton
      onClick={onRemove}
      tooltip={`Remove ${file.name}`}
      buttonSize="small"
      iconVariant="clear"
      nodrag={false}
      sx={{
        position: "absolute",
        top: -6,
        right: -6,
        width: 18,
        height: 18,
        backgroundColor: "var(--palette-c_scrim)",
        "&:hover": {
          backgroundColor: "var(--palette-c_scrim_strong)"
        },
        "& .MuiSvgIcon-root": {
          fontSize: 14
        }
      }}
    />
  </div>
));

FilePreview.displayName = "FilePreview";