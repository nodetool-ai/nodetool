import React, { useCallback, useEffect, memo, useRef, useState } from "react";
import { Box, Tab, Tabs, IconButton, Tooltip, Typography, keyframes } from "@mui/material";
import ChatIcon from "@mui/icons-material/Chat";
import FolderOutlinedIcon from "@mui/icons-material/FolderOutlined";
import TerminalIcon from "@mui/icons-material/Terminal";
import VisibilityIcon from "@mui/icons-material/Visibility";
import CloseIcon from "@mui/icons-material/Close";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import { useVibeCodingStore } from "../../stores/VibeCodingStore";
import useAgentStore from "../../stores/AgentStore";
import type { ServerStatus } from "../../stores/VibeCodingStore";
import type { WorkspaceResponse } from "../../stores/ApiTypes";
import VibeCodingChat from "./VibeCodingChat";
import VibeCodingPreview from "./VibeCodingPreview";
import VibeCodingFileExplorer from "./VibeCodingFileExplorer";
import VibeCodingServerLogs from "./VibeCodingServerLogs";
import VibeCodingCodeEditor from "./VibeCodingCodeEditor";
import { parseServerLogs } from "./diagnosticParser";

let nextPort = 3100;
function allocatePort(): number {
  return nextPort++;
}

const pulse = keyframes`
  0%   { opacity: 1; }
  50%  { opacity: 0.4; }
  100% { opacity: 1; }
`;

interface VibeCodingPanelProps {
  workspaceId: string | undefined;
  workspacePath: string | undefined;
  workspaces: WorkspaceResponse[] | undefined;
  isLoadingWorkspaces: boolean;
  onWorkspaceChange: (workspaceId: string) => void;
}

const LOG_DRAWER_HEIGHT = 200;

