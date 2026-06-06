import React, { memo, useCallback, useMemo } from "react";
import type { Theme } from "@mui/material/styles";
import { Tooltip, EditorButton, FlexRow } from "../../ui_primitives";
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

const COPY_BUTTON_SX = {
  width: "17px",
  height: "17px",
  minWidth: "unset",
  padding: 0,
  margin: 0,
  marginLeft: "0 !important",
  borderRadius: ".1em",
  backgroundColor: (theme: Theme) => theme.vars.palette.grey[600],
  color: (theme: Theme) => theme.vars.palette.grey[200],
  "&:hover": {
    color: "var(--palette-primary-main)"
  },
  "& svg": {
    width: "100%",
    height: "100%"
  }
} as const;

const PreviewActions: React.FC<PreviewActionsProps> = memo(({
  onDownload,
  onAddToAssets,
  copyValue
}) => {
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );

  const assetInfo = useMemo(() => getAssetInfo(copyValue), [copyValue]);

  const handleCopyError = useCallback((_err: Error) => {
    addNotification({
      type: "error",
      content: "Failed to copy to clipboard"
    });
  }, [addNotification]);

  return (
    <FlexRow
      className="actions"
      gap={1}
      align="center"
      sx={{
        margin: "0 0 .25em 0"
      }}
    >
      <Tooltip title="Download">
        <EditorButton
          onClick={onDownload}
          className="action-button download"
          aria-label="Download"
        >
          <FileDownloadIcon />
        </EditorButton>
      </Tooltip>
      <Tooltip title="Add to Assets">
        <EditorButton
          onClick={onAddToAssets}
          className="action-button"
          aria-label="Add to Assets"
        >
          <AddIcon />
        </EditorButton>
      </Tooltip>
      {assetInfo ? (
        <CopyAssetButton
          contentType={assetInfo.contentType}
          url={assetInfo.url}
          onCopyError={handleCopyError}
          className="action-button copy"
          sx={COPY_BUTTON_SX}
          aria-label="Copy asset to clipboard"
        />
      ) : (
        <CopyButton
          value={copyValue}
          onCopyError={handleCopyError}
          className="action-button copy"
          sx={COPY_BUTTON_SX}
          aria-label="Copy to clipboard"
        />
      )}
    </FlexRow>
  );
});

PreviewActions.displayName = "PreviewActions";

export default PreviewActions;
