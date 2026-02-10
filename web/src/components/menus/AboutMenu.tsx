/** @jsxImportSource @emotion/react */
import React, { useState, useEffect, useCallback } from "react";
import { Typography, Box, CircularProgress, Chip } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CancelIcon from "@mui/icons-material/Cancel";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { VERSION } from "../../config/constants";
import { isElectron } from "../../stores/ApiClient";
import { useNotificationStore } from "../../stores/NotificationStore";
import { FlexRow, Text, Caption } from "../ui_primitives";

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
  pythonVersion: string | null;
  cudaAvailable: boolean;
  cudaVersion: string | null;
  ollamaInstalled: boolean;
  ollamaVersion: string | null;
  llamaServerInstalled: boolean;
  llamaServerVersion: string | null;
}

const InfoRow: React.FC<{
  label: string;
  value: string | null;
  copyable?: boolean;
  onCopy?: (value: string) => void;
}> = ({ label, value, copyable = false, onCopy }) => {
  const theme = useTheme();

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
        padding: "0.5em 0",
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
            fontFamily: "monospace"
          }}
        >
          {value || "N/A"}
        </Text>
        {copyable && value && (
          <ContentCopyIcon
            sx={{
              fontSize: "1em",
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
};

const FeatureStatus: React.FC<{
  label: string;
  available: boolean;
  version?: string | null;
}> = ({ label, available, version }) => {
  const theme = useTheme();

  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "0.5em 0",
        borderBottom: `1px solid ${theme.vars.palette.divider}`,
        "&:last-child": {
          borderBottom: "none"
        }
      }}
    >
      <Typography sx={{ color: theme.vars.palette.text.secondary }}>
        {label}
      </Typography>
      <Box sx={{ display: "flex", alignItems: "center", gap: "0.5em" }}>
        {available ? (
          <>
            <Chip
              icon={<CheckCircleIcon />}
              label={version || "Available"}
              size="small"
              color="success"
              variant="outlined"
              sx={{ fontFamily: "monospace" }}
            />
          </>
        ) : (
          <Chip
            icon={<CancelIcon />}
            label="Not Available"
            size="small"
            color="default"
            variant="outlined"
          />
        )}
      </Box>
    </Box>
  );
};

const AboutMenu: React.FC = () => {
  const theme = useTheme();
  const [systemInfo, setSystemInfo] = useState<SystemInfoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );

  useEffect(() => {
    const fetchSystemInfo = async () => {
      if (!isElectron) {
        // In web browser, just show basic info
        setSystemInfo(null);
        setLoading(false);
        return;
      }

      try {
        const info = await window.api?.settings?.getSystemInfo();
        setSystemInfo(info ?? null);
      } catch (err) {
        setError("Failed to load system information");
        console.error("Failed to fetch system info:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchSystemInfo();
  }, []);

  const handleCopy = useCallback((value: string) => {
    navigator.clipboard.writeText(value);
    addNotification({
      type: "info",
      alert: true,
      content: "Copied to clipboard!"
    });
  }, [addNotification]);

  const handleCopyAll = useCallback(() => {
    if (!systemInfo) {return;}

    const text = `NodeTool System Information
=============================
Version: ${VERSION}
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

Features & Versions
-------------------
Python: ${systemInfo.pythonVersion || "Not available"}
CUDA: ${systemInfo.cudaAvailable ? systemInfo.cudaVersion || "Available" : "Not available"}
Ollama: ${systemInfo.ollamaInstalled ? systemInfo.ollamaVersion || "Installed" : "Not installed"}
Llama Server: ${systemInfo.llamaServerInstalled ? systemInfo.llamaServerVersion || "Installed" : "Not installed"}
`;

    navigator.clipboard.writeText(text);
    addNotification({
      type: "info",
      alert: true,
      content: "System information copied to clipboard!"
    });
  }, [systemInfo, addNotification]);

  if (loading) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          padding: "3em"
        }}
      >
        <CircularProgress size={40} />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ padding: "1em" }}>
        <Typography color="error">{error}</Typography>
      </Box>
    );
  }

  return (
    <Box>
      {/* Application Info */}
      <Typography variant="h3" id="application">
        Application
      </Typography>
      <div className="settings-section">
        <InfoRow label="Version" value={VERSION} />
        {systemInfo && (
          <>
            <InfoRow label="Electron" value={systemInfo.electronVersion} />
            <InfoRow label="Chrome" value={systemInfo.chromeVersion} />
            <InfoRow label="Node.js" value={systemInfo.nodeVersion} />
          </>
        )}
      </div>

      {/* Operating System */}
      <Typography variant="h3" id="operating-system">
        Operating System
      </Typography>
      <div className="settings-section">
        {systemInfo ? (
          <>
            <InfoRow label="OS" value={systemInfo.os} />
            <InfoRow label="Version" value={systemInfo.osVersion} />
            <InfoRow label="Architecture" value={systemInfo.arch} />
          </>
        ) : (
          <>
            <InfoRow label="Platform" value={navigator.platform} />
            <InfoRow label="User Agent" value={navigator.userAgent} />
          </>
        )}
      </div>

      {/* Installation Paths - only show in Electron */}
      {systemInfo && (
        <>
          <Typography variant="h3" id="installation-paths">
            Installation Paths
          </Typography>
          <div className="settings-section">
            <InfoRow
              label="Application"
              value={systemInfo.installPath}
              copyable
              onCopy={handleCopy}
            />
            <InfoRow
              label="Conda Environment"
              value={systemInfo.condaEnvPath}
              copyable
              onCopy={handleCopy}
            />
            <InfoRow
              label="Data"
              value={systemInfo.dataPath}
              copyable
              onCopy={handleCopy}
            />
            <InfoRow
              label="Logs"
              value={systemInfo.logsPath}
              copyable
              onCopy={handleCopy}
            />
          </div>
        </>
      )}

      {/* Features & Versions */}
      {systemInfo && (
        <>
          <Typography variant="h3" id="features">
            Features & Versions
          </Typography>
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
            <FeatureStatus
              label="Llama Server"
              available={systemInfo.llamaServerInstalled}
              version={systemInfo.llamaServerVersion}
            />
          </div>
        </>
      )}

      {/* Copy All Button */}
      {systemInfo && (
        <Box sx={{ marginTop: "1.5em", marginBottom: "1em" }}>
          <Typography
            onClick={handleCopyAll}
            sx={{
              color: "var(--palette-primary-main)",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5em",
              fontSize: theme.fontSizeSmall,
              "&:hover": {
                textDecoration: "underline"
              }
            }}
          >
            <ContentCopyIcon sx={{ fontSize: "1.2em" }} />
            Copy all system information
          </Typography>
        </Box>
      )}

      {/* Links */}
      <Typography variant="h3" id="links">
        Links
      </Typography>
      <div className="settings-section">
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: "0.5em",
            padding: "0.5em 0"
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
            GitHub Repository
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
            NodeTool Forum
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
            Website
          </a>
        </Box>
      </div>
    </Box>
  );
};

export default AboutMenu;
