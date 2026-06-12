/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useMemo, useState, useCallback, memo } from "react";
import { ToggleGroup, ToggleOption, ToolbarIconButton, Box } from "../ui_primitives";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import FullscreenExitIcon from "@mui/icons-material/FullscreenExit";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import LogsTable, { LogRow, Severity } from "../common/LogsTable";
import useLogsStore from "../../stores/LogStore";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import PanelToolbar from "./PanelToolbar";

type Row = LogRow & { workflowId: string; workflowName: string; key: string };

const containerStyles = (theme: Theme) =>
  css({
    display: "flex",
    flexDirection: "column",
    height: "100%",
    width: "100%",
    "&.fullscreen": {
      position: "fixed",
      inset: 0,
      zIndex: theme.zIndex.modal,
      backgroundColor: theme.vars.palette.background.default
    },
    ".table-wrap": {
      display: "flex",
      flexDirection: "column",
      flex: 1,
      minHeight: 0,
      padding: "8px 12px 12px"
    }
  });

const SEVERITIES: Severity[] = ["info", "warning", "error"];

const SEVERITY_LABELS: Record<Severity, string> = {
  info: "Info",
  warning: "Warn",
  error: "Error"
};

const LogPanel: React.FC = memo(function LogPanel() {
  const theme = useTheme();
  const currentWorkflowId = useWorkflowManager((s) => s.currentWorkflowId);
  const openWorkflows = useWorkflowManager((s) => s.openWorkflows);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Map workflow id -> name for quick lookup
  const wfName = useMemo(() => {
    const map: Record<string, string> = {};
    openWorkflows.forEach((w) => (map[w.id] = w.name));
    return map;
  }, [openWorkflows]);

  const [selectedSeverities, setSelectedSeverities] = useState<Severity[]>([]);

  // Subscribe to logs - this will trigger re-renders when logs change
  const logs = useLogsStore((s) => s.logs);

  // Filter by workflow and severity, then shape rows, in a single pass.
  const filteredRows = useMemo<Row[]>(() => {
    return logs
      .filter((log) => {
        if (currentWorkflowId && log.workflowId !== currentWorkflowId) {
          return false;
        }
        if (
          selectedSeverities.length > 0 &&
          !selectedSeverities.includes(log.severity)
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => b.timestamp - a.timestamp)
      .map((log, index) => {
        const workflowId = log.workflowId;
        return {
          key: `${workflowId}:${log.nodeId}:${log.timestamp}:${index}`,
          workflowId,
          workflowName: log.workflowName || wfName[workflowId] || workflowId,
          severity: log.severity,
          timestamp: log.timestamp,
          content: log.content,
          data: log.data
        } as Row;
      });
  }, [logs, currentWorkflowId, selectedSeverities, wfName]);

  const handleSeverityChange = useCallback(
    (_event: React.MouseEvent<HTMLElement>, value: string[]) => {
      setSelectedSeverities(value as Severity[]);
    },
    []
  );

  const handleFullscreenToggle = useCallback(() => {
    setIsFullscreen((v) => !v);
  }, []);

  return (
    <Box
      css={containerStyles(theme)}
      className={isFullscreen ? "fullscreen" : undefined}
    >
      <PanelToolbar
        title="Logs"
        count={filteredRows.length}
        actions={
          <ToolbarIconButton
            icon={
              isFullscreen ? (
                <FullscreenExitIcon fontSize="small" />
              ) : (
                <FullscreenIcon fontSize="small" />
              )
            }
            tooltip={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
            onClick={handleFullscreenToggle}
            ariaLabel="Toggle fullscreen"
          />
        }
      >
        <ToggleGroup
          value={selectedSeverities}
          onChange={handleSeverityChange}
          compact
          aria-label="Filter by severity"
        >
          {SEVERITIES.map((s) => (
            <ToggleOption key={s} value={s} aria-label={s}>
              {SEVERITY_LABELS[s]}
            </ToggleOption>
          ))}
        </ToggleGroup>
      </PanelToolbar>

      <Box className="table-wrap">
        <LogsTable
          rows={filteredRows}
          height={undefined}
          showTimestampColumn={false}
        />
      </Box>
    </Box>
  );
});

export default LogPanel;
