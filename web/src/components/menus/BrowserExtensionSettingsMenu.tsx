/** @jsxImportSource @emotion/react */
import { memo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "@mui/material/styles";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DownloadIcon from "@mui/icons-material/Download";
import LinkIcon from "@mui/icons-material/Link";
import ErrorBanner from "../support/ErrorBanner";
import { Text, FlexRow, FlexColumn, NavButton, Chip, getSpacingPx, SPACING } from "../ui_primitives";
import { getSharedSettingsStyles } from "./settingsMenuStyles";
import { useNotificationStore } from "../../stores/NotificationStore";
import {
  useExtensionStatus,
  useInstallExtensionHost
} from "../../serverState/useExtensionStatus";
import { BASE_URL } from "../../stores/BASE_URL";

const CHROME_EXTENSIONS_URL = "chrome://extensions";

async function copyText(text: string): Promise<void> {
  if (window.api?.clipboard?.writeText) {
    await window.api.clipboard.writeText(text);
    return;
  }
  await navigator.clipboard.writeText(text);
}

const BrowserExtensionSettingsMenu = () => {
  const { t } = useTranslation();
  const theme = useTheme();
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );

  const { status: data, isLoading } = useExtensionStatus();
  const host = useInstallExtensionHost();

  const connected = data?.connected ?? false;
  const distPath = data?.distPath ?? "";
  const distExists = data?.distExists ?? false;
  const canReveal = Boolean(distExists && window.api?.showItemInFolder);
  const downloadUrl = `${BASE_URL}/api/extension/download`;

  const handleReveal = useCallback(() => {
    if (distPath && window.api?.showItemInFolder) {
      void window.api.showItemInFolder(distPath);
    }
  }, [distPath]);

  const handleCopy = useCallback(
    async (text: string, what: string) => {
      try {
        await copyText(text);
        addNotification({
          type: "success",
          alert: true,
          content: t("screens4_1.browserExtension.copied", { item: what })
        });
      } catch {
        addNotification({
          type: "error",
          alert: true,
          content: t("screens4_1.browserExtension.copyError", { item: what })
        });
      }
    },
    [addNotification, t]
  );

  return (
    <div
      className="remote-settings-content"
      css={getSharedSettingsStyles(theme)}
    >
      <div className="settings-main-content">
        <Text className="description" sx={{ mb: 1 }}>
          {t("screens4_1.browserExtension.description")}
        </Text>

        <FlexRow gap={1} sx={{ alignItems: "center", mb: 1 }}>
          <Chip
            icon={
              connected ? (
                <CheckCircleIcon fontSize="small" />
              ) : (
                <RadioButtonUncheckedIcon fontSize="small" />
              )
            }
            label={
              isLoading
                ? t("screens4_1.browserExtension.checking")
                : connected
                  ? t("screens4_1.browserExtension.connected")
                  : t("screens4_1.browserExtension.notConnected")
            }
            color={connected ? "success" : "default"}
          />
          {!connected && !isLoading && (
            <Text size="small" sx={{ opacity: 0.7 }}>
              {t("screens4_1.browserExtension.installHint")}
            </Text>
          )}
        </FlexRow>

        <FlexColumn gap={0.5} sx={{ mb: 1.5 }}>
          {Array.from({ length: 6 }, (_, i) => t(`screens4_1.browserExtension.steps.${i + 1}`)).map((step, i) => (
            <Text key={i} size="small">
              {i + 1}. {step}
            </Text>
          ))}
        </FlexColumn>

        {host.error && (
          <ErrorBanner
            sx={{ mb: SPACING.sm }}
            report={{
              source: "operation-failure",
              summary: t("screens4_1.browserExtension.registrationFailed"),
              errorText: host.error
            }}
          >
            {host.error}
          </ErrorBanner>
        )}

        <FlexRow gap={1} sx={{ flexWrap: "wrap" }}>
          {!isLoading && !data?.hostInstalled && (
            <NavButton
              icon={<LinkIcon />}
              label={host.isInstalling ? t("screens4_1.browserExtension.connecting") : t("screens4_1.browserExtension.connectToChrome")}
              color="primary"
              onClick={() => host.install()}
              disabled={host.isInstalling}
              navSize="small"
              sx={{ padding: `${getSpacingPx(SPACING.xs)} ${getSpacingPx(SPACING.xl)}`, minWidth: "unset" }}
            />
          )}
          <NavButton
            icon={<DownloadIcon />}
            label={t("screens4_1.browserExtension.downloadExtension")}
            color="primary"
            onClick={() => window.open(downloadUrl, "_blank")}
            navSize="small"
            sx={{ padding: `${getSpacingPx(SPACING.xs)} ${getSpacingPx(SPACING.xl)}`, minWidth: "unset" }}
          />
          {canReveal ? (
            <NavButton
              icon={<FolderOpenIcon />}
              label={t("screens4_1.browserExtension.revealBuildFolder")}
              onClick={handleReveal}
              navSize="small"
              sx={{ padding: `${getSpacingPx(SPACING.xs)} ${getSpacingPx(SPACING.xl)}`, minWidth: "unset" }}
            />
          ) : (
            distExists && (
              <NavButton
                icon={<ContentCopyIcon />}
                label={t("screens4_1.browserExtension.copyBuildPath")}
                onClick={() => handleCopy(distPath, t("screens4_1.browserExtension.buildPath"))}
                navSize="small"
                sx={{ padding: `${getSpacingPx(SPACING.xs)} ${getSpacingPx(SPACING.xl)}`, minWidth: "unset" }}
              />
            )
          )}
          <NavButton
            icon={<ContentCopyIcon />}
            label={t("screens4_1.browserExtension.copyExtensionsUrl")}
            onClick={() => handleCopy(CHROME_EXTENSIONS_URL, CHROME_EXTENSIONS_URL)}
            navSize="small"
            sx={{ padding: `${getSpacingPx(SPACING.xs)} ${getSpacingPx(SPACING.xl)}`, minWidth: "unset" }}
          />
        </FlexRow>

        {distExists && (
          <Text
            size="small"
            sx={{
              mt: 1,
              fontFamily: "var(--fontFamily2)",
              opacity: 0.7,
              wordBreak: "break-all"
            }}
          >
            {distPath}
          </Text>
        )}
      </div>
    </div>
  );
};

export default memo(BrowserExtensionSettingsMenu);
