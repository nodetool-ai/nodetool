/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { Text, Tooltip, ToolbarIconButton, Card, Popover, FlexColumn, FlexRow } from "../ui_primitives";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { useVirtualizer } from "@tanstack/react-virtual";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import DataObjectIcon from "@mui/icons-material/DataObject";
import { CopyButton } from "../ui_primitives";

export type Severity = "info" | "warning" | "error";

export type LogRow = {
  severity: Severity;
  workflowName?: string;
  timestamp: number;
  content: string;
  data?: unknown;
};

export type LogsTableProps = {
  rows: LogRow[];
  rowHeight?: number; // default 36
  height?: number; // if provided, sets container height; otherwise flexes
  emptyText?: string;
  severities?: Severity[]; // when provided, only show these severities
  autoScroll?: boolean; // default true
  showTimestampColumn?: boolean;
};

const SEVERITY_COLORS = (theme: Theme): Record<Severity, { bg: string; text: string; border: string }> => ({
  error: { 
    bg: `${theme.vars.palette.error.main}1f`, 
    text: theme.vars.palette.error.main, 
    border: `${theme.vars.palette.error.main}4d` 
  },
  warning: { 
    bg: `${theme.vars.palette.warning.main}1f`, 
    text: theme.vars.palette.warning.main, 
    border: `${theme.vars.palette.warning.main}4d` 
  },
  info: { 
    bg: `${theme.vars.palette.info.main}14`, 
    text: theme.vars.palette.info.main, 
    border: `${theme.vars.palette.info.main}33` 
  }
});

const tableStyles = (theme: Theme) =>
  css({
    height: "100%",
    width: "100%",
    position: "relative",

    ".table": {
      flex: 1,
      minHeight: 0,
      borderRadius: 6,
      overflow: "hidden",
      backgroundColor: theme.vars.palette.background.paper,
      border: `1px solid ${theme.vars.palette.grey[800]}`
    },

    ".header": {
      display: "grid",
      gridTemplateColumns: "1fr 60px",
      gap: 8,
      alignItems: "center",
      height: 32,
      backgroundColor: theme.vars.palette.grey[900],
      borderBottom: `1px solid ${theme.vars.palette.grey[800]}`,
      padding: "0 12px",
      fontWeight: 500,
      color: theme.vars.palette.grey[400],
      fontSize: "0.7rem",
      textTransform: "uppercase",
      letterSpacing: "0.05em"
    },

    ".row": {
      display: "grid",
      gridTemplateColumns: "1fr 60px",
      gap: 8,
      alignItems: "center",
      height: 36,
      padding: "0 12px",
      borderBottom: `1px solid ${theme.vars.palette.grey[850] || theme.vars.palette.grey[900]}`,
      backgroundColor: "transparent",
      transition: "background-color 0.15s ease",
      cursor: "pointer",
      borderLeft: "3px solid transparent",
      "&:hover": {
        backgroundColor: theme.vars.palette.action.hover
      },
      "&:active": {
        backgroundColor: theme.vars.palette.action.selected
      },
      "&.expanded": {
        alignItems: "flex-start",
        paddingTop: 8,
        paddingBottom: 8
      },
      // Hide copy button by default, show on hover
      "& .copy-btn": {
        opacity: 0,
        transition: "opacity 0.15s ease"
      },
      "&:hover .copy-btn": {
        opacity: 1
      },
      // Show timestamp on hover
      "&:hover .timestamp": {
        opacity: 1
      }
    },

    ".row-error": {
      backgroundColor: `${theme.vars.palette.error.main}0a`,
      "&:hover": {
        backgroundColor: `${theme.vars.palette.error.main}14`
      }
    },

    ".row-warning": {
      backgroundColor: `${theme.vars.palette.warning.main}0a`,
      "&:hover": {
        backgroundColor: `${theme.vars.palette.warning.main}14`
      }
    },

    ".cell": {
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      fontSize: "0.75rem",
      color: theme.vars.palette.text.primary
    },

    ".cell.actions": {
      justifyContent: "flex-end",
      whiteSpace: "normal",
      gap: 4
    },

    ".content": {
      fontFamily: theme.fontFamily2,
      color: theme.vars.palette.grey[300],
      cursor: "default"
    },

    ".content.expanded": {
      whiteSpace: "normal",
      overflow: "visible",
      textOverflow: "clip",
      lineHeight: "1.35"
    },

    ".timestamp": {
      fontFamily: theme.fontFamily2,
      fontSize: "0.7rem",
      color: theme.vars.palette.grey[500],
      opacity: 0,
      transition: "opacity 0.2s ease"
    },

    ".empty": {
      height: "100%",
      color: theme.vars.palette.grey[500],
      fontSize: "0.85rem"
    },

    ".scroll-to-bottom": {
      position: "absolute",
      bottom: 16,
      right: 16,
      zIndex: 10,
      backgroundColor: theme.vars.palette.grey[800],
      border: `1px solid ${theme.vars.palette.grey[700]}`,
      boxShadow: "0 4px 12px rgba(0, 0, 0, 0.4)",
      "&:hover": {
        backgroundColor: theme.vars.palette.grey[700]
      }
    },

    ".list-container": {
      flex: 1,
      minHeight: 0
    }
  });

