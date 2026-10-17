import React, { memo, useMemo } from "react";

import AnnouncementIcon from "@mui/icons-material/Announcement";
import {
  Dialog,
  Divider,
  EditorButton,
  EmptyState,
  FlexColumn,
  FlexRow,
  SPACING,
  Text
} from "../ui_primitives";
import { useModelDownloadStore } from "../../stores/ModelDownloadStore";
import { useShallow } from "zustand/react/shallow";
import { DownloadProgress } from "./DownloadProgress";
import { useTheme } from "@mui/material/styles";

import isEqual from "../../utils/isEqual";
import FolderOutlined from "@mui/icons-material/FolderOutlined";
import DownloadingIcon from "@mui/icons-material/Downloading";
import {
  isFileExplorerAvailable,
  openHuggingfacePath,
  openOllamaPath
} from "../../utils/fileExplorer";
import { isLocalhost, isProduction } from "../../lib/env";
import { isElectron } from "../../utils/browser";

const DownloadManagerDialog: React.FC = () => {
  const { isDialogOpen, closeDialog, downloads } = useModelDownloadStore(
    useShallow((state) => ({
      isDialogOpen: state.isDialogOpen,
      closeDialog: state.closeDialog,
      downloads: state.downloads
    }))
  );

  const downloadNames = useMemo(() => Object.keys(downloads), [downloads]);
  const hasActiveDownloads = downloadNames.length > 0;

  const theme = useTheme();

  const infoMessage = hasActiveDownloads ? (
    "Downloads continue in the background. Access them anytime from the toolbar download icon."
  ) : (
    <FlexColumn gap={SPACING.xs}>
      <span>
        Download models using the <strong>Recommended models</strong> button
        inside nodes.
      </span>
      <span>
        The <strong>Model manager</strong> in the top right panel shows all
        available models.
      </span>
    </FlexColumn>
  );

  return (
    <Dialog
      className="download-dialog"
      open={isDialogOpen}
      onClose={closeDialog}
      title="Downloads"
      maxWidth="md"
      fullWidth
    >
      <FlexColumn className="download-dialog-content" gap={SPACING.md}>
        {hasActiveDownloads ? (
          <FlexColumn className="downloads-list" gap={SPACING.md}>
            {downloadNames.map((name) => (
              <DownloadProgress key={name} name={name} />
            ))}
          </FlexColumn>
        ) : (
          <EmptyState
            icon={<DownloadingIcon />}
            title="No active downloads"
            description="Start a model download from the Recommended Models dialog or Model Manager."
          />
        )}
        {isLocalhost &&
          isFileExplorerAvailable() &&
          !isProduction &&
          isElectron && (
            <>
              <Divider />
              <FlexRow className="folders-row" gap={SPACING.sm} wrap>
                <EditorButton
                  variant="outlined"
                  startIcon={<FolderOutlined />}
                  onClick={openHuggingfacePath}
                >
                  Open HuggingFace folder
                </EditorButton>
                <EditorButton
                  variant="outlined"
                  startIcon={<FolderOutlined />}
                  onClick={openOllamaPath}
                >
                  Open Ollama folder
                </EditorButton>
              </FlexRow>
            </>
          )}
        <Divider />
        <FlexRow className="download-info" gap={SPACING.md} align="center">
          <AnnouncementIcon
            fontSize="small"
            sx={{ color: theme.vars.palette.warning.main }}
          />
          <Text component="div" size="small" color="secondary">
            {infoMessage}
          </Text>
        </FlexRow>
      </FlexColumn>
    </Dialog>
  );
};

export default memo(DownloadManagerDialog, isEqual);
