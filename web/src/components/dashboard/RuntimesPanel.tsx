/** @jsxImportSource @emotion/react */
import React, { useState, useEffect, useCallback, memo } from "react";
import { Box } from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import DownloadIcon from "@mui/icons-material/Download";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import { css } from "@emotion/react";
import { useTheme, Theme } from "@mui/material/styles";
import { getIsElectronDetails } from "../../utils/browser";
import { FlexColumn, FlexRow, Card, Text, Caption, LoadingSpinner, AlertBanner, Tooltip, EditorButton } from "../ui_primitives";
import log from "loglevel";

interface RuntimeStatus {
  id: string;
  name: string;
  description: string;
  installed: boolean;
  installing: boolean;
}

const panelStyles = (theme: Theme) =>
  css({
    "&": {
      height: "100%",
    },
    ".panel-header": {
      paddingBottom: "0.75em",
      borderBottom: `1px solid ${theme.vars.palette.grey[700]}`,
    },
    ".scrollable-content": {
      flex: 1,
      overflowY: "auto",
      overflowX: "hidden",
    },
    ".runtime-card": {
      transition: "all 0.2s ease",
    },
    ".runtime-card.installed": {
      borderColor: theme.vars.palette.success.main,
      opacity: 0.85,
    },
    ".runtime-card:hover:not(.installed)": {
      borderColor: theme.vars.palette.grey[600],
      backgroundColor: theme.vars.palette.grey[850],
    },
    ".location-bar": {
      padding: "8px 12px",
      borderRadius: "var(--rounded-md)",
      backgroundColor: `color-mix(in srgb, ${theme.vars.palette.grey[800]} 50%, transparent)`,
      border: `1px solid ${theme.vars.palette.grey[700]}`,
    },
    ".location-path": {
      flex: 1,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap" as const,
      fontFamily: "monospace",
      fontSize: "0.8em",
      color: theme.vars.palette.grey[400],
    },
  });

const RuntimesPanel: React.FC = () => {
  const theme = useTheme();
  const { isElectron } = getIsElectronDetails();
  const [runtimes, setRuntimes] = useState<RuntimeStatus[]>([]);
  const [installLocation, setInstallLocation] = useState("");
  const [installing, setInstalling] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStatuses = useCallback(async () => {
    const api = window.api;
    if (!api?.packages?.getRuntimeStatuses) {return;}
    try {
      const [statuses, location] = await Promise.all([
        api.packages.getRuntimeStatuses(),
        api.packages.getInstallLocation?.() ?? "",
      ]);
      setRuntimes(statuses);
      setInstallLocation(location);
    } catch (err) {
      log.error("Failed to load runtime statuses:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatuses();
  }, [loadStatuses]);

  const handleInstall = useCallback(
    async (packageId: string) => {
      const api = window.api;
      if (!api?.packages?.installRuntime) {return;}

      setInstalling((prev) => new Set(prev).add(packageId));
      setError(null);
      try {
        const location = installLocation || undefined;
        const result = await api.packages.installRuntime(packageId, location);
        if (result.success) {
          await loadStatuses();
        } else {
          setError(result.message || "Installation failed");
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Installation failed";
        setError(errorMessage);
      } finally {
        setInstalling((prev) => {
          const next = new Set(prev);
          next.delete(packageId);
          return next;
        });
      }
    },
    [loadStatuses, installLocation]
  );

  const handleChangeLocation = useCallback(async () => {
    const api = window.api;
    if (!api?.packages?.selectInstallLocation) {return;}
    try {
      const selected = await api.packages.selectInstallLocation();
      if (selected) {setInstallLocation(selected);}
    } catch (err) {
      log.error("Failed to select location:", err);
    }
  }, []);

  if (!isElectron) {
    return (
      <FlexColumn gap={0} padding={4} fullHeight css={panelStyles(theme)}>
        <FlexRow gap={3} align="center" className="panel-header">
          <Text size="big" weight={600}>Runtimes</Text>
        </FlexRow>
        <Box sx={{ mt: 2, px: 1 }}>
          <Caption size="small">
            Runtime management is available in the desktop app.
          </Caption>
        </Box>
      </FlexColumn>
    );
  }

  const installedCount = runtimes.filter((r) => r.installed).length;

  return (
    <FlexColumn
      gap={0}
      padding={4}
      fullHeight
      css={panelStyles(theme)}
      className="runtimes-panel"
    >
      <FlexColumn gap={2} className="panel-header">
        <FlexRow gap={3} align="center" justify="space-between">
          <Text size="big" weight={600}>
            Runtimes
          </Text>
          <Caption size="small">
            {loading
              ? "Loading..."
              : `${installedCount}/${runtimes.length} installed`}
          </Caption>
        </FlexRow>
        {installLocation && (
          <FlexRow
            gap={2}
            align="center"
            className="location-bar"
          >
            <FolderOpenIcon
              sx={{ fontSize: "1rem", color: theme.vars.palette.grey[500] }}
            />
            <Tooltip title={installLocation} arrow>
              <span className="location-path">{installLocation}</span>
            </Tooltip>
            <EditorButton
              variant="text"
              onClick={handleChangeLocation}
              density="compact"
              sx={{ minWidth: "auto", fontSize: "0.75rem", whiteSpace: "nowrap" }}
            >
              Change
            </EditorButton>
          </FlexRow>
        )}
      </FlexColumn>

      {error && (
        <AlertBanner
          severity="error"
          onClose={() => setError(null)}
          sx={{ mt: 1, mb: 1 }}
        >
          {error}
        </AlertBanner>
      )}

      <Box className="scrollable-content" sx={{ mt: 2 }}>
        {loading ? (
          <FlexRow justify="center" sx={{ py: 4 }}>
            <LoadingSpinner size="small" />
          </FlexRow>
        ) : (
          <FlexColumn gap={3}>
            {runtimes.map((rt) => {
              const isInstalling = installing.has(rt.id) || rt.installing;

              return (
                <Card
                  key={rt.id}
                  variant="outlined"
                  padding="normal"
                  className={`runtime-card ${rt.installed ? "installed" : ""}`}
                >
                  <FlexRow gap={3} align="center">
                    <FlexColumn gap={0.5} sx={{ flex: 1, minWidth: 0 }}>
                      <FlexRow gap={2} align="center">
                        <Text size="normal" weight={500}>
                          {rt.name}
                        </Text>
                        {rt.installed && (
                          <CheckCircleIcon
                            sx={{
                              color: "success.main",
                              fontSize: "1rem",
                            }}
                          />
                        )}
                      </FlexRow>
                      <Caption size="small">{rt.description}</Caption>
                    </FlexColumn>
                    <Box sx={{ flexShrink: 0 }}>
                      {rt.installed ? (
                        <Tooltip title="Installed">
                          <CheckCircleIcon
                            sx={{
                              color: "success.main",
                              fontSize: "1.25rem",
                            }}
                          />
                        </Tooltip>
                      ) : (
                        <EditorButton
                          variant="outlined"
                          startIcon={
                            isInstalling ? (
                              <LoadingSpinner size="small" />
                            ) : (
                              <DownloadIcon />
                            )
                          }
                          onClick={() => handleInstall(rt.id)}
                          disabled={isInstalling}
                          density="compact"
                        >
                          {isInstalling ? "Installing..." : "Install"}
                        </EditorButton>
                      )}
                    </Box>
                  </FlexRow>
                </Card>
              );
            })}
          </FlexColumn>
        )}
      </Box>
    </FlexColumn>
  );
};

export default memo(RuntimesPanel);
