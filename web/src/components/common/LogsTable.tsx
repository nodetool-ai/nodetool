/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { IconButton, Paper, Tooltip, Typography, Popover, Box } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import AutoSizer from "react-virtualized-auto-sizer";
import { VariableSizeList, ListChildComponentProps } from "react-window";
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
  data?: any;
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
    display: "flex",
    flexDirection: "column",
    height: "100%",
    width: "100%",
    position: "relative",

    ".table": {
      display: "flex",
      flexDirection: "column",
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
      display: "flex",
      justifyContent: "flex-end",
      alignItems: "center",
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
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
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
    return "" + ts;
  }
};

// Memoized row component for better performance
type RowItemData = {
  rows: LogRow[];
  rowKeys: string[];
  showTimestampColumn: boolean;
  columns: string;
  expandedKeys: Set<string>;
  toggleExpand: (key: string, index: number) => void;
};

// Custom comparison function for RowItem to prevent unnecessary re-renders
const areEqual = (prevProps: ListChildComponentProps<RowItemData>, nextProps: ListChildComponentProps<RowItemData>) => {
  const { style: prevStyle, data: prevData, index: prevIndex } = prevProps;
  const { style: nextStyle, data: nextData, index: nextIndex } = nextProps;

  if (prevIndex !== nextIndex) {
    return false;
  }

  // Check style properties relevant to layout (top, left, width, height)
  // We use strict equality for values, assuming style object structure is consistent from react-window
  if (
    prevStyle.top !== nextStyle.top ||
    prevStyle.left !== nextStyle.left ||
    prevStyle.width !== nextStyle.width ||
    prevStyle.height !== nextStyle.height
  ) {
    return false;
  }

  // If data reference is the same, no need to check deeper
  if (prevData === nextData) {
    return true;
  }

  // Granular data check
  const prevRow = prevData.rows[prevIndex];
  const nextRow = nextData.rows[nextIndex];

  // If the specific row data changed
  if (prevRow !== nextRow) {
    return false;
  }

  const prevKey = prevData.rowKeys[prevIndex];
  const nextKey = nextData.rowKeys[nextIndex]; // Should be same if rows/index same

  // Check if expansion state changed for THIS row
  const prevExpanded = prevData.expandedKeys.has(prevKey);
  const nextExpanded = nextData.expandedKeys.has(nextKey);
  if (prevExpanded !== nextExpanded) {
    return false;
  }

  // Check global column settings
  if (prevData.showTimestampColumn !== nextData.showTimestampColumn) {
    return false;
  }
  if (prevData.columns !== nextData.columns) {
    return false;
  }

  return true;
};

