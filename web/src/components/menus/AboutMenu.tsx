/** @jsxImportSource @emotion/react */
import React, { useState, useEffect, useCallback, memo } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "@mui/material/styles";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CancelIcon from "@mui/icons-material/Cancel";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { VERSION, GIT_COMMIT_HASH, BUILD_NUMBER } from "../../config/constants";
import { isElectron, isProduction } from "../../lib/env";
import { useNotificationStore } from "../../stores/NotificationStore";
import ErrorBanner from "../support/ErrorBanner";
import { FlexRow, FlexColumn, Text, Caption, LoadingSpinner, Chip, Box, getSpacingPx, SPACING } from "../ui_primitives";

// Note: This interface mirrors the SystemInfo type from window.d.ts
// We use a local copy to avoid type export complexity
interface SystemInfoData {
  appVersion: string;
  electronVersion: string;
  chromeVersion: string;
  nodeVersion: string;
  os: string;
  osVersion: string;
  arch: string;
  installPath: string;
  condaEnvPath: string;
  dataPath: string;
  logsPath: string;
  optionalNodePath: string;
  pythonVersion: string | null;
  cudaAvailable: boolean;
  cudaVersion: string | null;
  ollamaInstalled: boolean;
  ollamaVersion: string | null;
}

const InfoRow: React.FC<{
  label: string;
  value: string | null;
  copyable?: boolean;
  onCopy?: (value: string) => void;
}> = memo(({ label, value, copyable = false, onCopy }) => {
  const theme = useTheme();
  const { t } = useTranslation();

  const handleCopy = () => {
    if (value && onCopy) {
      onCopy(value);
    }
  };

  return (
    <FlexRow
      justify="space-between"
      align="flex-start"
      sx={{
        padding: `${getSpacingPx(SPACING.md)} 0`,
        borderBottom: `1px solid ${theme.vars.palette.divider}`,
        "&:last-child": {
          borderBottom: "none"
        }
      }}
    >
      <Caption
        sx={{
          minWidth: "140px",
          flexShrink: 0
        }}
      >
        {label}
      </Caption>
      <FlexRow
        gap={2}
        align="center"
        sx={{
          flex: 1,
          justifyContent: "flex-end",
          textAlign: "right"
        }}
      >
        <Text
          size="small"
          sx={{
            wordBreak: "break-all",
            fontFamily: "var(--fontFamily2)"
          }}
        >
          {value || t("screens4_1.about.notAvailable")}
        </Text>
        {copyable && value && (
          <ContentCopyIcon
            aria-label={t("screens4_1.about.copyValue", { label })}
            title={t("screens4_1.about.copyValue", { label })}
            sx={{
              fontSize: "inherit",
              cursor: "pointer",
              opacity: 0.6,
              "&:hover": {
                opacity: 1
              }
            }}
            onClick={handleCopy}
          />
        )}
      </FlexRow>
    </FlexRow>
  );
});
InfoRow.displayName = "InfoRow";

const FeatureStatus: React.FC<{
  label: string;
  available: boolean;
  version?: string | null;
}> = memo(({ label, available, version }) => {
  const theme = useTheme();
  const { t } = useTranslation();

  return (
    <FlexRow
      justify="space-between"
      align="center"
      sx={{
        padding: `${getSpacingPx(SPACING.md)} 0`,
        borderBottom: `1px solid ${theme.vars.palette.divider}`,
        "&:last-child": {
          borderBottom: "none"
        }
      }}
    >
      <Text color="secondary">
        {label}
      </Text>
      <FlexRow align="center" gap={1}>
        {available ? (
          <>
            <Chip
              icon={<CheckCircleIcon />}
              label={version || t("screens4_1.about.available")}
              size="small"
              color="success"
              variant="outlined"
              sx={{ fontFamily: "var(--fontFamily2)" }}
            />
          </>
        ) : (
          <Chip
            icon={<CancelIcon />}
            label={t("screens4_1.about.notAvailable")}
            size="small"
            color="default"
            variant="outlined"
          />
        )}
      </FlexRow>
    </FlexRow>
  );
});
FeatureStatus.displayName = "FeatureStatus";

