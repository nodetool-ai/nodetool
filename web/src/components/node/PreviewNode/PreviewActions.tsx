import React from "react";
import { Button, Box, Tooltip } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import FileDownloadIcon from "@mui/icons-material/FileDownload";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";

type PreviewActionsProps = {
  onCopy: () => void;
  onDownload: () => void;
  onAddToAssets: () => void;
  canCopy: boolean;
};

const PreviewActions: React.FC<PreviewActionsProps> = ({
  onCopy,
  onDownload,
  onAddToAssets,
  canCopy
}) => {
  return (
    <Box
      className="actions"
      sx={{
        display: "flex",
        gap: 1,
        justifyContent: "flex-start",
        alignItems: "start",
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
      {canCopy && (
        <Tooltip title="Copy to clipboard">
          <Button onClick={onCopy} className="action-button" tabIndex={-1}>
            <ContentCopyIcon fontSize="inherit" />
          </Button>
        </Tooltip>
      )}
    </Box>
  );
};

export default PreviewActions;
