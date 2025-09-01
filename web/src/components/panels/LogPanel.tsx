/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useMemo, useState } from "react";
import {
  Box,
  Chip,
  FormControl,
  InputLabel,
  MenuItem,
  OutlinedInput,
  Paper,
  Select,
  SelectChangeEvent,
  Typography
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import LogsTable, { LogRow, Severity } from "../common/LogsTable";
import useLogsStore from "../../stores/LogStore";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";

type Row = LogRow & { workflowId: string; workflowName: string; key: string };

const containerStyles = (theme: Theme) =>
  css({
    display: "flex",
    flexDirection: "column",
    height: "100%",
    width: "100%",
    padding: "8px 10px 10px 10px",
    boxSizing: "border-box",
    gap: 8,
    ".filters": {
      display: "flex",
      gap: 10,
      alignItems: "center"
    },
    ".table": {
      display: "flex",
      flexDirection: "column",
      flex: 1,
      minHeight: 0,
      borderRadius: 8,
      overflow: "hidden",
      boxShadow:
        theme.palette.mode === "dark"
          ? "0 8px 24px rgba(0,0,0,0.3)"
          : "0 8px 24px rgba(16,24,40,0.12)",
      border: `1px solid ${theme.vars.palette.divider}`
    },
    ".header": {
      display: "grid",
      gridTemplateColumns: "80px 3fr 160px 3fr",
      gap: 0,
      alignItems: "center",
      height: 40,
      backgroundColor: theme.vars.palette.background.paper,
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      padding: "0 10px",
      fontWeight: 600,
      color: theme.vars.palette.text.secondary,
      fontSize: theme.fontSizeSmall
    },
    ".row": {
      display: "grid",
      gridTemplateColumns: "80px 3fr 160px 3fr",
      gap: 0,
      alignItems: "center",
      height: 44,
      padding: "0 10px",
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      backgroundColor: theme.vars.palette.background.default,
      transition: "background-color 0.2s ease",
      ":nth-of-type(even)": {
        backgroundColor: `${theme.vars.palette.grey[600]}22`
      },
      ":hover": {
        backgroundColor: `${theme.vars.palette.action.hover}44`
      }
    },
    ".cell": {
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      fontSize: theme.fontSizeSmall,
      color: theme.vars.palette.text.primary
    },
    ".content": {
      fontFamily: theme.fontFamily2,
      color: theme.vars.palette.text.secondary
    },
    ".empty": {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      height: "100%",
      color: theme.vars.palette.text.secondary
    }
  });

const SEVERITIES: Severity[] = ["info", "warning", "error"];

const formatTime = (ts: number) => {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString();
  } catch {
    return "" + ts;
  }
};

const LogPanel: React.FC = () => {
  const theme = useTheme();
  const logs = useLogsStore((s) => s.logs);
  const openWorkflows = useWorkflowManager((s) => s.openWorkflows);

  // Map workflow id -> name for quick lookup
  const wfName = useMemo(() => {
    const map: Record<string, string> = {};
    openWorkflows.forEach((w) => (map[w.id] = w.name));
    return map;
  }, [openWorkflows]);

  const rows = useMemo<Row[]>(() => {
    return Object.entries(logs).map(([key, log]) => {
      const [workflowId] = key.split(":");
      return {
        key,
        workflowId,
        workflowName: wfName[workflowId] ?? workflowId,
        severity: log.severity,
        timestamp: log.timestamp,
        content: log.content
      } as Row;
    });
  }, [logs, wfName]);

  // Filters
  const workflowOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => set.add(r.workflowName));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const [selectedSeverities, setSelectedSeverities] = useState<Severity[]>([]);
  const [selectedWorkflows, setSelectedWorkflows] = useState<string[]>([]);

  const handleSeverityChange = (e: SelectChangeEvent<string[]>) => {
    setSelectedSeverities(
      (e.target.value as string[]).map((v) => v as Severity)
    );
  };
  const handleWorkflowChange = (e: SelectChangeEvent<string[]>) => {
    setSelectedWorkflows(e.target.value as string[]);
  };

  const filtered = useMemo(() => {
    return rows
      .filter(
        (r) =>
          selectedSeverities.length === 0 ||
          selectedSeverities.includes(r.severity)
      )
      .filter(
        (r) =>
          selectedWorkflows.length === 0 ||
          selectedWorkflows.includes(r.workflowName)
      )
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [rows, selectedSeverities, selectedWorkflows]);

  return (
    <Box css={containerStyles(theme)}>
      <Box className="filters">
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel id="severity-label">Severity</InputLabel>
          <Select
            labelId="severity-label"
            multiple
            value={selectedSeverities as unknown as string[]}
            onChange={handleSeverityChange}
            input={<OutlinedInput label="Severity" />}
            renderValue={(selected) =>
              (selected as string[]).map((s) => s.toUpperCase()).join(", ")
            }
          >
            {SEVERITIES.map((s) => (
              <MenuItem key={s} value={s}>
                <Chip size="small" label={s} sx={{ mr: 1 }} /> {s}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: 220 }}>
          <InputLabel id="workflow-label">Workflow</InputLabel>
          <Select
            labelId="workflow-label"
            multiple
            value={selectedWorkflows}
            onChange={handleWorkflowChange}
            input={<OutlinedInput label="Workflow" />}
            renderValue={(selected) => (selected as string[]).join(", ")}
          >
            {workflowOptions.map((w) => (
              <MenuItem key={w} value={w}>
                {w}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      <LogsTable rows={filtered} showWorkflow height={undefined} />
    </Box>
  );
};

export default LogPanel;
