/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { Chip, IconButton, Paper, Tooltip, Typography, Popover, Box } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import AutoSizer from "react-virtualized-auto-sizer";
import { FixedSizeList, ListChildComponentProps } from "react-window";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowRightIcon from "@mui/icons-material/KeyboardArrowRight";
import DataObjectIcon from "@mui/icons-material/DataObject";
import { CopyToClipboardButton } from "./CopyToClipboardButton";

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
};

const SEVERITY_COLORS: Record<Severity, { bg: string; text: string; border: string }> = {
  error: { bg: "rgba(244, 67, 54, 0.12)", text: "#f44336", border: "rgba(244, 67, 54, 0.3)" },
  warning: { bg: "rgba(255, 152, 0, 0.12)", text: "#ff9800", border: "rgba(255, 152, 0, 0.3)" },
  info: { bg: "rgba(33, 150, 243, 0.08)", text: "#2196f3", border: "rgba(33, 150, 243, 0.2)" }
};

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
      gridTemplateColumns: "72px 1fr 80px 60px",
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
      gridTemplateColumns: "72px 1fr 80px 60px",
      gap: 8,
      alignItems: "center",
      height: 36,
      padding: "0 12px",
      borderBottom: `1px solid ${theme.vars.palette.grey[850] || theme.vars.palette.grey[900]}`,
      backgroundColor: "transparent",
      transition: "background-color 0.15s ease",
      cursor: "pointer",
      "&:hover": {
        backgroundColor: "rgba(255, 255, 255, 0.05)"
      },
      "&:active": {
        backgroundColor: "rgba(255, 255, 255, 0.08)"
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
      backgroundColor: "rgba(244, 67, 54, 0.04)",
      "&:hover": {
        backgroundColor: "rgba(244, 67, 54, 0.08)"
      }
    },

    ".row-warning": {
      backgroundColor: "rgba(255, 152, 0, 0.04)",
      "&:hover": {
        backgroundColor: "rgba(255, 152, 0, 0.08)"
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

    ".severity-badge": {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "2px 8px",
      borderRadius: 4,
      fontSize: "0.65rem",
      fontWeight: 600,
      textTransform: "uppercase",
      letterSpacing: "0.03em"
    },

    ".content": {
      fontFamily: theme.fontFamily2,
      color: theme.vars.palette.grey[300],
      cursor: "default"
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
const RowItem = memo(({ index, style, data }: ListChildComponentProps<LogRow[]>) => {
  const r = data[index];
  const colors = SEVERITY_COLORS[r.severity];
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);

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
        className={`row row-${r.severity}`}
      >
        <div className="cell">
          <span 
            className="severity-badge"
            style={{ 
              backgroundColor: colors.bg, 
              color: colors.text,
              border: `1px solid ${colors.border}`
            }}
          >
            {r.severity}
          </span>
        </div>
        <Tooltip title={r.content} placement="top-start" enterDelay={500}>
          <div className="cell content">
            {r.content}
          </div>
        </Tooltip>
        <div className="cell timestamp">{formatTime(r.timestamp)}</div>
        <div className="cell actions">
          <CopyToClipboardButton
            copyValue={r.content}
            title="Copy log to clipboard"
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
});

RowItem.displayName = "RowItem";

export const LogsTable: React.FC<LogsTableProps> = ({
  rows,
  rowHeight = 36,
  height,
  emptyText = "No logs to display",
  severities,
  autoScroll = true
}) => {
  const theme = useTheme();
  const styles = tableStyles(theme);
  const listRef = useRef<FixedSizeList>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const prevRowCountRef = useRef(rows.length);

  const filteredRows = Array.isArray(severities) && severities.length > 0
    ? rows.filter((r) => severities.includes(r.severity))
    : rows;

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

  const renderList = useCallback((listHeight: number, listWidth: number) => (
    <FixedSizeList
      ref={listRef}
      height={listHeight}
      width={listWidth}
      itemCount={filteredRows.length}
      itemSize={rowHeight}
      itemData={filteredRows}
      onScroll={handleScroll}
      overscanCount={5}
    >
      {RowItem}
    </FixedSizeList>
  ), [filteredRows, rowHeight, handleScroll]);

  return (
    <div css={styles} style={height ? { height } : undefined}>
      <Paper variant="outlined" className="table">
        <div className="header">
          <span>Severity</span>
          <span>Message</span>
          <span>Time</span>
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

