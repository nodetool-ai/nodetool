import React, { memo, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { Theme } from "@mui/material/styles";
import { Tooltip, EditorButton, FlexRow, getSpacingPx, SPACING } from "../../ui_primitives";
import AddIcon from "@mui/icons-material/AddOutlined";
import FileDownloadIcon from "@mui/icons-material/FileDownload";
import { CopyButton } from "../../ui_primitives";
import { CopyAssetButton } from "../../common/CopyAssetButton";
import { useNotificationStore } from "../../../stores/NotificationStore";
import { isObjectLike, isString } from "../../../utils/typePredicates";

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
  if (!value || !isObjectLike(value)) {
    return null;
  }

  const obj = value as Record<string, unknown>;
  if (obj.type && obj.uri && isString(obj.uri)) {
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
  const { t } = useTranslation();
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );

  const assetInfo = useMemo(() => getAssetInfo(copyValue), [copyValue]);

  const handleCopyError = useCallback((_err: Error) => {
    addNotification({
      type: "error",
      content: t("i18n-next37.previewActions.copyFailed")
    });
  }, [addNotification, t]);

  return (
    <FlexRow
      className="actions"
      gap={1}
      align="center"
      sx={{
        margin: `0 0 ${getSpacingPx(SPACING.xs)} 0`
      }}
    >
      <Tooltip title={t("i18n-next37.previewActions.download")}>
        <EditorButton
          onClick={onDownload}
          className="action-button download"
          aria-label={t("i18n-next37.previewActions.download")}
        >
          <FileDownloadIcon />
        </EditorButton>
      </Tooltip>
      <Tooltip title={t("i18n-next37.previewActions.addToAssets")}>
        <EditorButton
          onClick={onAddToAssets}
          className="action-button"
          aria-label={t("i18n-next37.previewActions.addToAssets")}
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
          aria-label={t("i18n-next37.previewActions.copyAsset")}
        />
      ) : (
        <CopyButton
          value={copyValue}
          onCopyError={handleCopyError}
          className="action-button copy"
          sx={COPY_BUTTON_SX}
          aria-label={t("i18n-next37.previewActions.copyOutput")}
        />
      )}
    </FlexRow>
  );
});

PreviewActions.displayName = "PreviewActions";

export default PreviewActions;
