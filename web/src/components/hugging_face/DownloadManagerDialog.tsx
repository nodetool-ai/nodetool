import React, { memo, useMemo } from "react";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
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
    t("i18n-next55.downloadManager.backgroundDownloads")
  ) : (
    <FlexColumn gap={SPACING.xs}>
      <span>
        {t("i18n-next55.downloadManager.downloadFromNodes", {
          recommendedModels: t("i18n-next55.downloadManager.recommendedModels")
        })}
      </span>
      <span>
        {t("i18n-next55.downloadManager.modelManagerInfo", {
          modelManager: t("i18n-next55.downloadManager.modelManager")
        })}
      </span>
    </FlexColumn>
  );

  return (
    <Dialog
      className="download-dialog"
      open={isDialogOpen}
      onClose={closeDialog}
      title={t("i18n-next55.downloadManager.title")}
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
            title={t("i18n-next55.downloadManager.noActiveDownloads")}
            description={t("i18n-next55.downloadManager.startDownload")}
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
                  {t("i18n-next55.downloadManager.openHuggingFaceFolder")}
                </EditorButton>
                <EditorButton
                  variant="outlined"
                  startIcon={<FolderOutlined />}
                  onClick={openOllamaPath}
                >
                  {t("i18n-next55.downloadManager.openOllamaFolder")}
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
