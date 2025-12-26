import React from "react";
import { Button, Box, Tooltip } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import FileDownloadIcon from "@mui/icons-material/FileDownload";
import { CopyToClipboardButton } from "../../common/CopyToClipboardButton";
import { useNotificationStore } from "../../../stores/NotificationStore";

type PreviewActionsProps = {
  onDownload: () => void;
  onAddToAssets: () => void;
  copyValue: unknown;
};

const PreviewActions: React.FC<PreviewActionsProps> = ({
  onDownload,
  onAddToAssets,
  copyValue
}) => {
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );

  const handleCopyError = (_err: Error) => {
    addNotification({
      type: "error",
      content: "Failed to copy to clipboard"
    });
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
      <CopyToClipboardButton
        copyValue={copyValue}
        onCopyError={handleCopyError}
        className="action-button copy"
        sx={{
          width: "17px",
          height: "17px",
          minWidth: "unset",
          padding: 0,
          margin: 0,
          marginLeft: "0 !important",
          borderRadius: ".1em",
          backgroundColor: (theme) => theme.vars.palette.grey[600],
          color: (theme) => theme.vars.palette.grey[200],
          "&:hover": {
            color: "var(--palette-primary-main)"
          },
          "& svg": {
            width: "100%",
            height: "100%"
          }
        }}
      />
    </Box>
  );
};

export default PreviewActions;
