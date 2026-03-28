import React, { useEffect, useRef, memo, useCallback, useState, useMemo } from "react";
import { Box, Typography, IconButton, Tooltip, Button } from "@mui/material";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import VerticalAlignBottomIcon from "@mui/icons-material/VerticalAlignBottom";
import BuildIcon from "@mui/icons-material/Build";
import { ServerStatus } from "../../stores/VibeCodingStore";

/** Extract port number from an EADDRINUSE log line, e.g. ":::3101" or ":3101" */
function extractEaddrinusePort(lines: string[]): number | null {
  for (const line of lines) {
    if (!line.includes("EADDRINUSE")) continue;
    const m = line.match(/:(\d{4,5})/);
    if (m) return parseInt(m[1], 10);
  }
  return null;
}

interface VibeCodingServerLogsProps {
  workspacePath: string | undefined;
  serverStatus: ServerStatus;
  onAutoFix?: (port: number) => void;
}

function classifyLine(
  line: string
): "error" | "warn" | "info" | "success" | "default" {
  const lower = line.toLowerCase();
  if (lower.includes("error") || lower.includes("failed") || lower.includes("err!"))
    {return "error";}
  if (lower.includes("warn") || lower.includes("warning")) {return "warn";}
  if (lower.includes("ready") || lower.includes("compiled successfully"))
    {return "success";}
  if (lower.includes("compiling") || lower.includes("building")) {return "info";}
  return "default";
}

const LINE_COLORS: Record<string, string> = {
  error: "#FF5555",
  warn: "#FFB86C",
  success: "#50FA7B",
  info: "#22D3EE",
  default: "#B9B9B4"
};

const VibeCodingServerLogs: React.FC<VibeCodingServerLogsProps> = ({
  workspacePath,
  serverStatus,
  onAutoFix
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [initialLogs, setInitialLogs] = useState<string[]>([]);
  const [liveLines, setLiveLines] = useState<string[]>([]);

  const allLines = useMemo(
    () => (liveLines.length === 0 ? initialLogs : [...initialLogs, ...liveLines]),
    [initialLogs, liveLines]
  );

  // Fetch buffered logs once on mount, then subscribe to stream for new lines
  useEffect(() => {
    if (!workspacePath) {return;}
    setInitialLogs([]);
    setLiveLines([]);

    // Fetch existing buffer
    window.api?.workspace?.server?.logs?.(workspacePath)
      .then((logs) => { if (logs) {setInitialLogs(logs);} })
      .catch(() => {});

    // Subscribe to new lines only
    if (!window.api?.workspace?.server?.onLog) {return;}
    const unsub = window.api.workspace.server.onLog((event) => {
      if (event.workspacePath !== workspacePath) {return;}
      setLiveLines((prev) => {
        const next = [...prev, event.line];
        return next.length > 500 ? next.slice(-500) : next;
      });
    });
    return unsub;
  }, [workspacePath]);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [allLines.length, autoScroll]);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) {return;}
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 30);
  }, []);

  const handleClear = useCallback(() => {
    setInitialLogs([]);
    setLiveLines([]);
  }, []);

  const handleScrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      setAutoScroll(true);
    }
  }, []);

  const eaddrinusePort = useMemo(
    () => (serverStatus === "error" ? extractEaddrinusePort(allLines) : null),
    [allLines, serverStatus]
  );

  const handleAutoFix = useCallback(() => {
    if (eaddrinusePort != null) onAutoFix?.(eaddrinusePort);
  }, [eaddrinusePort, onAutoFix]);

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100%"
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: "2px",
          px: "8px",
          minHeight: 28,
          borderBottom: 1,
          borderColor: "divider"
        }}
      >
        {eaddrinusePort != null && onAutoFix && (
          <Tooltip title={`Kill process on port ${eaddrinusePort} and restart`}>
            <Button
              size="small"
              variant="outlined"
              color="warning"
              startIcon={<BuildIcon sx={{ fontSize: 12 }} />}
              onClick={handleAutoFix}
              sx={{
                fontSize: "0.65rem",
                py: "1px",
                px: "6px",
                minWidth: 0,
                mr: "4px",
                borderColor: "#FFB86C",
                color: "#FFB86C",
                "&:hover": { borderColor: "#FFD580", color: "#FFD580", bgcolor: "rgba(255,184,108,0.08)" }
              }}
            >
              Auto-fix port {eaddrinusePort}
            </Button>
          </Tooltip>
        )}
        {!autoScroll && (
          <Tooltip title="Scroll to bottom">
            <IconButton size="small" onClick={handleScrollToBottom} sx={{ p: "3px" }}>
              <VerticalAlignBottomIcon sx={{ fontSize: 13 }} />
            </IconButton>
          </Tooltip>
        )}
        <Tooltip title="Clear">
          <IconButton size="small" onClick={handleClear} sx={{ p: "3px" }}>
            <DeleteOutlineIcon sx={{ fontSize: 13 }} />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Log output */}
      <Box
        ref={scrollRef}
        onScroll={handleScroll}
        sx={{
          flex: 1,
          overflowY: "auto",
          overflowX: "hidden",
          px: "12px",
          py: "4px",
          fontFamily: "fontFamily2",
          fontSize: "0.6875rem",
          lineHeight: 1.65,
          "&::-webkit-scrollbar": { width: 6 },
          "&::-webkit-scrollbar-thumb": {
            background: "#535353",
            borderRadius: 0
          },
          "&::-webkit-scrollbar-track": { background: "transparent" }
        }}
      >
        {allLines.length === 0 && (
          <Typography
            sx={{
              color: "text.disabled",
              fontStyle: "italic",
              fontSize: "0.6875rem",
              fontFamily: "fontFamily2",
              py: 1,
              textAlign: "center"
            }}
          >
            {serverStatus === "stopped"
              ? "Server not running"
              : "Waiting for output\u2026"}
          </Typography>
        )}
        {allLines.map((line, i) => (
          <Box
            key={i}
            component="pre"
            sx={{
              m: 0,
              p: 0,
              color: LINE_COLORS[classifyLine(line)],
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
              fontFamily: "inherit",
              fontSize: "inherit"
            }}
          >
            {line}
          </Box>
        ))}
      </Box>
    </Box>
  );
};

export default memo(VibeCodingServerLogs);
