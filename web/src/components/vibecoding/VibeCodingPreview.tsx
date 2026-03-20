import React, { useCallback, memo } from "react";
import { Box, Typography, IconButton, Tooltip, keyframes } from "@mui/material";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import RefreshIcon from "@mui/icons-material/Refresh";
import { ServerStatus } from "../../stores/VibeCodingStore";

const pulse = keyframes`
  0%   { opacity: 1; }
  50%  { opacity: 0.4; }
  100% { opacity: 1; }
`;

export interface VibeCodingPreviewProps {
  port: number | null;
  serverStatus: ServerStatus;
  serverLogs: string[];
  onRestart: () => void;
}

const VibeCodingPreview: React.FC<VibeCodingPreviewProps> = ({
  port,
  serverStatus,
  serverLogs,
  onRestart
}) => {
  const isStarting = serverStatus === "starting";
  const isRunning = serverStatus === "running";
  const iframeUrl =
    isRunning && port != null ? `http://localhost:${port}` : null;

  const handleOpenInNew = useCallback(() => {
    if (!iframeUrl) {return;}
    window.open(iframeUrl, "_blank", "noopener,noreferrer");
  }, [iframeUrl]);

  const dotColor =
    serverStatus === "running"
      ? "#50FA7B"
      : serverStatus === "starting"
        ? "#FFB86C"
        : serverStatus === "error"
          ? "#FF5555"
          : "rgba(255,255,255,0.4)";

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden"
      }}
    >
      {/* Status bar */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: "12px",
          minHeight: 32,
          borderBottom: 1,
          borderColor: "divider",
          bgcolor: "background.paper"
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <Box
            sx={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              bgcolor: dotColor,
              flexShrink: 0,
              animation: isStarting
                ? `${pulse} 2s ease-in-out infinite`
                : "none"
            }}
          />
          <Typography
            sx={{
              fontFamily: "fontFamily2",
              color: isRunning ? "text.secondary" : "text.disabled",
              fontSize: "0.6875rem"
            }}
          >
            {isRunning && port != null
              ? `localhost:${port}`
              : serverStatus === "starting"
                ? "starting\u2026"
                : serverStatus === "error"
                  ? "error"
                  : "stopped"}
          </Typography>
        </Box>

        <Box sx={{ display: "flex", gap: "2px" }}>
          <Tooltip title="Restart server">
            <IconButton size="small" onClick={onRestart} sx={{ p: "4px" }}>
              <RefreshIcon sx={{ fontSize: 15 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Open in new tab">
            <span>
              <IconButton
                size="small"
                onClick={handleOpenInNew}
                disabled={!isRunning || port == null}
                sx={{ p: "4px" }}
              >
                <OpenInNewIcon sx={{ fontSize: 15 }} />
              </IconButton>
            </span>
          </Tooltip>
        </Box>
      </Box>

      {/* Preview area */}
      <Box sx={{ flex: 1, position: "relative", bgcolor: "background.paper" }}>
        {iframeUrl && (
          <Box
            component="iframe"
            src={iframeUrl}
            sandbox="allow-scripts allow-same-origin allow-forms"
            title="VibeCoding Preview"
            sx={{
              width: "100%",
              height: "100%",
              border: "none",
              display: "block"
            }}
          />
        )}

        {serverStatus === "error" && serverLogs.length > 0 && (
          <Box
            sx={{
              position: "absolute",
              inset: 0,
              overflowY: "auto",
              p: "12px",
              bgcolor: "background.default",
              "&::-webkit-scrollbar": { width: 6 },
              "&::-webkit-scrollbar-thumb": {
                background: "#535353",
                borderRadius: 0
              }
            }}
          >
            <Box
              component="pre"
              sx={{
                m: 0,
                fontFamily: "fontFamily2",
                fontSize: "0.6875rem",
                color: "#FF5555",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
                lineHeight: 1.6
              }}
            >
              {serverLogs.join("\n")}
            </Box>
          </Box>
        )}

        {!iframeUrl && serverStatus !== "error" && (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              textAlign: "center",
              p: 3
            }}
          >
            {serverStatus === "starting" ? (
              <>
                {/* Dual-ring spinner matching project conventions */}
                <Box sx={{ position: "relative", width: 40, height: 40, mb: 2 }}>
                  <Box
                    sx={{
                      position: "absolute",
                      inset: 0,
                      borderRadius: "50%",
                      border: "2px solid rgba(95,138,200,0.15)"
                    }}
                  />
                  <Box
                    sx={{
                      position: "absolute",
                      inset: 0,
                      borderRadius: "50%",
                      border: "2px solid transparent",
                      borderTopColor: "#5f8ac8",
                      animation: "spin 1.9s linear infinite",
                      "@keyframes spin": {
                        "0%": { transform: "rotate(0deg)" },
                        "100%": { transform: "rotate(360deg)" }
                      }
                    }}
                  />
                </Box>
                <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>
                  Starting preview server...
                </Typography>
              </>
            ) : (
              <>
                <Typography sx={{ fontSize: "0.8125rem", color: "text.disabled", mb: 0.5 }}>
                  Preview server is stopped
                </Typography>
                <Typography sx={{ fontSize: "0.75rem", color: "text.disabled" }}>
                  Click restart to start the server
                </Typography>
              </>
            )}
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default memo(VibeCodingPreview);
