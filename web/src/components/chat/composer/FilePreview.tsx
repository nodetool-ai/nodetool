import React from "react";
import { useTranslation } from "react-i18next";
import FileIcon from "@mui/icons-material/InsertDriveFile";
import {
  Box,
  FlexColumn,
  ResponsiveImage,
  CloseButton,
  TruncatedText,
  BORDER_RADIUS,
  SPACING,
  ICON_SIZE
} from "../../ui_primitives";
import { DroppedFile } from "../types/chat.types";

const isDisplayableImage = (uri: string) =>
  /^data:image\/(jpeg|jpg|png|gif|webp|svg\+xml|bmp);base64,/.test(uri) ||
  /^https?:\/\//.test(uri) ||
  uri.startsWith("/");

interface FilePreviewProps {
  file: DroppedFile;
  onRemove: () => void;
}

const PREVIEW_SIZE = 48;

export const FilePreview: React.FC<FilePreviewProps> = React.memo(({ file, onRemove }) => {
  const { t } = useTranslation();
  return (
  <Box className="file-preview" sx={{ width: PREVIEW_SIZE, height: PREVIEW_SIZE, position: "relative" }}>
    {file.type.startsWith("image/") && isDisplayableImage(file.dataUri) ? (
      <ResponsiveImage
        locator={file.dataUri}
        alt={file.name}
        fit="cover"
        borderRadius={BORDER_RADIUS.sm}
        showErrorFallback
        sx={{ width: PREVIEW_SIZE, height: PREVIEW_SIZE }}
      />
    ) : (
      <FlexColumn
        className="file-icon-wrapper"
        align="center"
        justify="center"
        title={file.name}
        sx={{ width: "100%", height: "100%", overflow: "hidden", minWidth: 0 }}
      >
        <FileIcon sx={{ flexShrink: 0 }} />
        <TruncatedText className="file-name" sx={{ width: "100%" }}>{file.name}</TruncatedText>
      </FlexColumn>
    )}
    <CloseButton
      onClick={onRemove}
      tooltip={t("i18n-next54.composer.filePreview.remove", { name: file.name })}
      buttonSize="small"
      iconVariant="clear"
      nodrag={false}
      sx={{
        position: "absolute",
        top: -SPACING.xs,
        right: -SPACING.xs,
        width: SPACING.xl,
        height: SPACING.xl,
        backgroundColor: "c_scrim",
        "&:hover": { backgroundColor: "c_scrim_strong" },
        "& .MuiSvgIcon-root": { fontSize: ICON_SIZE.xs }
      }}
    />
  </Box>
  );
});

FilePreview.displayName = "FilePreview";
