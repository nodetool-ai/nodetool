import React, { useMemo } from "react";
import { Button, Box, Tooltip } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import FileDownloadIcon from "@mui/icons-material/FileDownload";
import { CopyButton } from "../../ui_primitives";
import { CopyAssetButton } from "../../common/CopyAssetButton";
import { useNotificationStore } from "../../../stores/NotificationStore";

type PreviewActionsProps = {
  onDownload: () => void;
  onAddToAssets: () => void;
  copyValue: unknown;
};

/**
 * Check if the value is a copyable asset (image, video, audio with a URI)
 * CopyAssetButton handles URL absolutization internally
 */
const getAssetInfo = (
  value: unknown
): { contentType: string; url: string } | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  // Single asset object with type and uri
  const obj = value as Record<string, unknown>;
  if (obj.type && obj.uri && typeof obj.uri === "string") {
    const type = obj.type as string;
    if (type === "image") {
      return { contentType: "image/png", url: obj.uri };
    }
    if (type === "video") {
      return { contentType: "video/mp4", url: obj.uri };
    }
    if (type === "audio") {
      return { contentType: "audio/mpeg", url: obj.uri };
    }
  }

  // Array with single asset
  if (Array.isArray(value) && value.length === 1) {
    return getAssetInfo(value[0]);
  }

  return null;
};

const PreviewActions: React.FC<PreviewActionsProps> = ({
  onDownload,
  onAddToAssets,
  copyValue
}) => {
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );

  // Check if this is a copyable asset (image/video/audio)
  const assetInfo = useMemo(() => getAssetInfo(copyValue), [copyValue]);

  const handleCopyError = (_err: Error) => {
    addNotification({
      type: "error",
      content: "Failed to copy to clipboard"
    });
  };

  const buttonStyles = {
    width: "17px",
    height: "17px",
    minWidth: "unset",
    padding: 0,
    margin: 0,
    marginLeft: "0 !important",
    borderRadius: ".1em",
    backgroundColor: (theme: any) => theme.vars.palette.grey[600],
    color: (theme: any) => theme.vars.palette.grey[200],
    "&:hover": {
      color: "var(--palette-primary-main)"
    },
    "& svg": {
      width: "100%",
      height: "100%"
    }
  };

  return (
    <Box
      className="actions"
      sx={{
        display: "flex",
        gap: 1,
        justifyContent: "flex-start",
        alignItems: "center",
        padding: 0,
        margin: "0 0 .25em 0"
      }}
    >
      <Tooltip title="Download">
        <Button
          onClick={onDownload}
          className="action-button download"
          tabIndex={-1}
        >
          <FileDownloadIcon />
        </Button>
      </Tooltip>
      <Tooltip title="Add to Assets">
        <Button onClick={onAddToAssets} className="action-button" tabIndex={-1}>
          <AddIcon />
        </Button>
      </Tooltip>
      {assetInfo ? (
        <CopyAssetButton
          contentType={assetInfo.contentType}
          url={assetInfo.url}
          onCopyError={handleCopyError}
          className="action-button copy"
          sx={buttonStyles}
          tabIndex={-1}
        />
      ) : (
        <CopyButton
          value={copyValue}
          onCopyError={handleCopyError}
          className="action-button copy"
          sx={buttonStyles}
          tabIndex={-1}
        />
      )}
    </Box>
  );
};

export default PreviewActions;