const VibeCodingPanel: React.FC<VibeCodingPanelProps> = ({
  workspaceId,
  workspacePath,
  workspaces,
  isLoadingWorkspaces,
  onWorkspaceChange
}) => {
  const initSession = useVibeCodingStore((s) => s.initSession);
  const setServerStatus = useVibeCodingStore((s) => s.setServerStatus);
  const appendServerLog = useVibeCodingStore((s) => s.appendServerLog);
  const openFileAction = useVibeCodingStore((s) => s.openFile);
  const closeFileAction = useVibeCodingStore((s) => s.closeFile);
  const setActiveTabAction = useVibeCodingStore((s) => s.setActiveTab);
  const updateTabContentAction = useVibeCodingStore((s) => s.updateTabContent);
  const setDiagnosticsAction = useVibeCodingStore((s) => s.setDiagnostics);
  const session = useVibeCodingStore((s) =>
    workspaceId ? s.sessions[workspaceId] ?? null : null
  );

  const portRef = useRef<number>(allocatePort());
  const spawnedRef = useRef<string | null>(null);
  const [leftTab, setLeftTab] = useState(0);
  const [rightTab, setRightTab] = useState<"preview" | "code">("preview");
  const [logsOpen, setLogsOpen] = useState(false);

  const openTabs = session?.openTabs ?? [];
  const activeTabPath = session?.activeTabPath ?? null;
  const diagnostics = session?.diagnostics ?? [];

  const handleFileOpen = useCallback(
    async (filePath: string) => {
      if (!workspaceId || !workspacePath) return;
      // If already open, just switch to it
      const existing = openTabs.find((t) => t.filePath === filePath);
      if (existing) {
        setActiveTabAction(workspaceId, filePath);
        setRightTab("code");
        return;
      }
      try {
        const content = await window.api?.workspace?.file?.read?.(
          workspacePath,
          filePath
        );
        if (content !== undefined) {
          openFileAction(workspaceId, filePath, content ?? "");
          setRightTab("code");
        }
      } catch {
        // Could not read file
      }
    },
    [workspaceId, workspacePath, openTabs, openFileAction, setActiveTabAction]
  );

  const handleTabClose = useCallback(
    (filePath: string) => {
      if (!workspaceId) return;
      closeFileAction(workspaceId, filePath);
      // If no tabs remain, switch back to preview
      const remaining = openTabs.filter((t) => t.filePath !== filePath);
      if (remaining.length === 0) {
        setRightTab("preview");
      }
    },
    [workspaceId, openTabs, closeFileAction]
  );

  const handleTabSelect = useCallback(
    (filePath: string) => {
      if (!workspaceId) return;
      setActiveTabAction(workspaceId, filePath);
    },
    [workspaceId, setActiveTabAction]
  );

  const handleContentChange = useCallback(
    (filePath: string, content: string) => {
      if (!workspaceId) return;
      updateTabContentAction(workspaceId, filePath, content);
    },
    [workspaceId, updateTabContentAction]
  );

  const sendMessage = useAgentStore((s) => s.sendMessage);

  const handleFixWithAI = useCallback(
    (errorLogs: string) => {
      setLeftTab(0); // Switch to chat tab
      sendMessage({
        type: "message",
        name: "",
        role: "user",
        content: [
          {
            type: "text",
            text: `The dev server is showing errors. Please analyze and fix:\n\n\`\`\`\n${errorLogs}\n\`\`\``
          }
        ],
        created_at: new Date().toISOString()
      });
    },
    [sendMessage]
  );

  const serverStatus = session?.serverStatus ?? "stopped";

  // Subscribe to server status-change events pushed from the main process.
  // Also poll current status on mount/workspace-change so a missed one-shot
  // event (fired before this subscription existed) is still caught.
  useEffect(() => {
    if (!workspaceId || !workspacePath || !window.api?.workspace?.server) {return;}

    const srv = window.api.workspace.server;

    const unsub = srv.onStatusChange?.((event) => {
      if (event.workspacePath !== workspacePath) {return;}
      setServerStatus(workspaceId, event.status as ServerStatus, event.port);
    });

    // Check current status immediately in case the ready event already fired.
    srv.status?.(workspacePath).then((s) => {
      if (s?.running) {
        setServerStatus(workspaceId, "running", s.port ?? null);
      }
    }).catch(() => {});

    return unsub ?? undefined;
  }, [workspacePath, workspaceId, setServerStatus]);

  // Fetch TypeScript diagnostics by running `tsc --noEmit` in the workspace.
  // Also parse server logs for runtime errors that tsc can't catch.
  // Re-runs when the server reports compilation events.
  useEffect(() => {
    if (!workspaceId || !workspacePath) return;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const fetchDiagnostics = async () => {
      if (cancelled) return;
      // Get tsc diagnostics from electron backend
      const tscDiags = await window.api?.workspace?.file?.diagnostics?.(workspacePath).catch(() => []) ?? [];
      // Also parse server logs for runtime errors
      const serverLogs = await window.api?.workspace?.server?.logs?.(workspacePath).catch(() => []) ?? [];
      const runtimeDiags = parseServerLogs(serverLogs);
      // Merge: tsc diagnostics + runtime errors (deduped by file+line)
      const seen = new Set<string>();
      const all: typeof tscDiags = [];
      for (const d of tscDiags) {
        const key = `${d.filePath}:${d.line}:${d.column}`;
        if (!seen.has(key)) {
          seen.add(key);
          all.push(d);
        }
      }
      for (const d of runtimeDiags) {
        const key = `${d.filePath}:${d.line}:${d.column}`;
        if (!seen.has(key)) {
          seen.add(key);
          all.push({ filePath: d.filePath, line: d.line, column: d.column, message: d.message, severity: d.severity === "info" ? "warning" : d.severity });
        }
      }
      if (!cancelled) {
        setDiagnosticsAction(workspaceId, all);
      }
    };

    const debouncedFetch = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(fetchDiagnostics, 1000);
    };

    // Fetch immediately on mount
    fetchDiagnostics();

    // Re-fetch when server logs indicate compilation finished
    const unsub = window.api?.workspace?.server?.onLog?.((event) => {
      if (event.workspacePath !== workspacePath) return;
      const lower = event.line.toLowerCase();
      if (
        lower.includes("compiled") ||
        lower.includes("error") ||
        lower.includes("failed") ||
        /^[⨯✖✗×]/.test(event.line)
      ) {
        debouncedFetch();
      }
    });

    return () => {
      cancelled = true;
      unsub?.();
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [workspacePath, workspaceId, setDiagnosticsAction]);

  useEffect(() => {
    if (!workspaceId || !workspacePath) {return;}
    if (spawnedRef.current === workspaceId) {return;}

    // Kill the previous workspace's server before switching.
    if (spawnedRef.current) {
      const prevPath = useVibeCodingStore.getState().sessions[spawnedRef.current]?.workspacePath;
      if (prevPath) {
        window.api?.workspace?.server?.kill?.(prevPath).catch(() => {});
      }
    }

    spawnedRef.current = workspaceId;

    initSession(workspaceId, workspacePath);
    if (!window.api?.workspace?.server) {return;}
    setServerStatus(workspaceId, "starting", null);

    const startServer = async () => {
      try {
        await window.api?.workspace?.server?.ensureInstalled(workspacePath);
        // Fire-and-forget — status updates arrive via onStatusChange event.
        window.api?.workspace?.server?.spawn(workspacePath, portRef.current)
          .catch((err: unknown) => {
            const msg = err instanceof Error ? err.message : String(err);
            appendServerLog(workspaceId, msg);
            setServerStatus(workspaceId, "error", null);
          });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        appendServerLog(workspaceId, msg);
        setServerStatus(workspaceId, "error", null);
      }
    };
    startServer();

    return () => {
      window.api?.workspace?.server?.kill?.(workspacePath).catch(() => {});
    };
  }, [workspaceId, workspacePath, initSession, setServerStatus, appendServerLog]);

  const handleRestart = useCallback(async () => {
    if (!window.api?.workspace?.server || !workspacePath || !workspaceId) {return;}
    setServerStatus(workspaceId, "starting", null);
    try {
      const port = await window.api.workspace.server.respawn(
        workspacePath,
        portRef.current
      );
      setServerStatus(workspaceId, "running", port);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      appendServerLog(workspaceId, msg);
      setServerStatus(workspaceId, "error", null);
    }
  }, [workspaceId, workspacePath, setServerStatus, appendServerLog]);

  const handleAutoFixPort = useCallback(async (port: number) => {
    if (!window.api?.workspace?.server || !workspacePath || !workspaceId) {return;}
    setServerStatus(workspaceId, "starting", null);
    try {
      await window.api.workspace.server.killPort(port);
      const newPort = await window.api.workspace.server.respawn(
        workspacePath,
        portRef.current
      );
      setServerStatus(workspaceId, "running", newPort);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      appendServerLog(workspaceId, msg);
      setServerStatus(workspaceId, "error", null);
    }
  }, [workspaceId, workspacePath, setServerStatus, appendServerLog]);

  const statusDotColor =
    serverStatus === "running"
      ? "#50FA7B"
      : serverStatus === "error"
        ? "#FF5555"
        : serverStatus === "starting"
          ? "#FFB86C"
          : "rgba(255,255,255,0.4)";

  return (
    <Box sx={{ display: "flex", flex: 1, overflow: "hidden" }}>
      {/* ── Left panel: Chat / Files tabs ── */}
      <Box
        sx={{
          width: "35%",
          minWidth: 300,
          maxWidth: 480,
          borderRight: 1,
          borderColor: "divider",
          display: "flex",
          flexDirection: "column",
          bgcolor: "background.paper"
        }}
      >
        <Tabs
          value={leftTab}
          onChange={(_e, v) => setLeftTab(v)}
          variant="fullWidth"
          sx={{
            minHeight: 34,
            borderBottom: 1,
            borderColor: "divider",
            "& .MuiTab-root": {
              minHeight: 34,
              py: 0,
              fontSize: "0.75rem",
              fontWeight: 600,
              textTransform: "none",
              letterSpacing: "0.01em",
              color: "text.secondary",
              "&.Mui-selected": { color: "text.primary" },
              transition: "color 0.15s"
            },
            "& .MuiTabs-indicator": {
              height: 2,
              bgcolor: "primary.main"
            }
          }}
        >
          <Tab
            icon={<ChatIcon sx={{ fontSize: 15 }} />}
            iconPosition="start"
            label="Chat"
            sx={{ gap: "6px" }}
          />
          <Tab
            icon={<FolderOutlinedIcon sx={{ fontSize: 15 }} />}
            iconPosition="start"
            label="Files"
            sx={{ gap: "6px" }}
          />
        </Tabs>

        <Box sx={{ flex: 1, overflow: "hidden", minHeight: 0 }}>
          <Box sx={{ display: leftTab === 0 ? "flex" : "none", flexDirection: "column", height: "100%" }}>
            <VibeCodingChat
              workspaceId={workspaceId}
              workspacePath={workspacePath}
              workspaces={workspaces}
              isLoadingWorkspaces={isLoadingWorkspaces}
              onWorkspaceChange={onWorkspaceChange}
            />
          </Box>
          <Box sx={{ display: leftTab === 1 ? "flex" : "none", flexDirection: "column", height: "100%" }}>
            <VibeCodingFileExplorer workspacePath={workspacePath} onFileOpen={handleFileOpen} />
          </Box>
        </Box>
      </Box>

      {/* ── Right panel: unified tab bar + content + log drawer ── */}
      <Box
        sx={{
          flex: 1,
          minWidth: 400,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden"
        }}
      >
        {/* Unified tab bar: Preview + open file tabs */}
        <Box
          sx={{
            display: "flex",
            alignItems: "stretch",
            minHeight: 34,
            maxHeight: 34,
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            bgcolor: "#181818",
            overflowX: "auto",
            overflowY: "hidden",
            "&::-webkit-scrollbar": { height: 0 }
          }}
        >
          {/* Preview tab */}
          <Box
            onClick={() => setRightTab("preview")}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              px: "12px",
              cursor: "pointer",
              borderRight: "1px solid rgba(255,255,255,0.04)",
              bgcolor: rightTab === "preview" ? "#1e1e1e" : "transparent",
              borderBottom: rightTab === "preview"
                ? "2px solid #569cd6"
                : "2px solid transparent",
              transition: "background-color 0.1s",
              "&:hover": {
                bgcolor: rightTab === "preview" ? "#1e1e1e" : "#252526"
              },
              flexShrink: 0
            }}
          >
            <VisibilityIcon sx={{ fontSize: 14, color: rightTab === "preview" ? "text.primary" : "text.disabled" }} />
            <Typography
              noWrap
              sx={{
                fontSize: "12px",
                fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
                color: rightTab === "preview" ? "text.primary" : "text.disabled",
                lineHeight: 1
              }}
            >
              Preview
            </Typography>
          </Box>

          {/* File tabs */}
          {openTabs.map((tab) => {
            const isActive = rightTab === "code" && tab.filePath === activeTabPath;
            const fileName = tab.filePath.split("/").pop() ?? tab.filePath;
            const tabErrors = diagnostics.filter(
              (d) => tab.filePath.endsWith(d.filePath) || d.filePath.endsWith(tab.filePath)
            );
            const hasErrors = tabErrors.some((d) => d.severity === "error");
            const hasWarnings = !hasErrors && tabErrors.some((d) => d.severity === "warning");
            return (
              <Box
                key={tab.filePath}
                onClick={() => {
                  handleTabSelect(tab.filePath);
                  setRightTab("code");
                }}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  px: "12px",
                  minWidth: 0,
                  maxWidth: 180,
                  cursor: "pointer",
                  borderRight: "1px solid rgba(255,255,255,0.04)",
                  bgcolor: isActive ? "#1e1e1e" : "transparent",
                  borderBottom: isActive
                    ? "2px solid #569cd6"
                    : "2px solid transparent",
                  transition: "background-color 0.1s",
                  "&:hover": {
                    bgcolor: isActive ? "#1e1e1e" : "#252526"
                  },
                  "&:hover .tab-close": {
                    opacity: 1
                  },
                  flexShrink: 0
                }}
              >
                <Typography
                  noWrap
                  sx={{
                    fontSize: "12px",
                    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
                    color: hasErrors
                      ? "#FF5555"
                      : hasWarnings
                        ? "#FFB86C"
                        : isActive
                          ? "text.primary"
                          : "text.disabled",
                    lineHeight: 1,
                    flex: 1,
                    minWidth: 0
                  }}
                >
                  {fileName}
                </Typography>
                <IconButton
                  className="tab-close"
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleTabClose(tab.filePath);
                  }}
                  sx={{
                    p: "2px",
                    opacity: isActive ? 0.6 : 0,
                    transition: "opacity 0.1s",
                    "&:hover": { opacity: 1 }
                  }}
                >
                  <CloseIcon sx={{ fontSize: 12 }} />
                </IconButton>
              </Box>
            );
          })}
        </Box>

        {/* Content area */}
        <Box sx={{ flex: 1, overflow: "hidden", minHeight: 0 }}>
          <Box sx={{ display: rightTab === "preview" ? "flex" : "none", flexDirection: "column", height: "100%" }}>
            <VibeCodingPreview
              port={session?.port ?? null}
              serverStatus={serverStatus}
              serverLogs={session?.serverLogs ?? []}
              onRestart={handleRestart}
            />
          </Box>
          <Box sx={{ display: rightTab === "code" ? "flex" : "none", flexDirection: "column", height: "100%" }}>
            {workspacePath && activeTabPath && (() => {
              const activeTab = openTabs.find((t) => t.filePath === activeTabPath);
              return activeTab ? (
                <VibeCodingCodeEditor
                  filePath={activeTab.filePath}
                  content={activeTab.content}
                  workspacePath={workspacePath}
                  diagnostics={diagnostics}
                  onContentChange={handleContentChange}
                />
              ) : null;
            })()}
          </Box>
        </Box>

        {/* Log drawer toggle bar */}
        <Box
          onClick={() => setLogsOpen((prev) => !prev)}
          sx={{
            display: "flex",
            alignItems: "center",
            borderTop: 1,
            borderColor: "divider",
            bgcolor: "background.paper",
            cursor: "pointer",
            px: "12px",
            minHeight: 28,
            transition: "background-color 0.15s",
            "&:hover": { bgcolor: "rgba(255,255,255,0.02)" }
          }}
        >
          <TerminalIcon
            sx={{ fontSize: 13, color: "text.disabled", mr: "6px" }}
          />
          <Box
            sx={{
              fontSize: "0.65rem",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: "text.disabled",
              flex: 1
            }}
          >
            Logs
          </Box>
          <Box
            sx={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              bgcolor: statusDotColor,
              mr: "8px",
              animation:
                serverStatus === "starting"
                  ? `${pulse} 2s ease-in-out infinite`
                  : "none"
            }}
          />
          <Tooltip title={logsOpen ? "Collapse" : "Expand"}>
            <IconButton size="small" sx={{ p: "2px" }}>
              {logsOpen ? (
                <KeyboardArrowDownIcon sx={{ fontSize: 15 }} />
              ) : (
                <KeyboardArrowUpIcon sx={{ fontSize: 15 }} />
              )}
            </IconButton>
          </Tooltip>
        </Box>

        {logsOpen && (
          <Box
            sx={{
              height: LOG_DRAWER_HEIGHT,
              borderTop: 1,
              borderColor: "divider",
              overflow: "hidden"
            }}
          >
            <VibeCodingServerLogs
              workspacePath={workspacePath}
              serverStatus={serverStatus}
              onAutoFix={handleAutoFixPort}
              onFixWithAI={handleFixWithAI}
            />
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default memo(VibeCodingPanel);