const RowItem = memo(({ index, style, data }: ListChildComponentProps<RowItemData>) => {
  const r = data.rows[index];
  const rowKey = data.rowKeys[index];
  const theme = useTheme();
  const colors = SEVERITY_COLORS(theme)[r.severity];
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);
  const timeTooltip = data.showTimestampColumn ? "" : formatTime(r.timestamp);
  const isExpanded = data.expandedKeys.has(rowKey);

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
    event.stopPropagation();
  };

  const handleClose = (event: React.MouseEvent) => {
      setAnchorEl(null);
      event.stopPropagation();
  };
  
  const open = Boolean(anchorEl);
  
  return (
    <div style={style}>
      <div
        className={`row row-${r.severity}${isExpanded ? " expanded" : ""}`}
        style={{
          gridTemplateColumns: data.columns,
          borderLeftColor: colors.text
        }}
        onClick={() => data.toggleExpand(rowKey, index)}
      >
        <Tooltip
          title={timeTooltip}
          placement="top-start"
          enterDelay={500}
          disableHoverListener={data.showTimestampColumn}
        >
          <div className={`cell content${isExpanded ? " expanded" : ""}`}>
            {r.content}
          </div>
        </Tooltip>
        {data.showTimestampColumn && (
          <div className="cell timestamp">{formatTime(r.timestamp)}</div>
        )}
        <div className="cell actions" onClick={(e) => e.stopPropagation()}>
          <CopyButton
            value={r.content}
            tooltip="Copy log to clipboard"
            tooltipPlacement="top"
            className="copy-btn"
            sx={{ padding: "2px" }}
          />
          {r.data !== undefined && r.data !== null && (
            <>
              <IconButton 
                size="small" 
                onClick={handleClick}
                sx={{ padding: "2px" }}
              >
                <DataObjectIcon fontSize="inherit" />
              </IconButton>
              <Popover
                open={open}
                anchorEl={anchorEl}
                onClose={() => setAnchorEl(null)}
                anchorOrigin={{
                  vertical: "bottom",
                  horizontal: "left",
                }}
                transformOrigin={{
                  vertical: "top",
                  horizontal: "right",
                }}
              >
                 <Box sx={{ p: 2, maxWidth: 400, maxHeight: 300, overflow: 'auto' }}>
                    <pre style={{ margin: 0, fontSize: '0.75rem', fontFamily: 'monospace' }}>
                        {JSON.stringify(r.data, null, 2)}
                    </pre>
                 </Box>
                 {/* Close button inside popover just in case */}
                 <Box sx={{ p: 1, display: 'flex', justifyContent: 'flex-end', borderTop: 1, borderColor: 'divider' }}>
                    <Typography 
                        component="span" 
                        variant="caption" 
                        sx={{ cursor: 'pointer', color: 'primary.main' }}
                        onClick={handleClose}
                    >
                        Close
                    </Typography>
                 </Box>
              </Popover>
            </>
          )}
        </div>
      </div>
    </div>
  );
}, areEqual);

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
  const listRef = useRef<VariableSizeList>(null);
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
    listRef.current?.resetAfterIndex(0);
  }, [rowKeys]);

  const toggleExpand = useCallback((key: string, index: number) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
    listRef.current?.resetAfterIndex(index);
  }, []);

  const estimateRowHeight = useCallback(
    (row: LogRow, listWidth: number, expanded: boolean) => {
      if (!expanded) {
        return rowHeight;
      }
      const padding = 24;
      const actionsWidth = 60;
      const contentWidth = Math.max(120, listWidth - padding - actionsWidth);
      const avgCharWidth = 7;
      const maxCharsPerLine = Math.max(10, Math.floor(contentWidth / avgCharWidth));
      const lineHeight = 16;
      const lines = Math.max(1, Math.ceil(row.content.length / maxCharsPerLine));
      const extra = Math.max(0, (lines - 1) * lineHeight);
      return rowHeight + extra + 8;
    },
    [rowHeight]
  );

  // Auto-scroll to bottom when new logs arrive (if at bottom)
  useEffect(() => {
    if (autoScroll && isAtBottom && filteredRows.length > prevRowCountRef.current) {
      // Use requestAnimationFrame for smooth scrolling
      requestAnimationFrame(() => {
        listRef.current?.scrollToItem(filteredRows.length - 1, "end");
      });
    }
    prevRowCountRef.current = filteredRows.length;
  }, [filteredRows.length, isAtBottom, autoScroll]);

  const handleScroll = useCallback(({ scrollOffset, scrollUpdateWasRequested }: { 
    scrollOffset: number; 
    scrollUpdateWasRequested: boolean 
  }) => {
    if (scrollUpdateWasRequested) {return;}
    
    // Calculate if we're near the bottom
    const listHeight = listRef.current?.props.height as number || 0;
    const totalHeight = filteredRows.length * rowHeight;
    const threshold = rowHeight * 2; // Within 2 rows of bottom
    
    const atBottom = scrollOffset + listHeight >= totalHeight - threshold;
    setIsAtBottom(atBottom);
    setShowScrollButton(!atBottom && filteredRows.length > 10);
  }, [filteredRows.length, rowHeight]);

  const scrollToBottom = useCallback(() => {
    listRef.current?.scrollToItem(filteredRows.length - 1, "end");
    setIsAtBottom(true);
    setShowScrollButton(false);
  }, [filteredRows.length]);

  // Optimization: Memoize itemData to prevent RowItem re-renders when other props change
  // (like showScrollButton or isAtBottom state changes in LogsTable)
  const itemData = useMemo(() => ({
    rows: filteredRows,
    rowKeys,
    showTimestampColumn,
    columns,
    expandedKeys,
    toggleExpand
  }), [filteredRows, rowKeys, showTimestampColumn, columns, expandedKeys, toggleExpand]);

  const renderList = useCallback((listHeight: number, listWidth: number) => (
    <VariableSizeList
      ref={listRef}
      height={listHeight}
      width={listWidth}
      itemCount={filteredRows.length}
      itemSize={(index) =>
        estimateRowHeight(
          filteredRows[index],
          listWidth,
          expandedKeys.has(rowKeys[index])
        )
      }
      itemData={itemData}
      onScroll={handleScroll}
      overscanCount={5}
    >
      {RowItem}
    </VariableSizeList>
  ), [
    filteredRows,
    handleScroll,
    estimateRowHeight,
    itemData,
    rowKeys,
    expandedKeys // Still need these deps for itemSize
  ]);

  return (
    <div css={styles} style={height ? { height } : undefined}>
      <Paper variant="outlined" className="table">
        <div className="header" style={{ gridTemplateColumns: columns }}>
          <span>Message</span>
          {showTimestampColumn && <span>Time</span>}
          <span style={{ textAlign: "right" }}></span>
        </div>
        <div className="list-container">
          {filteredRows.length === 0 ? (
            <div className="empty">
              <Typography variant="body2">{emptyText}</Typography>
            </div>
          ) : (
            <AutoSizer>
              {({ height: h, width }) => renderList(h, width)}
            </AutoSizer>
          )}
        </div>
      </Paper>
      
      {showScrollButton && (
        <Tooltip title="Scroll to latest">
          <IconButton 
            className="scroll-to-bottom" 
            onClick={scrollToBottom}
            size="small"
          >
            <KeyboardArrowDownIcon />
          </IconButton>
        </Tooltip>
      )}
    </div>
  );
};

export default LogsTable;
