/** @jsxImportSource @emotion/react */
import React, { useCallback, useMemo, memo, useState } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import { Box, Typography, IconButton, Tooltip, Button } from "@mui/material";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import RefreshIcon from "@mui/icons-material/Refresh";
import type { Theme } from "@mui/material/styles";

// ServerStatus will be imported from VibeCodingStore once that rewrite lands.
// Defined locally here until Task 4 (VibeCodingStore rewrite) is complete.
type ServerStatus = "starting" | "running" | "error" | "stopped";

export type { ServerStatus };

const createStyles = (theme: Theme) =>
  css({
    "&": {
      display: "flex",
      flexDirection: "column",
      height: "100%",
      backgroundColor: theme.palette.background.default,
      overflow: "hidden"
    },
    ".preview-header": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "8px 12px",
      borderBottom: `1px solid ${theme.palette.divider}`,
      backgroundColor: theme.palette.background.paper
    },
    ".preview-title": { fontSize: "14px", fontWeight: 500 },
    ".preview-actions": { display: "flex", gap: "4px" },
    ".preview-frame-container": { flex: 1, position: "relative" },
    ".preview-frame": { width: "100%", height: "100%", border: "none" },
    ".preview-state": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      height: "100%",
      gap: "16px",
      padding: "24px",
      textAlign: "center"
    },
    ".error-log": {
      fontSize: "11px",
      color: theme.palette.text.secondary,
      backgroundColor: theme.palette.background.default,
      padding: theme.spacing(1),
      borderRadius: "4px",
      maxHeight: "200px",
      overflow: "auto",
      textAlign: "left",
      width: "100%",
      whiteSpace: "pre-wrap",
      wordBreak: "break-word"
    }
  });

interface VibeCodingPreviewProps {
  port: number | null;
  serverStatus: ServerStatus;
  serverLogs: string[];
  onRestart?: () => void;
}

const VibeCodingPreview: React.FC<VibeCodingPreviewProps> = ({
  port,
  serverStatus,
  serverLogs,
  onRestart
}) => {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [iframeKey, setIframeKey] = useState(0);

  const src =
    serverStatus === "running" && port ? `http://localhost:${port}` : null;

  const handleRefresh = useCallback(() => setIframeKey((k) => k + 1), []);
  const handleOpenInNew = useCallback(() => {
    if (src) { window.open(src, "_blank", "noopener,noreferrer"); }
  }, [src]);

  return (
    <Box css={styles}>
      <div className="preview-header">
        <Typography className="preview-title">
          Preview{serverStatus === "starting" && " (Starting\u2026)"}
        </Typography>
        <div className="preview-actions">
          <Tooltip title="Refresh">
            <span>
              <IconButton size="small" onClick={handleRefresh} disabled={!src}>
                <RefreshIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Open in new tab">
            <span>
              <IconButton
                size="small"
                onClick={handleOpenInNew}
                disabled={!src}
              >
                <OpenInNewIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </div>
      </div>

      <div className="preview-frame-container">
        {serverStatus === "starting" && (
          <div className="preview-state">
            <Typography variant="body2" color="text.secondary">
              Starting dev server\u2026
            </Typography>
          </div>
        )}

        {serverStatus === "error" && (
          <div className="preview-state">
            <Typography variant="body1" color="error">
              Dev server error
            </Typography>
            {serverLogs.length > 0 && (
              <pre className="error-log">
                {serverLogs.slice(-20).join("\n")}
              </pre>
            )}
            {onRestart && (
              <Button size="small" variant="outlined" onClick={onRestart}>
                &#8635; Restart server
              </Button>
            )}
          </div>
        )}

        {serverStatus === "stopped" && (
          <div className="preview-state">
            <Typography variant="body2" color="text.secondary">
              No workspace connected
            </Typography>
          </div>
        )}

        {src && (
          <iframe
            key={iframeKey}
            src={src}
            className="preview-frame"
            title="VibeCoding Preview"
          />
        )}
      </div>
    </Box>
  );
};

export default memo(VibeCodingPreview);