const formatTime = (ts: number) => {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString(undefined, { 
      hour: "2-digit", 
      minute: "2-digit", 
      second: "2-digit" 
    });
  } catch {
    // Date formatting failed, return timestamp as string
    return "" + ts;
  }
};

type RowItemProps = {
  row: LogRow;
  rowKey: string;
  isExpanded: boolean;
  showTimestampColumn: boolean;
  columns: string;
  style: React.CSSProperties;
  onToggle: (key: string) => void;
};

const RowItem = memo(({
  row,
  rowKey,
  isExpanded,
  showTimestampColumn,
  columns,
  style,
  onToggle
}: RowItemProps) => {
  const theme = useTheme();
  const colors = SEVERITY_COLORS(theme)[row.severity];
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);
  const timeTooltip = showTimestampColumn ? "" : formatTime(row.timestamp);

  const handleClick = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
    event.stopPropagation();
  }, []);

  const handleClose = useCallback((event: React.MouseEvent) => {
      setAnchorEl(null);
      event.stopPropagation();
  }, []);

  const handlePopoverClose = useCallback(() => {
    setAnchorEl(null);
  }, []);

  const handleRowClick = useCallback(() => {
    onToggle(rowKey);
  }, [onToggle, rowKey]);

  const handleActionsClick = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
  }, []);


  const open = Boolean(anchorEl);

  return (
    <div style={style}>
      <div
        className={`row row-${row.severity}${isExpanded ? " expanded" : ""}`}
        style={{
          gridTemplateColumns: columns,
          borderLeftColor: colors.text
        }}
        onClick={handleRowClick}
      >
        <Tooltip
          title={timeTooltip}
          placement="top-start"
          delay={500}
          disabled={showTimestampColumn}
        >
          <div className={`cell content${isExpanded ? " expanded" : ""}`}>
            {row.content}
          </div>
        </Tooltip>
        {showTimestampColumn && (
          <div className="cell timestamp">{formatTime(row.timestamp)}</div>
        )}
        <div className="cell actions" onClick={handleActionsClick}>
          <CopyButton
            value={row.content}
            tooltip="Copy log to clipboard"
            tooltipPlacement="top"
            className="copy-btn"
            sx={{ padding: "2px" }}
          />
          {row.data !== undefined && row.data !== null && (
            <>
              <ToolbarIconButton
                icon={<DataObjectIcon fontSize="inherit" />}
                tooltip="View log data"
              onClick={handleClick}
              size="small"
              sx={{ padding: "2px" }}
            />
              <Popover
                open={open}
                anchorEl={anchorEl}
                onClose={handlePopoverClose}
                placement="bottom-left"
                maxWidth={400}
                maxHeight={300}
              >
                <FlexColumn gap={0} sx={{ p: 2 }}>
                  <pre style={{ margin: 0, fontSize: "0.75rem", fontFamily: "monospace" }}>
                    {JSON.stringify(row.data, null, 2)}
                  </pre>
                  <FlexRow justify="flex-end" sx={{ mt: 1, pt: 1, borderTop: 1, borderColor: "divider" }}>
                    <Text
                      component="span"
                      size="small"
                      sx={{ cursor: "pointer", color: "primary.main" }}
                      onClick={handleClose}
                    >
                      Close
                    </Text>
                  </FlexRow>
                </FlexColumn>
              </Popover>
            </>
          )}
        </div>
      </div>
    </div>
  );
});

RowItem.displayName = "RowItem";

