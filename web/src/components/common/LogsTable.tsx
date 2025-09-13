/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { Chip, Paper, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import AutoSizer from "react-virtualized-auto-sizer";
import { FixedSizeList } from "react-window";

export type Severity = "info" | "warning" | "error";

export type LogRow = {
  severity: Severity;
  workflowName?: string;
  timestamp: number;
  content: string;
};

export type LogsTableProps = {
  rows: LogRow[];
  showWorkflow?: boolean;
  rowHeight?: number; // default 44
  height?: number; // if provided, sets container height; otherwise flexes
  emptyText?: string;
  severities?: Severity[]; // when provided, only show these severities
};

const tableStyles = (theme: Theme) =>
  css({
    display: "flex",
    flexDirection: "column",
    height: "100%",
    width: "100%",
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
      gridAutoFlow: "column",
      gridTemplateColumns: "80px 160px 1fr 160px",
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
      gridAutoFlow: "column",
      gridTemplateColumns: "80px 160px 1fr 160px",
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

const formatTime = (ts: number) => {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString();
  } catch {
    return "" + ts;
  }
};

export const LogsTable: React.FC<LogsTableProps> = ({
  rows,
  showWorkflow = true,
  rowHeight = 44,
  height,
  emptyText = "No logs to display",
  severities
}) => {
  const theme = useTheme();
  const styles = tableStyles(theme);
  const filteredRows = Array.isArray(severities) && severities.length > 0
    ? rows.filter((r) => severities.includes(r.severity))
    : rows;

  const RowItem = ({
    index,
    style
  }: {
    index: number;
    style: React.CSSProperties;
  }) => {
    const r = filteredRows[index];
    const chipColor =
      r.severity === "error" ? "error" : r.severity === "warning" ? "warning" : "info";
    return (
      <div style={style}>
        <div className="row">
          <div className="cell">
            <Chip size="small" color={chipColor as any} label={r.severity} />
          </div>
          {showWorkflow && <div className="cell">{r.workflowName ?? ""}</div>}
          <div className="cell content" title={r.content}>
            {r.content}
          </div>
          <div className="cell">{formatTime(r.timestamp)}</div>
        </div>
      </div>
    );
  };

  // Adjust grid when no workflow column
  const gridOverride = showWorkflow
    ? {}
    : {
        gridTemplateColumns: "80px 1fr 160px"
      } as React.CSSProperties;

  return (
    <div css={styles} style={height ? { height } : undefined}>
      <Paper variant="outlined" className="table">
        <div className="header" style={gridOverride}>
          <Typography variant="caption">Severity</Typography>
          {showWorkflow && <Typography variant="caption">Workflow</Typography>}
          <Typography variant="caption">Content</Typography>
          <Typography variant="caption">Timestamp</Typography>
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>
          {filteredRows.length === 0 ? (
            <div className="empty">
              <Typography variant="body2">{emptyText}</Typography>
            </div>
          ) : height ? (
            <FixedSizeList height={height - 40} width="100%" itemCount={filteredRows.length} itemSize={rowHeight}>
              {RowItem}
            </FixedSizeList>
          ) : (
            <AutoSizer>
              {({ height: h, width }) => (
                <FixedSizeList height={h} width={width} itemCount={filteredRows.length} itemSize={rowHeight}>
                  {RowItem}
                </FixedSizeList>
              )}
            </AutoSizer>
          )}
        </div>
      </Paper>
    </div>
  );
};

export default LogsTable;
