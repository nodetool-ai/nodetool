/** @jsxImportSource @emotion/react */
import React, { useCallback, useEffect, useMemo, memo, useRef } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import { Box, Typography } from "@mui/material";
import { CloseButton } from "../ui_primitives";
import { Workflow } from "../../stores/ApiTypes";
import { useVibeCodingStore } from "../../stores/VibeCodingStore";
import VibeCodingChat from "./VibeCodingChat";
import VibeCodingPreview from "./VibeCodingPreview";
import type { Theme } from "@mui/material/styles";
import log from "loglevel";

const createStyles = (theme: Theme) =>
  css({
    "&": {
      display: "flex",
      flexDirection: "column",
      height: "100%",
      backgroundColor: theme.palette.background.default
    },
    ".panel-header": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "12px 16px",
      borderBottom: `1px solid ${theme.palette.divider}`,
      backgroundColor: theme.palette.background.paper
    },
    ".panel-content": {
      flex: 1,
      display: "flex",
      overflow: "hidden"
    },
    ".chat-section": {
      width: "40%",
      minWidth: "300px",
      borderRight: `1px solid ${theme.palette.divider}`,
      display: "flex",
      flexDirection: "column"
    },
    ".preview-section": {
      flex: 1,
      minWidth: "400px",
      display: "flex",
      flexDirection: "column"
    }
  });

// Simple port allocator — starts at 3100, increments per panel instance.
let nextPort = 3100;
function allocatePort(): number {
  return nextPort++;
}

interface VibeCodingPanelProps {
  workflow: Workflow;
  workspacePath: string;
  onClose?: () => void;
}

const VibeCodingPanel: React.FC<VibeCodingPanelProps> = ({
  workflow,
  workspacePath,
  onClose
}) => {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const initSession = useVibeCodingStore((s) => s.initSession);
  const setServerStatus = useVibeCodingStore((s) => s.setServerStatus);
  const appendServerLog = useVibeCodingStore((s) => s.appendServerLog);
  const getSession = useVibeCodingStore((s) => s.getSession);
  const session = getSession(workflow.id);

  const portRef = useRef<number>(allocatePort());
  const spawnedRef = useRef(false);

  useEffect(() => {
    if (spawnedRef.current) return;
    spawnedRef.current = true;

    initSession(workflow.id, workspacePath);

    if (!window.api?.workspace?.server || !workspacePath) return;

    setServerStatus(workflow.id, "starting", null);

    const startServer = async () => {
      try {
        await window.api.workspace.server.ensureInstalled(workspacePath);
        const port = await window.api.workspace.server.spawn(
          workspacePath,
          portRef.current
        );
        setServerStatus(workflow.id, "running", port);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        appendServerLog(workflow.id, msg);
        setServerStatus(workflow.id, "error", null);
      }
    };
    startServer();
    // Server is intentionally NOT killed on unmount — stays alive for fast re-open
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflow.id, workspacePath]);

  const handleRestart = useCallback(async () => {
    if (!window.api?.workspace?.server || !workspacePath) return;
    setServerStatus(workflow.id, "starting", null);
    try {
      const port = await window.api.workspace.server.respawn(
        workspacePath,
        portRef.current
      );
      setServerStatus(workflow.id, "running", port);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      appendServerLog(workflow.id, msg);
      setServerStatus(workflow.id, "error", null);
    }
  }, [workflow.id, workspacePath, setServerStatus, appendServerLog]);

  return (
    <Box css={styles}>
      <div className="panel-header">
        <Typography variant="h6">VibeCoding</Typography>
        {onClose && <CloseButton onClick={onClose} />}
      </div>
      <div className="panel-content">
        <div className="chat-section">
          <VibeCodingChat workflow={workflow} workspacePath={workspacePath} />
        </div>
        <div className="preview-section">
          <VibeCodingPreview
            port={session.port}
            serverStatus={session.serverStatus}
            serverLogs={session.serverLogs}
            onRestart={handleRestart}
          />
        </div>
      </div>
    </Box>
  );
};

export default memo(VibeCodingPanel);
