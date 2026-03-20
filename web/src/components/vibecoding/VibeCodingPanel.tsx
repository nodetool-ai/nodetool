import React, { useCallback, useEffect, memo, useRef, useState } from "react";
import { Box, Tab, Tabs, IconButton, Tooltip, keyframes } from "@mui/material";
import ChatIcon from "@mui/icons-material/Chat";
import FolderOutlinedIcon from "@mui/icons-material/FolderOutlined";
import TerminalIcon from "@mui/icons-material/Terminal";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import { useVibeCodingStore } from "../../stores/VibeCodingStore";
import type { WorkspaceResponse } from "../../stores/ApiTypes";
import VibeCodingChat from "./VibeCodingChat";
import VibeCodingPreview from "./VibeCodingPreview";
import VibeCodingFileExplorer from "./VibeCodingFileExplorer";
import VibeCodingServerLogs from "./VibeCodingServerLogs";

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
  const getSession = useVibeCodingStore((s) => s.getSession);
  const session = workspaceId ? getSession(workspaceId) : null;

  const portRef = useRef<number>(allocatePort());
  const spawnedRef = useRef<string | null>(null);
  const [leftTab, setLeftTab] = useState(0);
  const [logsOpen, setLogsOpen] = useState(false);

  const serverStatus = session?.serverStatus ?? "stopped";

  useEffect(() => {
    if (!workspaceId || !workspacePath) {return;}
    if (spawnedRef.current === workspaceId) {return;}
    spawnedRef.current = workspaceId;

    initSession(workspaceId, workspacePath);
    if (!window.api?.workspace?.server) {return;}
    setServerStatus(workspaceId, "starting", null);

    const startServer = async () => {
      try {
        await window.api?.workspace?.server?.ensureInstalled(workspacePath);
        const port = await window.api?.workspace?.server?.spawn(
          workspacePath,
          portRef.current
        );
        setServerStatus(workspaceId, "running", port);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        appendServerLog(workspaceId, msg);
        setServerStatus(workspaceId, "error", null);
      }
    };
    startServer();
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

        <Box sx={{ flex: 1, overflow: "hidden" }}>
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
            <VibeCodingFileExplorer workspacePath={workspacePath} />
          </Box>
        </Box>
      </Box>

      {/* ── Right panel: Preview + Log drawer ── */}
      <Box
        sx={{
          flex: 1,
          minWidth: 400,
          display: "flex",
          flexDirection: "column"
        }}
      >
        <Box sx={{ flex: 1, overflow: "hidden" }}>
          <VibeCodingPreview
            port={session?.port ?? null}
            serverStatus={serverStatus}
            serverLogs={session?.serverLogs ?? []}
            onRestart={handleRestart}
          />
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
            />
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default memo(VibeCodingPanel);