export const LogsTable: React.FC<LogsTableProps> = ({
  rows,
  rowHeight = 36,
  height,
  emptyText = "No logs to display",
  severities,
  autoScroll = true,
  showTimestampColumn = true
}) => {
  const theme = useTheme();
  const styles = tableStyles(theme);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const prevRowCountRef = useRef(rows.length);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const columns = showTimestampColumn ? "1fr 80px 60px" : "1fr 60px";

  // Optimization: Memoize filteredRows to prevent recalculation on every render
  const filteredRows = useMemo(() => {
    return Array.isArray(severities) && severities.length > 0
      ? rows.filter((r) => severities.includes(r.severity))
      : rows;
  }, [rows, severities]);

  const rowKeys = useMemo(
    () =>
      filteredRows.map((r, index) =>
        `${r.timestamp}:${r.severity}:${r.content}:${index}`
      ),
    [filteredRows]
  );

  useEffect(() => {
    setExpandedKeys(new Set());
  }, [rowKeys]);

  const toggleExpand = useCallback((key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const [listWidth, setListWidth] = useState(0);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => setListWidth(el.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const estimateRowHeight = useCallback(
    (row: LogRow, width: number, expanded: boolean) => {
      if (!expanded) {
        return rowHeight;
      }
      const padding = 24;
      const actionsWidth = 60;
      const contentWidth = Math.max(120, width - padding - actionsWidth);
      const avgCharWidth = 7;
      const maxCharsPerLine = Math.max(10, Math.floor(contentWidth / avgCharWidth));
      const lineHeight = 16;
      const lines = Math.max(1, Math.ceil(row.content.length / maxCharsPerLine));
      const extra = Math.max(0, (lines - 1) * lineHeight);
      return rowHeight + extra + 8;
    },
    [rowHeight]
  );

  const virtualizer = useVirtualizer({
    count: filteredRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) =>
      estimateRowHeight(
        filteredRows[index],
        listWidth,
        expandedKeys.has(rowKeys[index])
      ),
    overscan: 5,
    getItemKey: (index) => rowKeys[index] ?? index,
  });

  // Auto-scroll to bottom when new logs arrive (if at bottom)
  useEffect(() => {
    if (autoScroll && isAtBottom && filteredRows.length > prevRowCountRef.current) {
      requestAnimationFrame(() => {
        virtualizer.scrollToIndex(filteredRows.length - 1, { align: "end" });
      });
    }
    prevRowCountRef.current = filteredRows.length;
  }, [filteredRows.length, isAtBottom, autoScroll, virtualizer]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const threshold = rowHeight * 2;
    const atBottom =
      el.scrollTop + el.clientHeight >= el.scrollHeight - threshold;
    setIsAtBottom(atBottom);
    setShowScrollButton(!atBottom && filteredRows.length > 10);
  }, [filteredRows.length, rowHeight]);

  const scrollToBottom = useCallback(() => {
    virtualizer.scrollToIndex(filteredRows.length - 1, { align: "end" });
    setIsAtBottom(true);
    setShowScrollButton(false);
  }, [filteredRows.length, virtualizer]);

  return (
    <FlexColumn css={styles} style={height ? { height } : undefined} fullWidth>
      <Card variant="outlined" className="table" sx={{ flex: 1, minHeight: 0 }}>
        <FlexColumn fullWidth fullHeight sx={{ minHeight: 0 }}>
          <div className="header" style={{ gridTemplateColumns: columns }}>
            <span>Message</span>
            {showTimestampColumn && <span>Time</span>}
            <span style={{ textAlign: "right" }}></span>
          </div>
          <FlexColumn className="list-container" fullWidth sx={{ flex: 1, minHeight: 0 }}>
            {filteredRows.length === 0 ? (
              <FlexColumn className="empty" fullWidth fullHeight align="center" justify="center">
                <Text size="small">{emptyText}</Text>
              </FlexColumn>
            ) : (
              <div
                ref={scrollRef}
                onScroll={handleScroll}
                style={{
                  width: "100%",
                  height: "100%",
                  overflow: "auto",
                }}
              >
                <div
                  style={{
                    height: virtualizer.getTotalSize(),
                    width: "100%",
                    position: "relative",
                  }}
                >
                  {virtualizer.getVirtualItems().map((vi) => {
                    const row = filteredRows[vi.index];
                    const rowKey = rowKeys[vi.index];
                    return (
                      <RowItem
                        key={vi.key}
                        row={row}
                        rowKey={rowKey}
                        isExpanded={expandedKeys.has(rowKey)}
                        showTimestampColumn={showTimestampColumn}
                        columns={columns}
                        onToggle={toggleExpand}
                        style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          width: "100%",
                          height: vi.size,
                          transform: `translateY(${vi.start}px)`,
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            )}
          </FlexColumn>
        </FlexColumn>
      </Card>

      {showScrollButton && (
        <ToolbarIconButton
          icon={<KeyboardArrowDownIcon />}
          tooltip="Scroll to latest"
          className="scroll-to-bottom"
          onClick={scrollToBottom}
          size="small"
        />
      )}
    </FlexColumn>
  );
};

export default LogsTable;
