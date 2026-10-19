/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React, { useCallback, useMemo, useState, useEffect, memo } from "react";
import { useTranslation } from "react-i18next";
import { Tooltip, Text, Caption, EditorButton, LoadingSpinner, Chip, CloseButton, FlexRow, FlexColumn, CopyButton, Box, BORDER_RADIUS, SPACING, getSpacingPx } from "../ui_primitives";
import { ProgressBar } from "../ui_primitives";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { useModelDownloadStore } from "../../stores/ModelDownloadStore";
import { useShallow } from "zustand/react/shallow";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

// Threshold in ms to consider a download stalled (30 seconds)
const STALL_THRESHOLD_MS = 30000;

const styles = (theme: Theme) =>
  css({
    width: "100%",
    borderRadius: BORDER_RADIUS.lg,
    padding: `${getSpacingPx(SPACING.lg)} ${getSpacingPx(SPACING.xl)} ${getSpacingPx(SPACING.xl)}`,
    position: "relative",
    alignItems: "stretch",
    justifyContent: "start",
    border: `1px solid ${theme.vars.palette.divider}`,
    background: theme.vars.palette.background.paper,
    boxShadow: theme.shadows[1],
    ".download-progress-text": {
      fontFamily: theme.fontFamily2,
      paddingBottom: getSpacingPx(SPACING.xs),
      width: "100%",
      marginTop: "0",
      fontSize: theme.fontSizeSmaller
    },
    ".download-status": {
      padding: `${getSpacingPx(SPACING.sm)} 0 ${getSpacingPx(SPACING.xs)}`,
      fontFamily: theme.fontFamily2
    },
    ".repo-name": {
      lineHeight: "1.2em",
      wordBreak: "break-word",
      paddingRight: getSpacingPx(SPACING.xxxl),
      fontWeight: 500
    },
    ".download-message": {
      fontSize: theme.fontSizeSmall,
      // Color is handled via dynamic style prop or class
    },
    ".download-progress": {
      marginTop: getSpacingPx(SPACING.lg)
    },
    ".download-details": {
      minHeight: "120px",
      display: "grid",
      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
      columnGap: theme.spacing(2),
      rowGap: theme.spacing(0.5),
      marginTop: theme.spacing(1)
    },
    ".cancel-button": {
      padding: `${getSpacingPx(SPACING.md)} ${getSpacingPx(SPACING.xl)}`,
      marginTop: getSpacingPx(SPACING.lg),
      lineHeight: "1.1em",
      whiteSpace: "nowrap",
      alignSelf: "start"
    },
    ".meta-row": {
      marginTop: theme.spacing(1)
    }
  });

