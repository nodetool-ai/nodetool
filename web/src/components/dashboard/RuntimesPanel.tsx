/** @jsxImportSource @emotion/react */
import React, { useState, useEffect, useCallback, memo } from "react";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import DownloadIcon from "@mui/icons-material/Download";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import { css } from "@emotion/react";
import { useTheme, Theme } from "@mui/material/styles";
import { getIsElectronDetails } from "../../utils/browser";
import { FlexColumn, FlexRow, Card, Text, Caption, LoadingSpinner, AlertBanner, Tooltip, EditorButton } from "../ui_primitives";
import { trpc } from "../../trpc/client";
import log from "loglevel";

interface RuntimeStatus {
  id: string;
  name: string;
  description: string;
  installed: boolean;
  installing: boolean;
}

interface SandboxStatus {
  container_id: string;
  name: string;
  status: string;
  status_text: string;
  age_seconds: number;
  cpu_percent: number | null;
  memory_usage_bytes: number | null;
  memory_limit_bytes: number | null;
  vnc_http_url: string | null;
  vnc_ws_url: string | null;
}

interface SandboxToolCall {
  id: string;
  timestamp: string | null;
  tool_name: string | null;
  message: string;
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

function formatAge(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"] as const;
const EMPTY_SANDBOXES: SandboxStatus[] = [];
const SANDBOX_LIST_REFETCH_INTERVAL_MS = 10_000;
const SANDBOX_TOOL_CALLS_REFETCH_INTERVAL_MS = 5_000;
const VNC_IFRAME_HEIGHT_PX = 320;
const TOOL_CALLS_MAX_HEIGHT_PX = 220;

function formatBytes(bytes: number | null): string {
  if (bytes === null) return "—";
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < BYTE_UNITS.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(index === 0 ? 0 : 1)} ${BYTE_UNITS[index]}`;
}

function isSafeVncUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const isHttp = parsed.protocol === "http:" || parsed.protocol === "https:";
    const isLocalHost =
      parsed.hostname === "127.0.0.1" ||
      parsed.hostname === "localhost" ||
      parsed.hostname === "::1";
    return isHttp && isLocalHost;
  } catch {
    return false;
  }
}

const RuntimesPanel: React.FC = () => {
  const theme = useTheme();
  const { isElectron } = getIsElectronDetails();
  const [selectedSandboxId, setSelectedSandboxId] = useState<string | null>(null);
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

  const sandboxesQuery = trpc.sandboxes.list.useQuery(undefined, {
    refetchInterval: SANDBOX_LIST_REFETCH_INTERVAL_MS,
    enabled: !isElectron
  });
  const pauseSandbox = trpc.sandboxes.pause.useMutation({
    onSuccess: async () => {
      await sandboxesQuery.refetch();
    }
  });
  const resumeSandbox = trpc.sandboxes.resume.useMutation({
    onSuccess: async () => {
      await sandboxesQuery.refetch();
    }
  });
  const killSandbox = trpc.sandboxes.kill.useMutation({
    onSuccess: async () => {
      await sandboxesQuery.refetch();
    }
  });

  const sandboxes = sandboxesQuery.data ?? EMPTY_SANDBOXES;
  const selectedSandbox =
    sandboxes.find((sandbox) => sandbox.container_id === selectedSandboxId) ?? null;

  useEffect(() => {
    if (
      !isElectron &&
      sandboxes.length > 0 &&
      !sandboxes.some((sandbox) => sandbox.container_id === selectedSandboxId)
    ) {
      setSelectedSandboxId(sandboxes[0].container_id);
      return;
    }
    if (!isElectron && sandboxes.length === 0 && selectedSandboxId !== null) {
      setSelectedSandboxId(null);
      return;
    }
  }, [isElectron, sandboxes, selectedSandboxId]);

  const toolCallsQuery = trpc.sandboxes.toolCalls.useQuery(
    {
      container_id: selectedSandboxId ?? "",
      limit: 80
    },
    {
      enabled: !isElectron && Boolean(selectedSandboxId),
      refetchInterval: SANDBOX_TOOL_CALLS_REFETCH_INTERVAL_MS
    }
  );
  const toolCalls = toolCallsQuery.data ?? [];

  if (!isElectron) {
    const actionPending =
      pauseSandbox.isPending || resumeSandbox.isPending || killSandbox.isPending;
    const validVncHttpUrl =
      selectedSandbox?.vnc_http_url && isSafeVncUrl(selectedSandbox.vnc_http_url)
        ? selectedSandbox.vnc_http_url
        : null;
    const vncIframeUrl = validVncHttpUrl
      ? `${validVncHttpUrl}/vnc.html?autoconnect=1&resize=scale&path=websockify`
      : null;

    return (
      <FlexColumn gap={0} padding={4} fullHeight css={panelStyles(theme)}>
        <FlexRow gap={3} align="center" justify="space-between" className="panel-header">
          <Text size="big" weight={600}>Runtimes</Text>
          <Caption size="small">
            {sandboxesQuery.isLoading ? "Loading..." : `${sandboxes.length} active`}
          </Caption>
        </FlexRow>
        {sandboxesQuery.isError && (
          <AlertBanner severity="error" sx={{ mt: 2 }}>
            Failed to load sandbox status
          </AlertBanner>
        )}
        <FlexColumn className="scrollable-content" sx={{ mt: 2 }}>
          {sandboxesQuery.isLoading ? (
            <FlexRow justify="center" sx={{ py: 4 }}>
              <LoadingSpinner size="small" />
            </FlexRow>
          ) : (
            <FlexColumn gap={2}>
              {sandboxes.length === 0 && (
                <Caption size="small">No active sandboxes.</Caption>
              )}
              {sandboxes.map((sandbox) => {
                const isSelected = sandbox.container_id === selectedSandboxId;
                return (
                  <Card
                    key={sandbox.container_id}
                    variant="outlined"
                    padding="normal"
                    sx={{
                      borderColor: isSelected ? "primary.main" : undefined
                    }}
                  >
                    <FlexColumn gap={2}>
                      <FlexRow
                        align="center"
                        justify="space-between"
                        sx={{ cursor: "pointer" }}
                        onClick={() => setSelectedSandboxId(sandbox.container_id)}
                      >
                        <FlexColumn gap={0.5}>
                          <Text size="normal" weight={600}>
                            {sandbox.name}
                          </Text>
                          <Caption size="small">{sandbox.status_text}</Caption>
                        </FlexColumn>
                        <FlexRow gap={2}>
                          <Caption size="small">Age: {formatAge(sandbox.age_seconds)}</Caption>
                          <Caption size="small">
                            CPU:{" "}
                            {sandbox.cpu_percent === null
                              ? "—"
                              : `${sandbox.cpu_percent.toFixed(2)}%`}
                          </Caption>
                          <Caption size="small">
                            RAM: {formatBytes(sandbox.memory_usage_bytes)}
                            {sandbox.memory_limit_bytes !== null
                              ? ` / ${formatBytes(sandbox.memory_limit_bytes)}`
                              : ""}
                          </Caption>
                        </FlexRow>
                      </FlexRow>
                      <FlexRow gap={2} sx={{ flexWrap: "wrap" }}>
                        <EditorButton
                          density="compact"
                          variant="outlined"
                          disabled={actionPending || sandbox.status === "paused"}
                          onClick={() =>
                            pauseSandbox.mutate({ container_id: sandbox.container_id })
                          }
                        >
                          Pause
                        </EditorButton>
                        <EditorButton
                          density="compact"
                          variant="outlined"
                          disabled={actionPending || sandbox.status !== "paused"}
                          onClick={() =>
                            resumeSandbox.mutate({ container_id: sandbox.container_id })
                          }
                        >
                          Resume
                        </EditorButton>
                        <EditorButton
                          density="compact"
                          variant="outlined"
                          disabled={actionPending}
                          onClick={() =>
                            killSandbox.mutate({ container_id: sandbox.container_id })
                          }
                        >
                          Kill
                        </EditorButton>
                        {sandbox.vnc_http_url && isSafeVncUrl(sandbox.vnc_http_url) && (
                          <EditorButton
                            density="compact"
                            variant="text"
                            onClick={() =>
                              window.open(
                                `${sandbox.vnc_http_url}/vnc.html?autoconnect=1&resize=scale&path=websockify`,
                                "_blank",
                                "noopener,noreferrer"
                              )
                            }
                          >
                            Open VNC
                          </EditorButton>
                        )}
                      </FlexRow>
                    </FlexColumn>
                  </Card>
                );
              })}
              {selectedSandbox && (
                <Card variant="outlined" padding="normal">
                  <FlexColumn gap={2}>
                    <Text size="normal" weight={600}>
                      Sandbox Live View
                    </Text>
                    {vncIframeUrl ? (
                      // noVNC requires scripts; URL is loopback-validated in isSafeVncUrl/vncIframeUrl.
                      <iframe
                        title={`Live VNC view for sandbox: ${selectedSandbox.name}`}
                        src={vncIframeUrl}
                        sandbox="allow-scripts"
                        css={{
                          width: "100%",
                          height: VNC_IFRAME_HEIGHT_PX,
                          border: `1px solid ${theme.vars.palette.grey[700]}`,
                          borderRadius: "6px",
                          backgroundColor: "black"
                        }}
                      />
                    ) : (
                      <Caption size="small">VNC is not available for this sandbox.</Caption>
                    )}
                    <FlexColumn gap={1}>
                      <Text size="normal" weight={600}>
                        Tool Calls
                      </Text>
                      {toolCallsQuery.isLoading ? (
                        <LoadingSpinner size="small" />
                      ) : toolCalls.length === 0 ? (
                        <Caption size="small">No tool calls yet.</Caption>
                      ) : (
                        <FlexColumn
                          sx={{
                            maxHeight: TOOL_CALLS_MAX_HEIGHT_PX,
                            overflow: "auto",
                            border: `1px solid ${theme.vars.palette.grey[700]}`,
                            borderRadius: "6px",
                            p: 1
                          }}
                        >
                          <FlexColumn gap={0.75}>
                            {toolCalls.map((call) => (
                              <Caption key={call.id} size="small">
                                {call.timestamp ? `[${call.timestamp}] ` : ""}
                                {call.tool_name ? `${call.tool_name}: ` : ""}
                                {call.message}
                              </Caption>
                            ))}
                          </FlexColumn>
                        </FlexColumn>
                      )}
                    </FlexColumn>
                  </FlexColumn>
                </Card>
              )}
            </FlexColumn>
          )}
        </FlexColumn>
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

      <FlexColumn className="scrollable-content" sx={{ mt: 2 }}>
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
                    <FlexRow sx={{ flexShrink: 0 }}>
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
                    </FlexRow>
                  </FlexRow>
                </Card>
              );
            })}
          </FlexColumn>
        )}
      </FlexColumn>
    </FlexColumn>
  );
};

export default memo(RuntimesPanel);
