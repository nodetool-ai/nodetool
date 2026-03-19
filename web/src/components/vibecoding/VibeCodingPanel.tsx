import React, { useCallback, useEffect, memo, useRef } from "react";
import { Box } from "@mui/material";
import { useVibeCodingStore } from "../../stores/VibeCodingStore";
import VibeCodingChat from "./VibeCodingChat";
import VibeCodingPreview from "./VibeCodingPreview";

let nextPort = 3100;
function allocatePort(): number {
  return nextPort++;
}

interface VibeCodingPanelProps {
  workspaceId: string;
  workspacePath: string;
}

const VibeCodingPanel: React.FC<VibeCodingPanelProps> = ({
  workspaceId,
  workspacePath
}) => {
  const initSession = useVibeCodingStore((s) => s.initSession);
  const setServerStatus = useVibeCodingStore((s) => s.setServerStatus);
  const appendServerLog = useVibeCodingStore((s) => s.appendServerLog);
  const getSession = useVibeCodingStore((s) => s.getSession);
  const session = getSession(workspaceId);

  const portRef = useRef<number>(allocatePort());
  const spawnedRef = useRef(false);

  useEffect(() => {
    if (spawnedRef.current) return;
    spawnedRef.current = true;

    initSession(workspaceId, workspacePath);

    if (!window.api?.workspace?.server || !workspacePath) return;

    setServerStatus(workspaceId, "starting", null);

    const startServer = async () => {
      try {
        await window.api.workspace.server.ensureInstalled(workspacePath);
        const port = await window.api.workspace.server.spawn(
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, workspacePath]);

  const handleRestart = useCallback(async () => {
    if (!window.api?.workspace?.server || !workspacePath) return;
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

  return (
    <Box sx={{ display: "flex", flex: 1, overflow: "hidden" }}>
      <Box
        sx={{
          width: "35%",
          minWidth: 300,
          borderRight: 1,
          borderColor: "divider",
          display: "flex",
          flexDirection: "column",
          bgcolor: "background.paper"
        }}
      >
        <VibeCodingChat workspaceId={workspaceId} workspacePath={workspacePath} />
      </Box>
      <Box
        sx={{
          flex: 1,
          minWidth: 400,
          display: "flex",
          flexDirection: "column",
          bgcolor: "background.default"
        }}
      >
        <VibeCodingPreview
          port={session.port}
          serverStatus={session.serverStatus}
          serverLogs={session.serverLogs}
          onRestart={handleRestart}
        />
      </Box>
    </Box>
  );
};

export default memo(VibeCodingPanel);