export const DownloadProgress: React.FC<{
  name: string;
  minimal?: boolean;
}> = memo(({ name, minimal }) => {
  const { t } = useTranslation();
  const download = useModelDownloadStore((state) => state.downloads[name]);
  const {
    cancelDownload,
    cancelAndRemoveDownload,
    removeDownload,
    wsConnectionState,
    reconnectWebSocket
  } = useModelDownloadStore(
    useShallow((state) => ({
      cancelDownload: state.cancelDownload,
      cancelAndRemoveDownload: state.cancelAndRemoveDownload,
      removeDownload: state.removeDownload,
      wsConnectionState: state.wsConnectionState,
      reconnectWebSocket: state.reconnectWebSocket
    }))
  );
  const isDisconnected = wsConnectionState === "disconnected";
  const isReconnecting = wsConnectionState === "connecting";

  const theme = useTheme();
  const cssStyles = useMemo(() => styles(theme), [theme]);

  // The card keeps the cancelled entry visible so the manager can show what
  // happened; the inline row dismisses itself instead.
  const handleCancelDownload = useCallback(() => {
    void cancelDownload(name);
  }, [name, cancelDownload]);

  const handleCancelAndDismiss = useCallback(() => {
    void cancelAndRemoveDownload(name);
  }, [name, cancelAndRemoveDownload]);

  const [now, setNow] = useState(Date.now());

  const isActive =
    download.status === "running" ||
    download.status === "progress" ||
    download.status === "start";

  // A pending download is only queued, but it is cancellable all the same.
  const canCancel =
    isActive || download.status === "pending";

  useEffect(() => {
    if (!isActive) return;
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 5000);
    return () => clearInterval(interval);
  }, [isActive]);

  const handleRemove = useCallback(() => {
    removeDownload(name);
  }, [name, removeDownload]);

  const totalBytes = download.totalBytes ?? 0;
  const downloadedBytes = download.downloadedBytes ?? 0;
  const percent =
    totalBytes > 0
      ? Math.min(100, Math.max(0, (downloadedBytes / totalBytes) * 100))
      : 0;

  const isStalled = useMemo(() => {
    if (!isActive) return false;
    if (isDisconnected) return true;
    if (!download.lastUpdated) return false;
    return now - download.lastUpdated > STALL_THRESHOLD_MS;
  }, [isActive, download.lastUpdated, now, isDisconnected]);

  const timeSinceUpdate = useMemo(() => {
    if (!download.lastUpdated || !isStalled) {
      return null;
    }
    const seconds = Math.floor((now - download.lastUpdated) / 1000);
    if (seconds < 60) {
      return `${seconds}s`;
    }
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ${seconds % 60}s`;
  }, [download.lastUpdated, isStalled, now]);

  const eta = useMemo(() => {
    if (isStalled) {
      return null;
    }
    if (download.speed && download.speed > 0) {
      const remainingBytes = totalBytes - downloadedBytes;
      const remainingSeconds = remainingBytes / download.speed;
      const minutes = Math.floor(remainingSeconds / 60);
      const seconds = Math.floor(remainingSeconds % 60);
      return `${minutes}m ${seconds}s`;
    }
    return null;
  }, [download.speed, totalBytes, downloadedBytes, isStalled]);

  // Display speed - show as stalled/disconnected if no recent updates
  const displaySpeed = useMemo(() => {
    if (isDisconnected) {
      return t("i18n-next7.downloadProgress.disconnected");
    }
    if (isReconnecting) {
      return t("i18n-next7.downloadProgress.reconnecting");
    }
    if (isStalled) {
      return t("i18n-next7.downloadProgress.stalled");
    }
    if (download.speed) {
      return `${(download.speed / 1024 / 1024).toFixed(2)} MB/s`;
    }
    return "-";
  }, [download.speed, isStalled, isDisconnected, isReconnecting, t]);

  const showDetails =
    download.status === "start" ||
    download.status === "idle" ||
    download.status === "pending" ||
    download.status === "running" ||
    download.status === "progress";

  const getCloseButtonTooltip = () => {
    switch (download.status) {
      case "completed":
        return t("i18n-next7.downloadProgress.removeFromHistory");
      case "cancelled":
        return t("i18n-next7.downloadProgress.clearCancelled");
      case "error":
        return t("i18n-next7.downloadProgress.clearFailed");
      default:
        return t("i18n-next7.downloadProgress.removeDownload");
    }
  };

  if (!download) {return null;}

  // Minimal inline variant for compact contexts (e.g., model variant buttons)
  if (minimal) {
    const totalBytes = download.totalBytes ?? 0;
    const downloadedBytes = download.downloadedBytes ?? 0;
    const percent =
      totalBytes > 0
        ? Math.min(100, Math.max(0, (downloadedBytes / totalBytes) * 100))
        : 0;
    const label =
      download.status === "completed"
        ? t("i18n-next7.downloadProgress.done")
        : download.status === "error"
        ? t("i18n-next7.downloadProgress.error")
        : download.status === "cancelled"
        ? t("i18n-next7.downloadProgress.cancelled")
        : totalBytes > 0
        ? `${percent.toFixed(0)}%`
        : t("i18n-next7.downloadProgress.loading");

    // Whole megabytes keep the line short: "89 / 465 MB".
    const compactBytes = (bytes: number) => {
      const mb = bytes / 1024 / 1024;
      return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`;
    };
    const done = compactBytes(downloadedBytes);
    const total = compactBytes(totalBytes);
    const [doneValue, doneUnit] = done.split(" ");
    const sizeLabel =
      totalBytes > 0 && isActive
        ? `${doneUnit === total.split(" ")[1] ? doneValue : done} / ${total}`
        : null;

    return (
      <Tooltip
        title={`${name}: ${download.status}${
          download.message ? ` — ${download.message}` : ""
        }`}
      >
        <FlexRow
          component="span"
          align="center"
          gap={1}
          sx={{ flexShrink: 0, whiteSpace: "nowrap" }}
        >
          <FlexColumn component="span" gap={0.5} sx={{ width: 120 }}>
            <FlexRow component="span" align="center" justify="space-between">
              <Caption sx={{ lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
                {label}
              </Caption>
              {sizeLabel && (
                <Caption
                  sx={{
                    lineHeight: 1,
                    color: "text.secondary",
                    fontVariantNumeric: "tabular-nums"
                  }}
                >
                  {sizeLabel}
                </Caption>
              )}
            </FlexRow>
            <ProgressBar
              value={download.status === "completed" ? 100 : percent}
              showValue={false}
              size="small"
            />
          </FlexColumn>
          {canCancel && (
            <CloseButton
              onClick={handleCancelAndDismiss}
              buttonSize="small"
              tooltip={t("i18n-next7.downloadProgress.cancelDownload")}
              nodrag={false}
              sx={{ flexShrink: 0 }}
            />
          )}
        </FlexRow>
      </Tooltip>
    );
  }

  return (
    <FlexColumn css={cssStyles} fullWidth gap={1}>
      <FlexRow className="header-row" align="center" justify="space-between" gap={1} fullWidth>
        <Text className="repo-name" size="small" weight={500}>
          {name}
        </Text>
        <CloseButton
          onClick={handleRemove}
          buttonSize="small"
          tooltip={getCloseButtonTooltip()}
          nodrag={false}
        />
      </FlexRow>
      {download.message && (
        <FlexRow align="flex-start" justify="space-between" gap={1} fullWidth>
          <Box
            component="div"
            sx={{
              flex: 1,
              minWidth: 0,
              userSelect: "text",
              cursor: "text",
              WebkitUserSelect: "text"
            }}
          >
            <Text
              className="download-message"
              component="div"
              size="small"
              sx={{
                color:
                  download.status === "error"
                    ? "var(--palette-error-main)"
                    : "var(--palette-info-main)",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                userSelect: "text"
              }}
            >
              {download.message}
            </Text>
          </Box>
          <CopyButton
            value={download.message}
            tooltip={t("i18n-next7.downloadProgress.copyFullMessage")}
            buttonSize="small"
            nodrag={false}
            sx={{ flexShrink: 0, mt: `-${getSpacingPx(SPACING.micro)}` }}
          />
        </FlexRow>
      )}
      {(download.status === "start" || download.status === "pending") && (
        <FlexRow align="center" gap={SPACING.sm}>
          <LoadingSpinner inline size={14} />
          <Text size="small">
            {download.status === "start"
              ? t("i18n-next7.downloadProgress.starting")
              : t("i18n-next7.downloadProgress.waiting")}
          </Text>
        </FlexRow>
      )}
      {download.status === "completed" && (
        <Tooltip title={t("i18n-next7.downloadProgress.finishedTooltip")}>
          <Chip
            label={t("i18n-next7.downloadProgress.completed")}
            size="small"
            color="success"
            className="download-status"
          />
        </Tooltip>
      )}
      {download.status === "cancelled" && (
        <Tooltip title={t("i18n-next7.downloadProgress.cancelledTooltip")}>
          <Chip
            label={t("i18n-next7.downloadProgress.cancelled")}
            size="small"
            color="warning"
            className="download-status"
          />
        </Tooltip>
      )}
      {download.status === "error" && (
        <Tooltip title={download.message || t("i18n-next7.downloadProgress.failed")}>
          <Chip
            label={t("i18n-next7.downloadProgress.failed")}
            size="small"
            color="error"
            className="download-status"
          />
        </Tooltip>
      )}
      {showDetails && (
        <>
          <FlexRow className="meta-row" align="center" justify="space-between" gap={1} fullWidth>
            <Caption sx={{ opacity: 0.85 }}>
              {percent.toFixed(0)}%
            </Caption>
            {isStalled && (
              <Tooltip
                title={
                  isDisconnected
                    ? t("i18n-next7.downloadProgress.connectionLost")
                    : t("i18n-next7.downloadProgress.noProgress", { time: timeSinceUpdate })
                }
              >
                <FlexRow align="center" gap={0.5} sx={{ color: "var(--palette-warning-main)" }}>
                  <WarningAmberIcon fontSize="small" />
                  <Caption sx={{ fontWeight: 500 }}>
                    {isDisconnected
                      ? t("i18n-next7.downloadProgress.disconnected")
                      : isReconnecting
                        ? t("i18n-next7.downloadProgress.reconnecting")
                        : t("i18n-next7.downloadProgress.stalledSince", { time: timeSinceUpdate })}
                  </Caption>
                  {isDisconnected && !isReconnecting && (
                    <EditorButton
                      density="compact"
                      variant="text"
                      onClick={reconnectWebSocket}
                      sx={{
                        ml: 1,
                        minWidth: "auto",
                        padding: `${getSpacingPx(SPACING.micro)} ${getSpacingPx(SPACING.md)}`,
                        fontSize: "var(--fontSizeSmall)"
                      }}
                    >
                      {t("i18n-next7.downloadProgress.reconnect")}
                    </EditorButton>
                  )}
                </FlexRow>
              </Tooltip>
            )}
          </FlexRow>
          <ProgressBar
            className="download-progress"
            value={percent}
            showValue={false}
            color={isStalled ? "warning" : "primary"}
            aria-label={t("i18n-next7.downloadProgress.downloading", { name })}
          />
          <Box className="download-details">
            <Tooltip title={t("i18n-next7.downloadProgress.totalSizeTooltip")}>
              <Text
                className="download-progress-text download-size"
                size="small"
                style={{
                  marginTop: getSpacingPx(SPACING.md),
                  fontFamily: "var(--fontFamily2)"
                }}
              >
                {t("i18n-next7.downloadProgress.size", { downloaded: (download.downloadedBytes / 1024 / 1024).toFixed(2), total: (download.totalBytes / 1024 / 1024).toFixed(2) })}
              </Text>
            </Tooltip>
            <Tooltip title={t("i18n-next7.downloadProgress.filesTooltip")}>
              <Text
                className="download-progress-text download-files"
                size="small"
              >
                {t("i18n-next7.downloadProgress.files", { downloaded: download.downloadedFiles, total: download.totalFiles })}
              </Text>
            </Tooltip>
            <Text
              className="download-progress-text download-current"
              size="small"
            >
              {t("i18n-next7.downloadProgress.currentFiles", { files: download.currentFiles?.join(", ") })}
            </Text>
            <Text
              className="download-progress-text download-speed"
              size="small"
              style={{
                minHeight: "1.5em",
                fontFamily: "var(--fontFamily2)",
                color: isStalled ? "var(--palette-warning-main)" : undefined
              }}
            >
              {t("i18n-next7.downloadProgress.speed", { speed: displaySpeed })}
            </Text>
            <Text
              className="download-progress-text download-eta"
              size="small"
              style={{
                minHeight: "1.2em",
                color: isStalled ? "var(--palette-warning-main)" : undefined
              }}
            >
              {t("i18n-next7.downloadProgress.eta", { eta: isStalled ? t("i18n-next7.downloadProgress.unknownStalled") : eta || "-" })}
            </Text>
          </Box>
          <Tooltip title={t("i18n-next7.downloadProgress.stopTooltip")}>
            <EditorButton
              onClick={handleCancelDownload}
              variant="contained"
              density="compact"
              style={{
                color: theme.vars.palette.primary.contrastText,
                backgroundColor: theme.vars.palette.info.main
              }}
              className="cancel-button"
            >
              {t("i18n-next7.downloadProgress.cancelDownload")}
            </EditorButton>
          </Tooltip>
        </>
      )}
    </FlexColumn>
  );
});

DownloadProgress.displayName = "DownloadProgress";

export default DownloadProgress;
