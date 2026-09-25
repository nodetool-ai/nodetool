/** @jsxImportSource @emotion/react */
import { useMemo, useState, useCallback, memo } from "react";
import { css } from "@emotion/react";
import { useNavigate } from "react-router-dom";
import FullscreenExitIcon from "@mui/icons-material/FullscreenExit";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { requestFitNode } from "../../hooks/useFitNodeEvent";
import useLogsStore from "../../stores/LogStore";
import { useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import LogsTable, {
  type LogRow,
  type Severity
} from "../common/LogsTable";
import {
  Box,
  Chip,
  SPACING,
  ToggleGroup,
  ToggleOption,
  ToolbarIconButton,
  getSpacingPx
} from "../ui_primitives";
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
      padding: `${getSpacingPx(SPACING.md)} ${getSpacingPx(SPACING.lg)} ${getSpacingPx(SPACING.lg)}`
    }
  });

const SEVERITIES: Severity[] = ["info", "warning", "error"];

const SEVERITY_LABELS = {
  info: "Info",
  warning: "Warn",
  error: "Error"
} satisfies Record<Severity, string>;

const LogPanel: React.FC = memo(function LogPanel() {
  const theme = useTheme();
  const navigate = useNavigate();
  const rootStyles = useMemo(() => containerStyles(theme), [theme]);
  const currentWorkflowId = useWorkflowManager((s) => s.currentWorkflowId);
  const setCurrentWorkflowId = useWorkflowManager(
    (state) => state.setCurrentWorkflowId
  );
  const openWorkflows = useWorkflowManager((s) => s.openWorkflows);
  const getWorkflow = useWorkflowManager((state) => state.getWorkflow);
  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  const setActiveTab = useWorkspaceTabsStore((state) => state.setActiveTab);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Map workflow id -> name for quick lookup
  const wfName = useMemo(() => {
    const map: Record<string, string> = {};
    openWorkflows.forEach((w) => (map[w.id] = w.name));
    return map;
  }, [openWorkflows]);

  const [selectedSeverities, setSelectedSeverities] = useState<Severity[]>([]);

  const logs = useLogsStore((s) => s.logs);
  const filter = useLogsStore((s) => s.filter);
  const clearFilter = useLogsStore((s) => s.clearFilter);

  // Filter by workflow and severity, then shape rows, in a single pass.
  const filteredRows = useMemo<Row[]>(() => {
    return logs
      .filter((log) => {
        const workflowId = filter?.workflowId ?? currentWorkflowId;
        if (workflowId && log.workflowId !== workflowId) {
          return false;
        }
        if (filter?.jobId && log.jobId !== filter.jobId) {
          return false;
        }
        if (filter?.nodeId && log.nodeId !== filter.nodeId) {
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
        const row: Row = {
          key: `${workflowId}:${log.nodeId}:${log.timestamp}:${index}`,
          workflowId,
          workflowName: log.workflowName || wfName[workflowId] || workflowId,
          nodeId: log.nodeId,
          nodeName: log.nodeName,
          severity: log.severity,
          timestamp: log.timestamp,
          content: log.content,
          data: log.data
        };
        if (log.jobId) {
          row.jobId = log.jobId;
        }
        return row;
      });
  }, [logs, filter, currentWorkflowId, selectedSeverities, wfName]);

  const filteredNodeName = useMemo(() => {
    if (!filter?.nodeId) {
      return null;
    }
    return (
      logs.find(
        (log) =>
          log.workflowId === filter.workflowId &&
          log.nodeId === filter.nodeId &&
          (!filter.jobId || log.jobId === filter.jobId)
      )?.nodeName || filter.nodeId
    );
  }, [filter, logs]);

  const handleSeverityChange = useCallback(
    (_event: React.MouseEvent<HTMLElement>, value: string[]) => {
      setSelectedSeverities(value as Severity[]);
    },
    []
  );

  const handleFullscreenToggle = useCallback(() => {
    setIsFullscreen((v) => !v);
  }, []);

  const handleRevealNode = useCallback(
    (workflowId: string, nodeId: string) => {
      const workflowTab: {
        type: "workflow";
        ref: string;
        mode: "edit";
        title?: string;
        projectId?: string;
      } = {
        type: "workflow",
        ref: workflowId,
        mode: "edit",
        projectId: getWorkflow(workflowId)?.project_id ?? undefined
      };
      if (wfName[workflowId]) {
        workflowTab.title = wfName[workflowId];
      }
      const workflowTabId = openTab(workflowTab);
      setActiveTab(workflowTabId);
      if (workflowId !== currentWorkflowId) {
        setCurrentWorkflowId(workflowId);
      }
      navigate("/workspace");
      requestFitNode({ workflowId, nodeId });
    },
    [
      currentWorkflowId,
      getWorkflow,
      navigate,
      openTab,
      setActiveTab,
      setCurrentWorkflowId,
      wfName
    ]
  );

  return (
    <Box
      css={rootStyles}
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
        {filter?.nodeId && filteredNodeName ? (
          <Chip
            compact
            color="info"
            label={`Node: ${filteredNodeName}`}
            onDelete={clearFilter}
            title={filter.jobId ? `Run ${filter.jobId}` : undefined}
          />
        ) : null}
      </PanelToolbar>

      <Box className="table-wrap">
        <LogsTable
          rows={filteredRows}
          height={undefined}
          showTimestampColumn
          onRevealNode={handleRevealNode}
        />
      </Box>
    </Box>
  );
});

export default LogPanel;