const AboutMenu: React.FC = memo(() => {
  const { t } = useTranslation();
  const [systemInfo, setSystemInfo] = useState<SystemInfoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );

  useEffect(() => {
    const fetchSystemInfo = async () => {
      if (!isElectron) {
        setSystemInfo(null);
        setLoading(false);
        return;
      }

      try {
        const info = await window.api?.settings?.getSystemInfo();
        setSystemInfo(info ?? null);
      } catch (err) {
        setError(t("screens4_1.about.loadError"));
        console.error("Failed to fetch system info:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchSystemInfo();
  }, [t]);

  const handleCopy = useCallback(async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      addNotification({
        type: "info",
        alert: true,
        content: t("screens4_1.about.copied")
      });
    } catch (error) {
      console.error("Failed to copy to clipboard:", error);
      addNotification({
        type: "error",
        alert: true,
        content: t("screens4_1.about.copyError")
      });
    }
  }, [addNotification, t]);

  const handleCopyAll = useCallback(async () => {
    if (!systemInfo) {
      return;
    }

    const text = `NodeTool System Information
=============================
Version: ${VERSION}
Git Commit: ${GIT_COMMIT_HASH}
Build: ${BUILD_NUMBER}
${systemInfo.electronVersion ? `Electron: ${systemInfo.electronVersion}` : ""}
${systemInfo.chromeVersion ? `Chrome: ${systemInfo.chromeVersion}` : ""}
${systemInfo.nodeVersion ? `Node.js: ${systemInfo.nodeVersion}` : ""}

Operating System
----------------
OS: ${systemInfo.os}
Version: ${systemInfo.osVersion}
Architecture: ${systemInfo.arch}

Installation Paths
------------------
Application: ${systemInfo.installPath}
Conda Environment: ${systemInfo.condaEnvPath}
Data: ${systemInfo.dataPath}
Logs: ${systemInfo.logsPath}
NPM Packages: ${systemInfo.optionalNodePath}

Features & Versions
-------------------
Python: ${systemInfo.pythonVersion || "Not available"}
CUDA: ${systemInfo.cudaAvailable ? systemInfo.cudaVersion || "Available" : "Not available"}
Ollama: ${systemInfo.ollamaInstalled ? systemInfo.ollamaVersion || "Installed" : "Not installed"}
`;

    try {
      await navigator.clipboard.writeText(text);
      addNotification({
        type: "info",
        alert: true,
        content: t("screens4_1.about.systemInfoCopied")
      });
    } catch (error) {
      console.error("Failed to copy to clipboard:", error);
      addNotification({
        type: "error",
        alert: true,
        content: t("screens4_1.about.systemInfoCopyError")
      });
    }
  }, [systemInfo, addNotification, t]);

  if (loading) {
    return (
      <FlexRow
        justify="center"
        align="center"
        sx={{
          padding: "3em"
        }}
      >
        <LoadingSpinner size="medium" />
      </FlexRow>
    );
  }

  if (error) {
    return (
      <Box sx={{ padding: getSpacingPx(SPACING.xl) }}>
        <ErrorBanner
          report={{
            source: "operation-failure",
            summary: t("screens4_1.about.loadError"),
            errorText: error
          }}
        >
          {error}
        </ErrorBanner>
      </Box>
    );
  }

  return (
    <Box>
      <Text size="big" id="application">
        {t("screens4_1.about.application")}
      </Text>
      <div className="settings-section">
        <InfoRow label={t("screens4_1.about.version")} value={VERSION} />
        <InfoRow
          label={t("screens4_1.about.gitCommit")}
          value={GIT_COMMIT_HASH}
          copyable
          onCopy={handleCopy}
        />
        <InfoRow label={t("screens4_1.about.build")} value={BUILD_NUMBER} />
        {systemInfo && (
          <>
            <InfoRow label="Electron" value={systemInfo.electronVersion} />
            <InfoRow label="Chrome" value={systemInfo.chromeVersion} />
            <InfoRow label="Node.js" value={systemInfo.nodeVersion} />
          </>
        )}
      </div>

      <Text size="big" id="operating-system">
        {t("screens4_1.about.operatingSystem")}
      </Text>
      <div className="settings-section">
        {systemInfo ? (
          <>
            <InfoRow label="OS" value={systemInfo.os} />
            <InfoRow label={t("screens4_1.about.version")} value={systemInfo.osVersion} />
            <InfoRow label={t("screens4_1.about.architecture")} value={systemInfo.arch} />
          </>
        ) : (
          <>
            <InfoRow label={t("screens4_1.about.platform")} value={navigator.platform} />
            <InfoRow label={t("screens4_1.about.userAgent")} value={navigator.userAgent} />
          </>
        )}
      </div>

      {systemInfo && !isProduction && (
        <>
          <Text size="big" id="installation-paths">
            {t("screens4_1.about.installationPaths")}
          </Text>
          <div className="settings-section">
            <InfoRow
              label={t("screens4_1.about.application")}
              value={systemInfo.installPath}
              copyable
              onCopy={handleCopy}
            />
            <InfoRow
              label={t("screens4_1.about.condaEnvironment")}
              value={systemInfo.condaEnvPath}
              copyable
              onCopy={handleCopy}
            />
            <InfoRow
              label={t("screens4_1.about.data")}
              value={systemInfo.dataPath}
              copyable
              onCopy={handleCopy}
            />
            <InfoRow
              label={t("screens4_1.about.logs")}
              value={systemInfo.logsPath}
              copyable
              onCopy={handleCopy}
            />
            <InfoRow
              label={t("screens4_1.about.npmPackages")}
              value={systemInfo.optionalNodePath}
              copyable
              onCopy={handleCopy}
            />
          </div>
        </>
      )}

      {systemInfo && (
        <>
          <Text size="big" id="features">
            {t("screens4_1.about.featuresAndVersions")}
          </Text>
          <div className="settings-section">
            <InfoRow label="Python" value={systemInfo.pythonVersion} />
            <FeatureStatus
              label="CUDA (GPU)"
              available={systemInfo.cudaAvailable}
              version={systemInfo.cudaVersion}
            />
            <FeatureStatus
              label="Ollama"
              available={systemInfo.ollamaInstalled}
              version={systemInfo.ollamaVersion}
            />
          </div>
        </>
      )}

      {systemInfo && (
        <Box sx={{ marginTop: getSpacingPx(SPACING.xxl), marginBottom: getSpacingPx(SPACING.xl) }}>
          <Text
            size="small"
            component="button"
            type="button"
            onClick={handleCopyAll}
            sx={{
              background: "none",
              border: "none",
              padding: 0,
              color: "var(--palette-primary-main)",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: getSpacingPx(SPACING.md),
              "&:hover": {
                textDecoration: "underline"
              }
            }}
          >
            <ContentCopyIcon sx={{ fontSize: "1.2em" }} />
            {t("screens4_1.about.copyAllSystemInfo")}
          </Text>
        </Box>
      )}

      <Text size="big" id="links">
        {t("screens4_1.about.links")}
      </Text>
      <div className="settings-section">
        <FlexColumn
          gap={1}
          sx={{
            padding: `${getSpacingPx(SPACING.md)} 0`
          }}
        >
          <a
            href="https://github.com/nodetool-ai/nodetool"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: "var(--palette-primary-main)",
              textDecoration: "none"
            }}
          >
            {t("screens4_1.about.githubRepository")}
          </a>
          <a
            href="https://forum.nodetool.ai"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: "var(--palette-primary-main)",
              textDecoration: "none"
            }}
          >
            {t("screens4_1.about.forum")}
          </a>
          <a
            href="https://nodetool.ai"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: "var(--palette-primary-main)",
              textDecoration: "none"
            }}
          >
            {t("screens4_1.about.website")}
          </a>
          <a
            href="https://nodetool.ai/privacy"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: "var(--palette-primary-main)",
              textDecoration: "none"
            }}
          >
            {t("screens4_1.about.privacyPolicy")}
          </a>
          <a
            href="https://nodetool.ai/terms"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: "var(--palette-primary-main)",
              textDecoration: "none"
            }}
          >
            {t("screens4_1.about.termsOfUse")}
          </a>
        </FlexColumn>
      </div>
    </Box>
  );
});
AboutMenu.displayName = "AboutMenu";

export default memo(AboutMenu);
